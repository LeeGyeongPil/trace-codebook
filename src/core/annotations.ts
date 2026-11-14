// 오픈 코딩 주석의 상태와 reducer.
// 상태는 "원본 트레이스 파일과 따로" 보관한다(사이드카) — 원본은 절대 바꾸지 않는다.
// reducer 는 순수 함수라 시각(at)도 밖에서 받는다 → 테스트에서 결과가 항상 같다.

export type Verdict = 'pass' | 'fail' | 'defer';

export type Annotation = {
  traceId: string;
  source: string;
  verdict: Verdict | null;
  /** 오픈 코딩 메모 — "처음 잘못된 지점" 한 줄 */
  note: string;
  /** 축 코딩으로 붙인 실패 유형(FailureMode.id). 한 트레이스는 유형 하나에만 속한다(상호 배타). */
  modeId: string | null;
  /** 이 트레이스를 처음 검토한 순서(1부터). 포화 곡선의 x 축 */
  reviewOrder: number | null;
  reviewedAt: string | null;
};

export type FailureMode = { id: string; name: string; definition: string };

export type ProjectState = {
  annotations: Record<string, Annotation>;
  /** 만든 순서대로. 리뷰 화면의 숫자 단축키 1–9 가 이 순서를 따른다 */
  modes: FailureMode[];
  nextOrder: number;
  nextModeNum: number;
};

export const emptyState = (): ProjectState => ({ annotations: {}, modes: [], nextOrder: 1, nextModeNum: 1 });

type Target = { traceId: string; source: string; at: string };

export type Action =
  | ({ type: 'verdict'; verdict: Verdict } & Target)
  | ({ type: 'note'; note: string } & Target)
  | ({ type: 'assign'; modeId: string | null } & Target)
  | { type: 'addMode'; name: string; definition?: string }
  | { type: 'editMode'; modeId: string; name?: string; definition?: string }
  | { type: 'deleteMode'; modeId: string }
  | { type: 'replace'; state: ProjectState };

/** 주석 하나를 고친 새 상태. 처음 손댄 트레이스면 검토 순서를 매긴다. */
function touch(s: ProjectState, t: Target, change: (a: Annotation) => Annotation): ProjectState {
  const before: Annotation = s.annotations[t.traceId] ?? {
    traceId: t.traceId,
    source: t.source,
    verdict: null,
    note: '',
    modeId: null,
    reviewOrder: null,
    reviewedAt: null,
  };
  let next = change({ ...before });
  let nextOrder = s.nextOrder;
  if (next.reviewOrder == null) {
    next = { ...next, reviewOrder: nextOrder };
    nextOrder++;
  }
  next.reviewedAt = t.at;
  return { ...s, annotations: { ...s.annotations, [t.traceId]: next }, nextOrder };
}

export function reducer(s: ProjectState, a: Action): ProjectState {
  switch (a.type) {
    case 'verdict':
      // 통과·보류로 바꾸면 실패 유형은 떼어 낸다(실패가 아닌데 실패 유형에 세이면 안 된다)
      return touch(s, a, (x) => ({ ...x, verdict: a.verdict, modeId: a.verdict === 'fail' ? x.modeId : null }));
    case 'note':
      return touch(s, a, (x) => ({ ...x, note: a.note }));
    case 'assign': {
      if (a.modeId != null && !s.modes.some((m) => m.id === a.modeId)) return s;
      // 유형을 붙이는 것은 곧 "실패"라는 뜻 — 판정도 실패로 맞춘다
      return touch(s, a, (x) => ({ ...x, modeId: a.modeId, verdict: a.modeId != null ? 'fail' : x.verdict }));
    }
    case 'addMode': {
      const name = a.name.trim();
      if (!name || s.modes.some((m) => m.name === name)) return s;
      const mode: FailureMode = { id: `m${s.nextModeNum}`, name, definition: a.definition ?? '' };
      return { ...s, modes: [...s.modes, mode], nextModeNum: s.nextModeNum + 1 };
    }
    case 'editMode': {
      const name = a.name?.trim();
      // 이름이 비거나 다른 유형과 겹치면 이름은 그대로 둔다
      const clash = name != null && (name === '' || s.modes.some((m) => m.id !== a.modeId && m.name === name));
      return {
        ...s,
        modes: s.modes.map((m) =>
          m.id !== a.modeId
            ? m
            : { ...m, name: name != null && !clash ? name : m.name, definition: a.definition ?? m.definition },
        ),
      };
    }
    case 'deleteMode': {
      // 유형을 지우면 그 유형의 카드는 "미분류 실패"로 돌아간다(판정·메모는 그대로)
      const annotations: Record<string, Annotation> = {};
      for (const [id, x] of Object.entries(s.annotations))
        annotations[id] = x.modeId === a.modeId ? { ...x, modeId: null } : x;
      return { ...s, annotations, modes: s.modes.filter((m) => m.id !== a.modeId) };
    }
    case 'replace':
      return a.state;
  }
}

/** 검토 순서대로 정렬한 "검토한" 주석(판정이 있는 것) */
export function reviewedInOrder(s: ProjectState): Annotation[] {
  return Object.values(s.annotations)
    .filter((x) => x.verdict != null)
    .sort((x, y) => (x.reviewOrder ?? Infinity) - (y.reviewOrder ?? Infinity) || x.traceId.localeCompare(y.traceId));
}

// ---- 리뷰 화면 단축키 → 동작 표 (도움말 화면도 이 표로 그린다) ----
export type ShortcutCommand =
  | { kind: 'verdict'; verdict: Verdict }
  | { kind: 'move'; delta: 1 | -1 }
  | { kind: 'focusNote' }
  | { kind: 'assignIndex'; index: number }
  | { kind: 'help' }
  | { kind: 'escape' };

export const SHORTCUTS = [
  { keys: 'P', msgId: 'shortcut.pass' },
  { keys: 'F', msgId: 'shortcut.fail' },
  { keys: 'D', msgId: 'shortcut.defer' },
  { keys: 'J', msgId: 'shortcut.next' },
  { keys: 'K', msgId: 'shortcut.prev' },
  { keys: 'N', msgId: 'shortcut.note' },
  { keys: '1–9', msgId: 'shortcut.mode' },
  { keys: '?', msgId: 'shortcut.help' },
  { keys: 'Esc', msgId: 'shortcut.escape' },
] as const;

/** 키 이름(KeyboardEvent.key) → 명령. 해당 없으면 null */
export function commandForKey(key: string): ShortcutCommand | null {
  switch (key.toLowerCase()) {
    case 'p':
      return { kind: 'verdict', verdict: 'pass' };
    case 'f':
      return { kind: 'verdict', verdict: 'fail' };
    case 'd':
      return { kind: 'verdict', verdict: 'defer' };
    case 'j':
      return { kind: 'move', delta: 1 };
    case 'k':
      return { kind: 'move', delta: -1 };
    case 'n':
      return { kind: 'focusNote' };
    case '?':
      return { kind: 'help' };
    case 'escape':
      return { kind: 'escape' };
  }
  if (/^[1-9]$/.test(key)) return { kind: 'assignIndex', index: Number(key) - 1 };
  return null;
}
