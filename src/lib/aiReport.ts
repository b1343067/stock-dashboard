// AI 投研辦公室：報告的驗證與顯示用的小工具（純函式，測試在 aiReport.test.ts）
//
// 驗證有兩個用途：
//   1. 網站讀報告時：格式不對就不顯示（頁面顯示「暫時無法讀取」，不會壞掉）
//   2. 第二階段排程任務推報告之前：同一個函式當成檢查工具，擋下格式錯誤或違反規則的報告
// 規則（違反就判定無效）：
//   - 不可以出現買進／賣出建議或目標價（禁用詞）
//   - 提到的股票必須在觀察清單裡（只能用公開資料，不可以出現持股）
//   - 字數上限：摘要 60 字、每段最多 5 點、每點 80 字（英文版約 3 倍）
//   - 主管的今日重點 3～5 點

import { missedWeekdays, STALE_THRESHOLD } from "./freshness";
import type { AiReport, AiRoleKey, AiRoleReport, LocalText, ReportItem, ReportSection } from "./types";

export const ROLE_ORDER: AiRoleKey[] = ["tech", "news", "fundamental", "debate", "lead"];

/** 角色名稱（中文原文，畫面用 t() 翻譯） */
export const ROLE_NAME: Record<AiRoleKey, string> = {
  tech: "技術分析師",
  news: "新聞分析師",
  fundamental: "基本面分析師",
  debate: "多空辯論",
  lead: "主管",
};

export const LIMITS = { summaryZh: 60, itemZh: 80, enFactor: 3, itemsPerSection: 5, sections: 4, debateEach: 5, pointsMin: 3, pointsMax: 5 };

/**
 * 禁用詞：買賣建議與目標價。英文的 sell 排除常見的 sell-off／selloff（新聞用語，描述市場下跌，不是建議）。
 */
const FORBIDDEN: RegExp[] = [/買進/, /買入/, /賣出/, /目標價/, /加碼/, /減碼/, /建議(買|賣)/, /\bbuy\b/i, /\bsell\b(?!-?off)/i, /target price/i, /price target/i];

export function findForbidden(text: string): string | null {
  for (const re of FORBIDDEN) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isText = (v: unknown): v is LocalText => {
  const o = v as LocalText;
  return !!o && typeof o.zh === "string" && typeof o.en === "string" && o.zh.trim() !== "" && o.en.trim() !== "";
};

export interface ValidationResult {
  report: AiReport | null;
  errors: string[];
}

/**
 * 檢查報告。symbols：觀察清單的代號（提供時會檢查報告提到的股票都在裡面）。
 * 有任何錯誤就回傳 report = null，errors 列出所有問題（給排程任務修正用）。
 */
export function validateReport(raw: unknown, symbols?: Set<string>): ValidationResult {
  const errors: string[] = [];
  const r = raw as AiReport;
  if (!r || typeof r !== "object") return { report: null, errors: ["不是 JSON 物件"] };
  if (r.version !== 1) errors.push("version 必須是 1");
  if (typeof r.sample !== "boolean") errors.push("sample 必須是 true 或 false");
  if (!isDate(r.date)) errors.push("date 格式必須是 YYYY-MM-DD");
  if (typeof r.generatedAt !== "string") errors.push("缺少 generatedAt");
  const dd = r.dataDates as AiReport["dataDates"];
  if (!dd || !["us", "tw", "news"].every((k) => dd[k as keyof typeof dd] === null || isDate(dd[k as keyof typeof dd]))) {
    errors.push("dataDates 的 us／tw／news 必須是日期或 null");
  }
  if (r.staleNote !== null && !isText(r.staleNote)) errors.push("staleNote 必須是 null 或 {zh, en}");
  if (!r.roles || typeof r.roles !== "object") {
    errors.push("缺少 roles");
    return { report: null, errors };
  }

  const checkText = (t: unknown, where: string, zhMax: number) => {
    if (!isText(t)) return errors.push(`${where}：必須有 zh 和 en 兩個非空字串`);
    if ([...t.zh].length > zhMax) errors.push(`${where}：中文超過 ${zhMax} 字（${[...t.zh].length} 字）`);
    if (t.en.length > zhMax * LIMITS.enFactor * 2) errors.push(`${where}：英文太長`);
    for (const s of [t.zh, t.en]) {
      const bad = findForbidden(s);
      if (bad) errors.push(`${where}：出現禁用詞「${bad}」（不可以給買賣建議或目標價）`);
    }
  };
  const checkItems = (items: unknown, where: string, max: number, min = 0) => {
    if (!Array.isArray(items)) return errors.push(`${where}：必須是陣列`);
    if (items.length > max || items.length < min) errors.push(`${where}：要 ${min}～${max} 點（現在 ${items.length} 點）`);
    (items as ReportItem[]).forEach((it, i) => {
      checkText(it?.text, `${where} 第 ${i + 1} 點`, LIMITS.itemZh);
      for (const ref of it?.refs ?? []) {
        if (typeof ref?.symbol !== "string") errors.push(`${where} 第 ${i + 1} 點：refs 的 symbol 必須是字串`);
        else if (symbols && !symbols.has(ref.symbol)) errors.push(`${where} 第 ${i + 1} 點：${ref.symbol} 不在觀察清單（只能用公開資料）`);
        if (ref?.changePct !== undefined && !Number.isFinite(ref.changePct)) errors.push(`${where} 第 ${i + 1} 點：changePct 必須是數字`);
      }
    });
  };

  for (const key of ROLE_ORDER) {
    const role = r.roles[key] as AiRoleReport;
    const where = ROLE_NAME[key];
    if (!role || (role.status !== "done" && role.status !== "off")) {
      errors.push(`${where}：status 必須是 done 或 off`);
      continue;
    }
    if (role.status === "off") continue; // 休假中：不用檢查內容
    if (!isDate(role.dataDate)) errors.push(`${where}：done 時必須註明 dataDate`);
    checkText(role.summary, `${where} 摘要`, LIMITS.summaryZh);
    if (!Array.isArray(role.sections) || role.sections.length > LIMITS.sections) errors.push(`${where}：sections 最多 ${LIMITS.sections} 段`);
    (role.sections ?? []).forEach((s: ReportSection, i: number) => {
      checkText(s?.heading, `${where} 第 ${i + 1} 段標題`, 20);
      checkItems(s?.items, `${where} 第 ${i + 1} 段`, LIMITS.itemsPerSection, 1);
    });
    if (key === "debate") {
      checkItems(role.bull, `${where} 偏多`, LIMITS.debateEach, 1);
      checkItems(role.bear, `${where} 偏空`, LIMITS.debateEach, 1);
    }
    if (key === "lead") checkItems(role.points, `${where} 今日重點`, LIMITS.pointsMax, LIMITS.pointsMin);
  }
  return { report: errors.length ? null : r, errors };
}

/** 依語言取出文字 */
export function pick(text: LocalText, lang: "zh" | "en"): string {
  return lang === "en" ? text.en : text.zh;
}

/** 今天有寫報告的角色數 */
export function doneCount(report: AiReport): number {
  return ROLE_ORDER.filter((k) => report.roles[k].status === "done").length;
}

/**
 * 報告用的資料是否過期：資料日期（美股、台股取較新的）到報告日期之間落後 3 個平日以上。
 * 和頁首的資料過期提醒用同一個門檻（freshness.ts）。
 */
export function reportStale(report: AiReport, today: string): boolean {
  const dates = [report.dataDates.us, report.dataDates.tw].filter((d): d is string => !!d).sort();
  if (dates.length === 0) return true;
  return missedWeekdays(dates[dates.length - 1], today) >= STALE_THRESHOLD;
}
