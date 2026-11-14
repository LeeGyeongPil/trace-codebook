// 파일 지문: 크기 + 앞·뒤 64 KiB 의 SHA-256.
// 같은 파일을 다시 열면 같은 지문 → IndexedDB 에 저장한 주석을 이어서 연다.
// 수백 MB 파일도 전체를 읽지 않아 바로 끝난다(앞뒤만 읽으므로 가운데만 바뀐 파일은 같은 지문 — 의도된 절충).

const CHUNK = 64 * 1024;

export async function fingerprint(blob: Blob): Promise<string> {
  const head = new Uint8Array(await blob.slice(0, CHUNK).arrayBuffer());
  const tail = blob.size > CHUNK ? new Uint8Array(await blob.slice(Math.max(CHUNK, blob.size - CHUNK)).arrayBuffer()) : new Uint8Array(0);
  const both = new Uint8Array(head.length + tail.length);
  both.set(head, 0);
  both.set(tail, head.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', both));
  const hex = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${blob.size}-${hex}`;
}
