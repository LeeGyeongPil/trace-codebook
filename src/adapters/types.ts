// 공통 Trace 형태. 어떤 내보내기 형식이든 결국 이 모양(대화 메시지 + 도구 호출)으로 바뀐다.

/** 모델이 부른 도구 한 번. args 는 사람이 읽을 원문(JSON 문자열)이다. */
export type ToolCall = { id: string; name: string; args: string };

/** 대화 한 줄. role 은 system | user | assistant | tool 등 원본 값을 그대로 둔다. */
export type Msg = {
  role: string;
  text: string;
  toolCalls: ToolCall[];
  /** role 이 tool 인 메시지가 어느 도구 호출의 결과인지 (ToolCall.id) */
  toolResultFor?: string;
};

export type SourceFormat =
  | 'openai-jsonl'
  | 'anthropic-jsonl'
  | 'otlp-json'
  | 'langfuse-trace'
  | 'phoenix-jsonl';

export type Trace = {
  /** 원본의 트레이스 ID. 없으면 내용 해시(`h-` + 16 hex) */
  id: string;
  source: SourceFormat;
  messages: Msg[];
  /** span 형식에서 이 트레이스에 묶인 span 수 (메시지 JSONL 은 0) */
  spanCount: number;
  /** span 은 있는데 메시지 본문이 하나도 없을 때 true — 계측의 content capture 가 꺼진 경우가 많다 */
  contentMissing?: boolean;
};

// 외부 JSON 은 모양을 믿을 수 없어 어댑터 안에서는 느슨한 타입으로 다룬다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;
