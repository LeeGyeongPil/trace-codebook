// AC-3 (저장): IndexedDB 에 저장하고 같은 파일 지문으로 다시 열면 그대로 복원된다.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyState, reducer } from '../src/core/annotations';
import { fingerprint } from '../src/core/fingerprint';
import { openProjectStore, type ProjectStore } from '../src/storage/db';
import { sample } from './helpers';

const open: ProjectStore[] = [];
afterEach(() => {
  while (open.length) open.pop()!.close(); // 테스트마다 연결을 닫는다
});

describe('storage', () => {
  it('same file -> same fingerprint; different content -> different fingerprint', async () => {
    const text = sample('support-agent.jsonl');
    const a = await fingerprint(new Blob([text]));
    const b = await fingerprint(new Blob([text]));
    const c = await fingerprint(new Blob([text + '\n']));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^\d+-[0-9a-f]{64}$/);
  });

  it('fingerprint reads only head and tail of large files', async () => {
    const big = 'x'.repeat(300 * 1024);
    const changedMiddle = big.slice(0, 150 * 1024) + 'y' + big.slice(150 * 1024 + 1);
    expect(await fingerprint(new Blob([big]))).toBe(await fingerprint(new Blob([changedMiddle])));
  });

  it('reopening the same fingerprint restores verdict, note and review order', async () => {
    const fp = await fingerprint(new Blob([sample('support-agent.jsonl')]));
    let s = emptyState();
    const tgt = { traceId: 'sup-002', source: 'openai-jsonl', at: '2026-11-14T09:00:00.000Z' };
    s = reducer(s, { type: 'verdict', verdict: 'pass', traceId: 'sup-001', source: 'openai-jsonl', at: tgt.at });
    s = reducer(s, { type: 'verdict', verdict: 'fail', ...tgt });
    s = reducer(s, { type: 'note', note: 'Says 30 days; policy says 14.', ...tgt });

    const store = await openProjectStore('test-db-1');
    open.push(store);
    await store.save(fp, 'support-agent.jsonl', s);
    store.close();
    open.pop();

    // "다시 열기": 새 연결로 같은 지문을 읽는다
    const again = await openProjectStore('test-db-1');
    open.push(again);
    const saved = await again.load(fp);
    expect(saved?.fileName).toBe('support-agent.jsonl');
    expect(saved?.state.annotations['sup-002']).toMatchObject({
      verdict: 'fail',
      note: 'Says 30 days; policy says 14.',
      reviewOrder: 2,
    });
    expect(saved?.state.nextOrder).toBe(3);
    expect(await again.load('other-fingerprint')).toBeUndefined();
    expect((await again.list()).map((p) => p.fingerprint)).toEqual([fp]);
  });
});
