// OpenAI Chat 메시지 형식.
// {role, content(문자열 | [{type:'text', text}]), tool_calls:[{id, function:{name, arguments}}], tool_call_id}
// 도구 결과는 role:'tool' + tool_call_id 로 앞의 도구 호출과 짝지어진다.
import type { Json, Msg } from './types';
import { joinText, str } from './util';

export function fromOpenAIMessage(m: Json): Msg {
  const text = Array.isArray(m?.content) ? joinText(m.content) : str(m?.content);
  const msg: Msg = {
    role: str(m?.role),
    text,
    toolCalls: (Array.isArray(m?.tool_calls) ? m.tool_calls : []).map((c: Json) => ({
      id: str(c?.id),
      name: str(c?.function?.name),
      args: str(c?.function?.arguments), // 보통 JSON "문자열" — 화면에서 보기 좋게 펼친다
    })),
  };
  if (m?.tool_call_id != null) msg.toolResultFor = str(m.tool_call_id);
  return msg;
}
