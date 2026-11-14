import type { Json } from './types';

/** 어떤 값이든 화면에 보일 문자열로. 객체는 JSON 문자열로 바꾼다. */
export const str = (v: Json): string =>
  v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);

/** "[...]" / "{...}" 처럼 보이는 문자열이면 JSON 으로 풀어 본다. 실패하면 원래 값. */
export function maybeParse(v: Json): Json {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (!(t.startsWith('[') || t.startsWith('{'))) return v;
  try {
    return JSON.parse(t);
  } catch {
    return v;
  }
}

/** 내용 블록 배열([{type:'text', text}] 등)에서 글자만 이어 붙인다. */
export const joinText = (parts: Json[]): string =>
  parts.map((p: Json) => (typeof p === 'string' ? p : (p?.text ?? p?.content ?? ''))).join('');
