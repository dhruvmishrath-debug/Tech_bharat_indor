# Self-Healing Software Tests

Intent-aware end-to-end testing that survives interface changes.

A traditional E2E test says `click("#checkout-button")`. The moment someone renames that button, moves it, or redesigns the checkout, the test breaks, even though the product still works. Here a test says **what the user wants** ("Complete checkout with a valid credit card"), and the system works out the clicks and keystrokes against whatever the interface looks like today.

When the interface changes, the system:

1. **Detects** that the stored steps no longer fit.
2. **Explains** what broke and what changed.
3. **Rebuilds** the workflow from the original intent.
4. **Verifies** the intended outcome, and repairs the stored plan.
5. **Refuses to heal real bugs.** If the app itself fails, that is reported as a failure, never "fixed".

> New here? Read [SOLUTION.md](SOLUTION.md) for the problem, the design, the results and the trade-offs, then [SETUP.md](SETUP.md) for installation, then come back for usage.

---

## Quick start

```bash
npm install
npx playwright install chromium
npm run demo          # terminal walkthrough of the full A → B → C story
npm test              # Playwright suite (73 tests, ~3.5 min) + builds the dashboard
npm run llm:up && npm run demo:llm:docker   # optional: same story, an open-source LLM in Docker does the planning/healing
npm run dashboard     # open http://localhost:9400
```

Requires Node 20+. See [SETUP.md](SETUP.md) for details and troubleshooting.

---

## The demo story

The demo app is a small shop with a **real checkout**: a cart (two items, quantities, remove, promo code), contact and shipping details, a delivery method that changes the total, card payment, terms, an order summary, and a receipt. It is built several ways, in React:

| Version | What it is | Expected result |
|---|---|---|
| **A** | Original: cart page (qty, promo "Apply") → "Checkout" → one long form (contact, address with *ZIP code*, delivery radios, card, terms) → "Pay now" → "Order confirmed" | Passes. Plan derived from the intent and saved |
| **A′** (`a-renamed`) | Same UI, element ids renamed | **Healed in place**: locators repaired by meaning |
| **B** | Wizard redesign: "Continue to shipping" → shipping (*Postal code*, *Mobile number*) → "Continue to payment" → card + terms → "Place order", ids gone, labels via aria-label | **Healed**: change detected, explained, workflow rebuilt |
| **D** | Second, structurally different redesign: one-page accordion, new wording (*Postcode*, *Discount code* + "Redeem", "Next", "Complete purchase") | **Healed** again from the same intent |
| **C** | B + payments endpoint returns HTTP 500 | **Failed, not healed**: genuine application failure |
| **C2** | B + payment succeeds on the server but the UI shows neither confirmation nor error | **Failed, not healed** (successful API call, no outcome) |
| **C3** | B + the discount is applied twice on the receipt | **Failed** for promo intents only; other intents never touch that path |
| **C4** | B + pay button permanently disabled | **Unresolved**: reported with the disabled control named |

`npm run demo` runs the headline story (valid card): A (record) → A (replay) → B (heal) → B (replay healed plan) → C (real bug). `npm test` runs every intent across every version (see [Test coverage](#test-coverage)).

Sample output for Version B:

```
✚ HEALED (passed after repair)  Complete checkout with a valid credit card  [version-b, 1451ms]

   What broke
   Step 1 of plan v1: click button "Checkout"  (#checkout-button)
   → element not found. Closest element on the page: "Continue to shipping" at match 0.25 — below the 0.8 trust bar, so I won't guess.

   Verdict: harmless UI change — the intent is still achievable, the page just asks for it differently.
   What changed
   ~ renamed  "Checkout" → "Continue to shipping"
   ~ selector #card-number → input[aria-label="Card number"]
   + added    new step: fill textbox "Full name"
   + added    new step: click button "Continue to payment"
   Rebuilt workflow
    1. click button "Continue to shipping"
    ...
    9. click button "Place order"
   Outcome verified. Plan updated to v2.
```

---

## Commands

| Command | Purpose |
|---|---|
| `npm run demo` | Terminal walkthrough. Clears previous history and plans first |
| `npm test` / `npm run test:e2e` | Run the Playwright suite. Rebuilds the app, records runs, regenerates the dashboard |
| `npm run test:e2e:ui` | Playwright UI mode (watch, step through, time-travel traces) |
| `npm run demo:llm` | Same walkthrough, planned and healed by a local LLM (needs Ollama running, native or Docker) |
| `npm run test:llm` | The 4 live-model tests (auto-skip if no model) |
| `npm run demo:groq` / `test:groq` | Demo / live tests using Groq's hosted open-weight model (needs `GROQ_API_KEY` in `.env`) |
| `npm run compare` | Run the same scenarios through **every** option (rules, local Ollama models, Groq) and write the side-by-side report |
| `npm run compare:report` | Rebuild the options report and dashboard from saved comparison results |
| `npm run llm:status` | Is the model server up and is the model pulled? |
| `npm run llm:up` | Start Ollama in Docker and pull a lightweight model (default `qwen2.5:3b`, ~2 GB) |
| `npm run demo:llm:docker` / `test:llm:docker` | Demo / live tests using the Docker model (`LLM_MODEL` defaults to `qwen2.5:3b`) |
| `npm run llm:down` | Stop the Docker model server (models stay in a volume) |
| `npm run dashboard` | Build the dashboard and serve it at http://localhost:9400 (Playwright report at `/playwright-report/`) |
| `npm run dashboard:build` | Build `reports/dashboard/index.html` only (open it directly, no server needed) |
| `npm run build:web` | Build the React demo app into `dist-web/` |
| `npm run dev:web` | Vite dev server for the demo app. Use `/?v=a`, `b`, `d`, `c`, `c-silent`, `c-total`, `c-disabled`, `a-renamed` (payments API needs `node engine/serve.js`, see SETUP.md) |
| `npx playwright show-report` | Open Playwright's own HTML report (traces, videos) |

Useful single-test runs:

```bash
npx playwright test -g "Version B"        # only tests whose title matches
npx playwright test --headed              # watch the browser
npx playwright test --debug               # Playwright Inspector
```

---

## Writing an intent-based test

A test is a JSON spec in [tests/intents/](tests/intents/), for example [valid-card.intent.json](tests/intents/valid-card.intent.json):

```json
{
  "id": "checkout-valid-card",
  "name": "Complete checkout with a valid credit card",
  "intent": "Complete checkout with a valid credit card.",
  "data": {
    "name": "Asha Verma", "email": "asha@example.com", "phone": "9876543210",
    "address": "12 MG Road", "city": "Bengaluru", "zip": "560001",
    "cardNumber": "4242 4242 4242 4242", "expiry": "12/30", "cvv": "123"
  },
  "expect": { "outcome": "order confirmed", "contains": ["\\$73\\.00"], "absent": ["card declined"] }
}
```

| Field | Meaning |
|---|---|
| `id` | Unique key. The stored plan is `.selfheal/<id>.plan.json` |
| `name`, `intent` | Human description of the goal |
| `data` | Values the user would type, keyed by **meaning**, not by field id: `name`, `email`, `phone`, `address`, `city`, `zip`, `cardNumber`, `expiry`, `cvv`, plus `promo` (a code to apply) and `shipping` (`express` or `standard`, a delivery option to choose) |
| `expect.outcome` | The success signal. `"order confirmed"` matches "Order confirmed", "Thank you! Your order is placed.", "Payment successful"... `"card declined"` matches decline messages (for negative tests). Any other string is matched literally |
| `expect.contains` | Optional regexes that must **also** be visible, e.g. the exact order total. This is what catches wrong-amount bugs |
| `expect.absent` | Optional outcomes that must **not** be visible, e.g. no "order confirmed" after a declined card |

The five intents included:

| Intent | `data` extras | Verifies |
|---|---|---|
| valid-card | n/a | Happy path, total `$73.00` |
| promo | `promo: SAVE10` | Planner applies the code; total `$65.70` |
| express | `shipping: express` | Planner picks the radio; total `$82.00`, "express" on the receipt |
| full | both | Promo + express + card; total `$74.70` |
| declined-card | bad card number | A decline message is shown and **no** order is confirmed |

Use it from a Playwright spec with the `selfHeal` fixture:

```js
import { test, expect } from '../fixtures/selfheal.js';

test('checkout still works', async ({ selfHeal }) => {
  const result = await selfHeal('b');                 // opens /?v=b on the fixture's page
  expect(result.status).not.toBe('failed');           // passed or healed
});
```

`selfHeal(version, spec?)` returns a result object (see [Result object](#result-object)). Pass a different `spec` to override data, e.g. to test an invalid card.

To point at your own app instead of the demo, call the engine directly:

```js
import { runTest } from '../engine/runner.js';
await runTest(spec, { name: 'staging', url: 'https://staging.example.com/checkout' }, { page });
```

> The vocabulary the planner understands (which fields mean what, which buttons "advance" a checkout) lives in [engine/lexicon.js](engine/lexicon.js). It is built for checkout-style flows. See [Limitations](#limitations).

---

## How it works

> The "decide" boxes below are done by rules by default, or by a local open-source LLM when enabled ([LLM mode](#using-an-open-source-llm-optional)). Verdicts are always plain code.

```
                      ┌─────────────── intent + data + expected outcome ───────────────┐
                      │                                                                 │
                 no stored plan?                                                   stored plan
                      │                                                                 │
                      ▼                                                                 ▼
        ┌──────────────────────────┐                                  ┌─────────────────────────────┐
        │ PLAN FROM INTENT         │                                  │ REPLAY steps                │
        │ observe page → decide    │                                  │ each step: find its element │
        │ next action → act → loop │                                  └──────────────┬──────────────┘
        │ until outcome appears    │                                                 │
        └────────────┬─────────────┘                          step doesn't fit?  ────┤──── all steps ran
                     │                                                 │                     │
                save plan v1                                  ┌────────▼────────┐    outcome on page?
                                                              │ LEVEL 1         │     │yes        │no
                                                              │ same element,   │   PASSED   REAL BUG
                                                              │ new address?    │            (not healed)
                                                              │ match ≥ 0.80    │
                                                              └───┬─────────┬───┘
                                                          yes     │         │ no
                                                  repair locator, │         ▼
                                                  continue replay │  ┌─────────────────┐
                                                                  │  │ LEVEL 2         │
                                                                  │  │ re-plan from    │
                                                                  │  │ the intent on a │
                                                                  │  │ fresh page      │
                                                                  │  └───┬─────┬─────┬─┘
                                                                  ▼      │     │     │
                                                               HEALED ◄──┘  app error  stuck
                                                            (plan v+1)    REAL BUG   UNRESOLVED
```

### Observing the page
[engine/page.js](engine/page.js) runs in the real browser and returns every visible interactive element with its **role**, **accessible name** (aria-label → labelledby → `<label for>` → wrapping label → placeholder → text), type, id, and a generated CSS selector. It also tracks visible `role=alert` text, console errors, uncaught exceptions and failing `/api/` responses. After each action it waits until the DOM is quiet and no `fetch` is in flight.

### Planning from intent
[engine/planner.js](engine/planner.js) loops: observe → decide → act. In order of priority it fills empty fields it has data for, ticks consent boxes, then clicks the most "forward" button (`Place order` > `Continue` > `Checkout`; ignoring `Back`, `Remove`, `Help`, promo/coupon...). It stops when the outcome text appears, an error appears after a click, or no sensible action remains.

### Healing in two levels
- **Level 1: locator healing** ([engine/healer.js](engine/healer.js)). If a step's selector is gone, find the element on the current page that *is the same thing*, scored by name similarity (55%), role (15%), type (10%), id/name-attribute similarity (20%). Accepted only if the score is **≥ 0.80** and clearly beats the runner-up. Example: `#pay-btn` → `#submit-payment-cta` (same "Pay now" label).
- **Level 2: re-plan.** If no element is a trustworthy match (e.g. "Checkout" vs "Continue to shipping" scores 0.25), the old steps are discarded and the workflow is rebuilt from the intent on a fresh page.

### Harmless change vs real failure
| Situation | Verdict |
|---|---|
| Old steps don't fit, but the intent can be re-achieved and the outcome appears | **Healed** (UI change) |
| All steps ran but the outcome never appears | **Failed: application-failure** |
| Re-planning completes the workflow but the app shows an error or HTTP 4xx/5xx | **Failed: application-failure** |
| Re-planning finds no way forward and no error | **Failed: unresolved** (needs a human) |

The **expected outcome is never modified by healing**. Only the *route* to it changes. That is what stops healing from hiding bugs.

---

## Using an open-source LLM (optional)

By default the planner and healer are **rule-based** (deterministic, offline, free). You can instead let an **open-source model** do the thinking, from either of two providers:

| Provider | Where it runs | Needs | Speed | Privacy |
|---|---|---|---|---|
| **Ollama** (native or Docker) | Your machine, `localhost:11434` | A model pulled locally | Seconds per call on CPU, faster with a GPU | Nothing leaves your machine |
| **Groq** | Groq's hosted open-weight models (default `openai/gpt-oss-20b`) | `GROQ_API_KEY` | Fastest; no local GPU | Page text and test data are sent to Groq |

| Job | Rules (default) | LLM mode |
|---|---|---|
| **Planning**: what to do next toward the goal | Fixed priority list + vocabulary regexes | Model reads the goal, your data and the numbered list of visible controls, and picks one action |
| **Healing**: which new control is the one a broken step meant | Similarity score ≥ 0.80 | Model judges "same purpose for the user?", with a confidence, or says there is no counterpart |
| **Explaining** what broke | Template text | Model writes 2–3 plain sentences (shown in the terminal, Playwright report and dashboard) |
| **Verdict**: did it work / is it a bug | `engine/verify.js` + runner logic | **Same code. Never delegated** |

```bash
# Option 1: Docker, lightweight model (qwen2.5:3b, ~2 GB)
npm run llm:up && npm run demo:llm:docker

# Option 2: native Ollama, larger model
brew install ollama && ollama serve &      # or the installer from ollama.com
ollama pull qwen2.5:7b                      # ~4.7 GB; Llama 3.1 8B also works: LLM_MODEL=llama3.1:8b
npm run demo:llm                            # the A → B → C story, driven by the model
npm run test:llm                            # live-model tests
PLANNER=llm npm run demo                    # force it for any command
```

Model sizes (set `LLM_MODEL`): `qwen2.5:1.5b` (~1 GB), **`qwen2.5:3b` (~2 GB, Docker default)**, `llama3.2:3b`, `phi3.5`, `qwen2.5:7b` (~4.7 GB, native default). Full table, GPU notes and the macOS CPU-only caveat for Docker are in [SETUP.md](SETUP.md#12-using-an-open-source-llm).

```bash
# Option 3: Groq (hosted open-weight model). Put the key in .env (gitignored): GROQ_API_KEY=gsk_...
npm run demo:groq && npm run test:groq
```

`LLM_PROVIDER` = `ollama` (default) or `groq`. With `PLANNER=auto` and no `LLM_PROVIDER`, a local Ollama is preferred; if it isn't running and `GROQ_API_KEY` is set, Groq is used.

`PLANNER` = `auto` (default: use the model if the server and model are present, otherwise rules), `llm` (require it; fails with the fix if missing), `rules`. `npm test` pins `rules` so the 71-test suite stays deterministic.

**Guard rails (why a model can't wreck a run):**
- The model only *chooses from the real page*. It gets a numbered control list and answers `{"action","element","field"}`. Every answer is validated: the element must exist, be the right kind, enabled, not already clicked; the `field` must be a data key. You never type values through the model, so test data can't be altered.
- Invalid JSON, a hallucinated element, a timeout or a server error → the rule-based planner takes over for that step (`source: rules-fallback`, counted in the report). A run never hangs on the model.
- **A model can steer but cannot declare success.** The outcome check (`outcome` + `contains` + `absent`) is plain code, so a model cannot "heal" a genuine bug.
- If a locator was re-targeted by a guess (rules *or* model) and the outcome then fails to appear, the run is **re-derived from the intent** before anything is blamed on the app, because a wrong guess is indistinguishable from a bug.
- Temperature 0 and a fixed seed; the healed plan is stored as ordinary deterministic steps, so replays don't call the model at all.

- If a **model-driven** run ends in an application error, the scenario is re-planned by the rules on a fresh page (**second opinion**). If the rules complete it, the error was the model's mistake (e.g. it forgot to click Apply on a promo code), not an app bug, and the report says so. If the rules hit the same error, the failure is confirmed.

The report shows which brain acted: each step records its `source` (`llm`, `rules`, `rules-fallback`) and the run records model, number of calls, time and fallbacks.

---

### Comparing all the options

```bash
npm run compare                                    # every available option; intents: valid-card + full (the hard one)
node engine/compare.js --options rules,groq        # only some options (ids: rules, ollama-qwen2-5-3b, groq-openai-gpt-oss-20b)
node engine/compare.js --intents valid-card,promo,express,full,declined-card
npm run compare:report                             # rebuild reports without re-running anything
```

Each option climbs the same ladder per intent: **A** derive the plan from the intent, **B** heal the wizard redesign, **D** heal the accordion redesign, **C** report the real bug. Output:
- `reports/options-report.md`: summary table, scenario-by-scenario grid, qualities (hosting, privacy, setup, cost, determinism) and when to use which.
- **Dashboard → solution tabs**: a tab bar switches between **Compare all** (side-by-side tables), **one report per option** (Rule-based, each local model, Groq: its own KPIs, who chose each step, the diff, model explanations, screenshots, and how to enable it if it wasn't run), and **Test suite** (the Playwright run history). The selected tab is in the URL (`#opt/groq`), so a view can be linked.
- `reports/comparison/<option>.json`: raw results, one file per option, so you can re-run one option without losing the rest (they survive `npm test` / `npm run demo`). Options that can't run (no server, no key, model not pulled) are **skipped and not shown**: no tab, no row, no placeholder file. The run log says why (`skipped, not available: …`).

A bigger local model is opt-in: `COMPARE_OLLAMA_MODELS=qwen2.5:3b,qwen2.5:7b npm run compare` (pull it first; a 7B model needs ~8 GB free and is only practical with the native Ollama app and a GPU, not in a CPU-only Docker VM). An option whose model isn't available is simply skipped.

To run options in parallel give each process its own plan folder: `SELFHEAL_DIR=.selfheal-groq node engine/compare.js --options groq`.

### Measured with real models

Same intents, same app (single runs, not a benchmark; models vary):

| Model | Checkout on A | Heals B and D | Promo + express journey | Bug (HTTP 500) still reported |
|---|---|---|---|---|
| `groq:openai/gpt-oss-20b` | 13 calls, 0 fallbacks | 14–16 calls, 0 fallbacks | 16 calls, 0 fallbacks, exact $74.70 (after the Apply-reminder fix; before it, the model forgot to click Apply and the second opinion took over) | ✔ confirmed |
| `ollama:qwen2.5:3b` (Docker, CPU) | ~20 calls, ~4 of them fell back to rules | ✔ | Model's own route got a wrong total; the second opinion overruled it (rules completed the journey) | ✔ confirmed |

Takeaway: the 20B model drives whole journeys; the 3B model handles the basics and relies on the validation/fallback layers for the rest. Rule-based mode: 73/73 tests pass.

---

## Reports and dashboard

Every run is saved to `reports/history.json` with screenshots in `reports/screenshots/`.

`npm run dashboard` shows:
- **KPIs:** runs, passed, healed, real bugs caught, needs-a-human, edits avoided, and an *estimated* time saved (edits × 3 min; an assumption shown on the tile, not a measurement).
- **Scenario matrix:** intents × UI versions, latest result per cell (click a cell to open that run). Regression builds are shaded.
- **Coverage & impact:** intents, UI versions, regression builds, healing paths hit, failure classes, user actions and form fields covered, and how many regression-build runs were flagged.
- **Timeline:** one bar per run, coloured by status, height = duration.
- **Run list:** filter by status and by intent.
- **Run detail:** verdict, *what broke*, *what changed* (scrollable), the rebuilt workflow, evidence (alerts, console errors, network calls, disabled controls), screenshots (where the old plan stopped fitting; final state) and the stored plan after that run.

The dashboard is rebuilt automatically at the end of every `npm test` run (Playwright `globalTeardown`).

Playwright's own report (`npx playwright show-report`) additionally has a full trace for every run and a `self-heal-report.md` attachment on each test.

---

## Project layout

```
.
├── web/                      React demo app (Vite)
│   ├── index.html
│   └── src/
│       ├── main.jsx, App.jsx        entry; picks a version from ?v=
│       ├── data/cart.js             items, promo codes, delivery options, totals math
│       ├── api/payments.js          fetch client (errors carry HTTP status)
│       ├── hooks/                   useCart, useFormFields, usePayment
│       ├── components/              Header, Alert, ItemRow, PromoBox, DeliveryOptions, OrderSummary, Receipt
│       ├── styles/app.css
│       └── versions/
│           ├── index.jsx            registry: a · a-renamed · b · d · c · c-silent · c-total · c-disabled
│           ├── a/                   CheckoutA + CartStep, CheckoutStep
│           ├── b/                   CheckoutWizard (+ bug modes) + Bag/Shipping/Payment steps
│           └── d/                   CheckoutAccordion
├── engine/                   the self-healing engine (plain Node ESM)
│   ├── page.js                      Playwright wrapper: observe + act + settle + API log
│   ├── lexicon.js                   field/button/outcome vocabulary, similarity
│   ├── planner.js                   rule-based intent → actions; the planning loop
│   ├── brain.js                     rules vs LLM brain: decide / locate / explain, validation, fallback
│   ├── llm.js                       Ollama HTTP client (structured JSON output)
│   ├── verify.js                    the oracle: outcome + contains + absent
│   ├── healer.js                    locator matching + plan diff
│   ├── runner.js                    replay → heal/replan → verdict; records runs
│   ├── recorder.js                  reports/history.json + screenshot paths
│   ├── server.js, serve.js          static server + payment API for the demo app
│   ├── dashboard.js                 builds/serves the dashboard
│   └── cli-format.js, demo.js       terminal output + `npm run demo`
├── tests/
│   ├── intents/*.intent.json        the five intent specs
│   ├── fixtures/selfheal.js         Playwright fixture + loadIntent/INTENTS
│   ├── helpers/mock-llm.js          stand-in model server for testing the LLM plumbing
│   ├── global-setup.js              clean plans + history before a run
│   ├── global-teardown.js           build the dashboard after a run
│   └── e2e/
│       ├── journey.spec.js          headline A → B → C story + guard rails (8 tests)
│       ├── scenarios.spec.js        5 intents × 7 UI evolution steps (35 tests)
│       ├── regressions.spec.js      4 bug builds × 5 intents (20 tests)
│       ├── llm.spec.js              LLM integration vs a stand-in model (8 tests)
│       └── llm-live.spec.js         real local model (4 tests, skipped without Ollama)
├── playwright.config.js
├── vite.config.js
├── docker-compose.yml        optional local LLM (Ollama) container
│
├── .selfheal/                generated: stored plans (reviewable JSON)
├── reports/                  generated: history.json, screenshots, dashboard
├── playwright-report/        generated
├── test-results/             generated (traces, videos)
└── dist-web/                 generated: built demo app
```

### Demo app versions (`?v=`)

| `?v=` | Component | Purpose |
|---|---|---|
| `a` | `CheckoutA` | Baseline |
| `a-renamed` | `CheckoutA renamed` | Same UI, ids renamed: Level 1 healing |
| `b` | `CheckoutWizard` | Wizard redesign: Level 2 healing |
| `d` | `CheckoutAccordion` | Accordion redesign, new wording: Level 2 healing |
| `c` | `CheckoutWizard bug="api"` | Payments endpoint → HTTP 500 |
| `c-silent` | `CheckoutWizard bug="silent"` | Payment OK, UI never confirms |
| `c-total` | `CheckoutWizard bug="total"` | Discount applied twice on the receipt |
| `c-disabled` | `CheckoutWizard bug="disabled"` | Pay button permanently disabled |

Cart: *Trail Running Shoes* $49 × 1 + *Merino Socks* $12 × 2 = **$73.00**. Promo `SAVE10` = 10% off the subtotal. Delivery: Standard free, Express +$9.

The demo server ([engine/server.js](engine/server.js)) validates cards for real: Luhn checksum, `MM/YY` in the future (≥ 26), 3–4 digit CVV. `4242 4242 4242 4242` / `12/30` / `123` is accepted. `4242 4242 4242 4241` is declined (HTTP 402). Version C posts to `/api/payments/v2`, which always returns 500.

---

## Stored plans

`.selfheal/<id>.plan.json` is plain JSON and designed to be reviewed in a pull request:

```json
{
  "testId": "checkout-valid-card",
  "version": 2,
  "updatedFor": "version-b",
  "steps": [
    {
      "action": "fill",
      "field": "cardNumber",
      "value": "{{cardNumber}}",
      "description": "fill textbox \"Card number\"",
      "locator": {
        "css": "input[aria-label=\"Card number\"]",
        "fingerprint": { "role": "textbox", "type": "text", "name": "Card number", "placeholder": "1234 5678 9012 3456", "id": "", "nameAttr": "" }
      }
    }
  ]
}
```

Values are templates (`{{cardNumber}}`), filled from the spec's `data` at run time, so no secrets or test data are baked into the plan. Delete `.selfheal/` to force every test to re-derive its plan.

## Result object

`runTest()` / `selfHeal()` resolve to:

| Field | Notes |
|---|---|
| `status` | `passed` · `healed` · `failed` |
| `mode` | `recorded` · `replay` · `locator-heal` · `replan` (for passed/healed) |
| `category` | `application-failure` · `unresolved` (for failed) |
| `reason`, `evidence` | `{ alerts, consoleErrors, pageText }` |
| `brokeAt` | `{ stepIndex, step, problem, candidate }` first step that stopped fitting |
| `changes` | `[{ kind: renamed\|selector\|added\|removed, text }]` |
| `newSteps`, `healedLocators` | rebuilt workflow; repaired locators |
| `planVersion`, `oldPlanVersion` | plan versioning |
| `screenshots` | `{ broke?, final?, failure? }` paths relative to `reports/` |
| `evidence` | `{ alerts, consoleErrors, apiCalls, disabledControls, pageText }` |

---

## Test coverage

`npm test` runs **73 Playwright tests** (about 3.5 minutes) plus 4 live-model tests that auto-skip without a local model:

| Suite | Tests | What it proves |
|---|---|---|
| [journey.spec.js](tests/e2e/journey.spec.js) | 8 | The headline story, plus guard rails: a bad card on an unchanged UI is a failure not a "UI change"; an id rename is repaired in place; a wrong expected total fails the run |
| [scenarios.spec.js](tests/e2e/scenarios.spec.js) | 35 | Each of the 5 intents survives the whole UI evolution: A (record, replay) → ids renamed → wizard B → accordion D, each followed by a clean replay of the healed plan |
| [regressions.spec.js](tests/e2e/regressions.spec.js) | 20 | Each of the 4 bug builds × 5 intents: reported (not healed) where the intent exercises the bug, and correctly *not* flagged where it doesn't |
| [llm.spec.js](tests/e2e/llm.spec.js) | 10 | The LLM integration against a **stand-in** model server: model-chosen steps, healing + explanation, bugs still caught, garbage/hallucinated answers contained, a model's mistake not blamed on the app (second opinion), server-down and missing-API-key behaviour |
| [llm-live.spec.js](tests/e2e/llm-live.spec.js) | 4 | The same story with a **real** open-source model: local Ollama/Docker (`npm run test:llm`) or Groq (`npm run test:groq`). Skipped unless a model is reachable |

The regression matrix is deliberately asymmetric: for example the double-discount bug (`c-total`) is invisible to intents that don't use a promo code, and the silent-success bug doesn't affect the declined-card intent. Coverage comes from having several intents, not from one test.


## Limitations

- **Rule-based planner by default.** It understands checkout-style flows (fields: card, expiry, CVV, name, email, address, city, zip, phone; buttons: checkout/continue/pay/place order...). A different domain needs new entries in [engine/lexicon.js](engine/lexicon.js), or switch on the [LLM mode](#using-an-open-source-llm-optional). `decide()` in [engine/planner.js](engine/planner.js) (rules) and [engine/brain.js](engine/brain.js) (LLM) are the seam: they take the observed page and goal and return the next action.
- **Outcome is text-based.** Success is "this text is visible" plus optional `contains`/`absent` checks. Stronger oracles (URL, API call, DB state) would reduce the risk of false passes.
- **Single flow.** No `<select>` dropdowns, iframes, shadow DOM, file uploads, drag and drop, or multi-tab flows.
- **Healing is conservative by design.** A heavily redesigned screen with ambiguous controls ends as *unresolved* rather than guessing.

## Ideas for extending

- Try larger/other open models (`LLM_MODEL=…`) and compare how many steps fall back to rules; vision models could read screenshots for UIs with unlabelled icon buttons.
- Add more intents (`tests/*.intent.json`) and share the plan store across CI runs (commit `.selfheal/` or cache it).
- Fail CI when a plan is healed but the plan change isn't committed, to force human review of healing.
