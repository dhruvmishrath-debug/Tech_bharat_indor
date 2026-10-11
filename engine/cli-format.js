const c = (n) => (s) => `\x1b[${n}m${s}\x1b[0m`;
export const C = { b: c(1), dim: c(2), red: c(31), green: c(32), yellow: c(33), cyan: c(36), mag: c(35) };

export function printResult(r, out = console.log) {
  const icon = { passed: C.green('✔ PASSED'), healed: C.yellow('✚ HEALED (passed after repair)'), failed: C.red('✘ FAILED') }[r.status];
  out(`${icon}  ${C.b(r.test)}  ${C.dim(`[${r.app}, ${r.ms}ms]`)}`);
  if (r.planner?.kind === 'llm') out(`   ${C.mag('LLM')} ${r.planner.model} · ${r.planner.llmCalls} calls · ${(r.planner.llmMs / 1000).toFixed(1)}s${r.planner.fallbacks ? ` · ${r.planner.fallbacks} fell back to rules` : ''}`);
  if (r.secondOpinion?.overruled) out(`   ${C.yellow('Second opinion:')} the model's route ended in an error (“${r.secondOpinion.overruled.slice(0, 110)}”), but the rule-based planner completed the journey correctly, so that was the model's mistake, not an application bug.`);
  if (r.secondOpinion?.confirmed) out(`   ${C.yellow('Second opinion:')} the rule-based planner reached the same error, so the failure is confirmed.`);
  if (r.llmSummary) out(`   ${C.mag('Model\'s explanation:')} ${r.llmSummary}`);
  if (r.mode === 'recorded') out(`   Derived ${r.steps} steps from the intent and saved plan v${r.planVersion}.`);
  if (r.mode === 'replay') out(`   Replayed stored plan v${r.planVersion}; every step matched the UI.`);
  if (r.mode === 'locator-heal') for (const h of r.healedLocators) out(`   Same element, new address: ${C.red(h.from)} → ${C.green(h.to)} ("${h.name}", match ${h.score}). Plan updated to v${r.planVersion}.`);

  if (r.brokeAt) {
    const f = r.brokeAt;
    out('');
    out(C.b('   What broke'));
    out(`   Step ${f.stepIndex + 1} of plan v${r.oldPlanVersion}: ${f.step.description}  ${C.dim(`(${f.step.locator.css})`)}`);
    out(`   → ${f.problem}.${f.candidate ? ` Closest element on the page: "${f.candidate.name}" at match ${f.candidate.score} — below the ${'0.8'} trust bar, so I won't guess.` : ''}`);
  }
  if (r.mode === 'replan') {
    out('');
    out(C.b('   Verdict: harmless UI change') + ' — the intent is still achievable, the page just asks for it differently.');
    out(C.b('   What changed'));
    for (const ch of r.changes) out(`   ${{ renamed: '~', selector: '~', added: C.green('+'), removed: C.red('-') }[ch.kind]} ${ch.kind.padEnd(8)} ${ch.text}`);
    out(C.b('   Rebuilt workflow'));
    r.newSteps.forEach((s, i) => out(`   ${String(i + 1).padStart(2)}. ${s.description}`));
    out(`   Outcome verified (“${'order confirmed'}” signal on page). Plan updated to v${r.planVersion}.`);
  }
  if (r.status === 'failed') {
    out('');
    out(C.b(r.category === 'application-failure' ? '   Verdict: GENUINE APPLICATION FAILURE — not healed, not masked' : '   Verdict: UNRESOLVED — needs a human'));
    out(`   ${r.reason}`);
    if (r.attempted) out(`   Workflow I reached before failing: ${r.attempted.map((s) => s.description).join(' → ')}`);
    for (const h of r.healedLocators || []) out(`   Note: step ${h.stepIndex + 1} was re-targeted ${h.from} → "${h.name}" (match ${h.score}) before the failure; that is a UI change, unrelated to the bug.`);
    const e = r.evidence || {};
    if (e.alerts?.length) out(`   Page said:     ${C.red(e.alerts.join(' | '))}`);
    if (e.consoleErrors?.length) out(`   Console error: ${C.red(e.consoleErrors.join(' | '))}`);
  }
}
