// 보드의 열 하나(미분류 또는 실패 유형). 카드를 놓으면 그 유형으로 옮긴다.
import { useState, type ReactNode } from 'react';
import type { FailureMode } from '../core/annotations';
import { useLang } from '../i18n';
import { DRAG_TYPE } from './NoteCard';

type Props = {
  mode: FailureMode | null; // null = 미분류 열
  count: number;
  onDropCard: (traceId: string) => void;
  onRename?: (name: string) => void;
  onDefine?: (definition: string) => void;
  onDelete?: () => void;
  children: ReactNode;
};

export function ModeColumn({ mode, count, onDropCard, onRename, onDefine, onDelete, children }: Props) {
  const { t } = useLang();
  const [over, setOver] = useState(false);
  const [name, setName] = useState(mode?.name ?? '');
  // 다른 곳(가져오기 등)에서 이름이 바뀌면 입력칸도 맞춘다
  const [seen, setSeen] = useState(mode?.name);
  if (mode && mode.name !== seen) {
    setSeen(mode.name);
    setName(mode.name);
  }

  return (
    <section
      className={`column ${over ? 'column--over' : ''} ${mode ? '' : 'column--unassigned'}`}
      aria-label={mode ? mode.name : t('axial.unassigned')}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData(DRAG_TYPE);
        if (id) onDropCard(id);
      }}
    >
      <header className="column__head">
        {mode ? (
          <>
            <input
              className="column__name"
              aria-label={t('axial.name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => onRename?.(name)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
            />
            <textarea
              className="column__def"
              aria-label={t('axial.definition')}
              rows={2}
              placeholder={t('axial.definitionPlaceholder')}
              value={mode.definition}
              onChange={(e) => onDefine?.(e.target.value)}
            />
          </>
        ) : (
          <h3>{t('axial.unassigned')}</h3>
        )}
        <div className="column__meta">
          <span className="muted small">{t('axial.count', { n: count })}</span>
          {mode && (
            <button type="button" className="link danger" onClick={onDelete}>
              {t('axial.delete')}
            </button>
          )}
        </div>
      </header>
      <div className="column__cards">{count === 0 ? <p className="muted small">{t('axial.dropHere')}</p> : children}</div>
    </section>
  );
}
