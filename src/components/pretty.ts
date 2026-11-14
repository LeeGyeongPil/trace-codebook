/** JSON 문자열이면 들여쓰기해 보기 좋게, 아니면 그대로 (도구 arguments 는 보통 한 줄짜리 JSON 문자열) */
export function prettyJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}
