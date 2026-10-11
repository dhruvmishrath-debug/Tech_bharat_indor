// Intent -> actions. Observes the *current* UI and decides what a user pursuing the goal would do next.
// decide(obs, ctx) is the seam where an LLM planner could be swapped in; this one is deterministic and offline.
import { classifyField, advanceScore, SHIPPING_CHOICE, PROMO_APPLY } from './lexicon.js';
import { verify } from './verify.js';

const MAX_STEPS = 30;

export function describe(e) { return `${e.role} "${e.name || e.placeholder || e.id}"`; }

export function decide(obs, ctx) {
  // 1. Fill every empty field we have data for.
  for (const e of obs.elements) {
    if (e.kind !== 'field' || !e.enabled || e.value) continue;
    const key = classifyField(e);
    if (key && ctx.data[key] !== undefined) return { action: 'fill', field: key, value: ctx.data[key], target: e };
  }
  // 2. Choose the requested delivery option (radio), if the test asks for one.
  const want = SHIPPING_CHOICE[ctx.data.shipping];
  if (want) for (const e of obs.elements) if (e.type === 'radio' && !e.checked && e.enabled && want.test(e.name)) return { action: 'check', field: 'shipping', target: e };
  // 3. Tick consent boxes.
  for (const e of obs.elements) {
    if (e.type === 'checkbox' && !e.checked && /terms|agree|consent|accept/i.test(e.name)) return { action: 'check', target: e };
  }
  // 4. A promo code was typed: apply it (once).
  const promoFilled = ctx.data.promo !== undefined && obs.elements.some((e) => e.kind === 'field' && e.value && classifyField(e) === 'promo');
  if (promoFilled && !ctx.promoApplied) {
    const btn = obs.elements.find((e) => e.kind === 'action' && e.enabled && PROMO_APPLY.test(e.name));
    if (btn) { ctx.promoApplied = true; return { action: 'click', target: btn }; }
  }
  // 5. Otherwise advance the flow with the most "forward" button we haven't already tried in this state.
  const scored = obs.elements
    .filter((e) => e.kind === 'action' && e.enabled && !ctx.tried.has(e.selector + '|' + ctx.stateKey))
    .map((e) => ({ e, s: advanceScore(e.name) })).filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  return scored.length ? { action: 'click', target: scored[0].e } : null;
}

const okCall = (c) => c.status < 400;

// Drives a fresh page to the goal. Returns {status, steps, reason, evidence}.
//   status: 'achieved' | 'app-error' | 'stuck'
export async function achieveIntent(page, test, log = () => {}, brain) {
  const ctx = { data: test.data, tried: new Set(), stateKey: '', promoApplied: false, test };
  const steps = [];
  let lastCalls = [];
  for (let i = 0; i < MAX_STEPS; i++) {
    const obs = await page.observe();
    const evidence = { alerts: obs.alerts, consoleErrors: obs.errors, pageText: obs.text.slice(0, 160) };
    const v = verify(obs.text, test.expect);
    if (v.ok) return { status: 'achieved', steps };
    if (v.kind !== 'outcome-missing') return { status: 'app-error', steps, reason: v.reason, evidence };

    const last = steps[steps.length - 1];
    const pendingData = obs.elements.some((e) => e.kind === 'field' && !e.value && classifyField(e) && ctx.data[classifyField(e)] !== undefined);
    if (last?.action === 'click' && (obs.alerts.length || obs.errors.length) && !pendingData) {
      return { status: 'app-error', steps, reason: 'The workflow was completed but the application reported an error instead of the expected outcome.', evidence };
    }
    ctx.stateKey = obs.text.slice(0, 200);
    const d = await brain.decide(obs, ctx, steps);
    if (!d) {
      if (last?.action === 'click' && lastCalls.some(okCall)) {
        return { status: 'app-error', steps, reason: `The last click triggered a successful API call (${lastCalls.filter(okCall).map((c) => `${c.method} ${c.path} → ${c.status}`).join(', ')}), yet the UI never showed the expected outcome and no error.`, evidence: { ...evidence, apiCalls: lastCalls } };
      }
      const blocked = obs.elements.filter((e) => e.kind === 'action' && !e.enabled && advanceScore(e.name) > 0);
      const hint = blocked.length ? ` The control that would move the workflow forward ("${blocked[0].name}") is disabled although every known field is filled.` : '';
      return { status: 'stuck', steps, reason: `No visible control moves the workflow toward the goal.${hint}`, evidence: { ...evidence, disabledControls: blocked.map((e) => e.name) } };
    }
    const t = d.target;
    const step = {
      action: d.action, field: d.field, value: d.action === 'fill' ? `{{${d.field}}}` : undefined,
      description: `${d.action} ${describe(t)}`, source: d.source, reason: d.reason,
      locator: { css: t.selector, fingerprint: fingerprint(t) },
    };
    const mark = page.apiLog.length;
    if (d.action === 'fill') await page.fill(t.selector, d.value); else if (d.action === 'check') await page.check(t.selector); else { ctx.tried.add(t.selector + '|' + ctx.stateKey); await page.click(t.selector); }
    await page.settle();
    lastCalls = page.apiLog.slice(mark);
    steps.push(step); log(step);
  }
  return { status: 'stuck', steps, reason: `Gave up after ${MAX_STEPS} steps.`, evidence: {} };
}

export const fingerprint = (e) => ({ role: e.role, tag: e.tag, type: e.type, name: e.name, placeholder: e.placeholder, id: e.id, nameAttr: e.nameAttr });
