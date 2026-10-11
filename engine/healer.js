// Level-1 healing (re-find a moved/renamed element) and the explanation of what changed between two plans.
import { similarity } from './lexicon.js';

export const LOCATOR_TRUST = 0.8; // below this we don't trust a fuzzy match; we re-plan from the intent instead.

export function score(fp, e) {
  const name = Math.max(similarity(fp.name, e.name), fp.name && fp.name === e.name ? 1 : 0);
  const ph = fp.placeholder && e.placeholder && fp.placeholder === e.placeholder ? 1 : 0;
  const role = fp.role === e.role ? 1 : 0;
  const type = fp.type === e.type ? 1 : 0;
  const ident = Math.max(similarity(fp.id, e.id), similarity(fp.nameAttr, e.nameAttr));
  return 0.55 * Math.max(name, ph * 0.9) + 0.15 * role + 0.1 * type + 0.2 * ident;
}

export function findBest(fp, obs) {
  const ranked = obs.elements
    .filter((e) => (fp.role === 'button' || fp.role === 'link' ? e.kind === 'action' : e.kind !== 'action'))
    .map((e) => ({ e, score: score(fp, e) })).sort((a, b) => b.score - a.score);
  return { best: ranked[0], runnerUp: ranked[1], ranked };
}

// Align steps by purpose so the report can say "renamed", "moved", "added", "removed".
function keyed(steps) {
  const clicks = steps.filter((s) => s.action === 'click');
  const seen = {}; // ordinal per kind so two "name" fields (shipping, card) are matched in order, not collapsed
  return steps.map((s) => {
    if (s.action === 'click') { const i = clicks.indexOf(s); return { s, key: i === 0 ? 'click:start' : i === clicks.length - 1 ? 'click:final-submit' : `click:step-${i}` }; }
    const base = s.action === 'fill' ? `fill:${s.field}` : s.field ? `${s.action}:${s.field}` : s.action;
    seen[base] = (seen[base] ?? 0) + 1;
    return { s, key: `${base}#${seen[base]}` };
  });
}

export function diffPlans(oldSteps, newSteps) {
  const a = keyed(oldSteps), b = keyed(newSteps);
  const changes = [];
  for (const o of a) {
    const n = b.find((x) => x.key === o.key);
    if (!n) { changes.push({ kind: 'removed', text: `${o.s.description} (${o.s.locator.css}) no longer needed` }); continue; }
    const of = o.s.locator.fingerprint, nf = n.s.locator.fingerprint;
    if (of.name !== nf.name) changes.push({ kind: 'renamed', text: `"${of.name}" → "${nf.name}"` });
    if (o.s.locator.css !== n.s.locator.css) changes.push({ kind: 'selector', text: `${o.s.locator.css} → ${n.s.locator.css}` });
  }
  for (const n of b) if (!a.find((x) => x.key === n.key)) changes.push({ kind: 'added', text: `new step: ${n.s.description}` });
  return changes;
}
