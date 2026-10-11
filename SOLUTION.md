# Self-Healing Software Tests: Problem, Solution, Results and Trade-offs

One document that explains **what problem we set out to solve, what we built, how we built it, what it gives us, which option is best and why, and what it costs us.**

Related: [README.md](README.md) (usage) · [SETUP.md](SETUP.md) (install and configuration) · `reports/options-report.md` (generated comparison) · `npm run dashboard` (live results).

---

## 1. The short version

| | |
|---|---|
| **Problem** | End-to-end UI tests break whenever the interface changes (a button is renamed, a form is split into steps), even though the product still works. Teams spend their time repairing selectors instead of finding bugs. |
| **Idea** | Write the test as the **user's goal** ("Complete checkout with a valid credit card"), not as a list of selectors. Let the system work out the clicks against the *current* UI. |
| **What we built** | A self-healing test engine on top of Playwright, a realistic React demo shop in several redesigned versions plus deliberately broken builds, a 73-test suite, a dashboard with a tab per solution, and a comparison of three ways to do the "thinking": **rules**, **a local open-source LLM**, and **a hosted open-source LLM (Groq)**. |
| **Key result** | A redesign that breaks every selector in the old test is detected, explained, rebuilt from the intent, and re-verified automatically, while **genuine application bugs are reported, never "healed" away**. |
| **Best option** | **Rules as the default in CI; a strong hosted/larger LLM where the app is unfamiliar or the UI changes a lot; a small local model only for the basics.** Full reasoning in [section 7](#7-which-option-is-better-and-why). |
| **Honest caveat** | Proven on a purpose-built demo shop, not yet on a real production app. See [section 9](#9-trade-offs-limitations-and-risks). |

---

## 2. Problem statement

### 2.1 What goes wrong with traditional E2E tests

A traditional test encodes *how* to do something:

```js
click("#checkout-button")
fill("#card-number", "4242 4242 4242 4242")
click("#pay-btn")
```

That ties the test to implementation details. The product can be perfectly healthy and the test still fails because:

- a button was renamed ("Checkout" → "Continue to shipping"),
- an element moved or lost its id,
- one page became a multi-step wizard or an accordion,
- fields were relabelled ("ZIP code" → "Postcode", "Phone number" → "Mobile number").

### 2.2 Why that is expensive

- **Maintenance dominates.** After a redesign, people spend hours fixing tests that found no bug.
- **Trust erodes.** Teams learn that red means "probably just a selector", and start ignoring failures, which is when a real bug slips through.
- **Redesigns get slower.** Fear of breaking the suite makes UI improvements more costly than they should be.

### 2.3 The hard part: telling a UI change from a real bug

Making tests "flexible" is easy. Making them flexible **without hiding genuine failures** is the real problem. A system that happily clicks "whatever looks similar" can turn a broken payment into a passing test. The solution had to:

1. Survive harmless UI change.
2. Still fail loudly on genuine application failures.
3. Explain what it did, so a human can trust it.

### 2.4 Requirements (from the brief)

| # | Requirement | Where it is met |
|---|---|---|
| 1 | A test describes **intent**, not selectors | [tests/intents/*.intent.json](tests/intents/) |
| 2 | The system **interprets the current interface** and finds the actions | [engine/page.js](engine/page.js), [engine/planner.js](engine/planner.js), [engine/brain.js](engine/brain.js) |
| 3 | Detect that old steps no longer fit | [engine/runner.js](engine/runner.js) (replay) |
| 4 | **Reconstruct** the workflow and generate updated actions | planning from intent + [engine/healer.js](engine/healer.js) |
| 5 | **Verify the intended outcome** | [engine/verify.js](engine/verify.js) |
| 6 | **Distinguish harmless UI change from a genuine failure** | verdict logic in the runner, second opinion, regression builds |
| 7 | Demo: pass on Version A, change the UI to Version B, show detection, explanation, rebuild, passing run | `npm run demo`, the dashboard, [tests/e2e/journey.spec.js](tests/e2e/journey.spec.js) |

---

## 3. The solution

### 3.1 The core idea

A test stores **what the user wants and what success looks like**. The *route* is derived from the live page and cached as a reviewable plan.

```
Intent + test data + expected outcome         (written by a person, rarely changes)
                │
                ▼
      ┌──────────────────┐   no stored plan   ┌─────────────────────────┐
      │  Replay the plan │ ─────────────────► │ Plan from the intent    │
      └────────┬─────────┘                    │ observe → decide → act  │
               │ a step no longer fits        └───────────┬─────────────┘
               ▼                                          │
      Same control, new address?  ──yes──► repair locator │
               │ no                                       │
               ▼                                          ▼
      Re-plan from the intent on a fresh page ───────► save plan v+1
               │
               ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │ VERIFY (plain code, never delegated): outcome text visible,     │
   │ exact details present (e.g. total $74.70), forbidden text absent│
   └────────────┬───────────────────────────────┬────────────────────┘
        outcome reached                    outcome missing / error shown
                │                                │
        PASSED / HEALED (UI change)      FAILED: genuine application failure
                                          (or "unresolved: needs a human")
```

### 3.2 The decision rule that makes it trustworthy

| Situation | Verdict |
|---|---|
| Old steps don't fit, but the intent is still achievable and the outcome is verified | **Healed** (harmless UI change) |
| Steps run, but the outcome never appears, or the app shows an error / HTTP 4xx-5xx | **Failed: application failure** |
| The outcome appears but a required detail is wrong (wrong total) | **Failed: application failure** |
| No way forward is found (e.g. the pay button is permanently disabled) | **Failed: unresolved, needs a human** |

**Healing changes the route, never the destination.** The expected outcome is fixed in the test, so healing cannot turn a failure into a pass.

---

## 4. How it was built

### 4.1 Building blocks

| Layer | What | Why this choice |
|---|---|---|
| **Browser automation** | Playwright (real Chromium) | Real rendering, network capture, traces and videos; first-class test runner and HTML report |
| **Demo application** | React 19 + Vite | A realistic, redesignable app: cart, quantities, promo code, address, delivery options, card, terms, receipt |
| **Engine** | Plain Node ESM in [engine/](engine/) | No build step, small, readable, easy to extend |
| **Brain** | Pluggable: rules, Ollama (local), Groq (hosted) | Lets us compare approaches fairly behind one interface |
| **Reporting** | Playwright report + custom dashboard + markdown options report | Explains every healing decision |

### 4.2 The demo shop: the "world" the tests live in

| Version | What changed | Purpose |
|---|---|---|
| **A** | Cart page → one long checkout page → "Order confirmed" | Baseline |
| **A′** | Same UI, element ids renamed | Tests small, in-place repairs |
| **B** | 4-step wizard; buttons renamed; ids gone; labels via aria-label | The brief's "Version B" redesign |
| **D** | One-page accordion, new wording ("Postcode", "Redeem", "Complete purchase") | A second, structurally different redesign |
| **C, C2, C3, C4** | B plus a genuine regression: payments API returns 500 · payment OK but UI shows nothing · discount applied twice on the receipt · pay button permanently disabled | Proof that real bugs are **not** healed |

Cart: Trail Running Shoes $49 + 2 × Merino Socks $12 = $73.00; promo `SAVE10` = 10% off; Express delivery +$9. The server validates cards for real (Luhn, expiry, CVV) so declines and failures are genuine.

### 4.3 The engine, file by file

| File | Responsibility |
|---|---|
| [page.js](engine/page.js) | Reads the page *semantically* (role, accessible name, state, selector); acts; waits for the DOM and network to settle; logs API calls and console errors |
| [planner.js](engine/planner.js) | The rule-based planner and the planning loop (observe → decide → act) |
| [lexicon.js](engine/lexicon.js) | Vocabulary for the rules: what a field means, which buttons advance a checkout, outcome phrases |
| [brain.js](engine/brain.js) | The two interchangeable brains. The LLM brain builds prompts, **validates every answer against the real page**, falls back to rules, writes explanations |
| [llm.js](engine/llm.js) | Model transport: Ollama (local) and Groq (hosted), structured JSON output, retry on rate limits |
| [healer.js](engine/healer.js) | Locator matching (similarity scoring) and the plan diff ("what changed") |
| [verify.js](engine/verify.js) | **The oracle**: outcome + `contains` + `absent`. Never delegated to a model |
| [runner.js](engine/runner.js) | Replay → heal / re-plan → verdict; second opinion; records every run with screenshots |
| [compare.js](engine/compare.js) | Runs the same scenarios through every option and produces the comparison |
| [dashboard.js](engine/dashboard.js) | The dashboard with a tab per solution |

### 4.4 How the build evolved (and why)

1. **Rule-based engine first.** Deterministic, offline, and enough to demonstrate the whole story (A → B → C).
2. **Richer shop and more tests.** A full checkout, 5 intents, 3 UI designs and 4 bug builds, so "it works" means more than one happy path.
3. **Optional LLM brain.** Same interface as the rules. Added because rules are limited to a known vocabulary.
4. **Hardening against real models.** Running real models exposed failures the stand-in tests could not (see [section 8](#8-what-we-learned-from-real-models)), which led to schema constraints, validation, fallback and the *second opinion*.
5. **Second provider (Groq).** A faster, stronger open-weight model without local hardware.
6. **Comparison + dashboard tabs.** So the options can be judged on evidence, not opinion.

### 4.5 Guard rails (why a model can steer but cannot lie)

- The model sees a **numbered list of real controls** and chooses from it; it cannot invent selectors. Invalid answers are rejected.
- The data key for a field is constrained to the real keys; a label-vs-key sanity check stops the card number going into the promo box.
- **The verdict is plain code**, not model judgement.
- **Fallback:** any invalid, slow or failed model answer falls back to the rules for that step.
- **Second opinion:** if a *model-driven* run ends in an application error, the rules re-run the scenario. If the rules succeed, the model made a mistake (not the app); if they hit the same error, the failure is confirmed.
- If a locator was re-targeted by a guess and the outcome then fails, the run is re-derived from the intent before anything is blamed on the app.
- Temperature 0 and a fixed seed; the healed plan is stored as ordinary deterministic steps, so **replays do not call the model at all**.

---

## 5. What problem it solves, concretely

On the demo, for the headline intent "Complete checkout with a valid credit card":

| Event | Traditional test | This system |
|---|---|---|
| Version A | passes | passes; plan derived from the intent |
| Version B redesign (21 diff lines: renames, new selectors, a new step, a removed field) | **breaks at step 1** | detects step 1 `#checkout-button` is gone, explains it, rebuilds a 13-step workflow, verifies the order, saves plan v2 |
| Version D redesign | breaks again | rebuilds again from the same intent |
| Id rename only (A′) | breaks | repaired in place, no re-plan |
| Payments API returns 500 (C) | fails (maybe for the wrong reason) | **fails, correctly labelled as an application failure**, with the HTTP 500 and console error as evidence |
| Discount applied twice (C3) | passes if the test never checks the amount | **fails**: `contains: $65.70` is not on the page |
| Pay button permanently disabled (C4) | fails opaquely | **unresolved**, naming the disabled control |

Every healed run produces an explanation: what broke, what changed, the rebuilt workflow, screenshots before and after.

---

## 6. Evidence

### 6.1 Automated tests

| Suite | Tests | Proves |
|---|---|---|
| [journey.spec.js](tests/e2e/journey.spec.js) | 8 | The headline story and guard rails |
| [scenarios.spec.js](tests/e2e/scenarios.spec.js) | 35 | 5 intents × (record, replay, id rename, wizard, accordion, each followed by clean replay) |
| [regressions.spec.js](tests/e2e/regressions.spec.js) | 20 | 4 bug builds × 5 intents: reported where the intent exercises the bug, correctly *not* flagged where it doesn't |
| [llm.spec.js](tests/e2e/llm.spec.js) | 10 | LLM plumbing against a stand-in model: validation, fallback, second opinion, server down, missing key |
| [llm-live.spec.js](tests/e2e/llm-live.spec.js) | 4 | Same story with a real model (skipped without one) |

**73 pass in the standard run (about 3.5 minutes). The 4 live tests passed in one run with Groq `gpt-oss-20b`.** With local `qwen2.5:3b` they passed only across two runs (one test failed in the first, before the second-opinion safeguard existed), and I did not re-run them all together afterwards.

### 6.2 Options comparison (same 8 scenarios per option)

Scenarios: for two intents (a simple checkout and the hard promo + express journey), derive the plan on A, heal B, heal D, and report the real bug C.

| Option | Verdicts correct | Steps chosen by the model | Fallbacks to rules | Second opinions | Wall time |
|---|---|---|---|---|---|
| **Rule-based** | **8 / 8** | n/a | n/a | n/a | **17 s** |
| **Local LLM** (Ollama in Docker, `qwen2.5:3b`) | 6 / 8 | 53% | 27 | 2 | 802 s |
| **Hosted LLM** (Groq `gpt-oss-20b`) | **8 / 8** | **95%** | 18 | 2 | 2016 s |

These are **single runs, not a benchmark**; model output varies. Groq's long wall time is mostly the free tier's rate limit (about 8,000 tokens/minute), not model speed. The 3B model's two misses were on the hard journey (it gave up on the original UI, and on the accordion redesign).

---

## 7. Which option is better, and why

There is no single winner; each wins on a different axis.

| Axis | Rules | Local LLM (small) | Hosted LLM (Groq 20B) |
|---|---|---|---|
| **Accuracy here** | 8/8 | 6/8 | 8/8 |
| **Speed** | Seconds | Minutes (CPU) | Minutes (rate-limited), fast per call |
| **Repeatability** | Exact | Near (temp 0, seed) | Near (temp 0, seed) |
| **Cost** | Free | Free (your hardware) | Free tier, then pay |
| **Privacy** | Nothing leaves | Nothing leaves | Page text and test data go to a third party |
| **Setup effort** | None | Docker + 2 GB model | API key |
| **New or unfamiliar UIs** | Needs new vocabulary (code) | Limited by model size | Handles them with no code change |
| **Explanations** | Templates | Model-written, sometimes imprecise | Model-written, better |
| **Failure modes** | Misses anything outside its vocabulary | Wrong picks, gives up on hard journeys | Rate limits, outages, data-governance |

### Recommendation

1. **Default for CI and regression: rules.** On the known flows it was as accurate as the best LLM, and 47–118× faster in our runs (17 s vs 802 s and 2016 s), free, private and exactly repeatable. Plans are stored, so replays never need a model anyway.
2. **Use a strong LLM for what rules cannot do:** authoring a plan for a *new* or unfamiliar flow, healing a large redesign, and writing plain-language explanations. Hosted (Groq) is the practical choice when the data is not sensitive.
3. **Local model when data cannot leave the building**, with realistic expectations: a ≤3B model handles basic journeys and relies on the safety layers for the rest. A larger local model (7B+, ideally on a GPU via native Ollama) is the next step for privacy-sensitive teams.
4. **Hybrid is the design.** The LLM brain already falls back to rules per step, and the rules give a second opinion on model failures. In practice the best system is "rules where they work, model where they don't", with a deterministic verdict in both.

---

## 8. What we learned from real models

Running real models, not just a stand-in, exposed problems no amount of design reasoning predicted. Each became a safeguard:

| What happened | Safeguard added |
|---|---|
| The 3B model **omitted the `element` field** in its answer | Schema requires every key; `element` first |
| It wrote verbose field names ("ZIP code (data key: zip)") | Closed list of data keys in the schema + normalisation |
| It **typed the card number into the promo box** | Label-vs-key sanity check |
| It **clicked "Apply" on an empty promo box**, triggering a real error | Refuse controls that never advance a checkout |
| It said **"stuck"** when the rules could still proceed | A model's "stuck" is trusted only if the rules agree |
| Both 3B and 20B models produced a wrong total by **skipping the promo or never clicking "Apply"**, which looks exactly like a wrong-total *bug* | **Second opinion** from the rules, plus a situational reminder in the prompt |
| Groq's free tier **throttles** (8k tokens/min) | Retry with `retry-after`, then fall back to rules |

A bug in the **rule-based** planner was found on the way too (it clicked "Apply" on any filled promo box even when the test had no promo), and fixed.

---

## 9. Trade-offs, limitations and risks

### 9.1 Trade-offs we accepted

- **Determinism vs flexibility.** Rules are exact but narrow; LLMs are broad but probabilistic. We keep both and keep the verdict deterministic.
- **Speed vs adaptability.** The first run on a new UI is slow with a model (minutes); replays are seconds. Healing is a pay-once cost.
- **Safety vs convenience.** Strict validation and fallback add code and some extra model calls, but are what make LLM mode safe to trust.
- **Privacy vs capability.** The strongest easy option (hosted) sends page text and test data off-site; the private option is weaker on small hardware.

### 9.2 Limitations (not hidden)

- **Proven on a demo shop, not production.** Real apps bring auth, iframes, shadow DOM, flaky networks, A/B tests and animations. Expect adjustment work.
- **The rule-based planner knows checkout vocabulary.** Other domains need new entries in [engine/lexicon.js](engine/lexicon.js) (or the LLM mode).
- **Text-based oracle.** Success is "this text is visible" plus optional `contains`/`absent`. Stronger oracles (API state, database, URL) would reduce false passes.
- **Single flow, text inputs.** No `<select>` dropdowns, file uploads, drag-and-drop or multi-tab flows.
- **Single-run model results.** The comparison is not a statistical benchmark; a different day can give a different number.
- **"Edits avoided / time saved" on the dashboard are estimates** (it assumes about 3 minutes per manual fix), a planning aid, not a measurement.
- **Small local models are unreliable on hard journeys** (6/8 here), even with the safety layers.

### 9.3 Risks and mitigations

| Risk | Mitigation |
|---|---|
| A healed test hides a real bug | The oracle is fixed and plain code; healing never edits it; real-bug builds are in the test suite |
| A model mistake is blamed on the app (false alarm) | Second opinion re-checks with the rules before failing |
| Silent plan drift | Plans are plain JSON in `.selfheal/`, designed for PR review; consider failing CI when a plan changes without being committed |
| Sensitive data sent to a hosted model | Use rules or a local model for such tests; the key lives only in a gitignored `.env`; rotate any key that has been shared |
| Rate limits / provider outage | Retries, per-step fallback to rules |

---

## 10. Benefits

**For engineers**
- Far fewer test repairs after redesigns: the 21-line diff for Version B was handled with no human edit.
- Failures mean something again: "real bug", "unresolved", or "healed UI change", each with evidence.
- Healed plans are reviewable JSON, so changes are visible in code review.

**For the team and product**
- Faster, safer UI iteration: redesigns stop being blocked by test fallout.
- Better coverage per unit of effort: tests assert **amounts and outcomes** (promo, express delivery, decline handling), not just "a page loaded". One wrong-total bug was only caught by the intents that use a promo, which is the argument for several intents.
- Choice without lock-in: rules, local or hosted models behind one interface; swap or combine as policy and budget allow.

**For leadership**
- Lower maintenance cost with a guarded downside: the design explicitly protects against the main risk of "self-healing" (masking bugs).
- Evidence-based option choice: the comparison report and dashboard make trade-offs visible rather than anecdotal.

---

## 11. Recommended next steps

1. **Pilot on one real flow** (for example login or checkout) in a staging environment with the rule-based planner, and add vocabulary where it stops.
2. **Commit `.selfheal/` plans** and review healed-plan diffs in PRs; optionally fail CI on uncommitted plan changes.
3. **Add stronger oracles** (API or order-state checks) for critical flows.
4. **Evaluate a larger model** for the LLM path: a 7B+ local model on GPU if privacy demands, or a paid hosted tier to remove rate limits. Re-run `npm run compare` to measure it.
5. **Broaden scope** gradually: dropdowns, iframes, more intents, and a repeated-runs benchmark for model options.

---

## 12. Where to find everything

| Need | Go to |
|---|---|
| Install and run | [SETUP.md](SETUP.md) |
| Usage, commands, how healing works | [README.md](README.md) |
| See it working | `npm run demo` · `npm test` · `npm run dashboard` |
| Compare options | `npm run compare`, then the dashboard tabs or `reports/options-report.md` |
| Try LLM modes | `npm run llm:up` + `npm run demo:llm:docker` (local) · `npm run demo:groq` (hosted) |
| The test specs | [tests/intents/](tests/intents/) |
| The engine | [engine/](engine/) |
| The demo app | [web/src/](web/src/) |
