// CLI 메시지(영어·한국어)와 언어 결정.
// 우선순위: --lang > TRACE_CODEBOOK_LANG > LC_ALL > LC_MESSAGES > LANG. ko 로 시작하면 한국어, 아니면 영어.

export const MESSAGES = {
  en: {
    usage: 'Usage: trace-codebook [file] [options]',
    summary: 'Open LLM traces in your browser for open coding, axial coding and failure-mode counts.\nEverything runs locally: the server listens on 127.0.0.1 only and the app sends nothing out.',
    options: 'Options:',
    optPort: '  --port N        port to listen on (default 4178, 0 = any free port)',
    optNoOpen: '  --no-open       do not open a browser',
    optLang: '  --lang en|ko    message language (also TRACE_CODEBOOK_LANG)',
    optHelp: '  -h, --help      show this help',
    optVersion: '  -v, --version   show the version',
    examples: 'Examples:',
    ex1: '  npx trace-codebook                     open the app, then drop a file or try the sample',
    ex2: '  npx trace-codebook traces.jsonl        open the app with this file loaded',
    formats: 'Formats: OpenAI / Anthropic message JSONL, OTLP JSON, Langfuse trace JSON, Phoenix span JSONL.',
    running: 'trace-codebook is running at {url}',
    serving: 'Serving {file} (read-only — the file is never modified)',
    stop: 'Press Ctrl+C to stop.',
    openFailed: 'Could not open a browser automatically. Open this address yourself: {url}',
    noDist: 'The built app (dist/) was not found at {dir}. Run `npm run build` first.',
    noFile: 'File not found: {file}',
    notFile: 'Not a regular file: {file}',
    badPort: 'Invalid port: {port} (use 0-65535)',
    badLang: 'Unknown language: {lang} (use en or ko)',
    badOption: 'Unknown option: {option}. See --help.',
    tooMany: 'Only one trace file can be opened at a time.',
    portInUse: 'Port {port} is already in use. Try --port 0 for any free port.',
    stopped: 'Stopped.',
  },
  ko: {
    usage: '사용법: trace-codebook [파일] [옵션]',
    summary: 'LLM 트레이스를 브라우저에서 열어 오픈 코딩·축 코딩·실패 유형 세기를 합니다.\n모두 이 컴퓨터 안에서 돌아갑니다: 서버는 127.0.0.1 에서만 듣고 앱은 밖으로 아무것도 보내지 않습니다.',
    options: '옵션:',
    optPort: '  --port N        사용할 포트 (기본 4178, 0 = 빈 포트 아무거나)',
    optNoOpen: '  --no-open       브라우저를 열지 않음',
    optLang: '  --lang en|ko    메시지 언어 (TRACE_CODEBOOK_LANG 로도 지정)',
    optHelp: '  -h, --help      이 도움말',
    optVersion: '  -v, --version   버전 보기',
    examples: '예:',
    ex1: '  npx trace-codebook                     앱을 열고 파일을 끌어 놓거나 샘플로 해 보기',
    ex2: '  npx trace-codebook traces.jsonl        이 파일을 연 채로 앱 열기',
    formats: '형식: OpenAI / Anthropic 메시지 JSONL, OTLP JSON, Langfuse 트레이스 JSON, Phoenix span JSONL.',
    running: 'trace-codebook 실행 중: {url}',
    serving: '{file} 제공 중 (읽기 전용 — 파일은 바뀌지 않습니다)',
    stop: '끝내려면 Ctrl+C 를 누르세요.',
    openFailed: '브라우저를 자동으로 열지 못했습니다. 이 주소를 직접 여세요: {url}',
    noDist: '빌드된 앱(dist/)이 {dir} 에 없습니다. 먼저 `npm run build` 를 실행하세요.',
    noFile: '파일이 없습니다: {file}',
    notFile: '일반 파일이 아닙니다: {file}',
    badPort: '잘못된 포트: {port} (0-65535)',
    badLang: '알 수 없는 언어: {lang} (en 또는 ko)',
    badOption: '알 수 없는 옵션: {option}. --help 를 보세요.',
    tooMany: '트레이스 파일은 한 번에 하나만 열 수 있습니다.',
    portInUse: '포트 {port} 가 이미 쓰이고 있습니다. --port 0 으로 빈 포트를 쓰세요.',
    stopped: '멈췄습니다.',
  },
};

/** 환경변수에서 언어를 고른다(--lang 이 없을 때). */
export function langFromEnv(env) {
  const explicit = (env.TRACE_CODEBOOK_LANG || '').trim();
  if (explicit) return explicit.toLowerCase().startsWith('ko') ? 'ko' : 'en';
  // POSIX 규칙: LC_ALL > LC_MESSAGES > LANG 중 처음으로 값이 있는 것
  const locale = env.LC_ALL || env.LC_MESSAGES || env.LANG || '';
  return locale.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

/** 메시지 하나를 꺼내 {name} 자리를 채운다 */
export function msg(lang, id, vars = {}) {
  const text = (MESSAGES[lang] ?? MESSAGES.en)[id] ?? MESSAGES.en[id] ?? id;
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

export function helpText(lang) {
  const m = (id) => msg(lang, id);
  return [
    m('usage'),
    '',
    m('summary'),
    '',
    m('options'),
    m('optPort'),
    m('optNoOpen'),
    m('optLang'),
    m('optHelp'),
    m('optVersion'),
    '',
    m('examples'),
    m('ex1'),
    m('ex2'),
    '',
    m('formats'),
  ].join('\n');
}
