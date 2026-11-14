// 트레이스 한 건: 역할별 말풍선. 도구 결과 메시지는 해당 도구 호출 옆에 짝지어 보이고 따로 그리지 않는다.
import type { Msg, Trace } from '../adapters';
import { useLang, type MsgId } from '../i18n';
import { LongText } from './LongText';
import { ToolCallPair } from './ToolCallPair';

const KNOWN_ROLES = new Set(['system', 'user', 'assistant', 'tool']);

export function TraceView({ trace, position, total }: { trace: Trace; position: number; total: number }) {
  const { t } = useLang();
  // 도구 호출 id → 결과 메시지
  const results = new Map<string, Msg>();
  for (const m of trace.messages) if (m.toolResultFor) results.set(m.toolResultFor, m);
  const pairedIds = new Set(trace.messages.flatMap((m) => m.toolCalls.map((c) => c.id)).filter((id) => results.has(id)));

  const roleLabel = (role: string) => (KNOWN_ROLES.has(role) ? t(`role.${role}` as MsgId) : role || '?');

  return (
    <article className="trace-view">
      <header className="trace-view__head">
        <span className="muted">{t('review.position', { i: position, n: total })}</span>
        <code className="trace-view__id">{trace.id}</code>
        <span className="chip">{trace.source}</span>
        {trace.spanCount > 0 && <span className="muted small">{t('review.spans', { n: trace.spanCount })}</span>}
      </header>
      {trace.contentMissing && (
        <p className="notice" role="note">
          {t('review.contentMissing')}
        </p>
      )}
      {trace.messages.map((m, i) => {
        if (m.toolResultFor && pairedIds.has(m.toolResultFor)) return null; // 호출 옆에 이미 보임
        const role = KNOWN_ROLES.has(m.role) ? m.role : 'other';
        return (
          <div key={i} className={`bubble bubble--${role}`}>
            <div className="bubble__role">{roleLabel(m.role)}</div>
            {(m.text || m.toolCalls.length === 0) && <LongText text={m.text} pre={m.role === 'tool'} />}
            {m.toolCalls.map((c, j) => (
              <ToolCallPair key={c.id || j} call={c} result={results.get(c.id)} />
            ))}
          </div>
        );
      })}
    </article>
  );
}
