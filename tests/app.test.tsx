// @vitest-environment jsdom
// 화면 전체 흐름(목 모드): 샘플 열기 → 단축키로 판정·메모 → IndexedDB 자동 저장 → 다시 열면 이어서,
// 예시 주석 불러오기 → 축 코딩 보드(선택 메뉴로 옮기기) → 통계·포화 배지.
import 'fake-indexeddb/auto'; // IDBRequest 등 전역을 모두 깐다
import { IDBFactory } from 'fake-indexeddb';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { openProjectStore } from '../src/storage/db';
import { LangProvider } from '../src/i18n';
import { sample } from './helpers';

const FILES: Record<string, string> = {
  './samples/support-agent.jsonl': 'support-agent.jsonl',
  './samples/support-agent.annotations.jsonl': 'support-agent.annotations.jsonl',
  './samples/support-agent.taxonomy.csv': 'support-agent.taxonomy.csv',
};

beforeEach(() => {
  // 테스트마다 빈 IndexedDB
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  // 동봉 샘플은 public/samples 에서 읽어 같은 출처 fetch 처럼 돌려준다(네트워크 없음)
  vi.stubGlobal('fetch', async (url: string) => {
    const name = FILES[url];
    return name ? new Response(sample(name)) : new Response('missing', { status: 404 });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderApp = () =>
  render(
    <LangProvider initial="en">
      <App />
    </LangProvider>,
  );

async function openSample() {
  await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Try sample traces' })));
  await screen.findByTestId('format');
  // 화면이 그려진 직후에도 키 처리기를 다는 effect 는 아직 대기 중일 수 있다 → 비워서 처리기가 달린 뒤에 키를 누른다
  await act(async () => {});
}

const press = (key: string, target: Window | Element = window) => act(() => void fireEvent.keyDown(target, { key }));

describe('app flow (mock mode with bundled sample)', () => {
  it('shows the detection summary and the practice-data notice', async () => {
    renderApp();
    await openSample();
    expect(screen.getByTestId('format').textContent).toBe('openai-jsonl');
    expect(screen.getByText('40 traces')).toBeTruthy();
    expect(screen.getByText('0 broken lines')).toBeTruthy();
    expect(screen.getByText('Practice mode — synthetic sample data')).toBeTruthy();
    expect(screen.getByText(/synthetic practice data written for this project/)).toBeTruthy();
  });

  it('autosaves to IndexedDB and resumes when the same file is opened again', async () => {
    renderApp();
    await openSample();
    press('f');
    press('n');
    const note = screen.getByRole('textbox', { name: /Note/ });
    act(() => void fireEvent.change(note, { target: { value: 'Answered without checking the order' } }));
    press('Escape', note);
    press('j');
    press('p');
    // 자동 저장이 끝날 때까지 조건으로 기다린 뒤(고정 sleep 없음) 화면을 닫고(언마운트) 다시 연다
    await waitFor(async () => {
      const db = await openProjectStore();
      try {
        const rows = await db.list();
        expect(rows).toHaveLength(1);
        const anns = Object.values(rows[0].state.annotations);
        expect(anns.map((a) => a.verdict).sort()).toEqual(['fail', 'pass']);
        expect(anns.find((a) => a.verdict === 'fail')?.note).toBe('Answered without checking the order');
      } finally {
        db.close();
      }
    }, { timeout: 5000 });
    cleanup();

    renderApp();
    await openSample();
    expect(screen.getByText('Resumed your saved notes for this file.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Fail/ }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByRole('textbox', { name: /Note/ }) as HTMLTextAreaElement).value).toBe('Answered without checking the order');
    press('j');
    expect(screen.getByRole('button', { name: /^Pass/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('example annotations fill the axial board and stats; the select menu moves a card', async () => {
    renderApp();
    await openSample();
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Load example annotations' })));
    await screen.findByText(/Imported 40, kept 0 newer local notes, 0 unknown trace ids\./);

    act(() => void fireEvent.click(screen.getByRole('tab', { name: 'Axial coding' })));
    const columns = document.querySelectorAll('.column');
    expect(columns).toHaveLength(6); // 미분류 + 유형 5
    const policy = screen.getByRole('region', { name: 'Policy hallucination' });
    expect(within(policy).getByText('5 notes')).toBeTruthy();

    // 키보드·터치 대체 수단: 카드의 선택 메뉴로 sup-002 를 "Wrong tool arguments" 로 옮긴다
    const select = screen.getByRole('combobox', { name: 'Mode: sup-002' }) as HTMLSelectElement;
    const target = [...select.options].find((o) => o.text === 'Wrong tool arguments')!;
    act(() => void fireEvent.change(select, { target: { value: target.value } }));
    expect(within(screen.getByRole('region', { name: 'Policy hallucination' })).getByText('4 notes')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Wrong tool arguments' })).getByText('5 notes')).toBeTruthy();

    act(() => void fireEvent.click(screen.getByRole('tab', { name: 'Stats' })));
    expect(screen.getByText('40 of 40 traces reviewed')).toBeTruthy();
    const badge = document.querySelector('.badge')!;
    expect(badge.getAttribute('data-saturated')).toBe('true');
    expect(badge.textContent).toBe('Saturated — new failure modes stopped appearing');
    expect(document.querySelectorAll('.sat-chart__dot')).toHaveLength(5);
  });

  it('opens a file passed by the CLI via ?trace=__trace/<name>', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      url === './__trace/my%20traces.jsonl' ? new Response(sample('anthropic.jsonl')) : new Response('', { status: 404 }),
    );
    window.history.replaceState(null, '', '/?trace=__trace%2Fmy%2520traces.jsonl');
    renderApp();
    await waitFor(() => expect(screen.getByTestId('format').textContent).toBe('anthropic-jsonl'));
    expect(screen.getByText('my traces.jsonl')).toBeTruthy();
  });

  it('shows a readable error for an unknown format', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"foo":1}\n'));
    renderApp();
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Try sample traces' })));
    expect((await screen.findByRole('alert')).textContent).toMatch(/unknown trace format: keys=foo/);
  });

  it('shows broken line numbers when every line of the file is broken', async () => {
    renderApp();
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    const file = new File(['not json\n{oops\nalso bad\n'], 'broken.jsonl');
    await act(async () => void fireEvent.change(input, { target: { files: [file] } }));
    expect((await screen.findByRole('alert')).textContent).toContain('3 broken lines (1, 2, 3)');
  });

  it('shows the broken line numbers in Korean too', async () => {
    render(
      <LangProvider initial="ko">
        <App />
      </LangProvider>,
    );
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    const file = new File(['not json\n{oops\nalso bad\n'], 'broken.jsonl');
    await act(async () => void fireEvent.change(input, { target: { files: [file] } }));
    expect((await screen.findByRole('alert')).textContent).toContain('깨진 줄 3개 (1, 2, 3)');
  });
});
