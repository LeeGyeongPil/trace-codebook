// 트레이스 ID 가 없는 레코드(OpenAI·Anthropic 메시지 JSONL 에 흔하다)를 위한 내용 해시.
// 줄 번호를 ID 로 쓰면 파일을 다시 뽑아 순서가 바뀔 때 주석이 엉뚱한 트레이스에 붙는다.
// 그래서 "내용이 같으면 같은 ID" 가 되도록 64비트 FNV-1a 를 쓴다(암호용이 아니라 식별용).

const encoder = new TextEncoder();

/** 64비트 FNV-1a. JS 숫자는 53비트라 16비트 조각 4개로 나눠 곱셈한다. 결과는 16자리 hex. */
export function fnv1a64(input: string): string {
  const bytes = encoder.encode(input);
  // offset basis 0xcbf29ce484222325 를 16비트씩 (h0 이 가장 낮은 자리)
  let h0 = 0x2325;
  let h1 = 0x8422;
  let h2 = 0x9ce4;
  let h3 = 0xcbf2;
  for (let i = 0; i < bytes.length; i++) {
    h0 ^= bytes[i];
    // prime 0x100000001b3 = 2^40 + 0x1b3 를 곱한다
    let t0 = h0 * 0x1b3;
    let t1 = h1 * 0x1b3;
    let t2 = h2 * 0x1b3;
    let t3 = h3 * 0x1b3;
    t2 += h0 << 8; // h0 * 2^40 은 세 번째 조각에 h0 * 2^8 로 들어간다
    t3 += h1 << 8;
    t1 += t0 >>> 16;
    h0 = t0 & 0xffff;
    t2 += t1 >>> 16;
    h1 = t1 & 0xffff;
    t3 += t2 >>> 16;
    h2 = t2 & 0xffff;
    h3 = t3 & 0xffff;
  }
  const hex = (n: number) => n.toString(16).padStart(4, '0');
  return hex(h3) + hex(h2) + hex(h1) + hex(h0);
}

/** 내용 해시 ID: `h-` + 16 hex */
export const contentId = (canonical: string): string => `h-${fnv1a64(canonical)}`;
