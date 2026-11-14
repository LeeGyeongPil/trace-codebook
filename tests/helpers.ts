// 테스트 공용 도우미: 픽스처·동봉 샘플 읽기
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalize, parseText, type Trace } from '../src/adapters';
import { emptyState, type ProjectState } from '../src/core/annotations';
import { importText } from '../src/core/importers';

// jsdom 환경에선 import.meta.url 이 파일 경로가 아니라서 레포 뿌리(테스트 실행 위치) 기준으로 읽는다
const ROOT = process.cwd();
export const fx = (name: string): string => readFileSync(join(ROOT, 'tests', 'fixtures', name), 'utf8');
export const sample = (name: string): string => readFileSync(join(ROOT, 'public', 'samples', name), 'utf8');

/** 동봉 샘플 40건 */
export function sampleTraces(): Trace[] {
  return normalize(parseText(sample('support-agent.jsonl')).records);
}

/** 샘플 + 예시 주석 + 유형 정의를 빈 프로젝트에 가져온 상태 */
export function sampleProject(): { traces: Trace[]; state: ProjectState } {
  const traces = sampleTraces();
  const index = new Map(traces.map((t) => [t.id, t.source as string]));
  let { state } = importText(emptyState(), sample('support-agent.annotations.jsonl'), index);
  ({ state } = importText(state, sample('support-agent.taxonomy.csv'), index));
  return { traces, state };
}
