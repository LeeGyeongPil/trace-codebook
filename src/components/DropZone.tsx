// 첫 화면: 파일 끌어 놓기·고르기, 샘플 열기.
import { useRef, useState, type DragEvent } from 'react';
import { useLang } from '../i18n';

type Props = {
  onFile: (file: File) => void;
  onSample: () => void;
  busy: string | null;
  error: string | null;
};

export function DropZone({ onFile, onSample, busy, error }: Props) {
  const { t } = useLang();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <section
      className={`drop ${over ? 'drop--over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <h2>{t('drop.title')}</h2>
      <p className="muted">{t('drop.hint')}</p>
      <div className="drop__actions">
        <button type="button" className="btn btn--primary" onClick={() => input.current?.click()}>
          {t('drop.choose')}
        </button>
        <button type="button" className="btn" onClick={onSample}>
          {t('drop.sample')}
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".jsonl,.json,.ndjson,.txt"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = ''; // 같은 파일을 다시 골라도 change 가 일어나게
        }}
      />
      <p className="notice">{t('drop.sampleNotice')}</p>
      <p className="muted small">{t('drop.privacy')}</p>
      {busy && <p className="muted">{t('drop.loading', { name: busy })}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
