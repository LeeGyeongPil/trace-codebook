// AC-8: CLI — 도움말 언어, 버전, 127.0.0.1 정적 서버, dist 밖 경로 차단.
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const BIN = join(ROOT, 'bin', 'trace-codebook.mjs');
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

/** 언어 관련 환경변수를 비운 깨끗한 환경 + 덧붙일 값 */
function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of ['TRACE_CODEBOOK_LANG', 'LC_ALL', 'LC_MESSAGES', 'LANG']) delete env[name];
  return { ...env, ...extra };
}

const run = (args: string[], extra: Record<string, string> = {}) =>
  spawnSync(process.execPath, [BIN, ...args], { env: cleanEnv(extra), encoding: 'utf8', timeout: 20000 });

const firstLine = (s: string) => s.split('\n')[0];

describe('cli help and language', () => {
  it('--help --lang ko prints Korean help', () => {
    const r = run(['--help', '--lang', 'ko']);
    expect(r.status).toBe(0);
    expect(firstLine(r.stdout)).toBe('사용법: trace-codebook [파일] [옵션]');
  });

  it('--help --lang en prints English help', () => {
    const r = run(['--help', '--lang', 'en'], { LANG: 'ko_KR.UTF-8' });
    expect(firstLine(r.stdout)).toBe('Usage: trace-codebook [file] [options]');
  });

  it('without --lang: TRACE_CODEBOOK_LANG beats LANG, then LC_ALL/LC_MESSAGES/LANG', () => {
    expect(firstLine(run(['--help'], { TRACE_CODEBOOK_LANG: 'ko', LANG: 'en_US.UTF-8' }).stdout)).toMatch(/^사용법/);
    expect(firstLine(run(['--help'], { TRACE_CODEBOOK_LANG: 'en', LANG: 'ko_KR.UTF-8' }).stdout)).toMatch(/^Usage/);
    expect(firstLine(run(['--help'], { LANG: 'ko_KR.UTF-8' }).stdout)).toMatch(/^사용법/);
    expect(firstLine(run(['--help'], { LC_ALL: 'C', LANG: 'ko_KR.UTF-8' }).stdout)).toMatch(/^Usage/);
    expect(firstLine(run(['--help'], { LC_MESSAGES: 'ko_KR.UTF-8' }).stdout)).toMatch(/^사용법/);
    expect(firstLine(run(['--help'], { LANG: 'ja_JP.UTF-8' }).stdout)).toMatch(/^Usage/);
    expect(firstLine(run(['--help']).stdout)).toMatch(/^Usage/);
  }, 90000); // 프로세스를 7번 띄우므로 CPU 가 몹시 바쁠 때를 위해 넉넉히

  it('--lang wins over the environment', () => {
    expect(firstLine(run(['--help', '--lang=en'], { TRACE_CODEBOOK_LANG: 'ko' }).stdout)).toMatch(/^Usage/);
  });

  it('--version prints the package.json version', () => {
    const r = run(['--version']);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(PKG.version);
  });

  it('bad options exit 2 with a message in the chosen language', () => {
    const a = run(['--lang', 'fr']);
    expect(a.status).toBe(2);
    expect(a.stderr).toMatch(/Unknown language: fr/);
    const b = run(['--port', 'abc', '--lang', 'ko']);
    expect(b.status).toBe(2);
    expect(b.stderr).toMatch(/잘못된 포트/);
    expect(run(['--bogus']).status).toBe(2);
  });

  it('missing file exits 1', () => {
    const r = run(['--no-open', 'no-such-file.jsonl']);
    // dist 가 없으면 dist 안내가 먼저 나온다 — 어느 쪽이든 1
    expect(r.status).toBe(1);
  });
});

// ---- 서버 ----
function get(port: number, path: string): Promise<{ status: number; body: string; headers: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    // path 를 그대로 보낸다(/../ 를 클라이언트가 정규화하지 않게 http.request 사용)
    const req = request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('cli server', () => {
  let child: ChildProcess | null = null;
  let port = 0;
  let stdout = '';
  let tmp = '';
  let traceFile = '';
  const content = '{"id":"cli-1","messages":[{"role":"user","content":"hello"}]}\n';

  beforeAll(async () => {
    // 서버는 빌드된 dist/ 를 제공한다. 테스트만 먼저 돌릴 때(CI 순서 등)를 위해 없으면 만든다.
    if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
      execFileSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--logLevel', 'warn'], {
        cwd: ROOT,
        stdio: 'inherit',
        timeout: 120000,
      });
    }
    tmp = mkdtempSync(join(tmpdir(), 'trace-codebook-cli-'));
    traceFile = join(tmp, 'my traces.jsonl');
    writeFileSync(traceFile, content);
    child = spawn(process.execPath, [BIN, '--no-open', '--port', '0', '--lang', 'en', traceFile], {
      env: cleanEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server did not start: ${stdout}`)), 20000);
      child!.stdout!.on('data', (c) => {
        stdout += String(c);
        // 시작 안내 세 줄(주소·파일·Ctrl+C)이 다 나올 때까지 기다린다
        const m = /http:\/\/127\.0\.0\.1:(\d+)\//.exec(stdout);
        if (m && stdout.includes('Ctrl+C')) {
          clearTimeout(timer);
          resolve(Number(m[1]));
        }
      });
      child!.on('exit', (code) => reject(new Error(`exited early with ${code}`)));
    });
  });

  afterAll(async () => {
    // 서버 프로세스를 끝내고 기다린다(남은 프로세스 없게), 임시 파일도 지운다
    if (child && child.exitCode == null) {
      const exited = new Promise((r) => child!.once('exit', r));
      child.kill('SIGTERM');
      await exited;
    }
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  it('listens on 127.0.0.1 and prints the app address with ?trace=', () => {
    expect(stdout).toMatch(/running at http:\/\/127\.0\.0\.1:\d+\/\?trace=__trace%2Fmy%2520traces\.jsonl/);
    expect(stdout).toMatch(/never modified/);
  });

  it('GET / returns the app (200) with the CSP', async () => {
    const r = await get(port, '/');
    expect(r.status).toBe(200);
    expect(r.body).toContain('<div id="root">');
    expect(r.body).toContain("connect-src 'self'");
    expect(String(r.headers['content-security-policy'])).toContain("connect-src 'self'");
  });

  it('GET /__trace/<name> returns the file content unchanged', async () => {
    const r = await get(port, '/__trace/my%20traces.jsonl');
    expect(r.status).toBe(200);
    expect(r.body).toBe(content);
    expect(readFileSync(traceFile, 'utf8')).toBe(content);
  });

  it('paths outside dist are 404', async () => {
    expect((await get(port, '/../package.json')).status).toBe(404);
    expect((await get(port, '/%2e%2e/package.json')).status).toBe(404);
    expect((await get(port, '/__trace/other.jsonl')).status).toBe(404);
    expect((await get(port, '/no-such-file.js')).status).toBe(404);
  });

  it('stops cleanly on SIGTERM', async () => {
    const exited = new Promise<number | null>((r) => child!.once('exit', (code) => r(code)));
    child!.kill('SIGTERM');
    expect(await exited).toBe(0);
  });
});
