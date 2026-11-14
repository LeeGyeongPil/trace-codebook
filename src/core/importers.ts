// 가져오기: 내보낸 주석 JSONL(동료 것 포함)·유형 분류표 CSV·라벨 CSV 를 지금 프로젝트에 합친다.
// 같은 트레이스에 둘 다 주석이 있으면 reviewed_at 이 더 새로운 쪽을 남긴다.
// 지금 열린 파일에 없는 trace_id 는 건너뛰고 몇 개였는지 알려 준다.
import type { Annotation, ProjectState, Verdict } from './annotations';
import { reducer } from './annotations';
import { parseCsv } from './csv';
import { LABEL_CSV_HEADER, TAXONOMY_CSV_HEADER, type AnnotationRow } from './exporters';

export type ImportReport = {
  kind: 'annotations' | 'taxonomy' | 'labels';
  /** 새로 들어오거나 덮어쓴 주석 수 */
  imported: number;
  /** 지금 것이 더 새로워서 그대로 둔 수 */
  kept: number;
  /** 열린 파일에 없는 trace_id 수 */
  unmatched: number;
  /** 읽지 못한 줄 번호 */
  badLines: number[];
};

const VERDICTS = new Set(['pass', 'fail', 'defer']);
const time = (v: string | null | undefined): number => (v ? Date.parse(v) || 0 : 0);

/** 유형 이름 → id. 없으면 만든다. */
function ensureMode(s: ProjectState, name: string): [ProjectState, string] {
  const found = s.modes.find((m) => m.name === name.trim());
  if (found) return [s, found.id];
  const next = reducer(s, { type: 'addMode', name });
  return [next, next.modes[next.modes.length - 1].id];
}

/** 주석 행들을 합친다. traces: 지금 열린 파일의 trace_id → source */
export function mergeRows(s: ProjectState, rows: Partial<AnnotationRow>[], traces: Map<string, string>, kind: ImportReport['kind'] = 'annotations', badLines: number[] = []): { state: ProjectState; report: ImportReport } {
  const report: ImportReport = { kind, imported: 0, kept: 0, unmatched: 0, badLines };
  let state: ProjectState = { ...s, annotations: { ...s.annotations } };
  // 검토 순서대로 처리해야 유형이 "처음 나온 순서"로 만들어진다
  const sorted = [...rows].sort((a, b) => (a.review_order ?? Infinity) - (b.review_order ?? Infinity));
  for (const r of sorted) {
    const id = r.trace_id;
    if (!id || !traces.has(id)) {
      report.unmatched++;
      continue;
    }
    const existing = state.annotations[id];
    if (existing && existing.reviewedAt && time(existing.reviewedAt) >= time(r.reviewed_at)) {
      report.kept++;
      continue;
    }
    const verdict = r.verdict && VERDICTS.has(r.verdict) ? (r.verdict as Verdict) : null;
    let modeId: string | null = null;
    if (verdict === 'fail' && r.failure_mode) [state, modeId] = ensureMode(state, r.failure_mode);
    const a: Annotation = {
      traceId: id,
      source: r.source || traces.get(id) || '',
      verdict,
      note: r.note ?? existing?.note ?? '',
      modeId,
      reviewOrder: r.review_order ?? existing?.reviewOrder ?? null,
      reviewedAt: r.reviewed_at ?? existing?.reviewedAt ?? null,
    };
    if (a.reviewOrder == null) {
      a.reviewOrder = state.nextOrder;
      state = { ...state, nextOrder: state.nextOrder + 1 };
    }
    state.annotations[id] = a;
    report.imported++;
  }
  // 다음에 검토할 트레이스의 순서는 지금까지의 가장 큰 순서 + 1
  const maxOrder = Math.max(0, ...Object.values(state.annotations).map((a) => a.reviewOrder ?? 0));
  state = { ...state, nextOrder: Math.max(state.nextOrder, maxOrder + 1) };
  return { state, report };
}

/** 주석 JSONL 텍스트 → 행. 깨진 줄은 줄 번호만 모은다. */
export function parseAnnotationsJsonl(text: string): { rows: Partial<AnnotationRow>[]; badLines: number[] } {
  const rows: Partial<AnnotationRow>[] = [];
  const badLines: number[] = [];
  text.replace(/^﻿/, '').split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    try {
      const v = JSON.parse(line);
      if (v && typeof v === 'object' && typeof v.trace_id === 'string') rows.push(v);
      else badLines.push(i + 1);
    } catch {
      badLines.push(i + 1);
    }
  });
  return { rows, badLines };
}

/** 유형 분류표 CSV: 이름별로 정의를 채운다(없는 유형은 만든다). 건수 칸은 계산값이라 무시한다. */
export function mergeTaxonomyCsv(s: ProjectState, text: string): { state: ProjectState; report: ImportReport } {
  const [header, ...rows] = parseCsv(text);
  const col = (name: string) => header.indexOf(name);
  let state = s;
  let imported = 0;
  for (const r of rows) {
    const name = (r[col('failure_mode')] ?? '').trim();
    if (!name) continue;
    let id: string;
    [state, id] = ensureMode(state, name);
    state = reducer(state, { type: 'editMode', modeId: id, definition: r[col('definition')] ?? '' });
    imported++;
  }
  return { state, report: { kind: 'taxonomy', imported, kept: 0, unmatched: 0, badLines: [] } };
}

/** 어떤 파일인지 첫 줄로 알아내 알맞게 합친다. */
export function importText(s: ProjectState, text: string, traces: Map<string, string>): { state: ProjectState; report: ImportReport } {
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0].trim();
  if (firstLine.startsWith(TAXONOMY_CSV_HEADER.split(',').slice(0, 2).join(','))) return mergeTaxonomyCsv(s, text);
  if (firstLine === LABEL_CSV_HEADER) {
    const [, ...rows] = parseCsv(text);
    const parsed = rows.map((r) => ({ trace_id: r[0], verdict: (r[1] || null) as AnnotationRow['verdict'], failure_mode: r[2] || null }));
    return mergeRows(s, parsed, traces, 'labels');
  }
  const { rows, badLines } = parseAnnotationsJsonl(text);
  return mergeRows(s, rows, traces, 'annotations', badLines);
}
