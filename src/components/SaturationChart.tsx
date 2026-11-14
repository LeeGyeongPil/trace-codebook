// 포화 곡선(인라인 SVG, 차트 라이브러리 없음). x = 검토한 트레이스 수, y = 누적 실패 유형 수.
import type { Saturation } from '../core/saturation';
import { useLang } from '../i18n';

const W = 560;
const H = 220;
const PAD = { l: 40, r: 16, t: 12, b: 36 };

export function SaturationChart({ data }: { data: Saturation }) {
  const { t } = useLang();
  const n = Math.max(1, data.reviewed);
  const maxY = Math.max(1, data.firstSeen.length);
  const x = (v: number) => PAD.l + (v / n) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / maxY) * (H - PAD.t - PAD.b);

  // 계단 모양: 새 유형이 나온 지점에서만 올라간다
  let d = `M ${x(0)} ${y(0)}`;
  let prev = 0;
  for (const p of data.points) {
    if (p.modes !== prev) d += ` L ${x(p.n)} ${y(prev)} L ${x(p.n)} ${y(p.modes)}`;
    prev = p.modes;
  }
  d += ` L ${x(n)} ${y(prev)}`;

  const yTicks = Array.from({ length: maxY + 1 }, (_, i) => i);
  const xTicks = [0, Math.round(n / 2), n];

  return (
    <svg className="sat-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('stats.saturation')}>
      {yTicks.map((v) => (
        <g key={`y${v}`}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="sat-chart__grid" />
          <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className="sat-chart__tick">
            {v}
          </text>
        </g>
      ))}
      {xTicks.map((v) => (
        <text key={`x${v}`} x={x(v)} y={H - PAD.b + 16} textAnchor="middle" className="sat-chart__tick">
          {v}
        </text>
      ))}
      <path d={d} className="sat-chart__line" />
      {data.firstSeen.map((v, i) => (
        <circle key={i} cx={x(v)} cy={y(i + 1)} r={4} className="sat-chart__dot" />
      ))}
      <text x={(W + PAD.l) / 2} y={H - 4} textAnchor="middle" className="sat-chart__axis">
        {t('stats.axisX')}
      </text>
      <text x={12} y={PAD.t + 4} className="sat-chart__axis" transform={`rotate(-90 12 ${PAD.t + 4})`} textAnchor="end">
        {t('stats.axisY')}
      </text>
    </svg>
  );
}
