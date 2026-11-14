// 어댑터 공개 진입점: normalize(records) → Trace[]
// 레코드는 parse.ts 가 파일에서 꺼낸 JSON 값들이다. 입력 객체는 절대 바꾸지 않는다(원본 불변).
import type { Json, Msg, SourceFormat, Trace } from './types';
import { anthropicSystem, fromAnthropicMessage } from './anthropic';
import { detectFormat } from './detect';
import { contentId } from './hash';
import { fromLangfuseTrace } from './langfuse';
import { fromOpenAIMessage } from './openai';
import { fromOtlp } from './otlp';
import { fromPhoenixSpans } from './phoenix';

export type { Msg, SourceFormat, ToolCall, Trace } from './types';
export { detect, detectFormat, UnknownFormatError } from './detect';
export { blobChunks, parseStream, parseText, type ParseResult, type SkippedLine } from './parse';

/** 내용 해시의 재료: 메시지의 역할·글자·도구 호출만(형식 이름은 빼서 같은 대화면 같은 값) */
const canonical = (messages: Msg[]): string =>
  JSON.stringify(messages.map((m) => [m.role, m.text, m.toolCalls.map((c) => [c.name, c.args]), m.toolResultFor ?? '']));

function fromMessageRecord(r: Json, kind: 'openai-jsonl' | 'anthropic-jsonl'): Omit<Trace, 'id'> & { id: string | null } {
  const msgs: Msg[] = [];
  const sys = anthropicSystem(r.system);
  if (sys != null) msgs.push({ role: 'system', text: sys, toolCalls: [] });
  for (const m of r.messages ?? []) {
    if (kind === 'anthropic-jsonl') msgs.push(...fromAnthropicMessage(m));
    else msgs.push(fromOpenAIMessage(m));
  }
  const id = r.id ?? r.trace_id ?? r.metadata?.trace_id ?? null;
  return { id: id == null ? null : String(id), source: kind, messages: msgs, spanCount: 0 };
}

export function normalize(records: Json[]): Trace[] {
  if (records.length === 0) return [];
  const kind = detectFormat(records);
  let traces: (Omit<Trace, 'id'> & { id: string | null })[];
  switch (kind) {
    case 'otlp-json':
      traces = fromOtlp(records);
      break;
    case 'phoenix-jsonl':
      traces = fromPhoenixSpans(records);
      break;
    case 'langfuse-trace':
      traces = records.map(fromLangfuseTrace);
      break;
    case 'openai-jsonl':
    case 'anthropic-jsonl':
      traces = records.map((r) => fromMessageRecord(r, kind));
      break;
  }
  // ID 가 없으면 내용 해시. 같은 ID 가 또 나오면(완전히 같은 대화가 두 번 등) 뒤에 #2, #3 을 붙여 구분한다.
  const seen = new Map<string, number>();
  return traces.map((t) => {
    let id = t.id || contentId(canonical(t.messages));
    const n = (seen.get(id) ?? 0) + 1;
    seen.set(id, n);
    if (n > 1) id = `${id}#${n}`;
    return { ...t, id };
  });
}

/** 파싱 + 형식 판정 + 정규화를 한 번에. 화면의 "감지 요약"에 쓰는 값들을 돌려준다. */
export function toTraces(records: Json[]): { format: SourceFormat | null; traces: Trace[] } {
  if (records.length === 0) return { format: null, traces: [] };
  const format = detectFormat(records);
  return { format, traces: normalize(records) };
}
