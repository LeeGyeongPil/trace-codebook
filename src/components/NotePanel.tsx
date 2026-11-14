// 오른쪽 판정·메모 칸. 단축키와 같은 일을 버튼으로도 할 수 있다.
import type { Ref } from 'react';
import type { Annotation, FailureMode, Verdict } from '../core/annotations';
import { useLang } from '../i18n';

type Props = {
  annotation: Annotation | undefined;
  modes: FailureMode[];
  noteRef: Ref<HTMLTextAreaElement>;
  onVerdict: (v: Verdict) => void;
  onNote: (note: string) => void;
  onMode: (modeId: string | null) => void;
  onPrev: () => void;
  onNext: () => void;
  onHelp: () => void;
};

const VERDICTS: Verdict[] = ['pass', 'fail', 'defer'];

export function NotePanel({ annotation, modes, noteRef, onVerdict, onNote, onMode, onPrev, onNext, onHelp }: Props) {
  const { t } = useLang();
  const verdict = annotation?.verdict ?? null;
  return (
    <aside className="note-panel">
      <h3>{t('review.verdict')}</h3>
      <div className="verdicts" role="group" aria-label={t('review.verdict')}>
        {VERDICTS.map((v) => (
          <button
            key={v}
            type="button"
            className={`btn verdict verdict--${v}`}
            aria-pressed={verdict === v}
            onClick={() => onVerdict(v)}
          >
            {t(`verdict.${v}`)} <kbd>{v[0].toUpperCase()}</kbd>
          </button>
        ))}
      </div>

      <label className="field">
        <span>{t('review.note')}</span>
        <textarea
          ref={noteRef}
          rows={4}
          value={annotation?.note ?? ''}
          placeholder={t('review.notePlaceholder')}
          onChange={(e) => onNote(e.target.value)}
        />
      </label>

      <label className="field">
        <span>{t('review.mode')}</span>
        <select
          value={verdict === 'fail' ? (annotation?.modeId ?? '') : ''}
          onChange={(e) => onMode(e.target.value || null)}
        >
          <option value="">{t('review.modeNone')}</option>
          {modes.map((m, i) => (
            <option key={m.id} value={m.id}>
              {i < 9 ? `${i + 1}. ` : ''}
              {m.name}
            </option>
          ))}
        </select>
      </label>

      <div className="note-panel__nav">
        <button type="button" className="btn" onClick={onPrev}>
          {t('review.prev')}
        </button>
        <button type="button" className="btn" onClick={onNext}>
          {t('review.next')}
        </button>
      </div>
      <p className="muted small">{t('review.hint')}</p>
      <button type="button" className="link" onClick={onHelp}>
        {t('review.help')}
      </button>
    </aside>
  );
}
