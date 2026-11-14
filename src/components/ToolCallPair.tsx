// 도구 호출과 그 결과를 한 덩어리로 접어 보여 준다. arguments 는 JSON 이면 들여쓰기해 펼친다.
import type { Msg, ToolCall } from '../adapters';
import { useLang } from '../i18n';
import { LongText } from './LongText';
import { prettyJson } from './pretty';

export function ToolCallPair({ call, result }: { call: ToolCall; result?: Msg }) {
  const { t } = useLang();
  return (
    <details className="tool-pair" open>
      <summary>
        <span className="tool-pair__tag">{t('msg.toolCall')}</span> <code>{call.name || '?'}</code>
      </summary>
      <pre className="tool-pair__args">{prettyJson(call.args) || '{}'}</pre>
      <div className="tool-pair__result">
        <span className="tool-pair__tag">{t('msg.toolResult')}</span>
        {result ? <LongText text={prettyJson(result.text)} pre /> : <em className="muted">{t('msg.noResult')}</em>}
      </div>
    </details>
  );
}
