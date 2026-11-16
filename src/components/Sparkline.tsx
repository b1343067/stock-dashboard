// 迷你走勢線（觀察清單用）：純 SVG，不需要圖表套件，畫幾十個也很輕

interface Props {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}

export default function Sparkline({ values, color, width = 48, height = 20 }: Props) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return <span className="spark" style={{ width, height }} />;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const range = max - min || 1;
  const points = v.map((x, i) => `${((i / (v.length - 1)) * width).toFixed(1)},${(height - 1 - ((x - min) / range) * (height - 2)).toFixed(1)}`).join(" ");
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
