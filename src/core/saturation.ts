// 이론적 포화: "더 읽어도 새 실패 유형이 안 나온다"는 신호.
// x = 검토한 트레이스 수(검토 순서), y = 그때까지 나온 유형 수.
// 유형이 "나온" 시점은 그 유형이 붙은 실패 중 가장 먼저 검토한 것의 순서다.
import type { ProjectState } from './annotations';
import { reviewedInOrder } from './annotations';

/** 최근 몇 건 동안 새 유형이 없으면 포화로 볼지 */
export const SATURATION_WINDOW = 20;

export type Saturation = {
  points: { n: number; modes: number }[];
  /** 각 유형이 처음 나온 n (오름차순) */
  firstSeen: number[];
  reviewed: number;
  saturated: boolean;
};

export function saturation(s: ProjectState, window = SATURATION_WINDOW): Saturation {
  const reviewed = reviewedInOrder(s);
  // 검토 순서 값에 빈칸이 있어도 되도록 n 은 "몇 번째로 검토했나"(1부터)로 다시 센다
  const first = new Map<string, number>();
  reviewed.forEach((a, i) => {
    if (a.verdict === 'fail' && a.modeId && !first.has(a.modeId)) first.set(a.modeId, i + 1);
  });
  const firstSeen = [...first.values()].sort((x, y) => x - y);

  const points: { n: number; modes: number }[] = [];
  let k = 0;
  for (let n = 1; n <= reviewed.length; n++) {
    while (k < firstSeen.length && firstSeen[k] <= n) k++;
    points.push({ n, modes: k });
  }
  const last = firstSeen[firstSeen.length - 1] ?? 0;
  // 유형이 하나 이상 있고, 마지막 새 유형 뒤로 window 건 이상 더 읽었으면 포화
  const saturated = firstSeen.length > 0 && reviewed.length - last >= window;
  return { points, firstSeen, reviewed: reviewed.length, saturated };
}
