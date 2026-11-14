// AC-1: 어댑터 5종이 공통 Trace 로 바뀐다.
import { describe, expect, it } from 'vitest';
import { detect, normalize, parseText, UnknownFormatError } from '../src/adapters';
import { fnv1a64 } from '../src/adapters/hash';
import { fx, sample } from './helpers';

const load = (name: string) => normalize(parseText(fx(name)).records);

describe('OpenAI message JSONL', () => {
  it('links tool calls to tool results and flattens content parts', () => {
    const t = load('openai.jsonl');
    expect(t).toHaveLength(2);
    expect(t[0].source).toBe('openai-jsonl');
    expect(t[0].messages[2].toolCalls[0]).toEqual({ id: 'call_1', name: 'get_weather', args: '{"city":"Paris"}' });
    expect(t[0].messages[3].toolResultFor).toBe('call_1');
    expect(t[1].messages[0].text).toBe('Hi');
  });
});

describe('Anthropic message JSONL', () => {
  it('splits tool_use / tool_result blocks and keeps system', () => {
    const [t] = load('anthropic.jsonl');
    expect(t.source).toBe('anthropic-jsonl');
    expect(t.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'tool', 'assistant']);
    expect(t.messages[0].text).toBe('Be brief.');
    expect(t.messages[2].toolCalls[0]).toEqual({ id: 'toolu_1', name: 'get_weather', args: '{"city":"Seoul"}' });
    expect(t.messages[3]).toMatchObject({ toolResultFor: 'toolu_1', text: 'clear, 12C' });
  });
});

describe('OTLP JSON', () => {
  it('groups GenAI parts and OpenInference flattened spans by traceId', () => {
    const t = load('otlp.json');
    expect(detect(JSON.parse(fx('otlp.json')))).toBe('otlp-json');
    expect(t.map((x) => x.id)).toEqual(['aaaa', 'bbbb']);
    expect(t[0].spanCount).toBe(2);
    expect(t[0].messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'tool', 'assistant']);
    // `result` 표기의 tool_call_response
    expect(t[0].messages[3]).toMatchObject({ toolResultFor: 'c1', text: 'rainy, 57F' });
    expect(t[1].messages[1].toolCalls[0]).toEqual({ id: 'k1', name: 'calc', args: '{"e":"2+2"}' });
    expect(t[0].contentMissing).toBeUndefined();
  });

  it('accepts snake_case envelopes, structured (non-string) messages and the `response` field', () => {
    const t = load('otlp-snake.json');
    expect(t.map((x) => x.id)).toEqual(['cccc', 'dddd']);
    expect(t[0].source).toBe('otlp-json');
    expect(t[0].messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    expect(t[0].messages[1].toolCalls[0]).toEqual({ id: 't1', name: 'lookup_order', args: '{"order_id":"BP-1"}' });
    expect(t[0].messages[2]).toMatchObject({ toolResultFor: 't1', text: 'shipped' });
    expect(t[0].messages[3].text).toBe('It has shipped.');
  });

  it('marks span traces without message content as contentMissing', () => {
    const t = load('otlp-snake.json');
    expect(t[1]).toMatchObject({ id: 'dddd', contentMissing: true, messages: [] });
  });
});

describe('Langfuse single-trace JSON', () => {
  it('reads a multi-line document and uses the last generation input + output', () => {
    const [t] = load('langfuse-trace.json');
    expect(t.source).toBe('langfuse-trace');
    expect(t.id).toBe('lf-1');
    expect(t.messages.map((m) => m.text)).toEqual(['Use docs.', 'refund?', 'Refunds take 30 days.']);
    expect(t.spanCount).toBe(2);
  });

  it('reads a pretty-printed (indented) export', () => {
    const pretty = JSON.stringify(JSON.parse(fx('langfuse-trace.json')), null, 2);
    const [t] = normalize(parseText(pretty).records);
    expect(t.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant']);
  });
});

describe('Phoenix span JSONL', () => {
  it('handles nested and flattened attributes', () => {
    const t = load('phoenix.jsonl');
    expect(t.map((x) => x.source)).toEqual(['phoenix-jsonl', 'phoenix-jsonl']);
    expect(t.map((x) => x.messages.map((m) => m.text))).toEqual([
      ['Name a color', 'Blue'],
      ['Hi', 'Hey'],
    ]);
  });
});

describe('format detection', () => {
  it('throws a clear error listing keys for unknown shapes', () => {
    expect(() => normalize([{ foo: 1, bar: 2 }])).toThrow(UnknownFormatError);
    expect(() => normalize([{ foo: 1, bar: 2 }])).toThrow(/^unknown trace format: keys=foo,bar$/);
  });

  it('opens every bundled per-format sample', () => {
    const cases: [string, string, number][] = [
      ['support-agent.jsonl', 'openai-jsonl', 40],
      ['anthropic.jsonl', 'anthropic-jsonl', 2],
      ['otlp.json', 'otlp-json', 2],
      ['langfuse-trace.json', 'langfuse-trace', 1],
      ['phoenix.jsonl', 'phoenix-jsonl', 2],
    ];
    for (const [file, source, n] of cases) {
      const t = normalize(parseText(sample(file)).records);
      expect(t, file).toHaveLength(n);
      expect(t[0].source, file).toBe(source);
    }
    // otlp 샘플의 두 번째 트레이스는 content capture 를 끈 계측 예시
    expect(normalize(parseText(sample('otlp.json')).records)[1].contentMissing).toBe(true);
  });

  it('does not modify the input records (source stays unchanged)', () => {
    for (const name of ['openai.jsonl', 'anthropic.jsonl', 'otlp.json', 'langfuse-trace.json', 'phoenix.jsonl']) {
      const { records } = parseText(fx(name));
      const before = JSON.stringify(records);
      normalize(records);
      expect(JSON.stringify(records), name).toBe(before);
    }
  });
});

describe('content hash', () => {
  it('is real 64-bit FNV-1a (known test vectors)', () => {
    expect(fnv1a64('')).toBe('cbf29ce484222325');
    expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
    expect(fnv1a64('foobar')).toBe('85944171f73967e8');
  });
});
