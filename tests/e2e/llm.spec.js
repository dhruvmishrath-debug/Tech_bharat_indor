import { test, expect, loadIntent, checkoutSpec } from '../fixtures/selfheal.js';
import { resetPlan } from '../../engine/runner.js';
import { createLlmBrain, getBrain } from '../../engine/brain.js';
import { startMockLlm } from '../helpers/mock-llm.js';

// LLM-driven planning/healing, tested against a STAND-IN model server (see tests/helpers/mock-llm.js).
// These prove the integration: prompts, JSON parsing, validation against the real page, fallback, and that a model
// can never mask a bug. For real-model results run `PLANNER=llm npm run test:llm` with Ollama (SETUP.md).
test.describe.configure({ mode: 'serial' });

let mock, brain;
test.beforeAll(async () => { mock = await startMockLlm(); brain = createLlmBrain({ url: mock.url, model: 'mock:1' }); });
test.afterAll(() => mock.close());
test.beforeEach(() => { mock.state.mode = 'ok'; resetPlan(checkoutSpec.id); });

test.describe('LLM planner (stand-in model)', () => {
  test('plans from the intent: every step chosen by the model, validated against the page', async ({ selfHeal }) => {
    const r = await selfHeal('a', checkoutSpec, { planner: brain });
    expect(r).toMatchObject({ status: 'passed', mode: 'recorded', planner: { kind: 'llm', model: 'mock:1', fallbacks: 0 } });
    expect(r.planner.llmCalls).toBeGreaterThan(10);
    expect(r.newSteps.every((s) => s.source === 'llm')).toBe(true);
  });

  test('heals a redesign: model re-targets what it can, re-plans the rest, and explains it', async ({ selfHeal }) => {
    await selfHeal('a', checkoutSpec, { planner: brain, record: false });
    const r = await selfHeal('b', checkoutSpec, { planner: brain });
    expect(r.status).toBe('healed');
    expect(r.planner.kind).toBe('llm');
    expect(r.llmSummary).toMatch(/Mock summary/);
    expect((await selfHeal('b', checkoutSpec, { planner: brain })).mode).toBe('replay'); // healed plan is deterministic
  });

  test('promo + express intent works through the model too', async ({ selfHeal }) => {
    const spec = loadIntent('full'); resetPlan(spec.id);
    expect(await selfHeal('d', spec, { planner: brain })).toMatchObject({ status: 'passed', mode: 'recorded' });
  });

  test('the model cannot mask a real bug: payments 500 is still a failure', async ({ selfHeal }) => {
    await selfHeal('a', checkoutSpec, { planner: brain, record: false });
    const r = await selfHeal('c', checkoutSpec, { planner: brain });
    expect(r).toMatchObject({ status: 'failed', category: 'application-failure' });
    expect(r.llmSummary).toMatch(/Mock summary/);
  });

  test('a wrong-amount bug is still caught when the model drives the run', async ({ selfHeal }) => {
    const spec = loadIntent('promo'); resetPlan(spec.id);
    await selfHeal('a', spec, { planner: brain, record: false });
    const r = await selfHeal('c-total', spec, { planner: brain });
    expect(r).toMatchObject({ status: 'failed', category: 'application-failure', secondOpinion: { confirmed: true } }); // rules agree: real bug
  });

  test('a model mistake is not blamed on the app: forgetting the promo code → second opinion overrules', async ({ selfHeal }) => {
    mock.state.mode = 'ignore-options';
    const spec = loadIntent('full'); resetPlan(spec.id);
    const r = await selfHeal('b', spec, { planner: brain });
    expect(r.status).toBe('passed'); // healthy app: the wrong total was the model's doing
    expect(r.secondOpinion.overruled).toMatch(/74\\.70|expected detail/);
    expect(r.newSteps.some((s) => /Promo code/.test(s.description))).toBe(true); // stored plan is the correct route
  });
});

test.describe('LLM misbehaviour is contained', () => {
  test('non-JSON answers fall back to the rule-based planner, run still completes', async ({ selfHeal }) => {
    mock.state.mode = 'garbage';
    const r = await selfHeal('a', checkoutSpec, { planner: brain });
    expect(r.status).toBe('passed');
    expect(r.planner.fallbacks).toBeGreaterThan(0);
    expect(r.newSteps.every((s) => s.source === 'rules-fallback')).toBe(true);
  });

  test('a hallucinated element number is rejected, never executed', async ({ selfHeal }) => {
    mock.state.mode = 'badindex';
    const r = await selfHeal('a', checkoutSpec, { planner: brain });
    expect(r.status).toBe('passed'); // rules took over
    expect(r.planner.fallbacks).toBeGreaterThan(0);
  });

  test('model server down: auto mode degrades to rules, llm mode explains how to fix it', async () => {
    const saved = { ...process.env };
    Object.assign(process.env, { OLLAMA_URL: 'http://127.0.0.1:9', LLM_PROVIDER: 'ollama' }); // nothing listens here; pin the provider so a Groq key in .env is not picked up
    try {
      process.env.PLANNER = 'auto';
      expect((await getBrain()).kind).toBe('rules');
      process.env.PLANNER = 'llm';
      await expect(getBrain()).rejects.toThrow(/Install and start Ollama/);
    } finally { restore(saved); }
  });

  test('Groq without an API key: llm mode says exactly what to set; the key is never required for rules', async () => {
    const saved = { ...process.env };
    Object.assign(process.env, { LLM_PROVIDER: 'groq', GROQ_API_KEY: '' });
    try {
      process.env.PLANNER = 'llm';
      await expect(getBrain()).rejects.toThrow(/GROQ_API_KEY/);
      process.env.PLANNER = 'rules';
      expect((await getBrain()).kind).toBe('rules');
    } finally { restore(saved); }
  });
});

function restore(saved) {
  for (const k of ['PLANNER', 'OLLAMA_URL', 'LLM_PROVIDER', 'GROQ_API_KEY', 'LLM_MODEL']) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
}
