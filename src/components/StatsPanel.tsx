// "통계" 탭: 판정 건수, 유형별 건수·실패 대비 비율 막대, 포화 곡선과 배지.
import type { ProjectState } from '../core/annotations';
import { saturation, SATURATION_WINDOW } from '../core/saturation';
import { modeCounts, unassignedFailureCount, verdictCounts } from '../core/taxonomy';
import { useLang } from '../i18n';
import { SaturationChart } from './SaturationChart';

export function StatsPanel({ state, total }: { state: ProjectState; total: number }) {
  const { t } = useLang();
  const v = verdictCounts(state);
  const counts = [...modeCounts(state)].sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...counts.map((c) => c.count));
  const sat = saturation(state);
  const unassigned = unassignedFailureCount(state);

  return (
    <div className="stats">
      <section>
        <h3>{t('stats.verdicts')}</h3>
        <p className="muted">{t('stats.reviewed', { reviewed: v.reviewed, total })}</p>
        <div className="verdict-counts">
          <span className="chip chip--pass">
            {t('verdict.pass')} {v.pass}
          </span>
          <span className="chip chip--fail">
            {t('verdict.fail')} {v.fail}
          </span>
          <span className="chip chip--defer">
            {t('verdict.defer')} {v.defer}
          </span>
        </div>
      </section>

      <section>
        <h3>{t('stats.modes')}</h3>
        {counts.length === 0 ? (
          <p className="muted">{t('stats.noModes')}</p>
        ) : (
          <table className="bars">
            <thead>
              <tr>
                <th>{t('review.mode')}</th>
                <th>{t('stats.count')}</th>
                <th>{t('stats.share')}</th>
              </tr>
            </thead>
            <tbody>
              {counts.map((c) => (
                <tr key={c.mode.id}>
                  <td>{c.mode.name}</td>
                  <td className="bars__cell">
                    <span className="bars__bar" style={{ width: `${(c.count / max) * 100}%` }} />
                    <span className="bars__num">{c.count}</span>
                  </td>
                  <td>{(c.share * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {unassigned > 0 && <p className="muted small">{t('stats.unassigned', { n: unassigned })}</p>}
      </section>

      <section>
        <h3>{t('stats.saturation')}</h3>
        <p className="muted small">{t('stats.saturationHelp')}</p>
        <p className={`badge ${sat.saturated ? 'badge--on' : 'badge--off'}`} data-saturated={sat.saturated}>
          {sat.saturated ? t('stats.saturated') : t('stats.notSaturated', { window: SATURATION_WINDOW })}
        </p>
        <SaturationChart data={sat} />
      </section>
    </div>
  );
}
