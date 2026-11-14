// "검토" 탭: 목록 + 트레이스 한 건 + 판정·메모 칸, 그리고 키보드 단축키.
import { useEffect, useLayoutEffect, useRef, useState, type Dispatch } from 'react';
import type { Trace } from '../adapters';
import { commandForKey, type Action, type ProjectState } from '../core/annotations';
import { NotePanel } from './NotePanel';
import { ShortcutHelp } from './ShortcutHelp';
import { TraceList } from './TraceList';
import { TraceView } from './TraceView';

type Props = {
  traces: Trace[];
  state: ProjectState;
  dispatch: Dispatch<Action>;
  index: number;
  setIndex: (i: number) => void;
  /** 지금 시각(ISO). 테스트에서 고정값을 넣을 수 있게 밖에서 받는다 */
  now?: () => string;
};

const isTyping = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.isContentEditable);

const isoNow = () => new Date().toISOString();

export function ReviewTab({ traces, state, dispatch, index, setIndex, now = isoNow }: Props) {
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [help, setHelp] = useState(false);
  const trace = traces[index];

  // 최신 값을 키 처리기에서 쓰기 위한 ref (처리기를 매번 다시 달지 않으려고)
  // 그리기가 끝난 직후(layout effect) 갱신하므로 다음 키 입력은 항상 화면과 같은 값을 본다
  const latest = useRef({ trace, index, state, traces, help, dispatch, setIndex, now });
  useLayoutEffect(() => {
    latest.current = { trace, index, state, traces, help, dispatch, setIndex, now };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const cmd = commandForKey(e.key);
      if (!cmd) return;
      // 메모 칸에서 글을 쓰는 중이면 Esc(칸에서 나가기) 말고는 단축키로 보지 않는다
      if (isTyping(e.target)) {
        if (cmd.kind === 'escape') (e.target as HTMLElement).blur();
        return;
      }
      const { trace: tr, index: i, state: s, traces: all, help: helpOpen, dispatch, setIndex, now } = latest.current;
      if (cmd.kind === 'help') return setHelp(!helpOpen);
      if (cmd.kind === 'escape') return setHelp(false);
      if (!tr) return;
      const target = { traceId: tr.id, source: tr.source, at: now() };
      switch (cmd.kind) {
        case 'verdict':
          dispatch({ type: 'verdict', verdict: cmd.verdict, ...target });
          break;
        case 'move':
          setIndex(Math.min(all.length - 1, Math.max(0, i + cmd.delta)));
          break;
        case 'focusNote':
          e.preventDefault(); // 'n' 이 메모 칸에 입력되지 않게
          noteRef.current?.focus();
          break;
        case 'assignIndex': {
          const mode = s.modes[cmd.index];
          if (mode) dispatch({ type: 'assign', modeId: mode.id, ...target });
          break;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey); // 탭을 떠나면 처리기도 뗀다
  }, []);

  if (!trace) return null;
  const at = () => ({ traceId: trace.id, source: trace.source, at: now() });

  return (
    <div className="review">
      <TraceList traces={traces} state={state} index={index} onSelect={setIndex} />
      <TraceView trace={trace} position={index + 1} total={traces.length} />
      <NotePanel
        annotation={state.annotations[trace.id]}
        modes={state.modes}
        noteRef={noteRef}
        onVerdict={(verdict) => dispatch({ type: 'verdict', verdict, ...at() })}
        onNote={(note) => dispatch({ type: 'note', note, ...at() })}
        onMode={(modeId) => dispatch({ type: 'assign', modeId, ...at() })}
        onPrev={() => setIndex(Math.max(0, index - 1))}
        onNext={() => setIndex(Math.min(traces.length - 1, index + 1))}
        onHelp={() => setHelp(true)}
      />
      {help && <ShortcutHelp onClose={() => setHelp(false)} />}
    </div>
  );
}
