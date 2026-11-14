// 축 코딩 보드의 메모 카드 하나. 끌어서 다른 열에 놓거나, 키보드·터치 사용자는 아래 선택 메뉴로 옮긴다.
import type { Annotation, FailureMode } from '../core/annotations';
import { useLang } from '../i18n';

export const DRAG_TYPE = 'text/plain';

type Props = {
  annotation: Annotation;
  modes: FailureMode[];
  onAssign: (traceId: string, modeId: string | null) => void;
  onOpen: (traceId: string) => void;
};

export function NoteCard({ annotation: a, modes, onAssign, onOpen }: Props) {
  const { t } = useLang();
  return (
    <div
      className="note-card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, a.traceId);
        e.dataTransfer.effectAllowed = 'move';
      }}
      data-trace-id={a.traceId}
    >
      <button type="button" className="link note-card__id" onClick={() => onOpen(a.traceId)}>
        {a.traceId}
      </button>
      <p className="note-card__text">{a.note || <em className="muted">{t('axial.noNote')}</em>}</p>
      <select
        aria-label={`${t('axial.moveTo')}: ${a.traceId}`}
        value={a.modeId ?? ''}
        onChange={(e) => onAssign(a.traceId, e.target.value || null)}
      >
        <option value="">{t('axial.unassigned')}</option>
        {modes.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  );
}
