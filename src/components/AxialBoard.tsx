// "축 코딩" 탭: 실패 메모 카드를 유형 열로 묶는다. 카드 하나는 한 열에만 있다(상호 배타).
import { useState, type Dispatch } from 'react';
import type { Action, ProjectState } from '../core/annotations';
import { failuresOf } from '../core/taxonomy';
import { useLang } from '../i18n';
import { ModeColumn } from './ModeColumn';
import { NoteCard } from './NoteCard';

type Props = {
  state: ProjectState;
  dispatch: Dispatch<Action>;
  sourceOf: (traceId: string) => string;
  onOpen: (traceId: string) => void;
};

export function AxialBoard({ state, dispatch, sourceOf, onOpen }: Props) {
  const { t } = useLang();
  const [newName, setNewName] = useState('');

  const assign = (traceId: string, modeId: string | null) =>
    dispatch({ type: 'assign', traceId, source: sourceOf(traceId), modeId, at: new Date().toISOString() });

  const unassigned = failuresOf(state, null);
  const totalFails = unassigned.length + state.modes.reduce((n, m) => n + failuresOf(state, m.id).length, 0);
  const card = (a: (typeof unassigned)[number]) => (
    <NoteCard key={a.traceId} annotation={a} modes={state.modes} onAssign={assign} onOpen={onOpen} />
  );

  return (
    <div className="axial">
      <p className="muted">{t('axial.intro')}</p>
      {totalFails === 0 && <p className="notice">{t('axial.empty')}</p>}
      <form
        className="axial__new"
        onSubmit={(e) => {
          e.preventDefault();
          dispatch({ type: 'addMode', name: newName });
          setNewName('');
        }}
      >
        <label>
          <span className="visually-hidden">{t('axial.newMode')}</span>
          <input value={newName} placeholder={t('axial.newModePlaceholder')} onChange={(e) => setNewName(e.target.value)} />
        </label>
        <button type="submit" className="btn btn--primary" disabled={!newName.trim()}>
          {t('axial.add')}
        </button>
      </form>
      <div className="board">
        <ModeColumn mode={null} count={unassigned.length} onDropCard={(id) => assign(id, null)}>
          {unassigned.map(card)}
        </ModeColumn>
        {state.modes.map((m) => {
          const items = failuresOf(state, m.id);
          return (
            <ModeColumn
              key={m.id}
              mode={m}
              count={items.length}
              onDropCard={(id) => assign(id, m.id)}
              onRename={(name) => dispatch({ type: 'editMode', modeId: m.id, name })}
              onDefine={(definition) => dispatch({ type: 'editMode', modeId: m.id, definition })}
              onDelete={() => dispatch({ type: 'deleteMode', modeId: m.id })}
            >
              {items.map(card)}
            </ModeColumn>
          );
        })}
      </div>
    </div>
  );
}
