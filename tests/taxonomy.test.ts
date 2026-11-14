// AC-4: 축 코딩(상호 배타·이동·삭제)과 건수 — 동봉 샘플로 목 모드 교훈 재현.
import { describe, expect, it } from 'vitest';
import { emptyState, reducer, type Action, type ProjectState } from '../src/core/annotations';
import { modeCounts, unassignedFailureCount, verdictCounts } from '../src/core/taxonomy';
import { sampleProject } from './helpers';

const at = '2026-11-14T00:00:00.000Z';
const run = (actions: Action[], s: ProjectState = emptyState()) => actions.reduce(reducer, s);
const fail = (traceId: string): Action => ({ type: 'verdict', verdict: 'fail', traceId, source: 'openai-jsonl', at });
const assign = (traceId: string, modeId: string | null): Action => ({ type: 'assign', modeId, traceId, source: 'openai-jsonl', at });

describe('axial coding', () => {
  const base = () =>
    run([
      fail('a'),
      fail('b'),
      fail('c'),
      { type: 'addMode', name: 'Policy hallucination' },
      { type: 'addMode', name: 'Wrong tool arguments' },
    ]);

  it('a note belongs to one mode; moving it decrements the old mode', () => {
    let s = run([assign('a', 'm1'), assign('b', 'm1')], base());
    expect(modeCounts(s).map((c) => c.count)).toEqual([2, 0]);
    s = reducer(s, assign('a', 'm2'));
    expect(modeCounts(s).map((c) => c.count)).toEqual([1, 1]);
    expect(unassignedFailureCount(s)).toBe(1);
  });

  it('deleting a mode moves its cards to unassigned and keeps verdict and note', () => {
    let s = run([{ type: 'note', note: 'quoted 30 days', traceId: 'a', source: 'openai-jsonl', at }, assign('a', 'm1'), assign('b', 'm1')], base());
    s = reducer(s, { type: 'deleteMode', modeId: 'm1' });
    expect(s.modes.map((m) => m.name)).toEqual(['Wrong tool arguments']);
    expect(unassignedFailureCount(s)).toBe(3);
    expect(s.annotations.a).toMatchObject({ verdict: 'fail', note: 'quoted 30 days', modeId: null });
  });

  it('assigning a mode marks the trace as fail; marking pass removes the mode', () => {
    let s = run([{ type: 'addMode', name: 'X' }, assign('z', 'm1')]);
    expect(s.annotations.z.verdict).toBe('fail');
    s = reducer(s, { type: 'verdict', verdict: 'pass', traceId: 'z', source: 'openai-jsonl', at });
    expect(s.annotations.z.modeId).toBeNull();
    expect(modeCounts(s)[0].count).toBe(0);
  });

  it('rejects empty and duplicate mode names', () => {
    const s = run([{ type: 'addMode', name: ' ' }, { type: 'addMode', name: 'A' }, { type: 'addMode', name: 'A' }]);
    expect(s.modes.map((m) => m.name)).toEqual(['A']);
    const renamed = run([{ type: 'addMode', name: 'B' }, { type: 'editMode', modeId: 'm2', name: 'A' }], s);
    expect(renamed.modes.map((m) => m.name)).toEqual(['A', 'B']);
  });
});

describe('bundled sample (mock mode) reproduces the lesson', () => {
  it('fail 16 / pass 22 / defer 2, five modes [5,4,3,2,2], first share 0.3125', () => {
    const { traces, state } = sampleProject();
    expect(traces).toHaveLength(40);
    expect(verdictCounts(state)).toEqual({ pass: 22, fail: 16, defer: 2, reviewed: 40 });
    const counts = modeCounts(state);
    expect(counts.map((c) => c.count)).toEqual([5, 4, 3, 2, 2]);
    expect(counts.map((c) => c.mode.name)).toEqual([
      'Policy hallucination',
      'Wrong tool arguments',
      'Ignored user constraint',
      'Missing human handoff',
      'Tool error reported as success',
    ]);
    expect(counts[0].share).toBe(0.3125);
    expect(counts[0].examples).toEqual(['sup-002', 'sup-007', 'sup-015']);
    expect(unassignedFailureCount(state)).toBe(0);
    // 정의는 분류표 CSV 에서 왔다
    expect(counts.every((c) => c.mode.definition.length > 20)).toBe(true);
  });

  it('every planted failure is visible in the trace content (not fake numbers)', () => {
    const { traces, state } = sampleProject();
    const byId = new Map(traces.map((t) => [t.id, t]));
    const text = (id: string) => byId.get(id)!.messages.map((m) => m.text + m.toolCalls.map((c) => c.args).join('')).join('\n');
    const policy = state.modes.find((m) => m.name === 'Policy hallucination')!;
    for (const a of Object.values(state.annotations).filter((x) => x.modeId === policy.id)) {
      // 정책 실패는 모두 search_policy 결과가 있고 그와 다른 답을 한다
      expect(byId.get(a.traceId)!.messages.some((m) => m.toolCalls.some((c) => c.name === 'search_policy'))).toBe(true);
    }
    const toolErr = state.modes.find((m) => m.name === 'Tool error reported as success')!;
    for (const a of Object.values(state.annotations).filter((x) => x.modeId === toolErr.id)) expect(text(a.traceId)).toMatch(/error/);
  });
});
