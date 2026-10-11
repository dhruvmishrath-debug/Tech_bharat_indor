import { test, expect, loadIntent, checkoutSpec } from '../fixtures/selfheal.js';
import { resetPlan } from '../../engine/runner.js';
import { createLlmBrain } from '../../engine/brain.js';
import { llmStatus, LLM_MODEL, LLM_PROVIDER } from '../../engine/llm.js';

// REAL open-source model. Skipped automatically when no model server / model is available.
//   local:  ollama pull qwen2.5:7b && npm run test:llm      (Docker: npm run llm:up && npm run test:llm:docker)
//   Groq:   GROQ_API_KEY in .env, then npm run test:groq    (hosted open-weight model, default openai/gpt-oss-20b)
// Assertions are deliberately about outcomes (the oracle), not about which steps the model happens to choose.
test.describe.configure({ mode: 'serial' });
test.setTimeout(900000);

let brain;
test.beforeAll(async () => {
  const st = await llmStatus();
  test.skip(!st.up || !st.hasModel, `no model "${LLM_MODEL()}" via ${LLM_PROVIDER()} (${st.reason ?? (st.up ? 'server up, model missing' : 'server down')}); see SETUP.md → Using an open-source LLM`);
  brain = createLlmBrain();
});
test.beforeEach(() => resetPlan(checkoutSpec.id));

test('real model: derives the checkout from the intent on Version A', async ({ selfHeal }) => {
  const r = await selfHeal('a', checkoutSpec, { planner: brain });
  expect(r.status, JSON.stringify(r.evidence ?? r.reason)).toBe('passed');
  expect(r.planner.kind).toBe('llm');
});

test('real model: heals the wizard redesign (B) and the accordion redesign (D)', async ({ selfHeal }) => {
  await selfHeal('a', checkoutSpec, { planner: brain, record: false });
  const b = await selfHeal('b', checkoutSpec, { planner: brain });
  expect(['healed', 'passed'], b.reason).toContain(b.status);
  const d = await selfHeal('d', checkoutSpec, { planner: brain });
  expect(['healed', 'passed'], d.reason).toContain(d.status);
});

test('real model: promo code + express delivery reach the exact total', async ({ selfHeal }) => {
  const spec = loadIntent('full'); resetPlan(spec.id);
  const r = await selfHeal('b', spec, { planner: brain });
  expect(r.status, r.reason).toBe('passed'); // oracle requires $74.70 and "express"
});

test('real model: still cannot hide a genuine bug (payments 500)', async ({ selfHeal }) => {
  await selfHeal('a', checkoutSpec, { planner: brain, record: false });
  const r = await selfHeal('c', checkoutSpec, { planner: brain });
  expect(r).toMatchObject({ status: 'failed', category: 'application-failure' });
});
