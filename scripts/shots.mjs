#!/usr/bin/env node
// README 스크린샷: 장면 4개 × 언어 2개 → docs/images/<장면>.<언어>.png
//   npm run build && npm run shots
// 빌드된 dist/ 를 CLI 와 같은 정적 서버로 띄우고, Playwright(Chromium)로 동봉 샘플을 열어 찍는다.
// 브라우저가 없으면 먼저: npx playwright install chromium-headless-shell
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { makeServer } from '../bin/trace-codebook.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const outDir = join(root, 'docs', 'images');
mkdirSync(outDir, { recursive: true });

// 화면 문구(언어별로 버튼을 찾기 위해) — src/i18n 의 값과 같다
const UI = {
  en: { sample: 'Try sample traces', example: 'Load example annotations', axial: 'Axial coding', stats: 'Stats' },
  ko: { sample: '샘플 트레이스로 해 보기', example: '예시 주석 불러오기', axial: '축 코딩', stats: '통계' },
};

const server = makeServer({ root: join(root, 'dist'), file: null });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();

try {
  for (const lang of ['en', 'ko']) {
    const ui = UI[lang];
    // 언어마다 새 브라우저 문맥 → IndexedDB 가 비어 있는 첫 실행 상태
    const context = await browser.newContext({ viewport: { width: 1600, height: 960 }, deviceScaleFactor: 1, locale: lang === 'ko' ? 'ko-KR' : 'en-US' });
    const page = await context.newPage();
    await page.goto(`${base}?lang=${lang}`);

    // 1) open: 샘플을 연 직후 — 감지 형식·건수·깨진 줄
    await page.getByRole('button', { name: ui.sample }).click();
    await page.getByTestId('format').waitFor();
    await page.screenshot({ path: join(outDir, `open.${lang}.png`) });

    // 2) review: 예시 주석을 불러오고 실패 트레이스(sup-002) 한 건 — 도구 호출/결과 짝, 실패 판정 + 메모
    await page.getByRole('button', { name: ui.example }).click();
    await page.locator('.ok').waitFor();
    await page.locator('.trace-list__item', { hasText: 'sup-002' }).click();
    await page.locator('.trace-view__id', { hasText: 'sup-002' }).waitFor();
    await page.screenshot({ path: join(outDir, `review.${lang}.png`) });

    // 3) axial: 메모 카드가 유형 5열로 묶인 보드
    await page.getByRole('tab', { name: ui.axial }).click();
    await page.locator('.board').waitFor();
    await page.screenshot({ path: join(outDir, `axial.${lang}.png`) });

    // 4) stats: 유형별 건수 막대 + 포화 곡선과 배지
    await page.getByRole('tab', { name: ui.stats }).click();
    await page.locator('.sat-chart').waitFor();
    await page.screenshot({ path: join(outDir, `stats.${lang}.png`), fullPage: true });

    await context.close();
    console.log(`shots: ${lang} done`);
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`shots written to docs/images/ (4 scenes x 2 langs)`);
