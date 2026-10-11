// Builds reports/dashboard/index.html — a self-contained page over reports/history.json.
//   node engine/dashboard.js           build
//   node engine/dashboard.js --serve   build and serve on http://localhost:9400 (dashboard + Playwright report)
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { readHistory, REPORTS } from './recorder.js';

const PAGE = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Self-Heal Dashboard</title>
<style>
:root{--bg:#f6f5f1;--card:#fff;--ink:#1d2421;--mute:#69736e;--line:#e1e0da;--ok:#1f7a4d;--okbg:#e3f3ea;--heal:#9a5b00;--healbg:#fdf0d6;--bad:#b3261e;--badbg:#fbe4e2;--accent:#2f6f5e;--code:#f0efe9}
@media (prefers-color-scheme:dark){:root{--bg:#141816;--card:#1d2220;--ink:#e8ece9;--mute:#98a39d;--line:#2e3532;--ok:#58c58c;--okbg:#17352a;--heal:#f0b04a;--healbg:#3a2c10;--bad:#ff8a80;--badbg:#3d1a18;--accent:#6fc2aa;--code:#171b19}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;padding:20px 24px 8px}
h1{font-size:22px;margin:0}h1 small{display:block;font-size:13px;font-weight:400;color:var(--mute)}
a{color:var(--accent)}main{padding:8px 24px 40px;max-width:1280px;margin:auto}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:12px 0}
.kpi,.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.kpi b{display:block;font-size:28px;line-height:1.1}.kpi span{color:var(--mute);font-size:12px}
.insight{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:10px;padding:12px 16px;margin:12px 0}
.timeline{display:flex;gap:4px;align-items:flex-end;height:64px;margin-top:8px}
.timeline button{flex:1;max-width:46px;border:0;border-radius:4px 4px 0 0;cursor:pointer;min-height:8px}
.grid{display:grid;grid-template-columns:minmax(300px,420px) 1fr;gap:16px;margin-top:16px}
@media(max-width:860px){.grid{grid-template-columns:1fr}}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.chip{border:1px solid var(--line);background:none;color:var(--ink);border-radius:99px;padding:3px 11px;cursor:pointer;font:inherit}
.chip[aria-pressed=true]{background:var(--ink);color:var(--bg)}
.run{display:block;width:100%;text-align:left;background:none;color:inherit;border:1px solid transparent;border-radius:8px;padding:9px 10px;cursor:pointer;font:inherit}
.run:hover{background:var(--code)}.run[aria-current=true]{border-color:var(--accent);background:var(--code)}
.run .t{display:flex;justify-content:space-between;gap:8px}.run .s{color:var(--mute);font-size:12px}
.badge{display:inline-block;padding:1px 9px;border-radius:99px;font-size:12px;font-weight:600;white-space:nowrap}
.passed{color:var(--ok);background:var(--okbg)}.healed{color:var(--heal);background:var(--healbg)}.failed{color:var(--bad);background:var(--badbg)}
.verdict{padding:12px 14px;border-radius:8px;margin:10px 0}.verdict b{display:block}
h2{font-size:15px;margin:18px 0 6px}h3{font-size:13px;margin:0 0 4px;color:var(--mute);font-weight:600}
ol,ul{margin:4px 0;padding-left:20px}code,pre{background:var(--code);border-radius:5px;font:12px ui-monospace,Menlo,monospace}code{padding:1px 5px}pre{padding:10px;overflow:auto;margin:6px 0}
.shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
.shots img{width:100%;border:1px solid var(--line);border-radius:6px;display:block}
.chg{display:grid;grid-template-columns:78px 1fr;gap:2px 8px;margin:4px 0}.chg i{font-style:normal;font-weight:600;color:var(--mute)}
.add{color:var(--ok)}.rem{color:var(--bad)}
.matrix{width:100%;border-collapse:collapse;font-size:12px}.matrix th,.matrix td{border-bottom:1px solid var(--line);padding:6px 5px;text-align:center;vertical-align:middle}
.matrix th:first-child,.matrix td:first-child{text-align:left;min-width:170px}.matrix th small{display:block;font-weight:400;color:var(--mute)}
.matrix button{border:0;background:none;cursor:pointer;font:inherit;padding:0;color:inherit}.matrix .none{color:var(--mute)}.matrix td.bugcol,.matrix th.bugcol{background:var(--code)}
.scroll{overflow-x:auto}.cov{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}
.tag{display:inline-block;border:1px solid var(--line);border-radius:6px;padding:0 7px;margin:2px 3px 2px 0;font-size:12px}
.changes{max-height:280px;overflow:auto;border:1px solid var(--line);border-radius:6px;padding:6px 8px}
select{font:inherit;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:3px 6px}
.tabs{display:flex;gap:6px;flex-wrap:wrap;padding:0 24px;margin:8px 0 0;border-bottom:1px solid var(--line)}
.tab{border:1px solid var(--line);border-bottom:0;background:var(--card);color:var(--ink);padding:8px 14px;border-radius:8px 8px 0 0;cursor:pointer;font:inherit;display:flex;gap:8px;align-items:center}
.tab[aria-selected=true]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.tab.off{opacity:.55}.tab small{font-size:11px;opacity:.85}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:10px 0}.facts div{font-size:12px;color:var(--mute)}.facts b{display:block;color:var(--ink);font-size:13px}
.bar{display:flex;height:10px;border-radius:5px;overflow:hidden;background:var(--line);min-width:90px}.bar i{display:block}
.src-llm{background:#6d5bd0}.src-rules{background:var(--ok)}.src-fb{background:var(--heal)}
details.run{border:1px solid var(--line);border-radius:8px;margin:6px 0;padding:0}details.run summary{cursor:pointer;padding:8px 10px;display:grid;grid-template-columns:minmax(150px,1.4fr) 130px 1fr 80px 110px;gap:8px;align-items:center;font-size:13px}
details.run .body{padding:4px 12px 12px;border-top:1px solid var(--line)}
.stepsrc{display:inline-block;font-size:10px;border-radius:4px;padding:0 5px;margin-right:4px;color:#fff}
.runlist{max-height:720px;overflow:auto}
.empty{color:var(--mute);padding:30px;text-align:center}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
</style></head><body>
<header><h1>Self-Heal Dashboard<small id="sub"></small></h1><div id="links"></div></header>
<nav class="tabs" id="tabs" role="tablist" aria-label="Solutions"></nav>
<main>
  <div id="view-compare" hidden>
  <div class="card" id="optionsCard" style="margin-bottom:12px" hidden><h3>Options compared — who plans and heals the tests (same scenarios, every option)</h3><div class="scroll" id="optionsTable"></div><div class="scroll" id="optionsMatrix" style="margin-top:14px"></div><p class="s" style="color:var(--mute);margin:10px 0 0" id="optionsNote"></p></div>
</div>
  <div id="view-option" hidden></div>
  <div id="view-suite">
  <div class="kpis" id="kpis"></div>
  <div class="insight" id="insight"></div>
  <div class="card"><h3>Scenario matrix — latest result per intent × UI version (click a cell)</h3><div class="scroll" id="matrix"></div></div>
  <div class="card" style="margin-top:12px"><h3>Coverage &amp; impact</h3><div class="cov" id="coverage"></div></div>
  <div class="card" style="margin-top:12px"><h3>Run timeline (oldest → newest, bar height = duration)</h3><div class="timeline" id="timeline"></div></div>
  <div class="grid">
    <div class="card"><div class="chips" id="chips" role="group" aria-label="Filter runs"></div><div style="margin-bottom:10px"><select id="intentFilter" aria-label="Filter by intent"></select></div><div id="runs" class="runlist"></div></div>
    <div class="card" id="detail"></div>
  </div>
  </div><!-- /view-suite -->
</main>
<script id="data" type="application/json">__DATA__</script>
<script>
const D = JSON.parse(document.getElementById('data').textContent);
const runs = D.runs, $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const LABEL = { passed: '✔ Passed', healed: '✚ Healed', failed: '✘ Failed' };
const badge = (r) => '<span class="badge ' + r.status + '">' + LABEL[r.status] + '</span>';
const kind = (r) => r.status === 'failed' ? (r.category === 'application-failure' ? 'Real bug' : 'Unresolved') : r.mode;
const time = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

$('sub').textContent = 'Generated ' + time(D.generatedAt) + ' · ' + runs.length + ' run' + (runs.length === 1 ? '' : 's');
$('links').innerHTML = D.links.map((l) => '<a href="' + l.href + '">' + esc(l.label) + '</a>').join(' · ');

const n = (s) => runs.filter((r) => r.status === s).length;
const healed = n('healed');
const bugs = runs.filter((r) => r.status === 'failed' && r.category === 'application-failure').length;
const unresolved = runs.filter((r) => r.status === 'failed' && r.category !== 'application-failure').length;
// one manual edit per plan step that had to change (new selector, added or removed step); renames always accompany a selector change
const edits = runs.filter((r) => r.status === 'healed').reduce((a, r) => a + (r.healedLocators?.length || r.changes?.filter((c) => c.kind !== 'renamed').length || 0), 0);
const MIN_PER_EDIT = 3, saved = edits * MIN_PER_EDIT;
const hrs = saved >= 60 ? (saved / 60).toFixed(1) + ' h' : saved + ' min';
[['Runs', runs.length, 'total recorded'], ['Passed', n('passed'), 'no repair needed'], ['Healed', healed, 'UI changed, test repaired'],
 ['Real bugs caught', bugs, 'reported, never healed'], ['Needs a human', unresolved, 'unresolved blockers'],
 ['Edits avoided', edits, 'selector / step changes made automatically'], ['Est. time saved', hrs, 'assumes ~' + MIN_PER_EDIT + ' min per manual fix']]
 .forEach(([l, v, s]) => $('kpis').insertAdjacentHTML('beforeend', '<div class="kpi"><span>' + l + '</span><b>' + v + '</b><span>' + s + '</span></div>'));
$('insight').innerHTML = runs.length
  ? '<b>' + healed + ' interface change' + (healed === 1 ? '' : 's') + ' survived without anyone touching the test.</b> ' + bugs + ' genuine application failure' + (bugs === 1 ? ' was' : 's were') + ' reported rather than masked, and ' + unresolved + ' blocker' + (unresolved === 1 ? '' : 's') + ' escalated to a human. A healed run means the intent still worked end to end and the expected outcome (including amounts) was verified; a real bug is never healed.'
  : 'No runs recorded yet. Run <code>npm run demo</code> or <code>npm test</code>.';

// ---- options comparison ----
if (D.options?.length) {
  const STAGES = ['A', 'B', 'D', 'C'], STAGE_T = { A: 'Derive plan from intent (original UI)', B: 'Heal wizard redesign', D: 'Heal accordion redesign', C: 'Report real bug (payments 500)' };
  const sumOf = (o) => { const rs = o.intents.flatMap((i) => i.runs); const add = (k) => rs.reduce((a, r) => a + r[k], 0); const st = rs.reduce((a, r) => ({ llm: a.llm + r.steps.llm, all: a.all + r.steps.llm + r.steps.rules + r.steps.fallback }), { llm: 0, all: 0 });
    return { ok: rs.filter((r) => r.correct).length, n: rs.length, calls: add('calls'), llmS: add('llmMs') / 1000, fb: add('fallbacks'), so: rs.filter((r) => r.secondOpinion).length, wall: add('ms') / 1000, share: st.all ? st.llm / st.all : null, perCall: add('calls') ? add('llmMs') / add('calls') / 1000 : null }; };
  $('optionsCard').hidden = false;
  const tag = (t) => '<span class="tag">' + esc(t) + '</span>';
  $('optionsTable').innerHTML = '<table class="matrix"><thead><tr><th>Option</th><th>Verdicts correct</th><th>Steps chosen by the model</th><th>Fell back to rules</th><th>Second opinions</th><th>LLM calls · time</th><th>Wall time</th><th>Privacy · setup · cost</th></tr></thead><tbody>' +
    D.options.map((o) => {
      const s = sumOf(o), pct = Math.round((s.ok / s.n) * 100);
      return '<tr><td><b>' + esc(o.label) + '</b><br>' + tag(o.hosting) + '</td><td><span class="badge ' + (pct === 100 ? 'passed' : pct >= 75 ? 'healed' : 'failed') + '">' + s.ok + ' / ' + s.n + '</span></td><td>' + (o.kind === 'rules' || s.share === null ? 'n/a' : Math.round(s.share * 100) + '%') + '</td><td>' + (o.kind === 'rules' ? '–' : s.fb) + '</td><td>' + (o.kind === 'rules' ? '–' : s.so) + '</td><td>' + (o.kind === 'rules' ? '–' : s.calls + ' · ' + s.llmS.toFixed(0) + 's' + (s.perCall ? ' (' + s.perCall.toFixed(1) + 's/call)' : '')) + '</td><td>' + s.wall.toFixed(0) + 's</td><td style="text-align:left;font-size:11px">' + esc(o.privacy) + '<br>' + esc(o.setup) + '<br>' + esc(o.cost) + '</td></tr>'; }).join('') + '</tbody></table>';
  const ran = D.options, intentsAll = [...new Map(ran.flatMap((o) => o.intents.map((i) => [i.intent, i.name]))).entries()];
  $('optionsMatrix').innerHTML = '<table class="matrix"><thead><tr><th>Scenario</th>' + ran.map((o) => '<th>' + esc(o.label.replace('Local LLM · ', '').replace('Hosted LLM · ', '')) + '</th>').join('') + '</tr></thead><tbody>' +
    intentsAll.map(([it, name]) => '<tr><td colspan="' + (ran.length + 1) + '" style="background:var(--code);font-weight:600">' + esc(name) + '</td></tr>' + STAGES.map((st) => '<tr><td>' + st + ': ' + esc(STAGE_T[st]) + '</td>' + ran.map((o) => { const r = o.intents.find((i) => i.intent === it)?.runs.find((x) => x.stage === st);
      return '<td>' + (r ? '<span class="badge ' + (r.correct ? 'passed' : 'failed') + '" title="' + esc(r.note || '') + '">' + (r.correct ? '✔' : '✘') + ' ' + esc(r.status === 'failed' && r.correct ? 'bug reported' : r.status) + '</span><br><small>' + esc((r.mode || r.category || '') + (r.calls ? ' · ' + r.calls + ' calls' + (r.fallbacks ? ', ' + r.fallbacks + ' fb' : '') : '') + (r.secondOpinion ? ' · 2nd opinion' : '') + ' · ' + (r.ms / 1000).toFixed(0) + 's') + '</small>' : '–') + '</td>'; }).join('') + '</tr>').join('')).join('') + '</tbody></table>';
  $('optionsNote').textContent = '✔ = the run ended as it should (A passes; B and D heal; C is reported as a genuine bug). "Second opinion" = the model’s own route ended in an error, so the rules re-checked; if the rules succeed the model was at fault, not the app. Single runs, not a benchmark.';
}

// ---- scenario matrix ----
const APPS = { 'version-a': ['A', 'original'], 'version-a-renamed': ['A′', 'ids renamed'], 'version-b': ['B', 'wizard redesign'], 'version-d': ['D', 'accordion redesign'],
  'version-c': ['C', 'bug: API 500'], 'version-c-silent': ['C2', 'bug: silent success'], 'version-c-total': ['C3', 'bug: wrong total'], 'version-c-disabled': ['C4', 'bug: pay disabled'] };
const appOrder = [...Object.keys(APPS).filter((k) => runs.some((r) => r.app === k)), ...[...new Set(runs.map((r) => r.app))].filter((k) => !APPS[k])];
const intents = [...new Map(runs.map((r) => [r.testId, r.test])).entries()];
const latest = (t, a) => { let idx = -1, cnt = 0; runs.forEach((r, i) => { if (r.testId === t && r.app === a) { idx = i; cnt++; } }); return { idx, cnt }; };
const short = (r) => r.status === 'failed' ? (r.category === 'application-failure' ? 'bug' : 'blocked') : r.mode === 'replan' ? 'rebuilt' : r.mode === 'locator-heal' ? 'repaired' : r.mode;
$('matrix').innerHTML = intents.length ? '<table class="matrix"><thead><tr><th>Intent</th>' + appOrder.map((a) => '<th class="' + (a.startsWith('version-c') ? 'bugcol' : '') + '">' + esc((APPS[a] || [a])[0]) + '<small>' + esc((APPS[a] || ['', ''])[1]) + '</small></th>').join('') + '</tr></thead><tbody>' +
  intents.map(([t, name]) => '<tr><td>' + esc(name) + '</td>' + appOrder.map((a) => { const { idx, cnt } = latest(t, a); const r = runs[idx];
    return '<td class="' + (a.startsWith('version-c') ? 'bugcol' : '') + '">' + (r ? '<button data-i="' + idx + '" title="' + esc(r.status + ' · ' + (r.mode || r.category) + (cnt > 1 ? ' · ' + cnt + ' runs' : '')) + '">' + badge(r) + '<br><small>' + esc(short(r)) + (cnt > 1 ? ' ×' + cnt : '') + '</small></button>' : '<span class="none">–</span>') + '</td>'; }).join('') + '</tr>').join('') + '</tbody></table>' : '<div class="empty">No scenarios yet.</div>';
$('matrix').onclick = (e) => { const b = e.target.closest('button'); if (b) { select(+b.dataset.i); $('detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } };

// ---- coverage & impact ----
const fields = new Set(), actions = {}, steps = [].concat(...runs.map((r) => r.planSteps || r.newSteps || []));
steps.forEach((s) => { actions[s.action] = (actions[s.action] || 0) + 1; if (s.field) fields.add(s.field); });
const uiVersions = appOrder.filter((a) => !a.startsWith('version-c'));
const bugRuns = runs.filter((r) => r.app.startsWith('version-c'));
const caught = bugRuns.filter((r) => r.status === 'failed').length;
const paths = [...new Set(runs.map((r) => r.status === 'failed' ? null : r.mode).filter(Boolean))];
const cls = [...new Set(runs.filter((r) => r.status === 'failed').map((r) => r.category))];
const tags = (a) => a.map((x) => '<span class="tag">' + esc(x) + '</span>').join('') || '–';
$('coverage').innerHTML =
  '<div><h3>Intents</h3><b style="font-size:22px">' + intents.length + '</b><div>' + intents.map(([, nme]) => '<div style="font-size:12px;color:var(--mute)">• ' + esc(nme) + '</div>').join('') + '</div></div>' +
  '<div><h3>UI versions exercised</h3>' + tags(uiVersions.map((a) => (APPS[a] || [a])[0] + ' ' + (APPS[a] || ['', ''])[1])) + '<h3 style="margin-top:8px">Regression builds</h3>' + tags(appOrder.filter((a) => a.startsWith('version-c')).map((a) => APPS[a][0] + ' ' + APPS[a][1])) + '</div>' +
  '<div><h3>Healing paths hit</h3>' + tags(paths) + '<h3 style="margin-top:8px">Failure classes</h3>' + tags(cls) + '</div>' +
  '<div><h3>User actions covered</h3>' + tags(Object.entries(actions).map(([k, v]) => k + ' ×' + v)) + '<h3 style="margin-top:8px">Form fields / inputs</h3>' + tags([...fields]) + '</div>' +
  '<div><h3>Bug detection</h3><b style="font-size:22px">' + caught + ' / ' + bugRuns.length + '</b><div style="font-size:12px;color:var(--mute)">regression-build runs flagged. The rest hit code paths that bug does not touch (e.g. a wrong-total bug is invisible to intents without a promo).</div></div>';

const max = Math.max(1, ...runs.map((r) => r.ms));
const color = { passed: 'var(--ok)', healed: 'var(--heal)', failed: 'var(--bad)' };
$('timeline').innerHTML = runs.map((r, i) => '<button data-i="' + i + '" style="height:' + Math.max(12, (r.ms / max) * 100) + '%;background:' + color[r.status] + '" title="' + esc(r.app + ' · ' + r.status + ' · ' + r.ms + 'ms') + '" aria-label="' + esc(r.app + ' ' + r.status) + '"></button>').join('');
$('timeline').onclick = (e) => { const b = e.target.closest('button'); if (b) select(+b.dataset.i); };

let filter = 'all', intentSel = 'all';
// open on the latest run that needed attention (healed or failed), else the latest run
let sel = runs.map((r) => r.status !== 'passed').lastIndexOf(true); if (sel < 0) sel = runs.length - 1;
function chips() {
  const opts = [['all', 'All'], ['passed', 'Passed'], ['healed', 'Healed'], ['failed', 'Failed']];
  $('chips').innerHTML = opts.map(([k, l]) => '<button class="chip" data-k="' + k + '" aria-pressed="' + (filter === k) + '">' + l + '</button>').join('');
}
$('intentFilter').innerHTML = '<option value="all">All intents</option>' + intents.map(([t, nme]) => '<option value="' + esc(t) + '">' + esc(nme) + '</option>').join('');
$('intentFilter').onchange = (e) => { intentSel = e.target.value; list(); };
$('chips').onclick = (e) => { const b = e.target.closest('.chip'); if (b) { filter = b.dataset.k; chips(); list(); } };
function list() {
  const rows = runs.map((r, i) => [r, i]).filter(([r]) => (filter === 'all' || r.status === filter) && (intentSel === 'all' || r.testId === intentSel)).reverse();
  $('runs').innerHTML = rows.length ? rows.map(([r, i]) => '<button class="run" data-i="' + i + '" aria-current="' + (i === sel) + '"><div class="t"><b>' + esc(r.app) + '</b>' + badge(r) + '</div><div class="s">' + esc(r.test) + '</div><div class="s">' + esc(kind(r)) + ' · ' + r.ms + 'ms · ' + time(r.at) + ' · ' + esc(r.source) + '</div></button>').join('') : '<div class="empty">No runs match.</div>';
}
$('runs').onclick = (e) => { const b = e.target.closest('.run'); if (b) select(+b.dataset.i); };
function select(i) { sel = i; list(); detail(); }

function stepList(arr) { return '<ol>' + arr.map((s) => '<li>' + esc(s.description) + ' <code>' + esc(s.locator.css) + '</code></li>').join('') + '</ol>'; }
function detail() {
  const r = runs[sel]; if (!r) { $('detail').innerHTML = '<div class="empty">Nothing to show yet.</div>'; return; }
  let h = '<h2 style="margin-top:0">' + esc(r.test) + ' ' + badge(r) + '</h2><div class="s" style="color:var(--mute)">' + esc(r.app) + ' · ' + time(r.at) + ' · ' + r.ms + 'ms · plan v' + (r.planVersion ?? r.planVersionNow ?? '–') + '</div>';
  h += '<div style="margin-top:6px"><span class="tag">' + (r.planner?.kind === 'llm' ? '🧠 LLM · ' + esc(r.planner.model) + ' · ' + r.planner.llmCalls + ' calls · ' + (r.planner.llmMs / 1000).toFixed(1) + 's' + (r.planner.fallbacks ? ' · ' + r.planner.fallbacks + ' fell back to rules' : '') : 'rule-based planner') + '</span></div>';
  if (r.secondOpinion?.overruled) h += '<div class="verdict healed"><b>Second opinion overruled the model</b>The model’s own route ended in an error (' + esc(r.secondOpinion.overruled) + '), but the rule-based planner completed the journey correctly: a model mistake, not an application bug.</div>';
  if (r.secondOpinion?.confirmed) h += '<p><b>Second opinion:</b> the rule-based planner reached the same error, so the failure is confirmed.</p>';
  if (r.llmSummary) h += '<div class="verdict" style="background:var(--code)"><b>Model’s explanation</b>' + esc(r.llmSummary) + '</div>';
  if (r.status === 'passed') h += '<div class="verdict passed"><b>' + (r.mode === 'recorded' ? 'Plan derived from the intent' : 'Stored plan replayed cleanly') + '</b>' + (r.mode === 'recorded' ? 'No stored plan existed, so the steps were worked out from the live page and saved.' : 'Every recorded step still matched the interface.') + '</div>';
  if (r.status === 'healed' && r.mode === 'replan') h += '<div class="verdict healed"><b>Harmless UI change — test rebuilt from intent</b>The old steps no longer fit, but the user goal was still achievable. The plan was regenerated and the outcome verified.</div>';
  if (r.status === 'healed' && r.mode === 'locator-heal') h += '<div class="verdict healed"><b>Same elements, new addresses — locators repaired</b>The recorded steps found their targets by meaning, even though selectors changed.</div>';
  if (r.status === 'failed') h += '<div class="verdict failed"><b>' + (r.category === 'application-failure' ? 'Genuine application failure — not healed' : 'Unresolved — needs a human') + '</b>' + esc(r.reason) + '</div>';
  if (r.brokeAt) { const f = r.brokeAt; h += '<h2>What broke</h2><p>Step ' + (f.stepIndex + 1) + ' of plan v' + r.oldPlanVersion + ': ' + esc(f.step.description) + ' <code>' + esc(f.step.locator.css) + '</code> — ' + esc(f.problem) + '.' + (f.candidate ? ' Closest match on the page: “' + esc(f.candidate.name) + '” at ' + f.candidate.score + ' similarity (trust bar 0.80), so it was not guessed.' : '') + '</p>'; }
  if (r.healedLocators?.length) h += '<h2>Locators repaired</h2>' + r.healedLocators.map((x) => '<div class="chg"><i>step ' + (x.stepIndex + 1) + '</i><span><code>' + esc(x.from) + '</code> → <code>' + esc(x.to) + '</code> “' + esc(x.name) + '” (' + x.score + (x.by ? ', by ' + esc(x.by) : '') + ')' + (x.reason ? '<br><small>' + esc(x.reason) + '</small>' : '') + '</span></div>').join('');
  if (r.distrustedHeal?.length) h += '<p><b>Note:</b> ' + r.distrustedHeal.length + ' locator(s) had been re-targeted by a guess, then the outcome did not appear — so the workflow was re-derived from the intent instead of blaming the app.</p>';
  if (r.changes?.length) h += '<h2>What changed (' + r.changes.length + ')</h2><div class="changes">' + r.changes.map((c) => '<div class="chg"><i class="' + (c.kind === 'added' ? 'add' : c.kind === 'removed' ? 'rem' : '') + '">' + esc(c.kind) + '</i><span>' + esc(c.text) + '</span></div>').join('');
  if (r.newSteps?.length) h += '<h2>' + (r.mode === 'recorded' ? 'Derived workflow' : 'Rebuilt workflow') + '</h2>' + stepList(r.newSteps);
  if (r.attempted?.length) h += '<h2>Workflow reached before failing</h2>' + stepList(r.attempted);
  const e = r.evidence || {};
  if (e.alerts?.length || e.consoleErrors?.length || e.apiCalls?.length || e.disabledControls?.length) h += '<h2>Evidence</h2>' + (e.apiCalls?.length ? '<p>Network: ' + e.apiCalls.map((c) => '<code>' + esc(c.method + ' ' + c.path + ' → ' + c.status) + '</code>').join(' ') + '</p>' : '') + (e.disabledControls?.length ? '<p>Disabled controls blocking the flow: ' + e.disabledControls.map((c) => '<code>' + esc(c) + '</code>').join(' ') + '</p>' : '') + (e.alerts?.length ? '<p>Page said: <b>' + esc(e.alerts.join(' | ')) + '</b></p>' : '') + (e.consoleErrors?.length ? '<pre>' + esc(e.consoleErrors.join('\n')) + '</pre>' : '');
  const shots = Object.entries(r.screenshots || {});
  if (shots.length) h += '<h2>Screenshots</h2><div class="shots">' + shots.map(([k, p]) => '<figure style="margin:0"><h3>' + ({ broke: 'Where the old plan stopped fitting', final: 'Final state', failure: 'Failure state' }[k] || k) + '</h3><a href="../' + p + '"><img loading="lazy" src="../' + p + '" alt="' + esc(k) + ' screenshot"></a></figure>').join('') + '</div>';
  if (r.planSteps?.length) h += '<h2>Stored plan after this run (v' + r.planVersionNow + ')</h2>' + stepList(r.planSteps);
  $('detail').innerHTML = h;
}
chips(); list(); detail();

// ---- solution switcher: Compare all | one report per option | Test suite ----
const OPT = D.options || [];
const verdictText = (r) => (r.status === 'failed' && r.correct ? 'bug reported' : r.status);
const tabName = (o) => o.label.replace('Local LLM · Ollama · ', 'Local · ').replace('Hosted LLM · Groq · ', 'Groq · ').replace('Rule-based (no LLM)', 'Rule-based');
const score = (o) => { const rs = (o.intents || []).flatMap((i) => i.runs); return rs.length ? rs.filter((r) => r.correct).length + '/' + rs.length : '–'; };
const views = [];
if (OPT.length) views.push({ id: 'compare', label: 'Compare all', sub: OPT.length + ' options' });
OPT.forEach((o) => views.push({ id: 'opt/' + o.id, label: tabName(o), sub: score(o), o }));
views.push({ id: 'suite', label: 'Test suite', sub: runs.length + ' runs' });

function renderTabs(cur) {
  $('tabs').innerHTML = views.map((v) => '<button class="tab' + (v.off ? ' off' : '') + '" role="tab" data-id="' + esc(v.id) + '" aria-selected="' + (v.id === cur) + '">' + esc(v.label) + '<small>' + esc(v.sub) + '</small></button>').join('');
}
function showView(id, push) {
  if (!views.some((v) => v.id === id)) id = views[0].id;
  $('view-compare').hidden = id !== 'compare';
  $('view-option').hidden = !id.startsWith('opt/');
  $('view-suite').hidden = id !== 'suite';
  if (id.startsWith('opt/')) renderOption(OPT.find((o) => 'opt/' + o.id === id));
  renderTabs(id);
  if (push) history.replaceState(null, '', '#' + id);
}
$('tabs').onclick = (e) => { const b = e.target.closest('.tab'); if (b) showView(b.dataset.id, true); };
window.addEventListener('hashchange', () => showView(decodeURIComponent(location.hash.slice(1))));

const HOWTO = {
  ollama: (o) => 'Start the model server and pull the model, then re-run this option:<pre>npm run llm:up           # Docker, or: brew install ollama && ollama serve\nollama pull ' + esc(o.model) + '\nnode engine/compare.js --options ' + esc(o.id) + '</pre>',
  groq: (o) => 'Add your key to <code>.env</code> (<code>GROQ_API_KEY=…</code>), then re-run this option:<pre>node engine/compare.js --options ' + esc(o.id) + '</pre>',
};
const srcBar = (st) => { const t = st.llm + st.rules + st.fallback; if (!t) return '<span class="none">–</span>'; const w = (n) => (n / t * 100).toFixed(1) + '%'; return '<div class="bar" title="model ' + st.llm + ' · rules ' + st.rules + ' · fell back ' + st.fallback + '">' + (st.llm ? '<i class="src-llm" style="width:' + w(st.llm) + '"></i>' : '') + (st.rules ? '<i class="src-rules" style="width:' + w(st.rules) + '"></i>' : '') + (st.fallback ? '<i class="src-fb" style="width:' + w(st.fallback) + '"></i>' : '') + '</div>'; };
const SRC_C = { llm: 'src-llm', rules: 'src-rules', 'rules-fallback': 'src-fb' };
const STAGE_T2 = { A: 'Derive plan from intent (original UI)', B: 'Heal wizard redesign', D: 'Heal accordion redesign', C: 'Report real bug (payments 500)' };

function runBody(r) {
  const d = r.detail; if (!d) return '<div class="body"><p class="none">No step-level detail was saved for this run (it was recorded before detail capture). Re-run: <code>node engine/compare.js --options …</code></p></div>';
  let h = '<div class="body">';
  if (d.reason) h += '<p><b>Verdict reason:</b> ' + esc(d.reason) + '</p>';
  if (d.secondOpinion?.overruled) h += '<div class="verdict healed"><b>Second opinion overruled the model</b>' + esc(d.secondOpinion.overruled) + '</div>';
  if (d.secondOpinion?.confirmed) h += '<p><b>Second opinion:</b> the rule-based planner reached the same error, so the failure is confirmed.</p>';
  if (d.llmSummary) h += '<div class="verdict" style="background:var(--code)"><b>Model’s explanation</b>' + esc(d.llmSummary) + '</div>';
  if (d.brokeAt) h += '<p><b>What broke:</b> ' + esc(d.brokeAt.step) + ' — ' + esc(d.brokeAt.problem) + '</p>';
  if (d.healedLocators?.length) h += '<p><b>Locators repaired:</b> ' + d.healedLocators.map((x) => '<code>' + esc(x.from) + '</code> → <code>' + esc(x.to) + '</code>' + (x.by ? ' (by ' + esc(x.by) + ')' : '')).join(', ') + '</p>';
  if (d.steps?.length) h += '<h3>Workflow — who chose each step</h3><ol>' + d.steps.map((x) => '<li><span class="stepsrc ' + (SRC_C[x.source] || 'src-rules') + '">' + esc(x.source === 'rules-fallback' ? 'fallback' : x.source) + '</span>' + esc(x.description) + (x.reason ? ' <small style="color:var(--mute)">— ' + esc(x.reason) + '</small>' : '') + '</li>').join('') + '</ol>';
  if (d.changes?.length) h += '<h3>What changed (' + d.changes.length + (d.changes.length >= 40 ? '+' : '') + ')</h3><div class="changes">' + d.changes.map((c) => '<div class="chg"><i class="' + (c.kind === 'added' ? 'add' : c.kind === 'removed' ? 'rem' : '') + '">' + esc(c.kind) + '</i><span>' + esc(c.text) + '</span></div>').join('') + '</div>';
  const e = d.evidence || {};
  if (e.alerts?.length || e.consoleErrors?.length || e.apiCalls?.length) h += '<h3>Evidence</h3>' + (e.apiCalls?.length ? '<p>' + e.apiCalls.map((c) => '<code>' + esc(c.method + ' ' + c.path + ' → ' + c.status) + '</code>').join(' ') + '</p>' : '') + (e.alerts?.length ? '<p>Page said: <b>' + esc(e.alerts.join(' | ')) + '</b></p>' : '') + (e.consoleErrors?.length ? '<pre>' + esc(e.consoleErrors.join('\n')) + '</pre>' : '');
  const shots = Object.entries(d.screenshots || {});
  if (shots.length) h += '<h3>Screenshots</h3><div class="shots">' + shots.map(([k, p]) => '<figure style="margin:0"><h3>' + ({ broke: 'Where the old plan stopped fitting', final: 'Final state', failure: 'Failure state' }[k] || esc(k)) + '</h3><a href="../' + esc(p) + '"><img loading="lazy" src="../' + esc(p) + '" alt="' + esc(k) + '"></a></figure>').join('') + '</div>';
  return h + '</div>';
}

function renderOption(o) {
  const el = $('view-option');
  let h = '<div class="card"><h2 style="margin-top:0">' + esc(o.label) + '</h2><span class="tag">' + esc(o.hosting) + '</span> <span class="tag">' + esc(o.kind === 'rules' ? 'deterministic' : 'LLM') + '</span>' +
    '<div class="facts"><div>Privacy<b>' + esc(o.privacy) + '</b></div><div>Setup<b>' + esc(o.setup) + '</b></div><div>Cost<b>' + esc(o.cost) + '</b></div><div>Determinism<b>' + esc(o.determinism) + '</b></div><div>Domain coverage<b>' + esc(o.domain) + '</b></div></div></div>';
  const rs = o.intents.flatMap((i) => i.runs), add = (k) => rs.reduce((a, r) => a + r[k], 0);
  const st = rs.reduce((a, r) => ({ llm: a.llm + r.steps.llm, rules: a.rules + r.steps.rules, fallback: a.fallback + r.steps.fallback }), { llm: 0, rules: 0, fallback: 0 });
  const ok = rs.filter((r) => r.correct).length, planned = st.llm + st.rules + st.fallback;
  const k = [['Verdicts correct', ok + ' / ' + rs.length, 'A passes · B, D heal · C is a real bug'], ['Steps chosen by the model', o.kind === 'rules' ? 'n/a' : (planned ? Math.round(st.llm / planned * 100) + '%' : '–'), o.kind === 'rules' ? 'rule-based planner' : planned + ' planned steps'],
    ['Fell back to rules', o.kind === 'rules' ? '–' : add('fallbacks'), 'invalid or unusable answers'], ['Second opinions', o.kind === 'rules' ? '–' : rs.filter((r) => r.secondOpinion).length, 'overruled or confirmed'],
    ['LLM calls', o.kind === 'rules' ? '–' : add('calls'), o.kind === 'rules' ? '' : (add('llmMs') / 1000).toFixed(0) + 's model time'], ['Wall time', (add('ms') / 1000).toFixed(0) + 's', rs.length + ' scenarios']];
  h += '<div class="kpis" style="margin-top:12px">' + k.map(([l, v, s2]) => '<div class="kpi"><span>' + l + '</span><b>' + v + '</b><span>' + esc(s2) + '</span></div>').join('') + '</div>';
  if (planned) h += '<div class="card" style="margin-top:12px"><h3>Who chose the steps</h3><div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><div style="flex:1;min-width:200px">' + srcBar(st) + '</div><span><span class="stepsrc src-llm">model</span>' + st.llm + ' <span class="stepsrc src-rules">rules</span>' + st.rules + ' <span class="stepsrc src-fb">fallback</span>' + st.fallback + '</span></div></div>';
  o.intents.forEach((i) => {
    h += '<div class="card" style="margin-top:12px"><h3>' + esc(i.name) + '</h3>';
    i.runs.forEach((r) => {
      h += '<details class="run"><summary><span><b>' + esc(r.stage) + '</b> · ' + esc(STAGE_T2[r.stage] || r.title) + '</span><span><span class="badge ' + (r.correct ? 'passed' : 'failed') + '">' + (r.correct ? '✔' : '✘') + ' ' + esc(verdictText(r)) + '</span> <small>' + esc(r.mode || r.category || '') + '</small></span><span>' + srcBar(r.steps) + '</span><span>' + (r.ms / 1000).toFixed(0) + 's</span><span><small>' + (r.calls ? r.calls + ' calls' + (r.fallbacks ? ' · ' + r.fallbacks + ' fb' : '') : '') + (r.secondOpinion ? ' · 2nd opinion' : '') + '</small></span></summary>' + runBody(r) + '</details>';
    });
    h += '</div>';
  });
  el.innerHTML = h;
}
if (views.length) {
  const want = decodeURIComponent(location.hash.slice(1));
  showView(views.some((v) => v.id === want) ? want : views[0].id);
}

</script></body></html>`;

export function buildDashboard() {
  const runs = readHistory();
  const dir = path.join(REPORTS, 'dashboard');
  fs.mkdirSync(dir, { recursive: true });
  const links = [];
  if (fs.existsSync('playwright-report/index.html')) links.push({ label: 'Playwright HTML report (traces)', href: '../../playwright-report/index.html' });
  const cdir = path.join(REPORTS, 'comparison');
  const options = fs.existsSync(cdir) ? fs.readdirSync(cdir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(cdir, f), 'utf8'))).filter((o) => o.available !== false) : []; // options that could not run are not shown
  const order = ['rules', 'ollama', 'groq'];
  options.sort((a, b) => order.findIndex((k) => a.id.startsWith(k)) - order.findIndex((k) => b.id.startsWith(k)) || a.id.localeCompare(b.id));
  if (fs.existsSync(path.join(REPORTS, 'options-report.md'))) links.push({ label: 'Options report (markdown)', href: '../options-report.md' });
  const data = JSON.stringify({ generatedAt: new Date().toISOString(), runs, links, options }).replace(/</g, '\\u003c');
  const out = path.join(dir, 'index.html');
  fs.writeFileSync(out, PAGE.replace('__DATA__', () => data));
  return { out, runs: runs.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { out, runs } = buildDashboard();
  console.log(`Dashboard built: ${out} (${runs} runs)`);
  if (process.argv.includes('--serve')) {
    const MIME = { '.html': 'text/html', '.png': 'image/png', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.webm': 'video/webm', '.zip': 'application/zip' };
    const root = process.cwd(); const port = Number(process.env.PORT || 9400);
    http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p === '/') { res.writeHead(302, { location: '/reports/dashboard/' }); return res.end(); }
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(root, p);
      if (!f.startsWith(root) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
    }).listen(port, () => console.log(`Serving on http://localhost:${port}  (dashboard at /, Playwright report at /playwright-report/)`));
  }
}
