#!/usr/bin/env bash
# 從 GitHub 的 data 分支下載最新的股價資料到 public/data/
#
# 為什麼資料放在另一個分支？
#   資料每天更新、而且幾乎每個檔案都會變，放在 main 會讓儲存庫每天長大好幾 MB。
#   data 分支每次更新只保留一個 commit（覆蓋舊的），大小不會累積；main 只放程式碼。
#
# 誰會執行這個腳本：
#   - Vercel 建置時（vercel.json 的 buildCommand）
#   - GitHub Actions 的 CI 測試
#   - 本機開發：npm run data:pull
# 下載失敗會回傳錯誤 → Vercel 建置失敗 → 線上網站維持上一版，不會變成沒有資料。
set -euo pipefail

# 儲存庫名稱：Vercel、GitHub Actions 會自動提供，本機就用預設值
if [[ -n "${VERCEL_GIT_REPO_OWNER:-}" && -n "${VERCEL_GIT_REPO_SLUG:-}" ]]; then
  REPO="${VERCEL_GIT_REPO_OWNER}/${VERCEL_GIT_REPO_SLUG}"
else
  REPO="${GITHUB_REPOSITORY:-b1343067/stock-dashboard}"
fi
BRANCH="${DATA_BRANCH:-data}"
DEST="public/data"
# DATA_URL 可以覆蓋下載網址（測試用）
URL="${DATA_URL:-https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}}"

echo "下載資料：${REPO}@${BRANCH} → ${DEST}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# --retry：網路偶爾不穩時自動重試
curl -fsSL --retry 3 --retry-delay 2 "$URL" | tar -xz --strip-components=1 -C "$TMP"

# 檢查下載到的東西是完整的，再取代舊資料（避免下載到一半就把舊資料刪掉）
if [[ ! -s "$TMP/index.json" ]]; then
  echo "錯誤：下載的資料裡沒有 index.json" >&2
  exit 1
fi
# data 分支裡的 vercel.json 只是告訴 Vercel「不要部署 data 分支」，不需要放到網站上
rm -f "$TMP/vercel.json"
rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"
mv "$TMP" "$DEST"
trap - EXIT
echo "完成：$(ls "$DEST" | wc -l) 個檔案"
