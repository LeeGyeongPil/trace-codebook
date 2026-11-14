import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// 데이터 반출 차단: 빌드한 index.html 에 CSP 를 넣는다. connect-src 'self' 라서
// 앱 코드(또는 실수로 들어간 의존성)가 트레이스를 외부 주소로 보내려 해도 브라우저가 막는다.
// 개발 서버(vite dev)는 React 새로고침용 인라인 스크립트를 쓰므로 빌드에만 넣는다.
export const CSP =
  "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; " +
  "object-src 'none'; base-uri 'none'; form-action 'none'";

function cspPlugin(): Plugin {
  return {
    name: 'trace-codebook-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

// base './' — dist/ 를 어느 경로(npx 정적 서버, GitHub Pages 하위 폴더)에서 열어도 자산 경로가 맞는다.
export default defineConfig({
  base: './',
  plugins: [react(), cspPlugin()],
  build: { outDir: 'dist', emptyOutDir: true },
  test: {
    // 기본은 node. 화면 테스트(*.test.tsx)는 파일 머리의 `@vitest-environment jsdom` 주석으로 jsdom 을 쓴다.
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
