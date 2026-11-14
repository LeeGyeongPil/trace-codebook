// Phoenix span JSONL: 한 줄 = span 하나. {context:{trace_id, span_id}, parent_id, start_time, attributes}
// attributes 는 중첩 객체(attributes.llm.input_messages)일 수도, 평탄화 키일 수도 있다 — spans.ts 가 둘 다 처리.
import type { Json, Trace } from './types';
import { assembleFromSpans } from './spans';

export function fromPhoenixSpans(rows: Json[]): Trace[] {
  return assembleFromSpans(
    rows.map((r: Json) => ({
      traceId: String(r?.context?.trace_id ?? r?.trace_id ?? ''),
      spanId: String(r?.context?.span_id ?? r?.span_id ?? ''),
      parentId: r?.parent_id ?? undefined,
      start: String(r?.start_time ?? ''),
      attrs: r?.attributes ?? {},
    })),
    'phoenix-jsonl',
  );
}
