// Orchestrates one test run: replay the stored plan, and if the UI no longer fits, diagnose, heal or report a real failure.
// Every run is recorded (with screenshots) for the dashboard.
import fs from 'node:fs';
import path from 'node:path';
import { Page } from './page.js';
import { achieveIntent } from './planner.js';
import { diffPlans } from './healer.js';
import { getBrain, rulesBrain } from './brain.js';
import { verify } from './verify.js';
import { recordRun, newRunId, shotPath } from './recorder.js';

const PLAN_DIR = process.env.SELFHEAL_DIR || '.selfheal';
const planFile = (test) => path.join(PLAN_DIR, `${test.id}.plan.json`);
export const loadPlan = (test) => (fs.existsSync(planFile(test)) ? JSON.parse(fs.readFileSync(planFile(test), 'utf8')) : null);
export const resetPlans = () => fs.rmSync(PLAN_DIR, { recursive: true, force: true });
export const resetPlan = (testId) => fs.rmSync(planFile({ id: testId }), { force: true });
function savePlan(test, steps, prev, note) {
  fs.mkdirSync(PLAN_DIR, { recursive: true });
  const plan = { testId: test.id, intent: test.intent, version: (prev?.version ?? 0) + 1, updatedFor: note, steps };
  fs.writeFileSync(planFile(test), JSON.stringify(plan, null, 2));
  return plan;
}

const interpolate = (v, data) => v?.replace(/\{\{(\w+)\}\}/g, (_, k) => data[k]);

// Replays recorded steps. Stops at the first step that no longer fits the UI.
async function replay(page, plan, test, brain, events) {
  const healedLocators = [];
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    let css = step.locator.css;
    const pr = await page.probe(css);
    let problem = null;
    if (!pr.exists) problem = 'element not found';
    else if (!pr.visible) problem = 'element is no longer visible';
    else if (!pr.enabled) problem = 'element is disabled';

    // A control that exists but is disabled is a symptom to report, not something to re-target.
    if (problem === 'element is disabled') return { ok: false, fail: { stepIndex: i, step, problem, candidate: null }, healedLocators };
    if (problem) {
      // Level 1: is it the same element under a new selector/label? (rules: similarity score; llm: the model decides)
      const loc = await brain.locate(step, await page.observe());
      const best = loc.best;
      const fail = { stepIndex: i, step, problem, candidate: best && { name: best.e.name, selector: best.e.selector, score: best.score } };
      if (!loc.trusted) return { ok: false, fail, healedLocators };
      healedLocators.push({ stepIndex: i, from: step.locator.css, to: best.e.selector, score: best.score, name: best.e.name, by: loc.source, reason: loc.reason });
      css = best.e.selector;
    }
    try {
      if (step.action === 'fill') await page.fill(css, interpolate(step.value, test.data));
      else if (step.action === 'check') await page.check(css);
      else await page.click(css);
    } catch (e) {
      return { ok: false, fail: { stepIndex: i, step, problem: `action failed (${e.message.split('\n')[0]})`, candidate: null }, healedLocators };
    }
    await page.settle();
    events?.({ type: 'step', i, step, ok: true });
  }
  return { ok: true, healedLocators };
}

// target: { name, url }.  Provide either `page` (a Playwright page, e.g. the test fixture) or `browser`.
export async function runTest(test, target, { browser, page: pwPage, events, autoSave = true, record = true, source = 'cli', planner } = {}) {
  const t0 = Date.now();
  const brain = planner ?? (await getBrain());
  const llm0 = { ...brain.stats };
  const runId = newRunId();
  const screenshots = {};
  const open = () => (pwPage ? (async () => { const p = Page.attach(pwPage); await p.goto(target.url); return p; })() : Page.open(browser, target.url));
  // Plan from the intent. If a MODEL-driven run ends in an application error, get a second opinion from the rules on a
  // fresh page: a model that skipped the promo code looks exactly like a wrong-total bug, and must not be blamed on the app.
  const planIntent = async (pg, evt) => {
    const r = await achieveIntent(pg, test, evt, brain);
    if (r.status !== 'app-error' || brain.kind !== 'llm') return { r, pg };
    const second = await open();
    const r2 = await achieveIntent(second, test, evt, rulesBrain);
    if (r2.status === 'achieved') { await pg.close(); return { r: { ...r2, secondOpinion: { overruled: r.reason } }, pg: second }; }
    await second.close();
    return { r: { ...r, secondOpinion: { confirmed: true } }, pg };
  };
  const shot = async (page, name) => { const s = shotPath(runId, name); fs.mkdirSync(path.dirname(s.file), { recursive: true }); await page.screenshot(s.file); screenshots[name] = s.rel; };
  const plan = loadPlan(test);
  const finish = async (r) => {
    const latest = loadPlan(test);
    const rec = { id: runId, at: new Date().toISOString(), source, testId: test.id, test: test.name, intent: test.intent, app: target.name, url: target.url, ms: Date.now() - t0, screenshots, planSteps: latest?.steps, planVersionNow: latest?.version, planner: { kind: brain.kind, model: brain.model, llmCalls: brain.stats.calls - llm0.calls, llmMs: brain.stats.ms - llm0.ms, fallbacks: brain.stats.fallbacks - llm0.fallbacks }, ...r };
    if (brain.kind === 'llm' && (r.status === 'healed' || r.status === 'failed')) rec.llmSummary = await brain.explain(rec);
    return record ? recordRun(rec) : rec;
  };

  // --- First run: no recorded plan, so derive one from the intent and keep it. ---
  if (!plan) {
    const { r, pg: page } = await planIntent(await open(), (s) => events?.({ type: 'plan-step', step: s }));
    await shot(page, r.status === 'achieved' ? 'final' : 'failure');
    await page.close();
    if (r.status !== 'achieved') return await finish({ status: 'failed', category: r.status === 'app-error' ? 'application-failure' : 'unresolved', reason: r.reason, evidence: r.evidence, ...(r.secondOpinion && { secondOpinion: r.secondOpinion }) });
    const saved = autoSave ? savePlan(test, r.steps, null, target.name) : { version: 1, steps: r.steps };
    return await finish({ status: 'passed', mode: 'recorded', planVersion: saved.version, steps: r.steps.length, newSteps: r.steps, ...(r.secondOpinion && { secondOpinion: r.secondOpinion }) });
  }

  // --- Replay the stored plan. ---
  const page = await open();
  const rep = await replay(page, plan, test, brain, events);
  let distrusted = null;
  if (rep.ok) {
    const obs = await page.observe();
    const v = verify(obs.text, test.expect);
    await shot(page, v.ok ? 'final' : 'failure');
    const apiCalls = [...page.apiLog];
    await page.close();
    if (v.ok) {
      if (rep.healedLocators.length && autoSave) {
        const steps = plan.steps.map((s, i) => { const h = rep.healedLocators.find((x) => x.stepIndex === i); return h ? { ...s, locator: { ...s.locator, css: h.to, fingerprint: { ...s.locator.fingerprint, name: h.name } } } : s; });
        const saved = savePlan(test, steps, plan, target.name);
        return await finish({ status: 'healed', mode: 'locator-heal', healedLocators: rep.healedLocators, oldPlanVersion: plan.version, planVersion: saved.version });
      }
      return await finish({ status: 'passed', mode: 'replay', planVersion: plan.version, steps: plan.steps.length });
    }
    // Locators were re-targeted by a guess (similarity or model) and the outcome is missing: a wrong guess is
    // indistinguishable from a bug, so re-derive the workflow from the intent before blaming the application.
    if (rep.healedLocators.length) distrusted = rep.healedLocators;
    // Every old step still worked, yet the outcome is missing -> nothing about the UI moved; the product misbehaved.
    else return await finish({ status: 'failed', category: 'application-failure', reason: v.reason ?? 'All recorded steps executed, but the expected outcome never appeared.', healedLocators: rep.healedLocators, evidence: { alerts: obs.alerts, consoleErrors: obs.errors, apiCalls, pageText: obs.text.slice(0, 160) } });
  }
  if (!distrusted) {
    await shot(page, 'broke'); // the UI exactly where the old plan stopped fitting
    await page.close();
  }

  // --- The recorded steps no longer fit. Rebuild the workflow from the original intent on a fresh page. ---
  const { r, pg: fresh } = await planIntent(await open(), (s) => events?.({ type: 'replan-step', step: s }));
  await shot(fresh, r.status === 'achieved' ? 'final' : 'failure');
  await fresh.close();
  const base = { brokeAt: rep.fail, oldPlanVersion: plan.version, ...(distrusted && { distrustedHeal: distrusted }) };

  if (r.status === 'achieved') {
    const changes = diffPlans(plan.steps, r.steps);
    const saved = autoSave ? savePlan(test, r.steps, plan, target.name) : { version: plan.version + 1 };
    return await finish({ status: 'healed', mode: 'replan', ...base, newSteps: r.steps, changes, planVersion: saved.version, ...(r.secondOpinion && { secondOpinion: r.secondOpinion }) });
  }
  if (r.status === 'app-error') {
    return await finish({ status: 'failed', category: 'application-failure', ...base, reason: `The UI changed, but even after re-deriving the workflow from the intent the application fails: ${r.reason}`, evidence: r.evidence, attempted: r.steps, ...(r.secondOpinion && { secondOpinion: r.secondOpinion }) });
  }
  return await finish({ status: 'failed', category: 'unresolved', ...base, reason: r.reason, evidence: r.evidence, attempted: r.steps });
}
