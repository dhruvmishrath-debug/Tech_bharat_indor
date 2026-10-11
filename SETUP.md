# Setup Guide

Everything needed to install, run, develop and troubleshoot the self-healing test project. For what the project *is* and how it works, see [README.md](README.md).

## Quick start (5 minutes, default mode)

```bash
node -v                                  # 20 or newer
npm install
npx playwright install chromium          # Linux: add --with-deps
npm run demo                             # see A → B → C in the terminal
npm test                                 # 73 Playwright tests, ~3.5 min
npm run dashboard                        # http://localhost:9400
```

That path needs **no API key, no Docker, no model**. Everything else (local LLM, Groq, comparison) is optional; see [section 12](#12-using-an-open-source-llm) and [section 13](#13-comparing-the-options).

## Contents
1. [Prerequisites](#1-prerequisites)
2. [Install](#2-install)
3. [Verify the install](#3-verify-the-install)
4. [Running things](#4-running-things)
5. [Configuration reference](#5-configuration-reference)
6. [Working on the demo app](#6-working-on-the-demo-app)
7. [Working on the engine](#7-working-on-the-engine)
8. [Adding your own test](#8-adding-your-own-test)
9. [Running in CI](#9-running-in-ci)
10. [Resetting state / cleaning up](#10-resetting-state--cleaning-up)
11. [Troubleshooting](#11-troubleshooting)
12. [Using an open-source LLM](#12-using-an-open-source-llm)
13. [Comparing the options](#13-comparing-the-options)
14. [Security and data handling](#14-security-and-data-handling)

---

## 1. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | **20.x or newer** | Tested on 20.10. ESM (`"type": "module"`) is used throughout |
| npm | 9+ | Ships with Node 20 |
| Groq API key *(optional)* | free tier works | Only for the hosted-LLM option (`GROQ_API_KEY` in `.env`; template in [.env.example](.env.example)) |
| Docker *(optional)* | Docker Desktop / Engine with Compose v2 | Only for the containerised local LLM (`npm run llm:up`). Give it ≥ 4 GB RAM for a 3B model |
| Ollama *(optional)* | any recent | Alternative to Docker for the local LLM (uses the Apple GPU on macOS) |
| Disk | ~300 MB | `node_modules` plus the Chromium download (~100 MB) |
| OS | macOS, Linux, Windows | Developed and tested on macOS. **Windows:** the npm scripts use POSIX syntax (`VAR=value cmd`, `${VAR:-default}`), so run them from **Git Bash or WSL**, not cmd/PowerShell (or set the variables yourself and call the underlying `node`/`playwright` commands) |
| Network | first install only | npm registry + Playwright's browser CDN. After that the default mode runs **fully offline** with no API keys. Network is needed again only if you choose Docker model pulls or Groq |

Check your versions:

```bash
node -v    # v20.x or higher
npm -v
```

> **Node 20.10 note:** this project pins **Vite 5** because Vite 8 needs a newer Node patch version than 20.10. If you upgrade Node to ≥ 20.19 you may bump Vite, but it is not required.

## 2. Install

From the project root:

```bash
# 1. JavaScript dependencies
npm install

# 2. Playwright's Chromium browser (one-time, ~100 MB)
npx playwright install chromium
```

On a fresh **Linux** machine or container, also install the system libraries Chromium needs:

```bash
npx playwright install --with-deps chromium
```

What gets installed:

| Package | Why |
|---|---|
| `playwright` | Browser automation used by the engine ([engine/page.js](engine/page.js)) |
| `@playwright/test` | Test runner, fixtures, HTML report, traces |
| `react`, `react-dom` | The demo shop app |
| `vite`, `@vitejs/plugin-react` | Build the demo app (dev dependencies) |

`playwright` and `@playwright/test` must be on the **same version** (currently 1.64). `npm install` handles this via `package.json`.

## 3. Verify the install

```bash
npm run demo
```

You should see five blocks ending with:

```
✔ PASSED   ... [version-a]      first run (plan derived from intent)
✔ PASSED   ... [version-a]      replay
✚ HEALED   ... [version-b]      UI redesigned → detected, explained, rebuilt
✔ PASSED   ... [version-b]      healed plan replays
✘ FAILED   ... [version-c]      GENUINE APPLICATION FAILURE — not healed, not masked
```

Then the full suite:

```bash
npm test
```

Expected: `73 passed, 4 skipped` (about 3.5 minutes; the 4 skipped need a model, see [section 12](#12-using-an-open-source-llm)), and a line `Self-heal dashboard: .../reports/dashboard/index.html`. For a quick check, run `npx playwright test tests/e2e/journey.spec.js` (8 tests, ~25 s).

Finally open the dashboard:

```bash
npm run dashboard        # → http://localhost:9400
```

**Optional checks** for the LLM modes (only if you set them up):

```bash
npm run llm:status                        # local Ollama: { up: true, hasModel: true }
LLM_PROVIDER=groq npm run llm:status      # Groq: { up: true, hasModel: true, models: [...] }
```

The first `npm run demo` (or `npm test`) builds the React app into `dist-web/` automatically; you do not need to build it by hand.

## 4. Running things

### Commands

| Command | What it does | Typical use |
|---|---|---|
| `npm run demo` | Terminal walkthrough A → B → C. **Wipes** `reports/` and `.selfheal/` first | Showing the idea |
| `npm test` | Alias for `playwright test` | Day-to-day |
| `npm run test:e2e` | Same as above | |
| `npm run test:e2e:ui` | Playwright UI mode | Debugging, stepping through traces |
| `npm run dashboard` | Build + serve dashboard on `:9400` | Reviewing results |
| `npm run dashboard:build` | Build only → `reports/dashboard/index.html` (open the file directly) | CI artifacts |
| `npm run build:web` | Build the React app → `dist-web/` | After editing `web/` |
| `npm run dev:web` | Vite dev server with hot reload | Developing the demo app UI |
| `npm run demo:groq` / `test:groq` | Demo / live tests with Groq's hosted model (needs `GROQ_API_KEY`) | Fastest way to try LLM healing, no local model |
| `npm run compare` / `compare:report` | Run every option through the same scenarios and build the comparison report (`reports/options-report.md` + dashboard section) | Choosing a planner |
| `npm run llm:status` | Prints the model name and whether the server/model are available | Checking LLM setup |
| `npm run llm:up` / `llm:down` | Start / stop the Ollama Docker container (pulls `qwen2.5:3b` on `up`) | Lightweight local LLM |
| `npm run demo:llm` | Demo with a local LLM (native Ollama, default `qwen2.5:7b`) | Trying LLM healing |
| `npm run demo:llm:docker` | Demo with the Docker model (`qwen2.5:3b`) | Trying LLM healing |
| `npm run test:llm` / `test:llm:docker` | The 4 live-model tests (auto-skip without a model) | Validating a model |

### Playwright flags that are handy here

```bash
npx playwright test -g "Version B"       # run tests whose title matches
npx playwright test --headed             # see the browser
npx playwright test --debug              # Playwright Inspector
npx playwright test --trace on           # (already on by default in this config)
npx playwright show-report               # open playwright-report/
npx playwright show-trace test-results/<folder>/trace.zip
```

### Ports

| Port | Used by | Change with |
|---|---|---|
| 4173 | Demo app + API for Playwright (`webServer`) | edit `PORT` in [playwright.config.js](playwright.config.js) |
| 9400 | `npm run dashboard` | `PORT=9500 npm run dashboard` |
| random | `npm run demo` starts its own server on a free port | n/a |
| 11434 | Ollama (native or Docker) | `OLLAMA_URL=http://host:port`; for Docker edit the port mapping in [docker-compose.yml](docker-compose.yml) |

### Manually browsing the demo app

```bash
npm run build:web && node engine/serve.js
# http://127.0.0.1:4173/?v=a          Version A
# http://127.0.0.1:4173/?v=b          Version B (redesign)
# http://127.0.0.1:4173/?v=c          Version C (redesign + broken payments API)
# http://127.0.0.1:4173/?v=a-renamed  Version A with renamed ids
# http://127.0.0.1:4173/?v=d          Version D (one-page accordion redesign)
# http://127.0.0.1:4173/?v=c-silent | c-total | c-disabled   other regression builds
```

Use card `4242 4242 4242 4242`, expiry `12/30`, CVV `123` for a successful payment.

### Dashboard tabs

`npm run dashboard` opens at **Compare all** when comparison results exist. The tab bar switches to a full report for each solution (Rule-based, each Ollama model, Groq) or to the **Test suite** (Playwright history). Each option tab shows its facts (privacy, setup, cost), KPIs, a bar of who chose the steps (model / rules / fell back), and an expandable row per scenario (A, B, D, C) with the workflow, diff, model explanation and screenshots. Options that can't run are not shown at all (the compare log prints `skipped, not available: …` so you know what to fix). Tabs are linkable (`reports/dashboard/index.html#opt/rules`). Step-level detail appears for options run with the current `engine/compare.js`; older result files show the summary only.

## 5. Configuration reference

### [playwright.config.js](playwright.config.js)

| Setting | Value | Why |
|---|---|---|
| `testDir` | `./tests/e2e` | Spec location |
| `fullyParallel` / `workers` | `false` / `1` | Healing tests share a plan store (`.selfheal/`) and a run history, so they run **serially, in order** |
| `reporter` | `list`, `html` | Console and Playwright's HTML report |
| `globalSetup` | `tests/global-setup.js` | Clears `.selfheal/`, run history, screenshots and the dashboard so it reflects exactly this run. **Keeps** `reports/comparison/` |
| `process.env.PLANNER` | pinned to `rules` unless you set it | Keeps the 73-test suite deterministic and offline |
| `globalTeardown` | `tests/global-teardown.js` | Rebuilds the dashboard whichever reporter is used (even with `--reporter=dot`) |
| `use.trace` | `'on'` | Trace for every run (healing is easier to understand with one) |
| `use.screenshot` / `video` | `'on'` / `'retain-on-failure'` | Artifacts |
| `webServer.command` | `npx vite build && node engine/serve.js` | Rebuilds the React app on each run so tests never hit a stale build |
| `webServer.reuseExistingServer` | `!process.env.CI` | Locally, an already-running server on 4173 is reused |
| `projects` | Desktop Chrome | Add Firefox/WebKit if you `npx playwright install` them |

### [tests/intents/](tests/intents/)

One JSON spec per intent (valid-card, promo, express, full, declined-card). Fields documented in [README.md](README.md#writing-an-intent-based-test). Every `*.intent.json` file added here is picked up automatically by `scenarios.spec.js` and `regressions.spec.js`.

### Tunable engine constants

| Where | Constant | Default | Effect |
|---|---|---|---|
| [engine/healer.js](engine/healer.js) | `LOCATOR_TRUST` | `0.8` | Minimum match score to repair a locator in place. Lower = more aggressive healing, higher = more re-planning |
| [engine/planner.js](engine/planner.js) | `MAX_STEPS` | `25` | Give-up limit when planning from intent |
| [engine/page.js](engine/page.js) | settle quiet time / cap | `100 ms` / `4 s` | How long to wait for the page to calm down after each action |
| [engine/page.js](engine/page.js) | `setDefaultTimeout` | `3000 ms` | Per-action Playwright timeout |
| [engine/lexicon.js](engine/lexicon.js) | `FIELD_RULES`, `ADVANCE`, `AVOID`, `OUTCOMES`, `SHIPPING_CHOICE`, `PROMO_APPLY` | n/a | The vocabulary the rule-based planner understands |
| [engine/brain.js](engine/brain.js) | model-confidence threshold | `0.7` | LLM locator matches below this are not trusted (re-plan instead) |
| [engine/llm.js](engine/llm.js) | `temperature`, `seed`, `num_ctx`, timeouts | `0`, `7`, `8192`, 180 s | Model call settings |

### Environment variables

| Variable | Default | Used by |
|---|---|---|
| `PORT` | `4173` (server) / `9400` (dashboard) | `engine/serve.js`, `engine/dashboard.js` |
| `CI` | unset | Playwright: disables `reuseExistingServer` |
| `PLANNER` | `auto` (`rules` under `npm test`) | `rules` / `llm` / `auto`: who plans and heals |
| `LLM_PROVIDER` | `ollama` | `ollama` or `groq` |
| `LLM_MODEL` | `qwen2.5:7b` (Ollama; `qwen2.5:3b` in the Docker scripts) / `openai/gpt-oss-20b` (Groq) | Model id/tag for the chosen provider |
| `GROQ_API_KEY` | unset | Groq key. Put it in `.env` (gitignored), never in code |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Model server address |
| `GROQ_URL` | `https://api.groq.com/openai/v1` | Override the Groq endpoint (proxy / compatible gateway) |
| `SELFHEAL_DIR` | `.selfheal` | Where stored plans live (use different folders to run options in parallel) |
| `COMPARE_OLLAMA_MODELS` / `COMPARE_GROQ_MODELS` | `qwen2.5:3b` / `openai/gpt-oss-20b` | Models `npm run compare` tries per provider |
| `LLM_DEBUG` | unset | `1` prints every model answer that validation rejected, and why (stderr) |

No API keys or secrets are required for the default mode. **Ollama** (native/Docker) keeps everything local; **Groq** sends prompts to a hosted service (see [section 14](#14-security-and-data-handling)). Variables can be exported in the shell or put in a gitignored `.env` at the project root (the engine reads it; real environment variables win). Copy [.env.example](.env.example) to start.

## 6. Working on the demo app

The demo app lives in [web/](web/) (React 19 + Vite 5):

```
web/src/
  main.jsx, App.jsx          entry; ?v= selects a version
  versions/index.jsx         registry of versions
  versions/a/…, versions/b/… the screens
  data/cart.js               items, promo codes, delivery options, totals
  hooks/, components/, api/  shared building blocks (useCart, PromoBox, Receipt...)
```

- **Hot-reload UI work:** `npm run dev:web`, then open the URL Vite prints, with `/?v=b`. Note the payment API (`/api/*`) is served by the engine server, not Vite, so payments won't work in `dev:web` unless you also run `node engine/serve.js` and proxy. For an end-to-end check, use `npm run build:web && node engine/serve.js`.
- **Add a new UI version** (say "Version E"): create the component under `web/src/versions/e/`, register it in `web/src/versions/index.jsx` (`e: () => <CheckoutE />`), rebuild, and use `selfHeal('e')` in a test or visit `/?v=e`. To include it in the evolution suite, add a row to `EVOLUTION` in [tests/e2e/scenarios.spec.js](tests/e2e/scenarios.spec.js).
- **Add a new regression build:** add a `bug` mode to `CheckoutWizard` (see the `bug` prop), register `c-<name>`, and add an entry to `BUGS` in [tests/e2e/regressions.spec.js](tests/e2e/regressions.spec.js) saying which intents must catch it.
- **Change the payment rules or add an endpoint:** edit [engine/server.js](engine/server.js). Version C's regression is just the route `/api/payments/v2` returning 500. The test cards: `4242 4242 4242 4242` is accepted, `…4241` is declined (HTTP 402).
- **Stale build:** `engine/server.js` only builds when `dist-web/` is missing. `npm test` always rebuilds (see `webServer.command`). When you use `npm run demo` or `node engine/serve.js` directly after editing `web/`, run `npm run build:web` first.

## 7. Working on the engine

All engine code is plain Node ESM in [engine/](engine/), with no build step.

| To change… | Edit |
|---|---|
| How a page is read or acted on | [engine/page.js](engine/page.js) (`collect()` runs *inside the browser*) |
| What fields/buttons/outcomes mean (rules) | [engine/lexicon.js](engine/lexicon.js) |
| LLM prompts, answer validation, fallback, explanations | [engine/brain.js](engine/brain.js) |
| Talking to the model server | [engine/llm.js](engine/llm.js) |
| What counts as success (`outcome`/`contains`/`absent`) | [engine/verify.js](engine/verify.js) |
| The rule-based planner and the planning loop | [engine/planner.js](engine/planner.js) |
| When a locator is trusted / how changes are described | [engine/healer.js](engine/healer.js) |
| The pass / heal / fail logic | [engine/runner.js](engine/runner.js) |
| Terminal output | [engine/cli-format.js](engine/cli-format.js) |
| Dashboard | [engine/dashboard.js](engine/dashboard.js) (HTML template + data embedding) |

**Plugging in a different planner/model:** the LLM brain already exists ([engine/brain.js](engine/brain.js)); to add another brain (a different provider, a vision model...), implement `{ kind, model, stats, decide(obs, ctx, doneSteps), locate(step, obs), explain(result) }` and return it from `getBrain()`. The `decide` contract: given the observed elements (`obs.elements`, each with `role`, `name`, `selector`, `kind`...) and the test data, return `{ action: 'fill'|'check'|'click', target, field?, value? }` or `null`. Keep the outcome check and the real-bug rules in `achieveIntent()` and `runTest()` as they are; that is what keeps healing honest.

## 8. Adding your own test

1. **Write a spec**: copy [tests/intents/valid-card.intent.json](tests/intents/valid-card.intent.json) to e.g. `tests/intents/signup.intent.json`, give it a unique `id`, an `intent`, `data` and `expect.outcome`.
2. **Add vocabulary** if your flow uses words the planner doesn't know (new field types in `FIELD_RULES`, new button verbs in `ADVANCE`, a new outcome phrase in `OUTCOMES`).
3. **Write the Playwright test**:

   ```js
   import fs from 'node:fs';
   import { test, expect } from '../fixtures/selfheal.js';
   const spec = JSON.parse(fs.readFileSync('tests/intents/signup.intent.json', 'utf8'));

   test('sign up still works', async ({ selfHeal }) => {
     const r = await selfHeal('a', spec);            // 'a' = ?v=a on the demo app
     expect(r.status).not.toBe('failed');
   });
   ```

   For your own site, call `runTest(spec, { name, url }, { page, source: 'playwright' })` from [engine/runner.js](engine/runner.js) instead of `selfHeal`, and set `use.baseURL`/`webServer` in the Playwright config as usual.
4. **First run** derives and stores a plan in `.selfheal/<id>.plan.json`. Review it. **Commit it** so CI starts from a known plan.
5. Later UI changes are healed automatically. The plan file changes and shows the diff in review.

## 9. Running in CI

```yaml
# .github/workflows/e2e.yml (example)
name: e2e
on: [push, pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm test
      - run: npm run dashboard:build
        if: always()
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: e2e-reports
          path: |
            reports/
            playwright-report/
            test-results/
            .selfheal/
```

Notes:
- `.selfheal/` is rewritten by healing. Upload it (or commit it) so a human can review healed plans.
- `tests/global-setup.js` clears plans and history at the start, so the demo suite is self-contained. For your own suites, **don't** reset plans, so stored plans persist between runs.
- **Secrets:** the standard suite needs none (`PLANNER=rules`). If a CI job runs LLM tests or `npm run compare` with Groq, store the key as a CI secret (`GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}`), never in the repo, and expect rate limits and long runtimes; keep those jobs off the per-commit path (nightly/manual). Upload `reports/comparison/` and `reports/options-report.md` as artifacts.
- The generated dashboard is a static folder (`reports/dashboard/index.html` + `reports/screenshots/`). Publish it anywhere that serves static files (the Playwright report link is relative: `../../playwright-report/index.html`).

## 10. Resetting state / cleaning up

| Want to… | Do |
|---|---|
| Forget stored plans (force re-derivation) | `rm -rf .selfheal` |
| Clear run history, screenshots and dashboard (keeps comparison results) | `rm -rf reports/history.json reports/screenshots reports/dashboard` |
| Clear comparison results (**slow to regenerate**: minutes to an hour with LLMs) | `rm -rf reports/comparison reports/options-report.md` |
| Clear Playwright artifacts | `rm -rf playwright-report test-results` |
| Rebuild the demo app from scratch | `rm -rf dist-web && npm run build:web` |
| Everything generated | `rm -rf .selfheal .selfheal-* reports playwright-report test-results dist-web` (this also deletes comparison results) |
| Stop the LLM container (keep models) | `npm run llm:down` |
| Delete the downloaded models too | `docker compose down -v` |
| Full reinstall | `rm -rf node_modules && npm install && npx playwright install chromium` |

All generated folders are in [.gitignore](.gitignore), as is `.env`. You may choose to commit `.selfheal/` (see above). `npm run demo` and `npm test` never delete `reports/comparison/`.

## 11. Troubleshooting

**`Executable doesn't exist at .../chromium_headless_shell-…`**
The browser isn't installed. Run `npx playwright install chromium`.

**Chromium fails to launch on Linux (missing `libnss3`, `libatk`...)**
`npx playwright install --with-deps chromium`.

**`npm ERR! code EEXIST ... EACCES ... ~/.npm/_cacache`**
Your npm cache has root-owned files, usually from an old `sudo npm`. Either fix ownership (`sudo chown -R $(id -u):$(id -g) ~/.npm`), or install with a throwaway cache: `npm install --cache /tmp/npm-cache`.

**`Cannot find module` / Vite crashes with a Node-version error**
You're on a Node that is too old for the installed Vite. Use Node 20+, and keep Vite at the pinned major (5).

**`Error: http://127.0.0.1:4173 is already used`**
Another server holds the port. Stop it, or set `reuseExistingServer` behaviour by running locally (`CI` unset), or change `PORT` in [playwright.config.js](playwright.config.js).

**`address already in use :::9400` (dashboard)**
`PORT=9500 npm run dashboard`.

**Dashboard says "No runs recorded yet"**
Nothing has run since the last reset. Run `npm run demo` or `npm test`. (`npm run demo` clears history first, so it replaces whatever the last test run recorded, and vice versa.)

**Dashboard screenshots are broken images**
Open the dashboard via `npm run dashboard` (server) or open `reports/dashboard/index.html` *in place*. Don't copy the HTML file elsewhere without `reports/screenshots/`.

**A test says `healed` or `failed` when I expected `passed`**
Plans persist across runs in `.selfheal/`. A plan recorded on one version replays on another and heals. That is by design. Delete `.selfheal/` for a clean slate. Also, tests in the demo suite are *serial and order-dependent*: running one in isolation (e.g. `-g "replays the stored plan"`) may fail because the earlier test that created the plan didn't run.

**Test is `unresolved` ("No visible control moves the workflow toward the goal")**
The planner didn't recognise a button or field. Check the observed names in the failure evidence, then extend [engine/lexicon.js](engine/lexicon.js) (`ADVANCE` for buttons, `FIELD_RULES` for fields), or supply data keys for any new required fields in the spec's `data`.

**Healing seems too eager / too timid**
Tune `LOCATOR_TRUST` in [engine/healer.js](engine/healer.js). Raise it to re-plan more often. Lower it to repair locators more often. Keep it high (≥ 0.75) to avoid clicking a *different* element that merely looks similar.

**Flaky timing (actions firing before the page is ready)**
Increase the quiet window or cap in `settle()` in [engine/page.js](engine/page.js), or raise `setDefaultTimeout`.

**`.env` seems to be ignored**
The engine reads `.env` from the **current working directory**, so run commands from the project root. Format is `KEY=value` per line, no `export`, no spaces around `=`. A variable already set in your shell wins over the file. Check with `LLM_PROVIDER=groq npm run llm:status`.

**`VAR=value npm run …` fails on Windows (`'VAR' is not recognized`)**
Use Git Bash or WSL (see Prerequisites), or set the variable in PowerShell with `$env:VAR='value'` before the command.

**`docker compose up --wait` unknown flag / `docker: 'compose' is not a docker command`**
You have an old Docker. Install Compose v2 (Docker Desktop ≥ 4.x includes it), or run `docker compose up -d` and wait until `docker compose ps` shows `healthy`.

**`Bind for 127.0.0.1:11434 failed: port is already allocated`**
A native Ollama (or an old container) already uses the port. That is fine: skip `llm:up`, the engine will use it. Or stop it first (`pkill ollama` / `docker rm -f selfheal-ollama`).

**`llm:up` hangs or the model download is very slow**
Check `docker compose logs -f ollama`. The first pull is 1–5 GB depending on the model. Pulls resume if you re-run `npm run llm:up`.

**Model answers never arrive / container restarts (out of memory)**
The model doesn't fit the Docker VM. Raise memory in Docker Desktop → Settings → Resources, or choose a smaller `LLM_MODEL` (`qwen2.5:1.5b`). Check with `docker stats selfheal-ollama`.

**LLM mode is very slow on a Mac with Docker**
Containers on macOS can't use the Apple GPU. Use the native Ollama app (`brew install ollama`) for GPU speed, with `LLM_MODEL=qwen2.5:7b`.

**Playwright and `@playwright/test` version mismatch warnings**
Keep both on the same version in `package.json`, then `npm install`.

## 12. Using an open-source LLM

Optional. Without it everything runs on the deterministic rule-based planner. What the model does, and the guard rails around it, are described in [README.md](README.md#using-an-open-source-llm-optional).

### Install a local model server (Ollama)

| OS | Command |
|---|---|
| macOS | `brew install ollama` (or the app from https://ollama.com/download) |
| Linux | `curl -fsSL https://ollama.com/install.sh \| sh` |
| Windows | Installer from https://ollama.com/download |

```bash
ollama serve                 # starts http://localhost:11434 (the macOS app does this for you)
ollama pull qwen2.5:7b       # ~4.7 GB, one-time
npm run llm:status           # → { up: true, hasModel: true, ... }
```

### Or: a lightweight model in Docker (no native install)

If you have Docker, the official Ollama image runs the same server in a container; the engine needs no changes (same `localhost:11434` API).

```bash
npm run llm:up                  # docker compose up + pulls qwen2.5:3b (~2 GB, one-time)
npm run llm:status              # LLM_MODEL=qwen2.5:3b npm run llm:status
npm run demo:llm:docker         # A → B → C story with the 3B model
npm run test:llm:docker         # live tests with the 3B model
npm run llm:down                # stop (models stay in the `ollama-models` volume)
```

Pick the size to fit your Docker memory (Docker Desktop → Settings → Resources):

| Model (`LLM_MODEL=`) | Download | RAM needed | Notes |
|---|---|---|---|
| `qwen2.5:1.5b` | ~1 GB | ~2 GB | Smallest that is usable. Expect more `rules-fallback` steps |
| `qwen2.5:3b` (**docker default**) | ~2 GB | ~4 GB | Good balance for a laptop container |
| `llama3.2:3b` | ~2 GB | ~4 GB | Alternative 3B |
| `phi3.5` (3.8B) | ~2.2 GB | ~5 GB | Strong reasoning for its size |
| `qwen2.5:7b` (native default) | ~4.7 GB | ~8 GB | Best accuracy here; needs more than a default 8 GB Docker VM |

Notes: on **macOS**, Docker containers can't use the Apple GPU, so a containerised model runs on CPU and is slower than the native Ollama app (which uses Metal). On Linux with an NVIDIA GPU, add `deploy.resources.reservations.devices` (or `--gpus all`) to the service. Smaller models choose worse, which is why every answer is validated and falls back to the rules; the report shows how often that happened.

### Or: Groq (hosted open-weight models, no local model needed)

[Groq](https://console.groq.com) serves open-weight models through an OpenAI-compatible API. It is the fastest option and needs no GPU or download, but **prompts (page text, your test data, the goal) are sent to Groq**, so don't use it with real customer data or secrets.

```bash
# 1. create a key at https://console.groq.com/keys and put it in .env (gitignored; never commit it)
echo 'GROQ_API_KEY=gsk_your_key_here' >> .env
# 2. try it
LLM_PROVIDER=groq npm run llm:status     # → { up: true, hasModel: true, models: [...] }
npm run demo:groq                        # A → B → C story
npm run test:groq                        # the 4 live tests
```

- Default model `openai/gpt-oss-20b` (open-weight; supports strict JSON-schema output on Groq). Others: `openai/gpt-oss-120b`, `qwen/qwen3.8-27b` (the list changes; `llm:status` prints what your key can use). Override with `LLM_MODEL=...`.
- The engine reads `.env` itself (no dotenv needed); real environment variables win over the file.
- Free-tier **rate limits** return HTTP 429; the client waits for `retry-after` and retries up to 4 times, then that step falls back to the rules.
- **Treat the key as a secret:** if it has ever been pasted into a chat, ticket or log, rotate it at the Groq console.
- With `PLANNER=auto` and `LLM_PROVIDER` unset, a running local Ollama is preferred; otherwise Groq is used if `GROQ_API_KEY` is set. Set `LLM_PROVIDER` explicitly to pin one.

### Run with the model

```bash
npm run demo:llm             # A → B → C story, model-driven, with its explanations
npm run test:llm             # 4 live tests (journey, promo+express, bug still caught)
PLANNER=llm npm run demo     # same as demo:llm
```

Expect it to be slower than rules: roughly one model call per UI action (a 9–15 step checkout is ~15–40 calls), each a few seconds on a laptop. Memory: a 7B model at 4-bit needs about 6–8 GB free RAM; on Apple Silicon it uses the GPU automatically.

### Settings

| Variable | Default | Meaning |
|---|---|---|
| `PLANNER` | `auto` | `rules`, `llm` (required; errors with the fix if unavailable), `auto` (model if present, else rules). `npm test` sets `rules` |
| `LLM_MODEL` | `qwen2.5:7b` | Any Ollama model tag, e.g. `llama3.1:8b`, `qwen2.5:14b`, `mistral:7b` |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Another host/port, or any gateway that speaks the Ollama `/api/chat` + `/api/tags` API |

Model choice: pick one that supports JSON-schema structured output (Ollama does this for all common instruct models). Bigger models make fewer wrong picks; the report's *"fell back to rules"* count tells you how often the model's answer was unusable.

### Testing the integration without a model

`tests/e2e/llm.spec.js` runs against a stand-in server ([tests/helpers/mock-llm.js](tests/helpers/mock-llm.js)) that imitates the Ollama API. It proves the prompting, parsing, validation, fallback and the "model can't mask a bug" guarantee, but it is **not** a real model and says nothing about real-model accuracy. That's what `npm run test:llm` is for.

### How a model answer is checked

Every model answer passes these checks before anything is executed; a failed check re-asks once with the reason, then falls back to the rules for that step:

1. `element` must exist, and be the right kind (text field to fill, unchecked box to tick, enabled button to click).
2. `field` is constrained by the JSON schema to the real data keys, and (if the model words it loosely, e.g. `"ZIP code (data key: zip)"`) is normalised to a key.
3. **Label vs key:** if the vocabulary clearly recognises the field's label, the key must agree (the card number can't go into the promo box). Labels the vocabulary doesn't know are left to the model.
4. Never click Back / Edit / Remove / quantity controls, and "Apply" only when a promo code was actually typed.
5. A click that was already tried on this screen with no effect is refused.
6. **Second opinion:** if a model-driven run ends in an application error, the scenario is re-planned by the rules on a fresh page. If the rules succeed, the model made the mistake (recorded as `secondOpinion.overruled`, and the stored plan is the correct route); if the rules hit the same error, the failure is confirmed.
7. If the model says "stuck", the rules are consulted: it counts as stuck only if the rules also see no way forward.

Run with `LLM_DEBUG=1` to see rejected answers. Small models commonly (a) omit keys, (b) mix up element numbers, (c) fill the wrong field; the schema and these checks exist because of exactly those failures seen with `qwen2.5:3b`.

### Troubleshooting the LLM mode

| Symptom | Fix |
|---|---|
| `PLANNER=llm but no model server at http://127.0.0.1:11434` | Start it: `ollama serve` (or open the Ollama app), or use Groq: `LLM_PROVIDER=groq` + `GROQ_API_KEY` |
| `PLANNER=llm with Groq: GROQ_API_KEY is not set` | Add `GROQ_API_KEY=...` to `.env` (project root) or export it |
| `Groq answered HTTP 401` | Wrong or revoked key: create a new one at console.groq.com/keys |
| `Groq rate limit: still 429 after retries` | Free-tier limit hit: wait a minute, use a smaller intent set, or a paid tier. Affected steps fall back to the rules |
| `Groq answered HTTP 400` / model not found | The model id isn't available to your key: run `LLM_PROVIDER=groq npm run llm:status` and pick one from the list |
| `model "qwen2.5:7b" is not pulled` | `ollama pull qwen2.5:7b`, or set `LLM_MODEL` to a model you have (`ollama list`) |
| Log line `no local LLM … using the rule-based planner` | Only a warning: `auto` mode fell back to rules |
| Many steps show `rules-fallback` | The model is returning unusable answers: try a larger or different model |
| Test times out | Model too slow for the hardware: smaller model, or raise the timeout in [tests/e2e/llm-live.spec.js](tests/e2e/llm-live.spec.js) |
| Different result between runs | Temperature is 0 with a fixed seed, but GPU/quantization can still vary slightly. The stored plan is deterministic, so replays don't call the model |

## 13. Comparing the options

`npm run compare` runs the **same scenarios through every available option** (rules, local Ollama model, Groq) and builds the side-by-side report. See [README.md](README.md#comparing-all-the-options) for output details and [SOLUTION.md](SOLUTION.md) for how to read the results.

```bash
npm run compare                                      # all available options; intents valid-card + full
node engine/compare.js --options rules,groq          # a subset (ids: rules, ollama-qwen2-5-3b, groq-openai-gpt-oss-20b)
node engine/compare.js --intents valid-card,promo,express,full,declined-card
npm run compare:report                               # rebuild reports/options-report.md + dashboard from saved results
```

What to expect:
- **Prerequisites per option:** rules need nothing; the Docker model needs `npm run llm:up`; Groq needs `GROQ_API_KEY`. An option that can't run is **skipped and not shown** (the log says `skipped, not available: <reason>`).
- **Time:** rules about 20 s; a 3B model on CPU about 15 minutes; Groq's free tier about 35 minutes for two intents because of its rate limit (about 8,000 tokens/minute, plus a daily request cap). Run options in parallel with separate plan folders: `SELFHEAL_DIR=.selfheal-groq node engine/compare.js --options groq`.
- **Results are single runs, not a benchmark**; models vary run to run. Re-run an option on its own without losing the others (results are one file per option in `reports/comparison/`).
- **Outputs:** `reports/options-report.md`, the **Compare all** and per-option tabs in the dashboard, raw JSON and screenshots under `reports/comparison/`.
- Models other than the defaults: `COMPARE_OLLAMA_MODELS=qwen2.5:3b,llama3.2:3b` or `COMPARE_GROQ_MODELS=openai/gpt-oss-20b,openai/gpt-oss-120b`.

## 14. Security and data handling

| Topic | Guidance |
|---|---|
| **API keys** | Keep `GROQ_API_KEY` in `.env` (gitignored) or a CI secret. Never commit it, paste it into tickets/chats, or put it in code. **If a key has ever been shared, rotate it** at console.groq.com/keys |
| **What the hosted option sends** | With Groq, prompts go to Groq: the goal text, test data values, visible page text and control names. Use it only with synthetic/non-sensitive data. Rules and Ollama (native/Docker) send nothing off the machine |
| **Test data** | The demo uses fake data (card `4242 4242 4242 4242`). Don't put real customer data or production credentials in `tests/intents/*.json`; stored plans keep `{{placeholders}}`, not the values |
| **Screenshots and reports** | `reports/`, `playwright-report/` and `test-results/` contain page screenshots, traces and videos. Treat them as sensitive if you point the engine at a real app, and don't publish them publicly |
| **Docker model server** | Bound to `127.0.0.1:11434` only (see [docker-compose.yml](docker-compose.yml)), so it isn't exposed to your network |
| **What is gitignored** | `node_modules/`, `dist-web/`, `playwright-report/`, `test-results/`, `reports/`, `.selfheal/`, `.selfheal-*/`, `.env` |
| **Healed plans** | `.selfheal/*.plan.json` are meant to be reviewed in PRs: a healed plan is a code change to your tests |

