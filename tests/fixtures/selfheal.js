// Playwright fixture: `selfHeal(version, spec?)` runs an intent-based test on the fixture's own `page`,
// so traces, videos and screenshots land in Playwright's report, and attaches the healing report to the test.
import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import { runTest } from '../../engine/runner.js';

export const loadIntent = (name) => JSON.parse(fs.readFileSync(`tests/intents/${name}.intent.json`, 'utf8'));
export const checkoutSpec = loadIntent('valid-card');
export const INTENTS = fs.readdirSync('tests/intents').filter((f) => f.endsWith('.intent.json')).map((f) => f.replace('.intent.json', ''));

function markdown(r) {
  const L = [`# ${r.status.toUpperCase()} — ${r.test}`, `App: ${r.app} · ${r.ms}ms${r.mode ? ` · mode: ${r.mode}` : ''}`];
  if (r.brokeAt) L.push('', '## What broke', `Step ${r.brokeAt.stepIndex + 1}: ${r.brokeAt.step.description} (${r.brokeAt.step.locator.css}) — ${r.brokeAt.problem}`);
  if (r.changes?.length) L.push('', '## What changed', ...r.changes.map((c) => `- ${c.kind}: ${c.text}`));
  if (r.newSteps?.length) L.push('', '## Workflow', ...r.newSteps.map((s, i) => `${i + 1}. ${s.description}`));
  if (r.healedLocators?.length) L.push('', '## Locators healed', ...r.healedLocators.map((h) => `- ${h.from} → ${h.to} (${h.score})`));
  if (r.status === 'failed') L.push('', `## Verdict: ${r.category}`, r.reason, '```', JSON.stringify(r.evidence, null, 2), '```');
  return L.join('\n');
}

export const test = base.extend({
  selfHeal: async ({ page, baseURL }, use, testInfo) => {
    await use(async (version, spec = checkoutSpec, { record = true, planner } = {}) => {
      const result = await runTest(spec, { name: `version-${version}`, url: `${baseURL}/?v=${version}` }, { page, source: 'playwright', record, planner });
      await testInfo.attach('self-heal-report.md', { body: markdown(result), contentType: 'text/markdown' });
      return result;
    });
  },
});
export { expect };
