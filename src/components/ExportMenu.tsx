// 내보내기·가져오기. 파일은 브라우저가 바로 내려받게 하고, 네트워크로는 아무것도 보내지 않는다.
import { useRef } from 'react';
import type { ProjectState } from '../core/annotations';
import { exportAnnotationsJsonl, exportLabelsCsv, exportTaxonomyCsv, exportTaxonomyMarkdown } from '../core/exporters';
import { useLang } from '../i18n';
import { download } from './download';

type Props = { state: ProjectState; baseName: string; onImport: (text: string) => void };

export function ExportMenu({ state, baseName, onImport }: Props) {
  const { t } = useLang();
  const input = useRef<HTMLInputElement>(null);
  return (
    <details className="export-menu">
      <summary className="btn">{t('export.title')}</summary>
      <div className="export-menu__list">
        <button type="button" className="btn" onClick={() => download(`${baseName}.annotations.jsonl`, exportAnnotationsJsonl(state), 'application/x-ndjson')}>
          {t('export.annotations')}
        </button>
        <button type="button" className="btn" onClick={() => download(`${baseName}.taxonomy.csv`, exportTaxonomyCsv(state), 'text/csv')}>
          {t('export.taxonomyCsv')}
        </button>
        <button type="button" className="btn" onClick={() => download(`${baseName}.taxonomy.md`, exportTaxonomyMarkdown(state, t), 'text/markdown')}>
          {t('export.taxonomyMd')}
        </button>
        <button type="button" className="btn" onClick={() => download(`${baseName}.labels.csv`, exportLabelsCsv(state), 'text/csv')}>
          {t('export.labels')}
        </button>
        <button type="button" className="btn" onClick={() => input.current?.click()}>
          {t('export.import')}
        </button>
        <input
          ref={input}
          type="file"
          accept=".jsonl,.csv,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onImport(await f.text());
          }}
        />
      </div>
    </details>
  );
}
