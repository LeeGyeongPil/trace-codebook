#!/usr/bin/env node
// 동봉 샘플(연습용 합성 데이터)을 만든다: `npm run samples`
//
// 가상의 아웃도어 쇼핑몰 "Brightpath Gear" 의 고객지원 에이전트 트레이스 40건(OpenAI 메시지 JSONL).
// 실제 사용자 기록이 아니라 이 프로젝트용으로 직접 쓴 연습 데이터다.
// 실패 유형 5개가 정해진 자리에 심어져 있어, 직접 읽고 메모하면 유형이 귀납적으로 드러나고
// 앞쪽 20건 안에서 5개가 다 나온 뒤 곡선이 평평해지는 "포화"를 볼 수 있다.
//
// 결과 파일(public/samples/):
//   support-agent.jsonl              트레이스 40건
//   support-agent.annotations.jsonl  위 트레이스를 읽고 단 예시 주석(실패 16·통과 22·보류 2)
//   support-agent.taxonomy.csv       예시 유형 5개의 정의
//   anthropic.jsonl · otlp.json · langfuse-trace.json · phoenix.jsonl  형식별 작은 샘플
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'samples');
mkdirSync(out, { recursive: true });

// ---- 에이전트가 따라야 할 정책 문서(도구 search_policy 가 돌려주는 내용) ----
const POLICY = {
  refund: 'Refund policy: unused items can be returned within 14 days of delivery for a full refund. Refunds go back to the original payment method within 5-7 business days.',
  shipping: 'Shipping policy: standard shipping takes 3-5 business days, express takes 1-2 business days. Standard shipping is free on orders over $75.',
  warranty: 'Warranty policy: all Brightpath products carry a 1-year warranty against manufacturing defects. Normal wear and misuse are not covered.',
  exchange: 'Exchange policy: size and color exchanges are free within 30 days of delivery.',
  escalation: 'Escalation policy: hand the conversation to a human agent when the customer asks for a person, mentions a chargeback or legal action, or reports a safety issue.',
};

const SYSTEM =
  'You are Pip, the customer support assistant for Brightpath Gear, an outdoor equipment store. ' +
  'Always check the policy with search_policy before answering policy questions. Use tools for order actions. ' +
  'Respect customer preferences. Follow the escalation policy.';

let callSeq = 0;
const call = (name, args) => ({ id: `call_${String(++callSeq).padStart(3, '0')}`, type: 'function', function: { name, arguments: JSON.stringify(args) } });

/** 대화 조립 도우미: user / assistant(+도구 호출) / tool 결과 */
function convo(steps) {
  const messages = [{ role: 'system', content: SYSTEM }];
  for (const s of steps) {
    if (s.user) messages.push({ role: 'user', content: s.user });
    if (s.tool) {
      const c = call(s.tool, s.args);
      messages.push({ role: 'assistant', content: s.pre ?? null, tool_calls: [c] });
      messages.push({ role: 'tool', tool_call_id: c.id, content: typeof s.result === 'string' ? s.result : JSON.stringify(s.result) });
    }
    if (s.say) messages.push({ role: 'assistant', content: s.say });
  }
  return messages;
}

const order = (id, item, status, extra = {}) => ({ order_id: id, item, status, ...extra });

// ---- 통과 트레이스 만들기(22건, 서로 조금씩 다르게) ----
const passes = [
  () => convo([
    { user: 'Hi, where is my order BP-40117? I ordered a trail backpack.' },
    { tool: 'lookup_order', args: { order_id: 'BP-40117' }, result: order('BP-40117', 'Ridge 30L trail backpack', 'shipped', { carrier: 'UPS', eta: '2026-11-18' }) },
    { say: 'Your Ridge 30L trail backpack (BP-40117) has shipped with UPS and should arrive by November 18.' },
  ]),
  () => convo([
    { user: 'How long do I have to return something?' },
    { tool: 'search_policy', args: { query: 'return window' }, result: POLICY.refund },
    { say: 'You can return unused items within 14 days of delivery for a full refund. The money goes back to your original payment method within 5-7 business days.' },
  ]),
  () => convo([
    { user: 'Is shipping free if I spend $90?' },
    { tool: 'search_policy', args: { query: 'free shipping threshold' }, result: POLICY.shipping },
    { say: 'Yes — standard shipping is free on orders over $75, so a $90 order ships free. Standard delivery takes 3-5 business days.' },
  ]),
  () => convo([
    { user: 'The tent poles I got are the wrong size. Order BP-40552. Can I return it?' },
    { tool: 'lookup_order', args: { order_id: 'BP-40552' }, result: order('BP-40552', 'Summit 2P tent', 'delivered', { delivered: '2026-11-09' }) },
    { tool: 'create_return', args: { order_id: 'BP-40552', reason: 'wrong size' }, result: { return_id: 'RT-9081', status: 'created', label_url: 'https://returns.example/RT-9081' } },
    { say: 'I created return RT-9081 for your Summit 2P tent (reason: wrong size). Your prepaid label is ready in your account.' },
  ]),
  () => convo([
    { user: 'My headlamp stopped working after 3 months. Is that covered?' },
    { tool: 'search_policy', args: { query: 'warranty' }, result: POLICY.warranty },
    { say: 'Yes — Brightpath products have a 1-year warranty against manufacturing defects, so a headlamp failing after 3 months is covered. Would you like me to start a warranty claim?' },
  ]),
  () => convo([
    { user: 'Can I swap my fleece for a medium? Got it last week.' },
    { tool: 'search_policy', args: { query: 'exchange size' }, result: POLICY.exchange },
    { say: 'Absolutely — size exchanges are free within 30 days of delivery. I can set up the exchange for a medium if you share your order number.' },
  ]),
  () => convo([
    { user: 'Please cancel order BP-41003, I ordered by mistake.' },
    { tool: 'cancel_order', args: { order_id: 'BP-41003' }, result: { order_id: 'BP-41003', status: 'cancelled' } },
    { say: 'Done — order BP-41003 is cancelled. You will not be charged.' },
  ]),
  () => convo([
    { user: 'I want to talk to a real person please.' },
    { tool: 'escalate_to_human', args: { reason: 'customer requested a human agent' }, result: { ticket: 'HD-3311', queue: 'general', wait_minutes: 4 } },
    { say: 'Of course. I have passed you to a human agent (ticket HD-3311). Expected wait is about 4 minutes.' },
  ]),
  () => convo([
    { user: 'Where is BP-41290?' },
    { tool: 'lookup_order', args: { order_id: 'BP-41290' }, result: order('BP-41290', 'Alpine down jacket', 'processing', { eta: '2026-11-21' }) },
    { say: 'Order BP-41290 (Alpine down jacket) is still being prepared. The current estimate is November 21.' },
  ]),
  () => convo([
    { user: 'Please return order BP-41377, the stove arrived dented.' },
    { tool: 'create_return', args: { order_id: 'BP-41377', reason: 'arrived damaged' }, result: { error: 'service timeout' } },
    { say: 'I am sorry — our returns system timed out and the return was not created. I have noted the damage report; please try again in a few minutes or I can connect you with an agent.' },
  ]),
  () => convo([
    { user: 'How long does express shipping take?' },
    { tool: 'search_policy', args: { query: 'express shipping time' }, result: POLICY.shipping },
    { say: 'Express shipping takes 1-2 business days.' },
  ]),
  () => convo([
    { user: 'Hi! Do you sell water filters?' },
    { tool: 'search_catalog', args: { query: 'water filter' }, result: { items: [{ sku: 'WF-200', name: 'Stream squeeze filter', price: 34.0 }] } },
    { say: 'Yes — we carry the Stream squeeze filter (WF-200) for $34.' },
  ]),
  () => convo([
    { user: 'When will my refund show up? I returned boots last week.' },
    { tool: 'search_policy', args: { query: 'refund timing' }, result: POLICY.refund },
    { say: 'Refunds go back to your original payment method within 5-7 business days after we receive the return.' },
  ]),
  () => convo([
    { user: 'Please only email me about order BP-41566, no calls.' },
    { tool: 'update_contact_preference', args: { order_id: 'BP-41566', channel: 'email' }, result: { ok: true } },
    { say: 'Got it — we will contact you only by email about BP-41566.' },
  ]),
  () => convo([
    { user: 'Can you check BP-41608 and BP-41609? Both are sleeping bags.' },
    { tool: 'lookup_order', args: { order_id: 'BP-41608' }, result: order('BP-41608', 'Nimbus sleeping bag', 'delivered') },
    { tool: 'lookup_order', args: { order_id: 'BP-41609' }, result: order('BP-41609', 'Nimbus sleeping bag', 'shipped', { eta: '2026-11-17' }) },
    { say: 'BP-41608 was delivered, and BP-41609 has shipped and should arrive by November 17.' },
  ]),
  () => convo([
    { user: 'The zipper on my jacket broke after 2 years.' },
    { tool: 'search_policy', args: { query: 'warranty duration' }, result: POLICY.warranty },
    { say: 'I am sorry. Our warranty covers manufacturing defects for 1 year, so a zipper failing after 2 years is outside the warranty. We do offer paid repairs if that helps.' },
  ]),
  () => convo([
    { user: 'I am going to dispute this charge with my bank if nobody helps me.' },
    { tool: 'escalate_to_human', args: { reason: 'customer mentions chargeback' }, result: { ticket: 'HD-3420', queue: 'billing', wait_minutes: 6 } },
    { say: 'I understand. I have escalated this to our billing team (ticket HD-3420); a person will reply within about 6 minutes.' },
  ]),
  () => convo([
    { user: 'Cancel just the trekking poles from BP-41702, keep the rest.' },
    { tool: 'cancel_item', args: { order_id: 'BP-41702', item: 'trekking poles' }, result: { order_id: 'BP-41702', cancelled_item: 'trekking poles', status: 'partially cancelled' } },
    { say: 'Done — the trekking poles are removed from BP-41702. The rest of the order ships as planned.' },
  ]),
  () => convo([
    { user: 'Do exchanges cost anything?' },
    { tool: 'search_policy', args: { query: 'exchange fee' }, result: POLICY.exchange },
    { say: 'No — size and color exchanges are free within 30 days of delivery.' },
  ]),
  () => convo([
    { user: 'Return BP-41811 please, the gloves are too small.' },
    { tool: 'create_return', args: { order_id: 'BP-41811', reason: 'too small' }, result: { return_id: 'RT-9150', status: 'created' } },
    { say: 'Return RT-9150 is created for BP-41811 (reason: too small).' },
  ]),
  () => convo([
    { user: 'Thanks, that is all!' },
    { say: 'You are welcome — enjoy your trip!' },
  ]),
  () => convo([
    { user: 'Can you cancel BP-41930? It says shipped already.' },
    { tool: 'cancel_order', args: { order_id: 'BP-41930' }, result: { status: 'failed', error: 'order already shipped' } },
    { say: 'I could not cancel BP-41930 because it has already shipped. Once it arrives you can return it within 14 days for a full refund.' },
  ]),
];

// ---- 실패 유형 5개(심어 둔 것) ----
const MODES = {
  policy: {
    name: 'Policy hallucination',
    definition: 'The answer states a policy (window, fee, threshold, duration) that contradicts the policy text the agent just retrieved.',
  },
  args: {
    name: 'Wrong tool arguments',
    definition: 'A tool is called with an argument that does not match what the customer said (wrong order id, wrong item, wrong reason).',
  },
  constraint: {
    name: 'Ignored user constraint',
    definition: 'The agent acts against an explicit customer preference or limit (contact channel, deadline, partial action).',
  },
  handoff: {
    name: 'Missing human handoff',
    definition: 'The escalation policy requires a human (asked for a person, chargeback, legal threat) but the agent keeps going alone.',
  },
  toolError: {
    name: 'Tool error reported as success',
    definition: 'A tool returned an error or failure status but the agent told the customer the action succeeded.',
  },
};

const fails = {
  policy: [
    { note: 'Says 30-day refund window; the retrieved policy says 14 days.', t: () => convo([
      { user: 'I bought a tent 3 weeks ago and never used it. Can I still get a refund?' },
      { tool: 'search_policy', args: { query: 'refund window' }, result: POLICY.refund },
      { say: 'Yes! You have 30 days from delivery to return unused items, so you are still within the window.' },
    ]) },
    { note: 'Claims free shipping over $50; policy says over $75.', t: () => convo([
      { user: 'My cart is $60. Do I get free shipping?' },
      { tool: 'search_policy', args: { query: 'free shipping' }, result: POLICY.shipping },
      { say: 'Good news — standard shipping is free on orders over $50, so your $60 cart ships free.' },
    ]) },
    { note: 'Promises a 2-year warranty; policy says 1 year.', t: () => convo([
      { user: 'How long is the warranty on your stoves?' },
      { tool: 'search_policy', args: { query: 'warranty' }, result: POLICY.warranty },
      { say: 'All Brightpath products come with a 2-year warranty against defects.' },
    ]) },
    { note: 'Says refund arrives within 24 hours; policy says 5-7 business days.', t: () => convo([
      { user: 'If I return these boots, how fast do I get my money back?' },
      { tool: 'search_policy', args: { query: 'refund timing' }, result: POLICY.refund },
      { say: 'Refunds are processed within 24 hours of us receiving the boots.' },
    ]) },
    { note: 'Mentions a $10 exchange fee; policy says exchanges are free.', t: () => convo([
      { user: 'I need a bigger size of the rain shell. Is there a fee?' },
      { tool: 'search_policy', args: { query: 'exchange' }, result: POLICY.exchange },
      { say: 'Exchanges are available within 30 days for a $10 processing fee.' },
    ]) },
  ],
  args: [
    { note: 'Customer said BP-48213; lookup_order called with BP-48231 (digits swapped).', t: () => convo([
      { user: 'Status of order BP-48213 please.' },
      { tool: 'lookup_order', args: { order_id: 'BP-48231' }, result: order('BP-48231', 'Camp chair', 'delivered') },
      { say: 'Your camp chair order was delivered.' },
    ]) },
    { note: 'Return reason sent as "damaged" but customer said wrong size.', t: () => convo([
      { user: 'Return BP-48390, the jacket is the wrong size.' },
      { tool: 'create_return', args: { order_id: 'BP-48390', reason: 'damaged' }, result: { return_id: 'RT-9203', status: 'created' } },
      { say: 'Return RT-9203 is created for BP-48390.' },
    ]) },
    { note: 'Passed the email address as order_id to lookup_order.', t: () => convo([
      { user: 'My email is sam.rivera@example.com and my order is BP-48455. Where is it?' },
      { tool: 'lookup_order', args: { order_id: 'sam.rivera@example.com' }, result: { error: 'order not found' } },
      { say: 'I could not find an order with that number. Could you double-check it?' },
    ]) },
    { note: 'Cancelled the previous order BP-48501 instead of BP-48510 the customer named.', t: () => convo([
      { user: 'Cancel BP-48510 please. (My older order BP-48501 is fine.)' },
      { tool: 'cancel_order', args: { order_id: 'BP-48501' }, result: { order_id: 'BP-48501', status: 'cancelled' } },
      { say: 'Your order has been cancelled.' },
    ]) },
  ],
  constraint: [
    { note: 'Customer asked for email only; agent scheduled a phone callback.', t: () => convo([
      { user: 'Please contact me by email only, I cannot take calls at work. I need help with a damaged stove.' },
      { tool: 'schedule_callback', args: { phone: 'on file', time: 'today 3pm' }, result: { ok: true } },
      { say: 'I have scheduled a callback for you today at 3pm to sort out the stove.' },
    ]) },
    { note: 'Needs delivery by Friday; agent recommends standard shipping that arrives next week.', t: () => convo([
      { user: 'I need the sleeping pad by Friday for a trip. Today is Wednesday. Which shipping should I pick?' },
      { tool: 'search_policy', args: { query: 'shipping times' }, result: POLICY.shipping },
      { say: 'Standard shipping is a great choice — it is free over $75 and takes 3-5 business days.' },
    ]) },
    { note: 'Asked to cancel only the tent; agent cancelled the whole order.', t: () => convo([
      { user: 'Cancel only the tent from BP-48777. Keep the sleeping bags.' },
      { tool: 'cancel_order', args: { order_id: 'BP-48777' }, result: { order_id: 'BP-48777', status: 'cancelled' } },
      { say: 'Done, BP-48777 is cancelled.' },
    ]) },
  ],
  handoff: [
    { note: 'Asked twice for a person; never escalated.', t: () => convo([
      { user: 'Can I speak to a human? This bot is not helping.' },
      { say: 'I am here to help! What seems to be the problem?' },
      { user: 'I said I want a PERSON. Please.' },
      { say: 'I understand your frustration. Could you tell me your order number so I can look into it?' },
    ]) },
    { note: 'Customer threatens legal action; no escalation per policy.', t: () => convo([
      { user: 'Your stove leaked gas. I am talking to a lawyer about this.' },
      { tool: 'search_policy', args: { query: 'escalation' }, result: POLICY.escalation },
      { say: 'I am sorry to hear that. You can return the stove within 14 days for a refund.' },
    ]) },
  ],
  toolError: [
    { note: 'create_return timed out but agent says the return is created.', t: () => convo([
      { user: 'Please start a return for BP-49012, the trekking poles bent on day one.' },
      { tool: 'create_return', args: { order_id: 'BP-49012', reason: 'defective' }, result: { error: 'service timeout' } },
      { say: 'All set — your return for BP-49012 is created and a label is on its way.' },
    ]) },
    { note: 'cancel_order failed (already shipped) but agent confirms cancellation.', t: () => convo([
      { user: 'Cancel BP-49088 right now.' },
      { tool: 'cancel_order', args: { order_id: 'BP-49088' }, result: { status: 'failed', error: 'order already shipped' } },
      { say: 'Your order BP-49088 has been cancelled.' },
    ]) },
  ],
};

const defers = [
  { note: 'Policy text does not cover rentals; unclear if the answer is right.', t: () => convo([
    { user: 'Can I return a rented kayak early and get part of the money back?' },
    { tool: 'search_policy', args: { query: 'rental refund' }, result: POLICY.refund },
    { say: 'Rental returns are handled by the store where you picked up the kayak. I recommend calling them about a partial refund.' },
  ]) },
  { note: 'Customer left mid-conversation; not enough to judge.', t: () => convo([
    { user: 'Hi, I have a question about my order' },
    { say: 'Sure! What is your order number?' },
  ]) },
];

// ---- 자리 배치: 검토 순서(=파일 순서) 2·5·9·13·19 에서 유형이 처음 나온다 ----
const slots = {
  policy: [2, 7, 15, 24, 33],
  args: [5, 11, 22, 37],
  constraint: [9, 17, 29],
  handoff: [13, 26],
  toolError: [19, 35],
};
const deferSlots = [30, 39];

const plan = new Map(); // 자리 → { verdict, mode?, note, make }
for (const [mode, positions] of Object.entries(slots))
  positions.forEach((p, i) => plan.set(p, { verdict: 'fail', mode, note: fails[mode][i].note, make: fails[mode][i].t }));
deferSlots.forEach((p, i) => plan.set(p, { verdict: 'defer', note: defers[i].note, make: defers[i].t }));
let passIdx = 0;
for (let p = 1; p <= 40; p++) if (!plan.has(p)) plan.set(p, { verdict: 'pass', note: '', make: passes[passIdx++] });
if (passIdx !== passes.length) throw new Error(`expected ${passes.length} pass slots, used ${passIdx}`);

const traceLines = [];
const annotationLines = [];
const base = Date.parse('2026-11-14T09:00:00Z');
for (let p = 1; p <= 40; p++) {
  const s = plan.get(p);
  const id = `sup-${String(p).padStart(3, '0')}`;
  traceLines.push(JSON.stringify({ id, messages: s.make() }));
  annotationLines.push(
    JSON.stringify({
      trace_id: id,
      source: 'openai-jsonl',
      verdict: s.verdict,
      note: s.note,
      failure_mode: s.mode ? MODES[s.mode].name : null,
      review_order: p,
      reviewed_at: new Date(base + p * 95_000).toISOString(),
    }),
  );
}
writeFileSync(join(out, 'support-agent.jsonl'), traceLines.join('\n') + '\n');
writeFileSync(join(out, 'support-agent.annotations.jsonl'), annotationLines.join('\n') + '\n');

const csvCell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const taxonomy = ['failure_mode,definition,count,share_of_failures,example_trace_ids'];
for (const [mode, positions] of Object.entries(slots)) {
  const ids = positions.slice(0, 3).map((p) => `sup-${String(p).padStart(3, '0')}`).join(';');
  taxonomy.push([MODES[mode].name, MODES[mode].definition, String(positions.length), (positions.length / 16).toFixed(4), ids].map(csvCell).join(','));
}
writeFileSync(join(out, 'support-agent.taxonomy.csv'), taxonomy.join('\n') + '\n');

// ---- 형식별 작은 샘플 ----
writeFileSync(
  join(out, 'anthropic.jsonl'),
  [
    {
      id: 'anth-001',
      system: SYSTEM,
      messages: [
        { role: 'user', content: 'Where is order BP-50110?' },
        { role: 'assistant', content: [{ type: 'text', text: 'Let me check.' }, { type: 'tool_use', id: 'toolu_01', name: 'lookup_order', input: { order_id: 'BP-50110' } }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_01', content: '{"status":"shipped","eta":"2026-11-19"}' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'BP-50110 has shipped and should arrive by November 19.' }] },
      ],
    },
    {
      id: 'anth-002',
      system: SYSTEM,
      messages: [
        { role: 'user', content: 'How long is the warranty?' },
        { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_02', name: 'search_policy', input: { query: 'warranty' } }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_02', content: [{ type: 'text', text: POLICY.warranty }] }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Brightpath products have a 1-year warranty against manufacturing defects.' }] },
      ],
    },
  ]
    .map((r) => JSON.stringify(r))
    .join('\n') + '\n',
);

const sv = (s) => ({ stringValue: s });
const attr = (key, value) => ({ key, value: typeof value === 'string' ? sv(value) : value });
const otlp = {
  resourceSpans: [
    {
      resource: { attributes: [attr('service.name', 'brightpath-support')] },
      scopeSpans: [
        {
          scope: { name: 'support-agent' },
          spans: [
            { traceId: '5b8efff798038103d269b633813fc60c', spanId: 'a1b2c3d4e5f60001', name: 'invoke_agent Pip', startTimeUnixNano: '1763110800000000000', attributes: [attr('gen_ai.operation.name', 'invoke_agent')] },
            {
              traceId: '5b8efff798038103d269b633813fc60c',
              spanId: 'a1b2c3d4e5f60002',
              parentSpanId: 'a1b2c3d4e5f60001',
              name: 'chat gpt-4o',
              startTimeUnixNano: '1763110801000000000',
              attributes: [
                attr('gen_ai.operation.name', 'chat'),
                attr('gen_ai.system_instructions', JSON.stringify([{ type: 'text', content: SYSTEM }])),
                attr('gen_ai.input.messages', JSON.stringify([
                  { role: 'user', parts: [{ type: 'text', content: 'Is shipping free on a $80 order?' }] },
                  { role: 'assistant', parts: [{ type: 'tool_call', id: 'call_x1', name: 'search_policy', arguments: { query: 'free shipping' } }] },
                  { role: 'tool', parts: [{ type: 'tool_call_response', id: 'call_x1', response: POLICY.shipping }] },
                ])),
                attr('gen_ai.output.messages', JSON.stringify([{ role: 'assistant', parts: [{ type: 'text', content: 'Yes, standard shipping is free on orders over $75.' }], finish_reason: 'stop' }])),
              ],
            },
            // 내용 수집(content capture)을 끈 계측: span 은 있지만 메시지가 없다
            { traceId: '0af7651916cd43dd8448eb211c80319c', spanId: 'b1b2c3d4e5f60001', name: 'chat gpt-4o', startTimeUnixNano: '1763110900000000000', attributes: [attr('gen_ai.operation.name', 'chat'), attr('gen_ai.request.model', 'gpt-4o')] },
          ],
        },
      ],
    },
  ],
};
writeFileSync(join(out, 'otlp.json'), JSON.stringify(otlp, null, 2) + '\n');

const langfuse = {
  id: 'lf-7c1e2a',
  name: 'support-chat',
  timestamp: '2026-11-14T10:00:00.000Z',
  input: { question: 'Can I exchange my fleece?' },
  output: 'Size and color exchanges are free within 30 days of delivery.',
  observations: [
    { id: 'obs-1', traceId: 'lf-7c1e2a', type: 'SPAN', name: 'retrieve-policy', startTime: '2026-11-14T10:00:00.100Z', input: 'exchange', output: [POLICY.exchange] },
    {
      id: 'obs-2',
      traceId: 'lf-7c1e2a',
      type: 'GENERATION',
      name: 'answer',
      parentObservationId: 'obs-1',
      startTime: '2026-11-14T10:00:00.400Z',
      model: 'gpt-4o-mini',
      input: [
        { role: 'system', content: `${SYSTEM}\n\n${POLICY.exchange}` },
        { role: 'user', content: 'Can I exchange my fleece?' },
      ],
      output: { role: 'assistant', content: 'Size and color exchanges are free within 30 days of delivery.' },
    },
  ],
  scores: [],
};
writeFileSync(join(out, 'langfuse-trace.json'), JSON.stringify(langfuse, null, 2) + '\n');

writeFileSync(
  join(out, 'phoenix.jsonl'),
  [
    {
      name: 'ChatCompletion',
      context: { trace_id: 'ph-trace-001', span_id: 'ph-span-001' },
      parent_id: null,
      span_kind: 'LLM',
      start_time: '2026-11-14T11:00:00Z',
      attributes: {
        openinference: { span: { kind: 'LLM' } },
        llm: {
          input_messages: [{ message: { role: 'system', content: SYSTEM } }, { message: { role: 'user', content: 'Do you sell water filters?' } }],
          output_messages: [{ message: { role: 'assistant', content: 'Yes, the Stream squeeze filter (WF-200) is $34.' } }],
        },
      },
    },
    {
      name: 'ChatCompletion',
      context: { trace_id: 'ph-trace-002', span_id: 'ph-span-002' },
      parent_id: null,
      span_kind: 'LLM',
      start_time: '2026-11-14T11:01:00Z',
      attributes: {
        'openinference.span.kind': 'LLM',
        'llm.input_messages.0.message.role': 'user',
        'llm.input_messages.0.message.content': 'Cancel BP-50220',
        'llm.output_messages.0.message.role': 'assistant',
        'llm.output_messages.0.message.tool_calls.0.tool_call.id': 'call_p1',
        'llm.output_messages.0.message.tool_calls.0.tool_call.function.name': 'cancel_order',
        'llm.output_messages.0.message.tool_calls.0.tool_call.function.arguments': '{"order_id":"BP-50220"}',
      },
    },
  ]
    .map((r) => JSON.stringify(r))
    .join('\n') + '\n',
);

console.log(`samples written: 40 traces, 16 fail / 22 pass / 2 defer, 5 modes -> public/samples/`);
