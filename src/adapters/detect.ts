// 첫 레코드의 모양으로 형식을 정한다. 모르는 모양이면 어떤 키가 있었는지 담아 오류를 낸다
// (사용자가 이슈에 붙여 주면 어댑터를 추가하기 쉽다).
import type { Json, SourceFormat } from './types';
import { hasAnthropicBlocks } from './anthropic';

export class UnknownFormatError extends Error {
  readonly keys: string[];
  constructor(keys: string[]) {
    super(`unknown trace format: keys=${keys.join(',')}`);
    this.name = 'UnknownFormatError';
    this.keys = keys;
  }
}

export function detect(first: Json): SourceFormat | 'unknown' {
  if (first == null || typeof first !== 'object') return 'unknown';
  if (first.resourceSpans || first.resource_spans) return 'otlp-json';
  if (Array.isArray(first.observations)) return 'langfuse-trace';
  if (first.context?.span_id || (first.span_id && first.attributes)) return 'phoenix-jsonl';
  if (Array.isArray(first.messages)) return hasAnthropicBlocks(first.messages) ? 'anthropic-jsonl' : 'openai-jsonl';
  return 'unknown';
}

/**
 * 레코드 목록 전체의 형식. 기본은 첫 레코드로 정하되,
 * 메시지 JSONL 은 첫 줄에 도구 호출이 없으면 OpenAI 와 Anthropic 이 똑같이 생겨서
 * Anthropic 블록이 한 줄이라도 있거나 system 이 메시지 밖에 있으면 Anthropic 으로 본다.
 */
export function detectFormat(records: Json[]): SourceFormat {
  const kind = detect(records[0]);
  if (kind === 'unknown') {
    const first = records[0];
    const keys = first != null && typeof first === 'object' ? Object.keys(first) : [typeof first];
    throw new UnknownFormatError(keys);
  }
  if (kind === 'openai-jsonl' || kind === 'anthropic-jsonl') {
    const anthropic = records.some(
      (r: Json) => Array.isArray(r?.messages) && (hasAnthropicBlocks(r.messages) || r.system != null),
    );
    return anthropic ? 'anthropic-jsonl' : 'openai-jsonl';
  }
  return kind;
}
