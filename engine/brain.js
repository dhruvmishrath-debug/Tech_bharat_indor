// The "brain" behind planning and healing. Two interchangeable implementations:
//   rules  deterministic vocabulary + similarity scoring (engine/planner.js, engine/healer.js)
//   llm    an open-source model served locally decides the next action, finds the control a broken step meant,
//          and explains what changed. Everything it returns is validated against the real page before use,
//          and any invalid/slow answer falls back to the rules so a run never hangs on the model.
// The oracle (engine/verify.js) is never delegated: a model can steer, but cannot declare success.
import { decide as rulesDecide } from './planner.js';
import { findBest, LOCATOR_TRUST } from './healer.js';
import { llmJson, llmStatus, endpoint, label, LLM_PROVIDER } from './llm.js';
import { AVOID, PROMO_APPLY, classifyField } from './lexicon.js';

const AVOID_HINT = 'Never click Back, Edit, Remove, Help, quantity (+/−) or "save for later" controls.';

// Every key is required (small models otherwise omit "element") and `field` is a closed list of the real data keys,
// so the model cannot leave it blank or invent one. Order matters: the model fills keys in this order.
const decideSchema = (dataKeys) => ({
  type: 'object',
  properties: { action: { enum: ['fill', 'check', 'click', 'stuck'] }, element: { type: 'integer' }, field: { enum: [...dataKeys, 'none'] }, reason: { type: 'string' } },
  required: ['action', 'element', 'field', 'reason'],
});
const LOCATE_SCHEMA = {
  type: 'object',
  properties: { element: { type: 'integer' }, confidence: { type: 'number' }, reason: { type: 'string' } },
  required: ['element', 'confidence', 'reason'],
};
const EXPLAIN_SCHEMA = { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] };

const flags = (e, ctx) => {
  if (e.kind === 'field') return e.value ? `filled with "${e.value}"` : 'empty';
  if (e.kind === 'checkbox') return e.checked ? 'checked' : 'unchecked';
  return [!e.enabled && 'DISABLED', ctx?.tried.has(e.selector + '|' + ctx.stateKey) && 'already clicked on this screen'].filter(Boolean).join(', ');
};
// Situational reminders derived from the page state (small models forget multi-part actions like type-then-apply).
const hints = (obs, ctx) => {
  const out = [];
  const typed = obs.elements.some((e) => e.kind === 'field' && e.value && classifyField(e) === 'promo');
  const applyBtn = obs.elements.find((e) => e.kind === 'action' && e.enabled && PROMO_APPLY.test(e.name));
  if (ctx.data.promo !== undefined && typed && !ctx.promoApplied && applyBtn) out.push(`REMINDER: the promo code is typed but NOT applied yet; typing alone does nothing. Click "${applyBtn.name}" next, before continuing.`);
  return out;
};
export const listElements = (elements, ctx) =>
  elements.map((e, i) => `[${i}] ${e.role} "${e.name || e.placeholder}"${flags(e, ctx) ? ` (${flags(e, ctx)})` : ''}`).join('\n');

export const rulesBrain = {
  kind: 'rules', model: null,
  stats: { calls: 0, ms: 0, fallbacks: 0 },
  async decide(obs, ctx) { const d = rulesDecide(obs, ctx); return d && { ...d, source: 'rules' }; },
  async locate(step, obs) {
    const { best, runnerUp } = findBest(step.locator.fingerprint, obs);
    const trusted = !!best && best.score >= LOCATOR_TRUST && (!runnerUp || best.score - runnerUp.score > 0.15);
    return { best: best && { e: best.e, score: +best.score.toFixed(2) }, trusted, source: 'rules' };
  },
  async explain() { return null; },
};

export function createLlmBrain(opts = {}) {
  const ep = endpoint(opts), model = label(ep);
  const stats = { calls: 0, ms: 0, fallbacks: 0 };
  const ask = async (o) => {
    const t0 = Date.now(); stats.calls++;
    try { return await llmJson({ ...ep, ...o }); } finally { stats.ms += Date.now() - t0; }
  };

  // Validate the model's choice against what is really on the page.
  // Models sometimes write "ZIP code (data key: zip)" or "[8] textbox 'Card number'": accept an exact key, else a key named in the text.
  const dataKey = (raw, data) => {
    if (raw === undefined || raw === null) return undefined;
    if (data[raw] !== undefined) return raw;
    const keys = Object.keys(data), low = String(raw).toLowerCase();
    return keys.find((k) => k.toLowerCase() === low) ?? keys.filter((k) => new RegExp(`\\b${k}\\b`, 'i').test(low)).sort((a, b) => b.length - a.length)[0];
  };

  function validate(ans, obs, ctx) {
    if (ans.action === 'stuck') return { stuck: true };
    ans = { ...ans, field: dataKey(ans.field, ctx.data) ?? ans.field };
    const t = obs.elements[ans.element];
    if (!t) return { error: `element ${ans.element} does not exist` };
    if (ans.action === 'fill') {
      if (t.kind !== 'field') return { error: `element ${ans.element} is not a text field` };
      if (t.value) return { error: `element ${ans.element} is already filled` };
      if (ctx.data[ans.field] === undefined) return { error: `"${ans.field}" is not one of the data keys: ${Object.keys(ctx.data).join(', ')}` };
      // Sanity: if the label clearly means something else (card number into the promo box), refuse. Unknown labels are left to the model.
      const known = classifyField(t);
      if (known && known !== ans.field) return { error: `the textbox "${t.name}" looks like "${known}", not "${ans.field}"` };
      return { d: { action: 'fill', field: ans.field, value: ctx.data[ans.field], target: t } };
    }
    if (ans.action === 'check') {
      if (t.kind !== 'checkbox' || t.checked) return { error: `element ${ans.element} is not an unchecked checkbox/radio` };
      return { d: { action: 'check', field: ans.field && ctx.data[ans.field] !== undefined ? ans.field : undefined, target: t } };
    }
    if (t.kind !== 'action' || !t.enabled) return { error: `element ${ans.element} is not an enabled button/link` };
    // Controls that never advance a checkout (Back/Remove/Edit/qty...) are refused; "Apply" only counts when a promo code was actually typed.
    const promoTyped = ctx.data.promo !== undefined && obs.elements.some((e) => e.kind === 'field' && e.value && classifyField(e) === 'promo');
    if (AVOID.test(t.name) && !(PROMO_APPLY.test(t.name) && promoTyped)) return { error: `"${t.name}" does not move the goal forward (never click Back/Edit/Remove/Apply-without-a-code)` };
    if (ctx.tried.has(t.selector + '|' + ctx.stateKey)) return { error: `element ${ans.element} was already clicked on this screen with no effect` };
    if (promoTyped && PROMO_APPLY.test(t.name)) ctx.promoApplied = true;
    return { d: { action: 'click', target: t } };
  }

  return {
    kind: 'llm', model, provider: ep.provider, stats,

    async decide(obs, ctx, done) {
      const { test } = ctx;
      const system = `You operate a web page on behalf of a user to accomplish a goal, one UI action per reply. Reply with JSON only. ${AVOID_HINT}`;
      let user = [
        `GOAL: ${test.intent}`,
        `SUCCESS LOOKS LIKE: the page shows "${test.expect.outcome}".`,
        `DATA (key = value; to type one, name its key in "field" — never invent values):`,
        ...Object.entries(ctx.data).map(([k, v]) => `  ${k} = ${v}`),
        `ALREADY DONE: ${done.length ? done.map((s) => s.description).join(' → ') : 'nothing yet'}`,
        `PAGE TEXT: ${obs.text.slice(0, 500)}`,
        ...hints(obs, ctx),
        `VISIBLE CONTROLS:\n${listElements(obs.elements, ctx)}`,
        '',
        'Choose the single next action:',
        '- fill: an EMPTY textbox; set "field" to the data key that belongs in it.',
        '- check: tick an unchecked box/radio (terms/consent; or the delivery option the data asks for, e.g. shipping = express). For a radio set "field" to its data key.',
        '- click: a button that moves toward the goal. If you typed a promo code you MUST click its Apply/Redeem button before continuing (typing alone does nothing); otherwise continue / pay / place order.',
        '- stuck: nothing can move the goal forward.',
        'Ignore optional textboxes you have no data key for (e.g. a promo code box when no promo key is listed) — leave them empty. Fill every field you have data for before moving on. Reply with ALL FOUR keys: {"action","element" (the [number]),"field" (the data key for a fill, else "none"),"reason"}.',
      ].join('\n');
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const ans = await ask({ system, user, schema: decideSchema(Object.keys(ctx.data)) });
          const v = validate(ans, obs, ctx);
          if (v.stuck) { // a small model giving up is suspicious: trust it only if the rules also see no way forward
            const d = rulesDecide(obs, ctx);
            if (!d) return null;
            stats.fallbacks++;
            return { ...d, source: 'rules-fallback', reason: 'model said stuck, rules found a move' };
          }
          if (v.d) return { ...v.d, source: 'llm', reason: ans.reason };
          if (process.env.LLM_DEBUG) console.error(`[llm] rejected ${JSON.stringify(ans)} → ${v.error}`);
          user += `\n\nYour previous answer was rejected: ${v.error}. Choose again.`;
        } catch (e) { if (process.env.LLM_DEBUG) console.error(`[llm] call failed: ${e.message}`); break; }
      }
      stats.fallbacks++;
      const d = rulesDecide(obs, ctx);
      return d && { ...d, source: 'rules-fallback' };
    },

    // Which control on the current page is the one this recorded step meant? Returns the same shape as rulesBrain.locate.
    async locate(step, obs) {
      const fp = step.locator.fingerprint;
      const want = step.action === 'fill' ? (e) => e.kind === 'field' : step.action === 'check' ? (e) => e.kind === 'checkbox' : (e) => e.kind === 'action';
      const pool = obs.elements.map((e, i) => ({ e, i })).filter(({ e }) => want(e));
      const system = 'You maintain automated UI tests. A recorded test step no longer finds its control because the interface changed. Decide which control on the current page, if any, is the SAME control (same purpose for the user). Reply with JSON only.';
      const user = [
        `RECORDED STEP: ${step.description}`,
        `  it targeted: ${fp.role} named "${fp.name}"${fp.placeholder ? `, placeholder "${fp.placeholder}"` : ''}, selector ${step.locator.css}${step.field ? `, entering data key "${step.field}"` : ''}`,
        `CURRENT CONTROLS OF THE RIGHT KIND:`,
        pool.map(({ e, i }) => `[${i}] ${e.role} "${e.name || e.placeholder}"${flags(e) ? ` (${flags(e)})` : ''}`).join('\n') || '(none)',
        'If one of them does the same job for the user, return its number. If the step has no counterpart on this screen (e.g. it moved to another screen or was removed), return -1. Do not pick a control with a different purpose just because it is nearby. Reply: {"element","confidence":0..1,"reason"}.',
      ].join('\n');
      try {
        const ans = await ask({ system, user, schema: LOCATE_SCHEMA });
        const e = obs.elements[ans.element];
        if (!e || !pool.some((p) => p.i === ans.element)) return { best: null, trusted: false, source: 'llm', reason: ans.reason };
        return { best: { e, score: +Number(ans.confidence).toFixed(2) }, trusted: ans.confidence >= 0.7, source: 'llm', reason: ans.reason };
      } catch {
        stats.fallbacks++;
        return { ...(await rulesBrain.locate(step, obs)), source: 'rules-fallback' };
      }
    },

    // Plain-language account of what happened, for the report. Best effort: never blocks a run.
    async explain(result) {
      const facts = {
        verdict: result.status === 'failed' ? `FAILED (${result.category})` : result.status.toUpperCase(),
        brokeAt: result.brokeAt && { step: result.brokeAt.step.description, problem: result.brokeAt.problem },
        changes: result.changes?.slice(0, 25).map((c) => `${c.kind}: ${c.text}`),
        locatorsRepaired: result.healedLocators?.map((h) => `${h.from} → ${h.to}`),
        reason: result.reason, evidence: result.evidence && { alerts: result.evidence.alerts, consoleErrors: result.evidence.consoleErrors, apiCalls: result.evidence.apiCalls },
      };
      try {
        const ans = await ask({
          system: 'You explain automated UI test results to engineers in 2-3 plain sentences. State what changed in the interface or what broke, and whether it is a harmless UI change or a genuine application bug. Be concrete; do not invent facts beyond the data. Reply with JSON only.',
          user: `Test: ${result.test}\nApp build: ${result.app}\nFacts: ${JSON.stringify(facts)}\nReply: {"summary"}`,
          schema: EXPLAIN_SCHEMA, timeoutMs: 90000,
        });
        return ans.summary;
      } catch { return null; }
    },
  };
}

let cached;
// PLANNER=rules | llm | auto (default). auto = use a model if one is reachable, else rules.
// LLM_PROVIDER=ollama (default, local) | groq (hosted open-weight models; needs GROQ_API_KEY). With auto, a local
// Ollama is preferred; if it is not up and a Groq key is present, Groq is used.
export async function getBrain({ force } = {}) {
  const mode = force ?? process.env.PLANNER ?? 'auto';
  const key = `${mode}|${process.env.LLM_PROVIDER}|${process.env.OLLAMA_URL}|${process.env.LLM_MODEL}|${!!process.env.GROQ_API_KEY}`;
  if (cached && cached.key === key) return cached.brain;
  let brain = rulesBrain;
  if (mode !== 'rules') {
    let ep = endpoint(); let st = await llmStatus(ep);
    if (!(st.up && st.hasModel) && !process.env.LLM_PROVIDER && process.env.GROQ_API_KEY) { ep = endpoint({ provider: 'groq' }); st = await llmStatus(ep); }
    if (st.up && st.hasModel) brain = createLlmBrain(ep);
    else if (mode === 'llm') {
      throw new Error(ep.provider === 'groq'
        ? `PLANNER=llm with Groq: ${st.reason ?? `model "${ep.model}" not available (have: ${st.models.join(', ') || 'none'})`}. Set GROQ_API_KEY (in .env) and optionally LLM_MODEL.`
        : st.up
          ? `PLANNER=llm but model "${ep.model}" is not pulled. Run: ollama pull ${ep.model}  (have: ${st.models.join(', ') || 'none'})`
          : `PLANNER=llm but no model server at ${ep.url}. Install and start Ollama (https://ollama.com), then: ollama pull ${ep.model} — or use Groq: LLM_PROVIDER=groq with GROQ_API_KEY.`);
    } else console.warn(`[self-heal] no usable LLM (${ep.provider}: ${st.reason ?? 'not reachable / model missing'}); using the rule-based planner. See SETUP.md → "Using an open-source LLM".`);
  }
  cached = { key, brain };
  return brain;
}
