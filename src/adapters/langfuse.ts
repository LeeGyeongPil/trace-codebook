// Langfuse 단일 트레이스 내보내기(트레이스 화면 "Download JSON"): 트레이스 + observations + scores.
// observation.type 이 GENERATION 인 것 중 마지막 것의 input(대화 이력) + output(최종 답)을 대화로 쓴다.
// input/output 이 JSON 문자열로 인코딩된 경우가 있어 maybeParse 로 푼다.
import type { Json, Msg, Trace } from './types';
import { anthropicSystem, fromAnthropicMessage, hasAnthropicBlocks } from './anthropic';
import { fromOpenAIMessage } from './openai';
import { maybeParse, str } from './util';

function messagesFrom(arr: Json[]): Msg[] {
  return hasAnthropicBlocks(arr) ? arr.flatMap(fromAnthropicMessage) : arr.map(fromOpenAIMessage);
}

function outputMessages(output: Json): Msg[] {
  if (output == null) return [];
  const o = output?.choices?.[0]?.message ?? output; // OpenAI 응답 전체가 들어 있을 때
  if (o && typeof o === 'object' && !Array.isArray(o) && o.role) {
    return Array.isArray(o.content) && hasAnthropicBlocks([o]) ? fromAnthropicMessage(o) : [fromOpenAIMessage(o)];
  }
  if (Array.isArray(o) && o.every((m: Json) => m?.role)) return messagesFrom(o);
  return [{ role: 'assistant', text: str(o), toolCalls: [] }];
}

export function fromLangfuseTrace(doc: Json): Omit<Trace, 'id'> & { id: string | null } {
  // 원본을 바꾸지 않도록 복사본을 정렬한다
  const obs: Json[] = [...(doc.observations ?? [])].sort((a: Json, b: Json) =>
    str(a?.startTime) < str(b?.startTime) ? -1 : str(a?.startTime) > str(b?.startTime) ? 1 : 0,
  );
  const gens = obs.filter((o: Json) => o?.type === 'GENERATION');
  const last = gens[gens.length - 1];
  let msgs: Msg[];
  if (last) {
    const input = maybeParse(last.input);
    msgs = [];
    const sys = anthropicSystem(input?.system);
    if (sys != null) msgs.push({ role: 'system', text: sys, toolCalls: [] });
    const arr = Array.isArray(input) ? input : Array.isArray(input?.messages) ? input.messages : null;
    if (arr) msgs.push(...messagesFrom(arr));
    else if (input != null) msgs.push({ role: 'user', text: str(input), toolCalls: [] });
    msgs.push(...outputMessages(maybeParse(last.output)));
  } else {
    // GENERATION 이 없으면 트레이스 자체의 input/output 이라도 보여 준다
    msgs = [];
    if (doc.input != null) msgs.push({ role: 'user', text: str(maybeParse(doc.input)), toolCalls: [] });
    if (doc.output != null) msgs.push({ role: 'assistant', text: str(maybeParse(doc.output)), toolCalls: [] });
  }
  const trace: Omit<Trace, 'id'> & { id: string | null } = {
    id: doc.id != null ? String(doc.id) : null,
    source: 'langfuse-trace',
    messages: msgs,
    spanCount: obs.length,
  };
  if (msgs.length === 0) trace.contentMissing = true;
  return trace;
}
