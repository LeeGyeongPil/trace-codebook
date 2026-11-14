// 내보내기. 모두 문자열을 돌려주는 순수 함수다(파일 저장은 화면이 한다).
// - 주석 JSONL: 판정·메모·유형을 트레이스 ID 로 이은 사이드카. 다시 가져오면 이어서 할 수 있다.
// - 유형 분류표 CSV / Markdown: 유형 이름·정의·건수·비율·예시 → 다음 단계(LLM 심판 프롬프트)의 재료
// - 라벨 CSV: trace_id,verdict,failure_mode → 심판·일치도 검증의 정답 라벨
import type { ProjectState } from './annotations';
import { modeCounts, unassignedFailureCount, verdictCounts } from './taxonomy';
import { csvRow } from './csv';

export const ANNOTATION_FIELDS = [
  'trace_id',
  'source',
  'verdict',
  'note',
  'failure_mode',
  'review_order',
  'reviewed_at',
] as const;
export const TAXONOMY_CSV_HEADER = 'failure_mode,definition,count,share_of_failures,example_trace_ids';
export const LABEL_CSV_HEADER = 'trace_id,verdict,failure_mode';

export type AnnotationRow = {
  trace_id: string;
  source: string;
  verdict: 'pass' | 'fail' | 'defer' | null;
  note: string;
  failure_mode: string | null;
  review_order: number | null;
  reviewed_at: string | null;
};

const modeName = (s: ProjectState, id: string | null): string | null =>
  id == null ? null : (s.modes.find((m) => m.id === id)?.name ?? null);

/** 손댄(판정이나 메모가 있는) 주석을 검토 순서대로 */
export function annotationRows(s: ProjectState): AnnotationRow[] {
  return Object.values(s.annotations)
    .filter((a) => a.verdict != null || a.note !== '')
    .sort((x, y) => (x.reviewOrder ?? Infinity) - (y.reviewOrder ?? Infinity) || x.traceId.localeCompare(y.traceId))
    .map((a) => ({
      trace_id: a.traceId,
      source: a.source,
      verdict: a.verdict,
      note: a.note,
      failure_mode: a.verdict === 'fail' ? modeName(s, a.modeId) : null,
      review_order: a.reviewOrder,
      reviewed_at: a.reviewedAt,
    }));
}

export function exportAnnotationsJsonl(s: ProjectState): string {
  return annotationRows(s)
    .map((r) => JSON.stringify(r))
    .map((line) => line + '\n')
    .join('');
}

export function exportTaxonomyCsv(s: ProjectState): string {
  const lines = [TAXONOMY_CSV_HEADER];
  for (const c of modeCounts(s))
    lines.push(csvRow([c.mode.name, c.mode.definition, c.count, c.share.toFixed(4), c.examples.join(';')]));
  return lines.join('\n') + '\n';
}

export function exportLabelsCsv(s: ProjectState): string {
  const lines = [LABEL_CSV_HEADER];
  for (const r of annotationRows(s)) if (r.verdict != null) lines.push(csvRow([r.trace_id, r.verdict, r.failure_mode ?? '']));
  return lines.join('\n') + '\n';
}

/** Markdown 보고서. 제목·머리말은 사용자가 고른 화면 언어로(t 함수를 받는다). */
export function exportTaxonomyMarkdown(s: ProjectState, t: (msgId: 'md.title' | 'md.summary' | 'md.header' | 'md.unassigned', vars?: Record<string, string | number>) => string): string {
  const v = verdictCounts(s);
  const cell = (x: string) => x.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const out = [
    `# ${t('md.title')}`,
    '',
    t('md.summary', { reviewed: v.reviewed, pass: v.pass, fail: v.fail, defer: v.defer }),
    '',
    t('md.header'),
    '|---|---|---:|---:|---|',
  ];
  const rows = [...modeCounts(s)].sort((a, b) => b.count - a.count);
  for (const c of rows)
    out.push(
      `| ${cell(c.mode.name)} | ${cell(c.mode.definition)} | ${c.count} | ${(c.share * 100).toFixed(1)}% | ${c.examples.map((e) => '`' + e + '`').join(', ')} |`,
    );
  out.push('', t('md.unassigned', { n: unassignedFailureCount(s) }), '');
  return out.join('\n');
}
