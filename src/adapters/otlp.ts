// OTLP JSON 봉투: resourceSpans[].scopeSpans[].spans[]{traceId, spanId, attributes:[{key, value:{stringValue|…}}]}
// 사양은 lowerCamelCase 지만 snake_case(resource_spans) 로 내보내는 도구도 있어 둘 다 받는다.
import type { Json, Trace } from './types';
import { assembleFromSpans, type FlatSpan } from './spans';

/** OTLP AnyValue → 평범한 JS 값 */
export function anyValue(v: Json): Json {
  if (v == null || typeof v !== 'object') return v ?? null;
  if ('stringValue' in v || 'string_value' in v) return v.stringValue ?? v.string_value;
  if ('intValue' in v || 'int_value' in v) return Number(v.intValue ?? v.int_value);
  if ('doubleValue' in v || 'double_value' in v) return Number(v.doubleValue ?? v.double_value);
  if ('boolValue' in v || 'bool_value' in v) return Boolean(v.boolValue ?? v.bool_value);
  const arr = v.arrayValue ?? v.array_value;
  if (arr) return (arr.values ?? []).map(anyValue);
  const kv = v.kvlistValue ?? v.kvlist_value;
  if (kv) return Object.fromEntries((kv.values ?? []).map((e: Json) => [e.key, anyValue(e.value)]));
  return null;
}

/** OTLP 문서 하나 → span 평탄화 → traceId 로 묶은 Trace[] */
export function flattenOtlp(doc: Json): FlatSpan[] {
  const spans: FlatSpan[] = [];
  for (const rs of doc?.resourceSpans ?? doc?.resource_spans ?? [])
    for (const ss of rs?.scopeSpans ?? rs?.scope_spans ?? [])
      for (const sp of ss?.spans ?? [])
        spans.push({
          traceId: String(sp.traceId ?? sp.trace_id ?? ''),
          spanId: String(sp.spanId ?? sp.span_id ?? ''),
          parentId: sp.parentSpanId ?? sp.parent_span_id ?? undefined,
          start: String(sp.startTimeUnixNano ?? sp.start_time_unix_nano ?? ''),
          attrs: Object.fromEntries((sp.attributes ?? []).map((e: Json) => [e.key, anyValue(e.value)])),
        });
  return spans;
}

/** 여러 OTLP 문서(한 파일에 여러 줄일 수도)의 span 을 모두 모아 한 번에 묶는다 */
export function fromOtlp(docs: Json[]): Trace[] {
  return assembleFromSpans(docs.flatMap(flattenOtlp), 'otlp-json');
}
