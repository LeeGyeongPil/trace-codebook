// 왼쪽 목록: 트레이스마다 판정 색 점. 누르면 그 트레이스로 이동.
import type { Trace } from '../adapters';
import type { ProjectState } from '../core/annotations';
import { useLang } from '../i18n';

type Props = { traces: Trace[]; state: ProjectState; index: number; onSelect: (i: number) => void };

export function TraceList({ traces, state, index, onSelect }: Props) {
  const { t } = useLang();
  return (
    <nav className="trace-list" aria-label={t('review.list')}>
      <h3>{t('review.list')}</h3>
      <ol>
        {traces.map((tr, i) => {
          const a = state.annotations[tr.id];
          const verdict = a?.verdict ?? 'none';
          return (
            <li key={tr.id}>
              <button
                type="button"
                className={`trace-list__item ${i === index ? 'is-current' : ''}`}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => onSelect(i)}
              >
                <span className={`dot dot--${verdict}`} title={t(`verdict.${verdict}`)} />
                <span className="trace-list__id">{tr.id}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
