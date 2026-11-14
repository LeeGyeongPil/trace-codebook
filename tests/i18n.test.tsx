// @vitest-environment jsdom
// AC-7: 화면 두 언어 — msgId 집합 동일, 첫 실행 감지, 메뉴 선택 저장, 탭 이름 전환.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { en } from '../src/i18n/en';
import { ko } from '../src/i18n/ko';
import { detectLang, LANG_STORAGE_NAME, LangProvider, translate } from '../src/i18n';

function setLanguages(langs: string[]) {
  vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(langs);
}

const renderApp = () =>
  render(
    <LangProvider>
      <App />
    </LangProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('dictionaries', () => {
  it('en and ko have identical msgId sets and no empty strings', () => {
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
    for (const [id, text] of [...Object.entries(en), ...Object.entries(ko)]) expect(text, id).not.toBe('');
  });

  it('placeholders match between languages', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const id of Object.keys(en) as (keyof typeof en)[]) expect(vars(ko[id]), id).toEqual(vars(en[id]));
  });

  it('translate fills placeholders', () => {
    expect(translate('en', 'summary.traces', { n: 40 })).toBe('40 traces');
    expect(translate('ko', 'summary.traces', { n: 40 })).toBe('트레이스 40건');
  });
});

describe('language selection', () => {
  it('detects Korean only when the first browser language starts with ko', () => {
    expect(detectLang(['ko-KR', 'en-US'])).toBe('ko');
    expect(detectLang(['ko'])).toBe('ko');
    expect(detectLang(['en-US', 'ko-KR'])).toBe('en');
    expect(detectLang(['ja-JP'])).toBe('en');
    expect(detectLang([])).toBe('en');
  });

  it('first run follows navigator.languages', () => {
    setLanguages(['ko-KR', 'en']);
    renderApp();
    expect(screen.getByText('검토')).toBeTruthy();
    cleanup();
    vi.restoreAllMocks();
    setLanguages(['en-US']);
    renderApp();
    expect(screen.getByText('Review')).toBeTruthy();
  });

  it('menu switch changes Review <-> 검토, is saved, and wins over detection', () => {
    setLanguages(['en-US']);
    renderApp();
    expect(screen.getByText('Review')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try sample traces' })).toBeTruthy();

    act(() => void fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), { target: { value: 'ko' } }));
    expect(screen.getByText('검토')).toBeTruthy();
    expect(screen.queryByText('Review')).toBeNull();
    expect(screen.getByRole('button', { name: '샘플 트레이스로 해 보기' })).toBeTruthy();
    expect(localStorage.getItem(LANG_STORAGE_NAME)).toBe('ko');
    expect(document.documentElement.lang).toBe('ko');

    // 다시 그려도(브라우저는 여전히 영어) 저장한 선택이 이긴다
    cleanup();
    renderApp();
    expect(screen.getByText('검토')).toBeTruthy();

    act(() => void fireEvent.change(screen.getByRole('combobox', { name: '언어' }), { target: { value: 'en' } }));
    expect(screen.getByText('Review')).toBeTruthy();
    expect(localStorage.getItem(LANG_STORAGE_NAME)).toBe('en');
  });

  it('?lang=ko in the address overrides without saving (for screenshots)', () => {
    setLanguages(['en-US']);
    window.history.replaceState(null, '', '/?lang=ko');
    renderApp();
    expect(screen.getByText('검토')).toBeTruthy();
    expect(localStorage.getItem(LANG_STORAGE_NAME)).toBeNull();
  });

  it('the sample notice says the data is synthetic in both languages', () => {
    expect(en['drop.sampleNotice']).toMatch(/synthetic practice data/);
    expect(ko['drop.sampleNotice']).toMatch(/가상의 연습용 데이터/);
  });
});
