#!/usr/bin/env node
// 문서 점검: README.md(영어)·README.ko.md(한국어)가 서로 링크하고, 각자 자기 언어 스크린샷 4장면을
// 참조하며(파일이 실제로 있어야 함), 샘플이 합성 연습용 데이터임을 밝히는지 확인한다.
//   node scripts/check-docs.mjs  →  "docs ok: 4 scenes x 2 langs"
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCENES = ['open', 'review', 'axial', 'stats'];
const DOCS = [
  { lang: 'en', file: 'README.md', other: 'README.ko.md', notice: /synthetic practice data/i },
  { lang: 'ko', file: 'README.ko.md', other: 'README.md', notice: /가상의 연습용 데이터|합성 연습용 데이터/ },
];

const problems = [];
for (const d of DOCS) {
  const path = join(root, d.file);
  if (!existsSync(path)) {
    problems.push(`${d.file}: missing`);
    continue;
  }
  const text = readFileSync(path, 'utf8');
  if (!text.includes(`](${d.other})`) && !text.includes(`](./${d.other})`)) problems.push(`${d.file}: no link to ${d.other}`);
  for (const scene of SCENES) {
    const img = `docs/images/${scene}.${d.lang}.png`;
    if (!text.includes(img)) problems.push(`${d.file}: does not reference ${img}`);
    if (!existsSync(join(root, img))) problems.push(`${img}: file missing (run npm run build && npm run shots)`);
  }
  if (!d.notice.test(text)) problems.push(`${d.file}: no synthetic sample data notice`);
}

if (problems.length) {
  for (const p of [...new Set(problems)]) console.error(`- ${p}`);
  console.error(`docs check failed: ${new Set(problems).size} problem(s)`);
  process.exit(1);
}
console.log(`docs ok: ${SCENES.length} scenes x ${DOCS.length} langs`);
