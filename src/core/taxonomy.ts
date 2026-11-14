// 축 코딩 결과 세기: 판정별 건수, 유형별 건수와 "실패 대비 비율".
import type { Annotation, FailureMode, ProjectState } from './annotations';
import { reviewedInOrder } from './annotations';

export type VerdictCounts = { pass: number; fail: number; defer: number; reviewed: number };

export function verdictCounts(s: ProjectState): VerdictCounts {
  const c: VerdictCounts = { pass: 0, fail: 0, defer: 0, reviewed: 0 };
  for (const a of Object.values(s.annotations)) {
    if (a.verdict == null) continue;
    c[a.verdict]++;
    c.reviewed++;
  }
  return c;
}

export type ModeCount = {
  mode: FailureMode;
  count: number;
  /** count / 전체 실패 수 (실패가 0 이면 0) */
  share: number;
  /** 검토 순서가 빠른 예시 트레이스 ID */
  examples: string[];
};

/** 실패 판정이면서 이 유형이 붙은 주석들(검토 순서대로) */
export function failuresOf(s: ProjectState, modeId: string | null): Annotation[] {
  return reviewedInOrder(s).filter((a) => a.verdict === 'fail' && a.modeId === modeId);
}

/** 유형별 건수. 유형을 만든 순서 그대로 돌려준다(화면에서 정렬은 따로). */
export function modeCounts(s: ProjectState): ModeCount[] {
  const fails = verdictCounts(s).fail;
  return s.modes.map((mode) => {
    const items = failuresOf(s, mode.id);
    return {
      mode,
      count: items.length,
      share: fails === 0 ? 0 : items.length / fails,
      examples: items.slice(0, 3).map((a) => a.traceId),
    };
  });
}

/** 아직 유형을 안 붙인 실패 수 */
export const unassignedFailureCount = (s: ProjectState): number => failuresOf(s, null).length;
