// 파일 텍스트 → JSON 레코드 목록.
// 1) 들여쓰기된 문서(Langfuse·OTLP 내보내기)는 줄 단위로 읽으면 깨진다 → 문서 전체 파싱을 먼저 시도.
// 2) 아니면 JSONL: 한 줄 = 레코드 하나, 깨진 줄은 건너뛰고 줄 번호를 남긴다.
// 큰 파일은 file.stream() 청크로 들어오므로, 청크 경계에 걸친 줄을 이어 붙이는 parseStream 을 쓴다.
import type { Json } from './types';

export type SkippedLine = { line: number; error: string };
export type ParseResult = { records: Json[]; skipped: SkippedLine[] };

/** 줄을 하나씩 받아 레코드를 모으는 상태 기계. 동기·비동기 읽기가 같이 쓴다. */
class LineCollector {
  private lineNo = 0;
  private records: Json[] = [];
  private skipped: SkippedLine[] = [];
  // 첫 줄이 JSON 한 덩어리로 안 풀리면 "여러 줄짜리 문서"일 수 있어 원문을 모아 둔다
  private docLines: string[] | null = null;
  private sawFirst = false;

  push(raw: string): void {
    this.lineNo++;
    const line = (this.lineNo === 1 ? raw.replace(/^﻿/, '') : raw).replace(/\r$/, '');
    if (this.docLines) this.docLines.push(line);
    if (!line.trim()) return;
    try {
      const v = JSON.parse(line);
      // 한 줄짜리 배열 문서([{...},{...}])는 원소 하나하나가 레코드
      if (Array.isArray(v)) this.records.push(...v);
      else this.records.push(v);
    } catch (e) {
      if (!this.sawFirst && /^\s*[[{]/.test(line)) this.docLines = [line];
      this.skipped.push({ line: this.lineNo, error: (e as Error).message });
    }
    this.sawFirst = true;
  }

  finish(): ParseResult {
    if (this.docLines) {
      try {
        const doc = JSON.parse(this.docLines.join('\n'));
        return { records: Array.isArray(doc) ? doc : [doc], skipped: [] };
      } catch {
        /* 문서도 아니면 줄 단위 결과(깨진 줄 목록 포함)를 그대로 쓴다 */
      }
    }
    return { records: this.records, skipped: this.skipped };
  }
}

/** 문자열 전체를 한 번에 */
export function parseText(text: string): ParseResult {
  const c = new LineCollector();
  for (const line of text.split('\n')) c.push(line);
  return c.finish();
}

/** 청크 스트림(문자열 조각들)을 줄 단위로. 청크 경계에 걸친 줄은 다음 청크와 이어 붙인다. */
export async function parseStream(chunks: AsyncIterable<string>): Promise<ParseResult> {
  const c = new LineCollector();
  let buf = '';
  for await (const chunk of chunks) {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      c.push(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  }
  c.push(buf); // 마지막 줄(끝에 줄바꿈이 없을 때)
  return c.finish();
}

/**
 * 브라우저 File/Blob → 문자열 청크. file.text() 로 한 번에 읽지 않고 스트림으로 읽어
 * 큰 파일에서도 메모리를 덜 쓴다. 멀티바이트 글자가 청크 경계에 걸려도 TextDecoder 가 이어 준다.
 */
export async function* blobChunks(blob: Blob): AsyncGenerator<string> {
  // Blob.stream() 이 없는 오래된 환경에서는 한 번에 읽는다
  if (typeof blob.stream !== 'function') {
    yield await blob.text();
    return;
  }
  const reader = blob.stream().getReader();
  const decoder = new TextDecoder('utf-8');
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value, { stream: true });
    }
    const rest = decoder.decode();
    if (rest) yield rest;
  } finally {
    reader.releaseLock(); // 중간에 멈춰도 스트림 잠금을 푼다
  }
}
