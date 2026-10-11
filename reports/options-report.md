# Options report: who plans and heals the tests

Generated 2026-10-11T07:40:20.393Z. Same scenarios, same app, every option. Single runs, not a benchmark: models vary run to run.

## Summary

| Option | Verdicts correct | Steps chosen by the model | Fallbacks to rules | Second opinions | LLM calls | LLM time | Wall time |
|---|---|---|---|---|---|---|---|
| Rule-based (no LLM) | **8/8** | n/a | 0 | 0 | 0 | 0s | 17s |
| Local LLM · Ollama · qwen2.5:3b | **6/8** | 53% | 27 | 2 | 154 | 738s (4.8s/call) | 802s |
| Hosted LLM · Groq · openai/gpt-oss-20b | **8/8** | 95% | 18 | 2 | 139 | 1950s (14.0s/call) | 2016s |

> **Groq latency note:** per-call time includes waiting out the free tier's rate limits (about 8,000 tokens/minute and a daily request cap). Waits and 429 retries that exhaust are why some Groq runs show many fallbacks and long wall times; a paid tier removes this. It says little about the model's own speed (a single call takes under a second).

"Verdicts correct" counts scenarios where the run ended as it should: A passes, B and D heal (or pass), C is reported as a genuine application failure. A model that gets a journey wrong (e.g. forgets to apply a promo code) is overruled by the rules' second opinion, so it shows as a second opinion instead of a false app bug.

## Scenario by scenario

### Complete checkout with a valid credit card

| Stage | Rule-based (no LLM) | Local LLM · Ollama · qwen2.5:3b | Hosted LLM · Groq · openai/gpt-oss-20b |
|---|---|---|---|
| A: Derive plan from intent (original UI) | ✔ passed/recorded · 2s | ✔ passed/recorded · 17 calls, 2 fb · 107s | ✔ passed/recorded · 13 calls · 12s |
| B: Heal wizard redesign | ✔ healed/replan · 2s | ✔ healed/replan · 18 calls, 1 fb · 85s | ✔ healed/replan · 21 calls · 81s |
| D: Heal accordion redesign | ✔ healed/replan · 2s | ✔ healed/replan · 16 calls, 4 fb · 85s | ✔ healed/replan · 16 calls, 1 fb · 90s |
| C: Report real bug (payments 500) | ✔ failed/application-failure · 2s | ✔ failed/application-failure · 14 calls, 1 fb · 2nd opinion (confirmed) · 57s | ✔ failed/application-failure · 14 calls · 2nd opinion (confirmed) · 58s |

### Full journey: promo code + express delivery + card

| Stage | Rule-based (no LLM) | Local LLM · Ollama · qwen2.5:3b | Hosted LLM · Groq · openai/gpt-oss-20b |
|---|---|---|---|
| A: Derive plan from intent (original UI) | ✔ passed/recorded · 2s | ✘ failed/unresolved · 34 calls, 4 fb · 220s | ✔ passed/recorded · 16 calls · 92s |
| B: Heal wizard redesign | ✔ healed/replan · 2s | ✔ passed/recorded · 18 calls, 2 fb · 2nd opinion (overruled) · 74s | ✔ healed/replan · 25 calls · 119s |
| D: Heal accordion redesign | ✔ healed/replan · 2s | ✘ failed/unresolved · 37 calls, 13 fb · 169s | ✔ healed/replan · 17 calls, 3 fb · 343s |
| C: Report real bug (payments 500) | ✔ failed/application-failure · 2s | ✔ failed/application-failure · 6s | ✔ failed/application-failure · 17 calls, 14 fb · 2nd opinion (confirmed) · 1221s |

## Qualities of each option

| Option | Hosting | Privacy | Setup | Cost | Determinism | Domain coverage |
|---|---|---|---|---|---|---|
| Rule-based (no LLM) | none | Local; nothing is sent anywhere | None | Free | Fully deterministic | Checkout-style flows; new vocabulary needs code |
| Local LLM · Ollama · qwen2.5:3b | local | Local; nothing leaves your machine | Docker (npm run llm:up) or native Ollama, plus a 2–5 GB model | Free (your CPU/GPU) | Temperature 0 + seed; plans replay without the model | Any UI the model can read |
| Hosted LLM · Groq · openai/gpt-oss-20b | hosted | Page text and test data are sent to Groq | GROQ_API_KEY in .env | Free tier with rate limits, then pay-as-you-go | Temperature 0 + seed; plans replay without the model | Any UI the model can read |

## Which to use

- **Rule-based**: CI, regression suites, anything that must be fast, free and exactly repeatable. Limited to the vocabulary in `engine/lexicon.js`.
- **Hosted LLM (Groq)**: best accuracy and speed with no local setup, and the way to try LLM healing quickly. Only with data you are happy to send to a third party.
- **Local LLM (Ollama / Docker)**: private and free, but slower on CPU, and small models (≤ 3B) need the validation and second-opinion layers to cover their mistakes. Larger local models close the gap.
- In every LLM mode the verdict (did the outcome appear, is it a bug) stays plain code, and stored plans replay without the model.
