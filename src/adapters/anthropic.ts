// Anthropic Messages 형식.
// content 가 블록 배열: text, tool_use{id,name,input}, 그리고 다음 user 메시지 안의 tool_result{tool_use_id, content}.
// 시스템 지시는 메시지 밖 `system` (문자열 또는 text 블록 배열).
// 화면에서 OpenAI 와 똑같이 보이도록 tool_result 블록은 role:'tool' 메시지로 떼어 낸다.
import type { Json, Msg } from './types';
import { joinText, str } from './util';

export function fromAnthropicMessage(m: Json): Msg[] {
  if (!Array.isArray(m?.content)) return [{ role: str(m?.role), text: str(m?.content), toolCalls: [] }];
  const out: Msg[] = [];
  const main: Msg = { role: str(m.role), text: '', toolCalls: [] };
  for (const b of m.content) {
    if (b?.type === 'text') main.text += str(b.text);
    else if (b?.type === 'tool_use') main.toolCalls.push({ id: str(b.id), name: str(b.name), args: str(b.input) });
    else if (b?.type === 'tool_result')
      out.push({
        role: 'tool',
        text: Array.isArray(b.content) ? joinText(b.content) : str(b.content),
        toolCalls: [],
        toolResultFor: str(b.tool_use_id),
      });
  }
  // 글자나 도구 호출이 있는 본 메시지를 결과 메시지들보다 앞에 둔다
  if (main.text || main.toolCalls.length) out.unshift(main);
  return out;
}

/** 시스템 지시: 문자열이거나 [{type:'text', text}] 배열 */
export function anthropicSystem(system: Json): string | null {
  if (typeof system === 'string') return system;
  if (Array.isArray(system)) return joinText(system);
  return null;
}

/** 메시지 배열에 Anthropic 고유 블록(tool_use·tool_result)이 있는가 */
export const hasAnthropicBlocks = (msgs: Json[]): boolean =>
  msgs.some(
    (m: Json) => Array.isArray(m?.content) && m.content.some((b: Json) => b?.type === 'tool_use' || b?.type === 'tool_result'),
  );
