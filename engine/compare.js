// Runs the SAME scenarios through every planner/healer option and writes a side-by-side report.
//   node engine/compare.js                         every available option, intents: valid-card + full
//   node engine/compare.js --options rules,groq    only some options
//   node engine/compare.js --intents valid-card,promo,express,full,declined-card
//   node engine/compare.js --report                just rebuild the markdown report + dashboard from saved results
// Each option writes reports/comparison/<option>.json, so options can run in parallel (set SELFHEAL_DIR per process) and be re-run alone.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTest, resetPlan } from './runner.js';
import { startServer } from './server.js';
import { launchBrowser } from './page.js';
import { rulesBrain, createLlmBrain } from './brain.js';
import { llmStatus, endpoint, label } from './llm.js';
import { REPORTS } from './recorder.js';

const DIR = path.join(REPORTS, 'comparison');

// What each option is. Facts about privacy/setup/cost are properties of the option, not measurements.
export function optionList() {
  const ollamaModels = (process.env.COMPARE_OLLAMA_MODELS || 'qwen2.5:3b').split(',');
  const groqModels = (process.env.COMPARE_GROQ_MODELS || 'openai/gpt-oss-20b').split(',');
  return [
    { id: 'rules', label: 'Rule-based (no LLM)', kind: 'rules', hosting: 'none', privacy: 'Local; nothing is sent anywhere', setup: 'None', cost: 'Free', determinism: 'Fully deterministic', domain: 'Checkout-style flows; new vocabulary needs code' },
    ...ollamaModels.map((m) => ({ id: `ollama-${m.replace(/[^a-z0-9]+/gi, '-')}`, label: `Local LLM · Ollama · ${m}`, kind: 'llm', provider: 'ollama', model: m, hosting: 'local', privacy: 'Local; nothing leaves your machine', setup: 'Docker (npm run llm:up) or native Ollama, plus a 2–5 GB model', cost: 'Free (your CPU/GPU)', determinism: 'Temperature 0 + seed; plans replay without the model', domain: 'Any UI the model can read' })),
    ...groqModels.map((m) => ({ id: `groq-${m.replace(/[^a-z0-9]+/gi, '-')}`, label: `Hosted LLM · Groq · ${m}`, kind: 'llm', provider: 'groq', model: m, hosting: 'hosted', privacy: 'Page text and test data are sent to Groq', setup: 'GROQ_API_KEY in .env', cost: 'Free tier with rate limits, then pay-as-you-go', determinism: 'Temperature 0 + seed; plans replay without the model', domain: 'Any UI the model can read' })),
  ];
}

// The scenario ladder every option climbs, per intent, with the verdict that counts as correct.
const STAGES = [
  { id: 'A', version: 'a', title: 'Derive plan from intent (original UI)', correct: (r) => r.status === 'passed' },
  { id: 'B', version: 'b', title: 'Heal wizard redesign', correct: (r) => r.status === 'healed' || r.status === 'passed' },
  { id: 'D', version: 'd', title: 'Heal accordion redesign', correct: (r) => r.status === 'healed' || r.status === 'passed' },
  { id: 'C', version: 'c', title: 'Report real bug (payments 500)', correct: (r) => r.status === 'failed' && r.category === 'application-failure' },
];

const srcCount = (steps = []) => steps.reduce((a, s) => { const k = s.source === 'rules-fallback' ? 'fallback' : s.source === 'llm' ? 'llm' : 'rules'; a[k] = (a[k] || 0) + 1; return a; }, { llm: 0, rules: 0, fallback: 0 });

async function runOption(opt, intents, { server, browser }) {
  const out = { ...opt, available: true, intents: [], generatedAt: new Date().toISOString() };
  let brain = rulesBrain;
  if (opt.kind === 'llm') {
    const ep = endpoint({ provider: opt.provider, model: opt.model });
    const st = await llmStatus(ep);
    if (!st.up || !st.hasModel) return { ...opt, available: false, reason: st.reason ?? (st.up ? `model "${opt.model}" not available` : 'server not reachable'), intents: [], generatedAt: out.generatedAt };
    brain = createLlmBrain(ep);
  }
  for (const intent of intents) {
    const spec = JSON.parse(fs.readFileSync(`tests/intents/${intent}.intent.json`, 'utf8'));
    resetPlan(spec.id);
    const runs = [];
    for (const st of STAGES) {
      const t0 = Date.now();
      const r = await runTest(spec, server.url(st.version), { browser, planner: brain, record: false, source: 'compare' });
      // Keep what a per-option report needs. Screenshots are copied out of reports/screenshots, which `npm test`/`npm run demo` clear.
      const shots = {};
      for (const [k, rel] of Object.entries(r.screenshots ?? {})) {
        const src = path.join(REPORTS, rel); if (!fs.existsSync(src)) continue;
        const dir = path.join(DIR, 'screenshots', opt.id); fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(src, path.join(dir, path.basename(rel))); shots[k] = `comparison/screenshots/${opt.id}/${path.basename(rel)}`;
      }
      const detail = {
        reason: r.reason ?? null, brokeAt: r.brokeAt && { step: r.brokeAt.step.description, problem: r.brokeAt.problem },
        steps: (r.newSteps ?? r.attempted ?? []).map((x) => ({ description: x.description, source: x.source ?? 'rules', reason: x.reason ?? null })),
        changes: r.changes?.slice(0, 40), healedLocators: r.healedLocators?.map((h) => ({ from: h.from, to: h.to, name: h.name, by: h.by })),
        llmSummary: r.llmSummary ?? null, evidence: r.evidence ? { alerts: r.evidence.alerts, consoleErrors: r.evidence.consoleErrors, apiCalls: r.evidence.apiCalls } : null,
        secondOpinion: r.secondOpinion ?? null, screenshots: shots,
      };
      runs.push({
        detail,
        stage: st.id, title: st.title, status: r.status, mode: r.mode, category: r.category, correct: !!st.correct(r), ms: Date.now() - t0,
        calls: r.planner?.llmCalls ?? 0, llmMs: r.planner?.llmMs ?? 0, fallbacks: r.planner?.fallbacks ?? 0,
        steps: srcCount(r.newSteps), secondOpinion: r.secondOpinion ? Object.keys(r.secondOpinion)[0] : null, note: r.status === 'failed' ? (r.reason || '').slice(0, 160) : null,
      });
      console.log(`  [${opt.id}] ${intent} ${st.id}: ${r.status}${r.mode ? '/' + r.mode : r.category ? '/' + r.category : ''} ${r.status === 'failed' && st.id !== 'C' ? '⚠ ' + (r.reason || '').slice(0, 80) : ''} (${((Date.now() - t0) / 1000).toFixed(0)}s${r.planner?.llmCalls ? `, ${r.planner.llmCalls} calls, ${r.planner.fallbacks} fallbacks` : ''}${r.secondOpinion ? ', 2nd opinion: ' + Object.keys(r.secondOpinion)[0] : ''})`);
    }
    out.intents.push({ intent, name: spec.name, runs });
  }
  return out;
}

export function loadResults() {
  if (!fs.existsSync(DIR)) return [];
  const order = optionList().map((o) => o.id);
  return fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')))
    .filter((o) => o.available !== false) // ignore leftover "not run" placeholders from older versions
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

export function summarize(o) {
  const runs = o.intents.flatMap((i) => i.runs);
  const sum = (k) => runs.reduce((a, r) => a + r[k], 0);
  const steps = runs.reduce((a, r) => ({ llm: a.llm + r.steps.llm, rules: a.rules + r.steps.rules, fallback: a.fallback + r.steps.fallback }), { llm: 0, rules: 0, fallback: 0 });
  const planned = steps.llm + steps.rules + steps.fallback;
  return {
    correct: runs.filter((r) => r.correct).length, total: runs.length, calls: sum('calls'), llmSec: sum('llmMs') / 1000, fallbacks: sum('fallbacks'),
    secondOpinions: runs.filter((r) => r.secondOpinion).length, wallSec: sum('ms') / 1000, steps,
    llmShare: o.kind !== 'rules' && planned ? steps.llm / planned : null, msPerCall: sum('calls') ? sum('llmMs') / sum('calls') : null,
  };
}

export function writeMarkdown(results = loadResults()) {
  const ok = results.filter((o) => o.available);
  const L = ['# Options report: who plans and heals the tests', '', `Generated ${new Date().toISOString()}. Same scenarios, same app, every option. Single runs, not a benchmark: models vary run to run.`, ''];
  L.push('## Summary', '', '| Option | Verdicts correct | Steps chosen by the model | Fallbacks to rules | Second opinions | LLM calls | LLM time | Wall time |', '|---|---|---|---|---|---|---|---|');
  for (const o of results) {
    const s = summarize(o);
    L.push(`| ${o.label} | **${s.correct}/${s.total}** | ${s.llmShare === null ? 'n/a' : Math.round(s.llmShare * 100) + '%'} | ${s.fallbacks} | ${s.secondOpinions} | ${s.calls} | ${s.llmSec.toFixed(0)}s${s.msPerCall ? ` (${(s.msPerCall / 1000).toFixed(1)}s/call)` : ''} | ${s.wallSec.toFixed(0)}s |`);
  }
  if (ok.some((o) => o.provider === 'groq')) L.push('', '> **Groq latency note:** per-call time includes waiting out the free tier\'s rate limits (about 8,000 tokens/minute and a daily request cap). Waits and 429 retries that exhaust are why some Groq runs show many fallbacks and long wall times; a paid tier removes this. It says little about the model\'s own speed (a single call takes under a second).');
  L.push('', '"Verdicts correct" counts scenarios where the run ended as it should: A passes, B and D heal (or pass), C is reported as a genuine application failure. A model that gets a journey wrong (e.g. forgets to apply a promo code) is overruled by the rules\' second opinion, so it shows as a second opinion instead of a false app bug.', '');
  L.push('## Scenario by scenario', '');
  const intents = [...new Set(ok.flatMap((o) => o.intents.map((i) => i.intent)))];
  for (const it of intents) {
    const name = ok.flatMap((o) => o.intents).find((i) => i.intent === it).name;
    L.push(`### ${name}`, '', `| Stage | ${ok.map((o) => o.label).join(' | ')} |`, `|---|${ok.map(() => '---').join('|')}|`);
    for (const st of STAGES) {
      L.push(`| ${st.id}: ${st.title} | ${ok.map((o) => { const r = o.intents.find((i) => i.intent === it)?.runs.find((x) => x.stage === st.id); return r ? `${r.correct ? '✔' : '✘'} ${r.status}${r.mode ? '/' + r.mode : r.category ? '/' + r.category : ''}${r.calls ? ` · ${r.calls} calls${r.fallbacks ? `, ${r.fallbacks} fb` : ''}` : ''}${r.secondOpinion ? ` · 2nd opinion (${r.secondOpinion})` : ''} · ${(r.ms / 1000).toFixed(0)}s` : '–'; }).join(' | ')} |`);
    }
    L.push('');
  }
  L.push('## Qualities of each option', '', '| Option | Hosting | Privacy | Setup | Cost | Determinism | Domain coverage |', '|---|---|---|---|---|---|---|');
  for (const o of results) L.push(`| ${o.label} | ${o.hosting} | ${o.privacy} | ${o.setup} | ${o.cost} | ${o.determinism} | ${o.domain} |`);
  L.push('', '## Which to use', '',
    '- **Rule-based**: CI, regression suites, anything that must be fast, free and exactly repeatable. Limited to the vocabulary in `engine/lexicon.js`.',
    '- **Hosted LLM (Groq)**: best accuracy and speed with no local setup, and the way to try LLM healing quickly. Only with data you are happy to send to a third party.',
    '- **Local LLM (Ollama / Docker)**: private and free, but slower on CPU, and small models (≤ 3B) need the validation and second-opinion layers to cover their mistakes. Larger local models close the gap.',
    '- In every LLM mode the verdict (did the outcome appear, is it a bug) stays plain code, and stored plans replay without the model.', '');
  const out = path.join(REPORTS, 'options-report.md');
  fs.mkdirSync(REPORTS, { recursive: true }); fs.writeFileSync(out, L.join('\n'));
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : null; };
  const { buildDashboard } = await import('./dashboard.js');
  if (!process.argv.includes('--report')) {
    const want = arg('options')?.split(',');
    const intents = (arg('intents') || 'valid-card,full').split(',');
    const opts = optionList().filter((o) => !want || want.some((w) => o.id === w || o.id.startsWith(w)));
    const server = await startServer(); const browser = await launchBrowser();
    fs.mkdirSync(DIR, { recursive: true });
    for (const o of opts) {
      console.log(`\n▶ ${o.label}`);
      const res = await runOption(o, intents, { server, browser });
      if (!res.available) { console.log(`  skipped, not available: ${res.reason}`); continue; } // nothing is saved or shown for an option that can't run
      fs.writeFileSync(path.join(DIR, `${o.id}.json`), JSON.stringify(res, null, 2));
    }
    await browser.close(); await server.close();
  }
  console.log(`\nReport: ${writeMarkdown()}\nDashboard: ${buildDashboard().out}`);
}
