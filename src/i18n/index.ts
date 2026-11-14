// 화면 언어: 영어·한국어.
// 정하는 순서: 주소 쿼리 ?lang=ko (스크린샷용, 저장 안 함) > 저장한 선택(localStorage) > 처음 실행이면 브라우저 언어.
import { createContext, createElement, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { en, type MsgId } from './en';
import { ko } from './ko';

export type Lang = 'en' | 'ko';
export type { MsgId };
export type Vars = Record<string, string | number>;

export const MESSAGES: Record<Lang, Record<MsgId, string>> = { en, ko };
/** 고른 언어를 저장하는 localStorage 항목 이름 */
export const LANG_STORAGE_NAME = 'trace-codebook.lang';

const isLang = (v: unknown): v is Lang => v === 'en' || v === 'ko';

/** 브라우저 언어 목록의 첫 값이 ko 로 시작하면 한국어, 아니면 영어 */
export function detectLang(languages: readonly string[] | undefined): Lang {
  const first = languages?.[0] ?? '';
  return first.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

function readSaved(): Lang | null {
  try {
    const v = globalThis.localStorage?.getItem(LANG_STORAGE_NAME);
    return isLang(v) ? v : null;
  } catch {
    return null; // 사생활 보호 모드 등에서 localStorage 접근이 막힐 수 있다
  }
}

export function initialLang(): Lang {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lang') : null;
  if (isLang(q)) return q;
  return readSaved() ?? detectLang(typeof navigator !== 'undefined' ? navigator.languages : undefined);
}

/** msgId → 문장. {name} 자리를 vars 로 채운다. */
export function translate(lang: Lang, msgId: MsgId, vars?: Vars): string {
  const text = MESSAGES[lang][msgId] ?? MESSAGES.en[msgId] ?? msgId;
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text;
}

export type Translate = (msgId: MsgId, vars?: Vars) => string;
type LangValue = { lang: Lang; setLang: (l: Lang) => void; t: Translate };

const LangContext = createContext<LangValue>({ lang: 'en', setLang: () => {}, t: (m, v) => translate('en', m, v) });

export function LangProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(() => initial ?? initialLang());
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      globalThis.localStorage?.setItem(LANG_STORAGE_NAME, l); // 다음에 열 때 감지보다 우선
    } catch {
      /* 저장 못 해도 이번 화면은 바뀐다 */
    }
    if (typeof document !== 'undefined') document.documentElement.lang = l;
  }, []);
  const value = useMemo<LangValue>(() => ({ lang, setLang, t: (m, v) => translate(lang, m, v) }), [lang, setLang]);
  return createElement(LangContext.Provider, { value }, children);
}

export const useLang = (): LangValue => useContext(LangContext);
