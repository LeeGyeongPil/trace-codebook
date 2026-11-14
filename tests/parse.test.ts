// AC-2: 읽기 견고성 — 청크 경계, 깨진 줄, 내용 해시 ID, 속도.
import { describe, expect, it } from 'vitest';
import { normalize, parseStream, parseText } from '../src/adapters';
import { fx } from './helpers';

async function* chunks(text: string, size: number) {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}

describe('parse', () => {
  it('7-character chunks give the same records as reading the whole text', async () => {
    for (const name of ['openai.jsonl', 'anthropic.jsonl', 'otlp.json', 'langfuse-trace.json', 'phoenix.jsonl', 'broken.jsonl']) {
      const text = fx(name);
      const streamed = await parseStream(chunks(text, 7));
      expect(streamed, name).toEqual(parseText(text));
    }
    const streamed = await parseStream(chunks(fx('openai.jsonl'), 7));
    expect(normalize(streamed.records).map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('skips broken lines and reports their line numbers', async () => {
    const r = parseText(fx('broken.jsonl'));
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped).toMatchObject([{ line: 3 }]);
    expect(normalize(r.records).map((t) => t.id)).toEqual(['b1', 'b2', 'b4']);
    const s = await parseStream(chunks(fx('broken.jsonl'), 7));
    expect(s.skipped).toMatchObject([{ line: 3 }]);
  });

  it('handles CRLF line endings and a UTF-8 BOM', () => {
    const text = '﻿' + fx('openai.jsonl').replace(/\n/g, '\r\n');
    const r = parseText(text);
    expect(r.skipped).toEqual([]);
    expect(normalize(r.records).map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('records without an id get a content-hash id that survives reordering', () => {
    const text = fx('noid.jsonl');
    const a = normalize(parseText(text).records);
    for (const t of a) expect(t.id).toMatch(/^h-[0-9a-f]{16}$/);
    expect(new Set(a.map((t) => t.id)).size).toBe(3);

    const shuffled = text.trim().split('\n').reverse().join('\n');
    const b = normalize(parseText(shuffled).records);
    const byText = (ts: typeof a) => Object.fromEntries(ts.map((t) => [t.messages[0].text, t.id]));
    expect(byText(b)).toEqual(byText(a));
  });

  it('identical id-less conversations get distinct ids', () => {
    const line = fx('noid.jsonl').split('\n')[0];
    const t = normalize(parseText(`${line}\n${line}\n`).records);
    expect(t[0].id).toMatch(/^h-[0-9a-f]{16}$/);
    expect(t[1].id).toBe(`${t[0].id}#2`);
  });

  it('normalizes 5,000 traces in under 500 ms', () => {
    const line = fx('openai.jsonl').split('\n')[0];
    const big = Array.from({ length: 5000 }, (_, i) => line.replace('"t1"', `"t${i}"`)).join('\n');
    const t0 = performance.now();
    const t = normalize(parseText(big).records);
    const ms = performance.now() - t0;
    expect(t).toHaveLength(5000);
    expect(ms).toBeLessThan(500);
  });

  it('id-less 5,000 traces (content hashing) also stay under 500 ms', () => {
    const lines = Array.from({ length: 5000 }, (_, i) => JSON.stringify({ messages: [{ role: 'user', content: `question ${i} `.repeat(20) }, { role: 'assistant', content: 'answer '.repeat(40) }] }));
    const t0 = performance.now();
    const t = normalize(parseText(lines.join('\n')).records);
    const ms = performance.now() - t0;
    expect(new Set(t.map((x) => x.id)).size).toBe(5000);
    expect(ms).toBeLessThan(500);
  });
});
