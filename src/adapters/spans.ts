// span 형식(OTLP JSON·Phoenix span JSONL) 공통 처리.
// 한 트레이스는 여러 span 으로 흩어져 있다 → traceId 로 묶고,
// 그 안에서 메시지가 가장 많은 LLM span 을 "대화"로 쓴다(마지막 턴의 입력에는 앞선 대화가 다 들어 있다).
import type { Json, Msg, SourceFormat, Trace } from './types';
import { joinText, maybeParse, str } from './util';

/** 형식과 상관없이 평탄하게 펼친 span */
export type FlatSpan = { traceId: string; spanId: string; parentId?: string; start: string; attrs: Record<string, Json> };

// ---- OTel GenAI 규약: {role, parts:[{type:'text'|'tool_call'|'tool_call_response', ...}]} ----
function fromGenAiParts(m: Json): Msg {
  const msg: Msg = { role: str(m?.role), text: '', toolCalls: [] };
  for (const p of Array.isArray(m?.parts) ? m.parts : []) {
    if (p?.type === 'text') msg.text += str(p.content);
    else if (p?.type === 'tool_call') msg.toolCalls.push({ id: str(p.id), name: str(p.name), args: str(p.arguments) });
    else if (p?.type === 'tool_call_response') {
      msg.toolResultFor = str(p.id);
      // 규약 문서끼리 이름이 다르다: 예시 문서는 `response`, span 문서는 `result` → 둘 다 받는다
      msg.text += str(p.response ?? p.result);
    }
  }
  return msg;
}

/** gen_ai.system_instructions: parts 배열 또는 그냥 문자열 */
function systemText(v: Json): string {
  if (Array.isArray(v)) return joinText(v);
  return str(v);
}

// ---- OpenInference: 평탄화 키("llm.input_messages.0.message.role") 또는 중첩 객체 ----
type OiPrefix = 'llm.input_messages' | 'llm.output_messages';

function oiNested(m: Json): Msg {
  const msg: Msg = {
    role: str(m?.role),
    text: m?.content != null ? str(m.content) : Array.isArray(m?.contents) ? joinText(m.contents.map((c: Json) => c?.message_content ?? c)) : '',
    toolCalls: (Array.isArray(m?.tool_calls) ? m.tool_calls : []).map((c: Json) => {
      const tc = c?.tool_call ?? c;
      return { id: str(tc?.id), name: str(tc?.function?.name), args: str(tc?.function?.arguments) };
    }),
  };
  if (m?.tool_call_id != null) msg.toolResultFor = str(m.tool_call_id);
  return msg;
}

function oiMessages(attrs: Record<string, Json>, prefix: OiPrefix): Msg[] {
  // 중첩 모양: attrs.llm.input_messages = [{message:{...}}]
  const nested = attrs.llm?.[prefix.split('.')[1]];
  if (Array.isArray(nested)) return nested.map((x: Json) => oiNested(x?.message ?? x));

  // 평탄화 모양: 키를 정규식으로 쪼개 인덱스별로 모은다
  const byIdx = new Map<number, Msg>();
  const re = new RegExp('^' + prefix.replace('.', '\\.') + '\\.(\\d+)\\.message\\.(.+)$');
  for (const [k, v] of Object.entries(attrs)) {
    const mm = re.exec(k);
    if (!mm) continue;
    const i = Number(mm[1]);
    const msg = byIdx.get(i) ?? { role: '', text: '', toolCalls: [] };
    byIdx.set(i, msg);
    const rest = mm[2];
    if (rest === 'role') msg.role = str(v);
    else if (rest === 'content') msg.text = str(v);
    else if (rest === 'tool_call_id') msg.toolResultFor = str(v);
    else if (/^contents\.\d+\.message_content\.text$/.test(rest)) msg.text += str(v);
    else {
      const tc = /^tool_calls\.(\d+)\.tool_call\.(id|function\.name|function\.arguments)$/.exec(rest);
      if (tc) {
        const j = Number(tc[1]);
        msg.toolCalls[j] ??= { id: '', name: '', args: '' };
        if (tc[2] === 'id') msg.toolCalls[j].id = str(v);
        else if (tc[2] === 'function.name') msg.toolCalls[j].name = str(v);
        else msg.toolCalls[j].args = str(v);
      }
    }
  }
  return [...byIdx.entries()]
    .sort((a, b) => a[0] - b[0])
    .map((e) => ({ ...e[1], toolCalls: e[1].toolCalls.filter(Boolean) }));
}

const isOiLlmSpan = (a: Record<string, Json>): boolean =>
  a['openinference.span.kind'] === 'LLM' || a.openinference?.span?.kind === 'LLM';

/** span 하나에서 대화 메시지를 꺼낸다. 본문이 없으면 빈 배열. */
export function spanMessages(s: FlatSpan): Msg[] {
  const a = s.attrs;
  // 1) OTel GenAI: 값이 JSON 문자열일 수도(span 에선 허용), 구조화 값일 수도 있다
  const inp = maybeParse(a['gen_ai.input.messages']);
  const outp = maybeParse(a['gen_ai.output.messages']);
  if (Array.isArray(inp) || Array.isArray(outp)) {
    const msgs: Msg[] = [];
    const sys = maybeParse(a['gen_ai.system_instructions']);
    if (sys != null && sys !== '') msgs.push({ role: 'system', text: systemText(sys), toolCalls: [] });
    for (const m of Array.isArray(inp) ? inp : []) msgs.push(fromGenAiParts(m));
    for (const m of Array.isArray(outp) ? outp : []) msgs.push(fromGenAiParts(m));
    return msgs;
  }
  // 2) OpenInference LLM span
  if (isOiLlmSpan(a)) {
    const msgs = [...oiMessages(a, 'llm.input_messages'), ...oiMessages(a, 'llm.output_messages')];
    if (msgs.length) return msgs;
    // 메시지 키가 없으면 input.value 에 OpenAI 요청 본문({messages:[...]})이 들어 있는 경우가 있다
    const iv = maybeParse(a['input.value'] ?? a.input?.value);
    if (Array.isArray(iv?.messages)) return iv.messages.map(oiNested);
  }
  return [];
}

/** span 들을 traceId 로 묶어 Trace[] 로. 처음 나온 traceId 순서를 지킨다. */
export function assembleFromSpans(spans: FlatSpan[], source: SourceFormat): Trace[] {
  const byTrace = new Map<string, FlatSpan[]>();
  for (const s of spans) {
    const arr = byTrace.get(s.traceId) ?? [];
    arr.push(s);
    byTrace.set(s.traceId, arr);
  }
  const out: Trace[] = [];
  for (const [id, arr] of byTrace) {
    // 시작 시각 순으로 보고, 메시지 수가 같으면 나중 span(마지막 턴)을 고른다
    const sorted = [...arr].sort((x, y) => compareStart(x.start, y.start));
    let best: Msg[] = [];
    for (const s of sorted) {
      const m = spanMessages(s);
      if (m.length && m.length >= best.length) best = m;
    }
    const trace: Trace = { id, source, messages: best, spanCount: arr.length };
    if (best.length === 0) trace.contentMissing = true;
    out.push(trace);
  }
  return out;
}

/** 시작 시각 비교: 나노초 숫자 문자열과 ISO 문자열 둘 다 */
function compareStart(a: string, b: string): number {
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    const d = BigInt(a) - BigInt(b);
    return d < 0n ? -1 : d > 0n ? 1 : 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}
