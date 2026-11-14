// @vitest-environment jsdom
// AC-3 (오픈 코딩): 단축키 P/F/D 판정, J/K 이동, N 메모 포커스, 1–9 유형 지정.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useReducer, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Trace } from '../src/adapters';
import { emptyState, reducer, type ProjectState } from '../src/core/annotations';
import { ReviewTab } from '../src/components/ReviewTab';
import { LangProvider } from '../src/i18n';
import { sampleTraces } from './helpers';

afterEach(cleanup);

// 테스트가 읽을 최신 상태(그린 뒤 effect 에서 옮겨 담는다)
const probe: { state: ProjectState } = { state: emptyState() };

function Harness({ traces, initial = emptyState() }: { traces: Trace[]; initial?: ProjectState }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    probe.state = state;
  });
  return (
    <LangProvider initial="en">
      <ReviewTab traces={traces} state={state} dispatch={dispatch} index={index} setIndex={setIndex} now={() => '2026-11-14T09:00:00.000Z'} />
    </LangProvider>
  );
}

const press = (key: string, target: Window | Element = window) => act(() => void fireEvent.keyDown(target, { key }));
const currentId = () => document.querySelector('.trace-view__id')?.textContent;

describe('open coding shortcuts', () => {
  it('P / F / D set the verdict of the current trace', () => {
    render(<Harness traces={sampleTraces()} />);
    press('f');
    expect(probe.state.annotations['sup-001'].verdict).toBe('fail');
    expect(screen.getByRole('button', { name: /^Fail/ }).getAttribute('aria-pressed')).toBe('true');
    press('p');
    expect(probe.state.annotations['sup-001'].verdict).toBe('pass');
    press('D');
    expect(probe.state.annotations['sup-001'].verdict).toBe('defer');
    expect(probe.state.annotations['sup-001'].reviewOrder).toBe(1);
  });

  it('J / K move between traces and stay within bounds', () => {
    render(<Harness traces={sampleTraces()} />);
    expect(currentId()).toBe('sup-001');
    press('j');
    press('j');
    expect(currentId()).toBe('sup-003');
    press('k');
    expect(currentId()).toBe('sup-002');
    press('k');
    press('k');
    expect(currentId()).toBe('sup-001');
    press('f');
    press('j');
    press('p');
    expect(probe.state.annotations['sup-002']).toMatchObject({ verdict: 'pass', reviewOrder: 2 });
  });

  it('N focuses the note field; typing there does not trigger shortcuts; Esc leaves it', () => {
    render(<Harness traces={sampleTraces()} />);
    const note = screen.getByRole('textbox', { name: /Note/ });
    press('n');
    expect(document.activeElement).toBe(note);
    press('f', note); // 메모에 'f' 를 치는 중
    expect(probe.state.annotations['sup-001']).toBeUndefined();
    act(() => void fireEvent.change(note, { target: { value: 'Says 30-day refund window' } }));
    expect(probe.state.annotations['sup-001'].note).toBe('Says 30-day refund window');
    press('Escape', note);
    expect(document.activeElement).not.toBe(note);
  });

  it('1–9 assign an existing failure mode (and mark the trace as fail)', () => {
    let initial = emptyState();
    initial = reducer(initial, { type: 'addMode', name: 'Policy hallucination' });
    initial = reducer(initial, { type: 'addMode', name: 'Wrong tool arguments' });
    render(<Harness traces={sampleTraces()} initial={initial} />);
    press('2');
    expect(probe.state.annotations['sup-001']).toMatchObject({ verdict: 'fail', modeId: 'm2' });
    press('9'); // 없는 유형 번호는 무시
    expect(probe.state.annotations['sup-001'].modeId).toBe('m2');
  });

  it('? opens the shortcut help and Esc closes it', () => {
    render(<Harness traces={sampleTraces()} />);
    press('?');
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy();
    press('Escape');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('tool calls are shown next to their results', () => {
    render(<Harness traces={sampleTraces()} />);
    expect(screen.getByText('lookup_order')).toBeTruthy();
    // arguments JSON 은 들여쓰기해 보여 준다
    expect(document.querySelector('.tool-pair__args')?.textContent).toBe('{\n  "order_id": "BP-40117"\n}');
    expect(document.querySelector('.tool-pair__result')?.textContent).toContain('"carrier": "UPS"');
  });
});
