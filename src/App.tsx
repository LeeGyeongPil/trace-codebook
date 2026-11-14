// 앱 전체 흐름: 파일 열기 → (검토 · 축 코딩 · 통계) 탭 → 내보내기.
// 상태는 위에서 아래로: 열린 파일(traces) + 주석 상태(reducer) + IndexedDB 자동 저장.
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { blobChunks, parseStream, toTraces, type SourceFormat, type Trace } from './adapters';
import type { SkippedLine } from './adapters';
import { emptyState, reducer, type ProjectState } from './core/annotations';
import { fingerprint } from './core/fingerprint';
import { importText, type ImportReport } from './core/importers';
import { openProjectStore, type ProjectStore } from './storage/db';
import { useLang } from './i18n';
import { AxialBoard } from './components/AxialBoard';
import { DropZone } from './components/DropZone';
import { ExportMenu } from './components/ExportMenu';
import { LangMenu } from './components/LangMenu';
import { ReviewTab } from './components/ReviewTab';
import { StatsPanel } from './components/StatsPanel';

type Tab = 'review' | 'axial' | 'stats';

type LoadedFile = {
  name: string;
  format: SourceFormat;
  traces: Trace[];
  skipped: SkippedLine[];
  fingerprint: string;
  isSample: boolean;
  resumed: boolean;
};

export const SAMPLE_FILE = 'support-agent.jsonl';
/** CLI 가 파일을 같은 출처로 제공하는 경로 접두사 (?trace=__trace/<이름>) */
const CLI_TRACE_PREFIX = '__trace/';

export default function App() {
  const { t } = useLang();
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [state, dispatch] = useReducer(reducer, undefined, emptyState);
  const [tab, setTab] = useState<Tab>('review');
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const storeRef = useRef<ProjectStore | null>(null);
  // 저장해 둔 주석을 다 불러온 뒤에만 자동 저장한다(빈 상태로 덮어쓰지 않게)
  const readyRef = useRef(false);

  // 열기 약속을 한 번만 만든다 — 동시에 두 곳이 부르면 연결이 둘 열려 쓰기 순서가 꼬일 수 있다
  const storePromise = useRef<Promise<ProjectStore | null> | null>(null);
  const getStore = useCallback((): Promise<ProjectStore | null> => {
    if (!storePromise.current) {
      storePromise.current = openProjectStore()
        .then((st) => {
          storeRef.current = st;
          return st;
        })
        .catch((e) => {
          storePromise.current = null;
          setSaveError(t('save.failed', { message: (e as Error).message }));
          return null;
        });
    }
    return storePromise.current;
  }, [t]);
  // 진행 중인 저장(끝나기 전에 연결을 닫지 않으려고)
  const inflight = useRef<Promise<unknown>>(Promise.resolve());


  /** 파일(또는 샘플) 하나를 연다: 스트림 파싱 → 형식 판정 → 지문 → 저장된 주석 불러오기 */
  const openBlob = useCallback(
    async (blob: Blob, name: string, isSample: boolean) => {
      setBusy(name);
      setError(null);
      setNotice(null);
      readyRef.current = false;
      try {
        const { records, skipped } = await parseStream(blobChunks(blob));
        const { format, traces } = toTraces(records);
        if (!format || traces.length === 0) throw new Error(t('error.empty'));
        const fp = await fingerprint(blob);
        const store = await getStore();
        const saved = store ? await store.load(fp).catch(() => undefined) : undefined;
        dispatch({ type: 'replace', state: saved?.state ?? emptyState() });
        setFile({ name, format, traces, skipped, fingerprint: fp, isSample, resumed: !!saved });
        setIndex(0);
        setTab('review');
        readyRef.current = true;
      } catch (e) {
        setError(t('error.read', { message: (e as Error).message }));
      } finally {
        setBusy(null);
      }
    },
    [getStore, t],
  );

  const openUrl = useCallback(
    async (url: string, name: string, isSample: boolean) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        await openBlob(await res.blob(), name, isSample);
      } catch {
        setError(t('error.fetch', { name }));
      }
    },
    [openBlob, t],
  );

  // CLI 로 띄우면 주소에 ?trace=__trace/<파일 이름> 이 붙어 온다 → 같은 출처에서 바로 연다
  useEffect(() => {
    const p = new URLSearchParams(location.search).get('trace');
    if (p && p.startsWith(CLI_TRACE_PREFIX) && !p.includes('..')) {
      void openUrl(`./${p}`, decodeURIComponent(p.slice(CLI_TRACE_PREFIX.length)), false);
    }
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 자동 저장: 바뀐 뒤 0.3초 조용하면 IndexedDB 에 쓴다
  const pendingRef = useRef(false); // 예약됐지만 아직 시작 안 된 저장이 있는가
  const latest = useRef<{ file: LoadedFile | null; state: ProjectState }>({ file, state });
  useLayoutEffect(() => {
    latest.current = { file, state };
  });
  useEffect(() => {
    if (!file || !readyRef.current) return;
    pendingRef.current = true;
    const timer = setTimeout(async () => {
      pendingRef.current = false;
      const store = await getStore();
      if (!store) return;
      try {
        const run = store.save(file.fingerprint, file.name, state);
        inflight.current = run.catch(() => {});
        await run;
        setSaveError(null);
      } catch (e) {
        setSaveError(t('save.failed', { message: (e as Error).message }));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [state, file, getStore, t]);

  // 탭을 닫거나 다른 페이지로 갈 때 기다리던 저장을 바로 시작한다
  useEffect(() => {
    const flush = () => {
      const { file: f, state: s } = latest.current;
      const st = storeRef.current;
      if (f && readyRef.current && st) inflight.current = st.save(f.fingerprint, f.name, s).catch(() => {});
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      // 화면이 닫힐 때 기다리던 저장이 있으면 버리지 않고 시작한다
      if (pendingRef.current) {
        pendingRef.current = false;
        flush();
      }
    };
  }, []);

  // 화면을 닫을 때 DB 연결을 닫는다
  useEffect(
    () => () => {
      const pending = storePromise.current;
      storePromise.current = null;
      storeRef.current = null;
      // 저장이 끝난 뒤에 닫는다
      void inflight.current.then(() => pending).then((st) => st?.close());
    },
    [],
  );

  const traceSources = useMemo(() => new Map(file?.traces.map((tr) => [tr.id, tr.source]) ?? []), [file]);

  const describeImport = (r: ImportReport): string => {
    const main =
      r.kind === 'taxonomy'
        ? t('export.importTaxonomy', { imported: r.imported })
        : t('export.importDone', { imported: r.imported, kept: r.kept, unmatched: r.unmatched });
    return r.badLines.length ? `${main} ${t('export.importBad', { n: r.badLines.length })}` : main;
  };

  const runImport = (texts: string[]) => {
    let s = latest.current.state;
    const messages: string[] = [];
    for (const text of texts) {
      const { state: next, report } = importText(s, text, traceSources);
      s = next;
      messages.push(describeImport(report));
    }
    dispatch({ type: 'replace', state: s });
    setNotice(messages.join(' '));
  };

  /** 동봉 샘플의 예시 주석 + 유형 정의(연습용)를 불러온다 */
  const loadExample = async () => {
    try {
      const [a, b] = await Promise.all([
        fetch('./samples/support-agent.annotations.jsonl').then((r) => r.text()),
        fetch('./samples/support-agent.taxonomy.csv').then((r) => r.text()),
      ]);
      runImport([a, b]);
    } catch {
      setError(t('error.fetch', { name: 'support-agent.annotations.jsonl' }));
    }
  };

  const contentMissing = file?.traces.filter((tr) => tr.contentMissing).length ?? 0;
  const jumpTo = (traceId: string) => {
    const i = file?.traces.findIndex((tr) => tr.id === traceId) ?? -1;
    if (i >= 0) {
      setIndex(i);
      setTab('review');
    }
  };

  return (
    <div className="app">
      <header className="app__head">
        <div>
          <h1>{t('app.title')}</h1>
          <p className="muted small">{t('app.tagline')}</p>
        </div>
        <LangMenu />
      </header>

      {saveError && (
        <p className="error" role="alert">
          {saveError}
        </p>
      )}

      {!file ? (
        <DropZone
          busy={busy}
          error={error}
          onFile={(f) => void openBlob(f, f.name, false)}
          onSample={() => void openUrl(`./samples/${SAMPLE_FILE}`, SAMPLE_FILE, true)}
        />
      ) : (
        <>
          <section className="summary" aria-live="polite">
            <span className="summary__name">{file.name}</span>
            <span className="chip">
              {t('summary.format')}: <code data-testid="format">{file.format}</code>
            </span>
            <span className="chip">{t('summary.traces', { n: file.traces.length })}</span>
            <span className={`chip ${file.skipped.length ? 'chip--fail' : ''}`}>
              {t('summary.skipped', { n: file.skipped.length })}
            </span>
            {file.isSample && <span className="chip chip--sample">{t('sample.badge')}</span>}
            <span className="summary__spacer" />
            {file.isSample && (
              <button type="button" className="btn" onClick={() => void loadExample()}>
                {t('summary.loadExample')}
              </button>
            )}
            <ExportMenu state={state} baseName={file.name.replace(/\.[^.]+$/, '')} onImport={(text) => runImport([text])} />
            <button type="button" className="btn" onClick={() => setFile(null)}>
              {t('summary.openOther')}
            </button>
          </section>
          {file.skipped.length > 0 && (
            <p className="muted small">
              {t('summary.skippedList', {
                lines: file.skipped
                  .slice(0, 20)
                  .map((s) => s.line)
                  .join(', '),
              })}
            </p>
          )}
          {file.resumed && <p className="muted small">{t('summary.resumed')}</p>}
          {file.isSample && <p className="notice small">{t('drop.sampleNotice')}</p>}
          {contentMissing > 0 && <p className="notice">{t('summary.contentMissing', { n: contentMissing })}</p>}
          {notice && <p className="ok small">{notice}</p>}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <nav className="tabs" role="tablist">
            {(['review', 'axial', 'stats'] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`tab ${tab === id ? 'is-active' : ''}`}
                onClick={() => setTab(id)}
              >
                {t(`tab.${id}`)}
              </button>
            ))}
          </nav>

          {tab === 'review' && (
            <ReviewTab traces={file.traces} state={state} dispatch={dispatch} index={index} setIndex={setIndex} />
          )}
          {tab === 'axial' && (
            <AxialBoard
              state={state}
              dispatch={dispatch}
              sourceOf={(id) => traceSources.get(id) ?? ''}
              onOpen={jumpTo}
            />
          )}
          {tab === 'stats' && <StatsPanel state={state} total={file.traces.length} />}
        </>
      )}

      {!file && (
        // 파일을 열기 전에는 앞으로 거칠 단계(탭)를 흐리게 보여 준다
        <nav className="tabs tabs--idle">
          {(['review', 'axial', 'stats'] as const).map((id) => (
            <span key={id} className="tab tab--disabled">
              {t(`tab.${id}`)}
            </span>
          ))}
        </nav>
      )}
    </div>
  );
}
