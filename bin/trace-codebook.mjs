#!/usr/bin/env node
// trace-codebook CLI — 의존성 없는 작은 정적 서버.
// 빌드된 앱(dist/)을 127.0.0.1 에서만 제공하고, 파일을 주면 같은 출처 경로 /__trace/<이름> 로 제공해
// 앱이 주소의 ?trace= 를 보고 자동으로 연다. 파일은 읽기만 한다.
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { helpText, langFromEnv, msg } from './messages.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PKG = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8'));
const DEFAULT_PORT = 4178;
const HOST = '127.0.0.1'; // 같은 컴퓨터에서만 접속 가능

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.jsonl': 'application/x-ndjson; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/** 인자 해석. 잘못되면 { error } */
export function parseArgs(argv, env = process.env) {
  const opts = { file: null, port: DEFAULT_PORT, open: true, help: false, version: false, lang: null };
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => (a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[++i]);
    if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '-v' || a === '--version') opts.version = true;
    else if (a === '--no-open') opts.open = false;
    else if (a === '--port' || a.startsWith('--port=')) opts.port = value();
    else if (a === '--lang' || a.startsWith('--lang=')) opts.lang = value();
    else if (a.startsWith('-')) return { opts, error: ['badOption', { option: a }] };
    else files.push(a);
  }
  // 언어부터 정해야 오류 메시지도 그 언어로 낼 수 있다
  if (opts.lang != null) {
    const l = String(opts.lang).toLowerCase();
    if (l !== 'en' && l !== 'ko') {
      opts.lang = langFromEnv(env);
      return { opts, error: ['badLang', { lang: l }] };
    }
    opts.lang = l;
  } else opts.lang = langFromEnv(env);
  if (files.length > 1) return { opts, error: ['tooMany', {}] };
  opts.file = files[0] ?? null;
  const port = Number(opts.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) return { opts, error: ['badPort', { port: opts.port }] };
  opts.port = port;
  return { opts };
}

/**
 * 정적 서버를 만든다. root 밖의 경로는 404, /__trace/<이름> 은 주어진 파일 하나만.
 * 반환한 server 는 호출한 쪽이 close() 한다.
 */
export function makeServer({ root, file }) {
  const rootDir = resolve(root);
  const traceName = file ? basename(file) : null;
  const csp = "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";

  return createServer((req, res) => {
    const notFound = () => {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' });
      return res.end();
    }
    let path;
    try {
      // 원문 경로(정규화 전)를 그대로 디코딩해 쓴다. /../package.json·%2e%2e 같은 요청은
      // 아래에서 resolve 한 결과가 root 밖이라 404 가 된다.
      path = decodeURIComponent((req.url ?? '/').split('?')[0].split('#')[0]);
    } catch {
      return notFound();
    }
    if (path.includes('\0')) return notFound();
    const headers = { 'x-content-type-options': 'nosniff', 'cache-control': 'no-store', 'content-security-policy': csp };

    // 1) 사용자가 준 트레이스 파일(읽기 전용)
    if (traceName && path === `/__trace/${traceName}`) {
      const type = TYPES[extname(traceName).toLowerCase()] ?? 'application/octet-stream';
      // 파일이 사라졌거나 일반 파일이 아니면 이 요청만 404 — 서버는 계속 돈다
      let traceStat;
      try {
        traceStat = statSync(file);
      } catch {
        return notFound();
      }
      if (!traceStat.isFile()) return notFound();
      const okHeaders = { ...headers, 'content-type': type, 'content-length': traceStat.size };
      if (req.method === 'HEAD') {
        res.writeHead(200, okHeaders);
        return res.end();
      }
      const stream = createReadStream(file);
      // stat 뒤 읽기 직전에 지워지는 경우 등: 헤더 전이면 404, 이미 보냈으면 연결만 끊는다
      stream.on('error', () => {
        if (!res.headersSent) notFound();
        else res.destroy();
      });
      // 파일이 실제로 열린 뒤에만 200 헤더를 쓴다
      stream.on('open', () => {
        res.writeHead(200, okHeaders);
        stream.pipe(res);
      });
      return;
    }

    // 2) dist/ 안의 정적 파일
    const rel = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
    const full = resolve(rootDir, rel);
    if (full !== rootDir && !full.startsWith(rootDir + sep)) return notFound();
    let st;
    try {
      st = statSync(full);
    } catch {
      return notFound();
    }
    if (!st.isFile()) return notFound();
    res.writeHead(200, { ...headers, 'content-type': TYPES[extname(full).toLowerCase()] ?? 'application/octet-stream', 'content-length': st.size });
    if (req.method === 'HEAD') return res.end();
    createReadStream(full).pipe(res);
  });
}

/** 운영체제 기본 브라우저로 주소를 연다. 실패해도 주소는 이미 출력했으니 안내만 한다. */
function openBrowser(url, lang) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => console.error(msg(lang, 'openFailed', { url })));
    child.unref(); // CLI 가 브라우저 프로세스를 기다리지 않게
  } catch {
    console.error(msg(lang, 'openFailed', { url }));
  }
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const { opts, error } = parseArgs(argv, env);
  const lang = opts.lang;
  if (error) {
    console.error(msg(lang, error[0], error[1]));
    return 2;
  }
  if (opts.help) {
    console.log(helpText(lang));
    return 0;
  }
  if (opts.version) {
    console.log(PKG.version);
    return 0;
  }

  const root = join(HERE, '..', 'dist');
  if (!existsSync(join(root, 'index.html'))) {
    console.error(msg(lang, 'noDist', { dir: root }));
    return 1;
  }
  let file = null;
  if (opts.file) {
    file = resolve(opts.file);
    if (!existsSync(file)) {
      console.error(msg(lang, 'noFile', { file: opts.file }));
      return 1;
    }
    if (!statSync(file).isFile()) {
      console.error(msg(lang, 'notFile', { file: opts.file }));
      return 1;
    }
  }

  const server = makeServer({ root, file });
  server.on('error', (e) => {
    console.error(e && e.code === 'EADDRINUSE' ? msg(lang, 'portInUse', { port: opts.port }) : String(e));
    process.exit(1);
  });
  server.listen(opts.port, HOST, () => {
    const { port } = server.address();
    let url = `http://${HOST}:${port}/`;
    const q = new URLSearchParams();
    if (file) q.set('trace', `__trace/${encodeURIComponent(basename(file))}`);
    if (env.TRACE_CODEBOOK_LANG || argv.some((a) => a.startsWith('--lang'))) q.set('lang', lang);
    if ([...q].length) url += `?${q.toString()}`;
    console.log(msg(lang, 'running', { url }));
    if (file) console.log(msg(lang, 'serving', { file }));
    console.log(msg(lang, 'stop'));
    if (opts.open) openBrowser(url, lang);
  });

  // Ctrl+C·종료 신호: 서버를 닫고 끝낸다(열린 연결도 끊는다)
  const stop = () => {
    console.log(msg(lang, 'stopped'));
    server.close(() => process.exit(0));
    server.closeAllConnections?.();
    setTimeout(() => process.exit(0), 1000).unref();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return null; // 서버가 계속 돈다
}

// 직접 실행했을 때만 main (테스트에서 import 해도 서버가 뜨지 않게)
const invoked = process.argv[1] && resolve(process.argv[1]);
const self = fileURLToPath(import.meta.url);
let isMain = invoked === self;
if (!isMain && invoked) {
  // npm 이 만든 bin 링크(심볼릭 링크)로 실행된 경우
  try {
    const { realpathSync } = await import('node:fs');
    isMain = realpathSync(invoked) === realpathSync(self);
  } catch {
    isMain = false;
  }
}
if (isMain) {
  const code = main();
  if (code != null) process.exitCode = code;
}
