// AC-6: 내보내기·가져오기
import { describe, expect, it } from 'vitest';
import { normalize, parseText } from '../src/adapters';
import { emptyState, reducer } from '../src/core/annotations';
import { parseCsv } from '../src/core/csv';
import {
  ANNOTATION_FIELDS,
  exportAnnotationsJsonl,
  exportLabelsCsv,
  exportTaxonomyCsv,
  exportTaxonomyMarkdown,
} from '../src/core/exporters';
import { importText } from '../src/core/importers';
import { translate } from '../src/i18n';
import { sample, sampleProject } from './helpers';

describe('export', () => {
  it('annotation JSONL lines have exactly the documented fields', () => {
    const { state } = sampleProject();
    const lines = exportAnnotationsJsonl(state).trim().split('\n');
    expect(lines).toHaveLength(40);
    for (const line of lines) expect(Object.keys(JSON.parse(line))).toEqual([...ANNOTATION_FIELDS]);
    expect(JSON.parse(lines[1])).toMatchObject({
      trace_id: 'sup-002',
      source: 'openai-jsonl',
      verdict: 'fail',
      failure_mode: 'Policy hallucination',
      review_order: 2,
    });
    // 동봉 예시 주석과 같은 내용으로 다시 나온다
    expect(exportAnnotationsJsonl(state)).toBe(sample('support-agent.annotations.jsonl'));
  });

  it('taxonomy CSV header and rows', () => {
    const csv = exportTaxonomyCsv(sampleProject().state);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('failure_mode,definition,count,share_of_failures,example_trace_ids');
    const rows = parseCsv(csv);
    expect(rows[1]).toEqual([
      'Policy hallucination',
      expect.stringContaining('contradicts the policy text'),
      '5',
      '0.3125',
      'sup-002;sup-007;sup-015',
    ]);
    expect(csv).toBe(sample('support-agent.taxonomy.csv'));
  });

  it('label CSV header and rows', () => {
    const lines = exportLabelsCsv(sampleProject().state).trim().split('\n');
    expect(lines[0]).toBe('trace_id,verdict,failure_mode');
    expect(lines).toHaveLength(41);
    expect(lines[1]).toBe('sup-001,pass,');
    expect(lines[2]).toBe('sup-002,fail,Policy hallucination');
  });

  it('Markdown report follows the chosen language', () => {
    const { state } = sampleProject();
    const en = exportTaxonomyMarkdown(state, (m, v) => translate('en', m, v));
    const ko = exportTaxonomyMarkdown(state, (m, v) => translate('ko', m, v));
    expect(en).toContain('# Failure mode taxonomy');
    expect(en).toContain('| Policy hallucination |');
    expect(en).toContain('31.3%');
    expect(ko).toContain('# 실패 유형 분류표');
    expect(ko).toContain('통과 22, 실패 16, 보류 2');
  });

  it('CSV quoting survives commas, quotes and newlines in notes', () => {
    let s = emptyState();
    s = reducer(s, { type: 'addMode', name: 'Odd, "name"' });
    s = reducer(s, { type: 'editMode', modeId: 'm1', definition: 'line one\nline two' });
    expect(parseCsv(exportTaxonomyCsv(s))[1].slice(0, 2)).toEqual(['Odd, "name"', 'line one\nline two']);
  });
});

describe('import', () => {
  it('importing exported JSONL into an empty project reproduces the state', () => {
    const { traces, state } = sampleProject();
    const index = new Map(traces.map((t) => [t.id, t.source as string]));
    const { state: back, report } = importText(emptyState(), exportAnnotationsJsonl(state), index);
    expect(report).toMatchObject({ kind: 'annotations', imported: 40, kept: 0, unmatched: 0 });
    expect(exportAnnotationsJsonl(back)).toBe(exportAnnotationsJsonl(state));
    expect(exportLabelsCsv(back)).toBe(exportLabelsCsv(state));
    expect(back.nextOrder).toBe(41);
  });

  it('conflicts keep the newer reviewed_at; unknown ids are counted', () => {
    const index = new Map([
      ['a', 'openai-jsonl'],
      ['b', 'openai-jsonl'],
    ]);
    let local = emptyState();
    local = reducer(local, { type: 'note', note: 'local newer', traceId: 'a', source: 'openai-jsonl', at: '2026-11-14T12:00:00.000Z' });
    local = reducer(local, { type: 'note', note: 'local older', traceId: 'b', source: 'openai-jsonl', at: '2026-11-14T08:00:00.000Z' });
    const incoming = [
      { trace_id: 'a', source: 'openai-jsonl', verdict: 'pass', note: 'theirs older', failure_mode: null, review_order: 1, reviewed_at: '2026-11-14T10:00:00.000Z' },
      { trace_id: 'b', source: 'openai-jsonl', verdict: 'fail', note: 'theirs newer', failure_mode: 'New mode', review_order: 2, reviewed_at: '2026-11-14T10:00:00.000Z' },
      { trace_id: 'zzz', source: 'openai-jsonl', verdict: 'pass', note: '', failure_mode: null, review_order: 3, reviewed_at: '2026-11-14T10:00:00.000Z' },
    ]
      .map((r) => JSON.stringify(r))
      .join('\n');
    const { state, report } = importText(local, incoming, index);
    expect(report).toMatchObject({ imported: 1, kept: 1, unmatched: 1 });
    expect(state.annotations.a.note).toBe('local newer');
    expect(state.annotations.b).toMatchObject({ note: 'theirs newer', verdict: 'fail' });
    expect(state.modes.map((m) => m.name)).toEqual(['New mode']);
    expect(state.annotations.zzz).toBeUndefined();
  });

  it('reports unreadable lines', () => {
    const { report } = importText(emptyState(), '{"trace_id":"a"}\nnot json\n', new Map([['a', 'x']]));
    expect(report.badLines).toEqual([2]);
  });

  it('label CSV can be imported too', () => {
    const { traces, state } = sampleProject();
    const index = new Map(traces.map((t) => [t.id, t.source as string]));
    const { state: back, report } = importText(emptyState(), exportLabelsCsv(state), index);
    expect(report.kind).toBe('labels');
    expect(exportLabelsCsv(back)).toBe(exportLabelsCsv(state));
  });

  it('the source trace text is never modified', () => {
    const text = sample('support-agent.jsonl');
    const copy = String(text);
    const { records } = parseText(text);
    const before = JSON.stringify(records);
    const traces = normalize(records);
    const index = new Map(traces.map((t) => [t.id, t.source as string]));
    importText(emptyState(), sample('support-agent.annotations.jsonl'), index);
    expect(text).toBe(copy);
    expect(JSON.stringify(records)).toBe(before);
  });
});
