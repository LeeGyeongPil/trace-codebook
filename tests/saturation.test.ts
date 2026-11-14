// AC-5: 포화 곡선과 배지
import { describe, expect, it } from 'vitest';
import { emptyState, reducer, type Action, type ProjectState } from '../src/core/annotations';
import { saturation } from '../src/core/saturation';
import { sampleProject } from './helpers';

const at = '2026-11-14T00:00:00.000Z';

/** n 건을 검토하고, newAt 자리마다 새 유형, 나머지 실패는 첫 유형에 붙인다 */
function sequence(n: number, newAt: number[]): ProjectState {
  let s = emptyState();
  let modes = 0;
  for (let i = 1; i <= n; i++) {
    const traceId = `t${i}`;
    const tgt = { traceId, source: 'openai-jsonl', at };
    if (newAt.includes(i)) {
      modes++;
      s = reducer(s, { type: 'addMode', name: `mode ${modes}` });
      s = reducer(s, { type: 'assign', modeId: `m${modes}`, ...tgt } as Action);
    } else s = reducer(s, { type: 'verdict', verdict: 'pass', ...tgt });
  }
  return s;
}

describe('saturation', () => {
  it('bundled example annotations: n=10 -> 3, n=20 -> 5, n=40 -> 5, badge on', () => {
    const sat = saturation(sampleProject().state);
    const at = (n: number) => sat.points.find((p) => p.n === n)!.modes;
    expect(sat.reviewed).toBe(40);
    expect(sat.firstSeen).toEqual([2, 5, 9, 13, 19]);
    expect([at(10), at(20), at(40)]).toEqual([3, 5, 5]);
    expect(sat.saturated).toBe(true);
  });

  it('badge stays off when the last new mode is fewer than 20 reviews ago', () => {
    expect(saturation(sequence(30, [3, 15])).saturated).toBe(false); // 15 뒤로 15건뿐
    expect(saturation(sequence(34, [3, 15])).saturated).toBe(false); // 19건
    expect(saturation(sequence(35, [3, 15])).saturated).toBe(true); // 20건
  });

  it('badge is off without any failure mode', () => {
    const s = sequence(50, []);
    expect(saturation(s).saturated).toBe(false);
    expect(saturation(s).points.at(-1)).toEqual({ n: 50, modes: 0 });
  });

  it('x axis counts reviewed traces only (notes without verdict are not reviews)', () => {
    let s = sequence(3, [1]);
    s = reducer(s, { type: 'note', note: 'thinking', traceId: 'x', source: 'openai-jsonl', at });
    expect(saturation(s).reviewed).toBe(3);
  });
});
