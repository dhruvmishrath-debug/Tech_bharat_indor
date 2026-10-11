// Transport to an open-source model. Two providers, same interface:
//   ollama  a local server (native or Docker) at http://localhost:11434. Nothing leaves your machine.
//   groq    Groq's hosted open-weight models (OpenAI-compatible API). Needs GROQ_API_KEY; prompts (page text, test data)
//           are sent to Groq. Fast, no local GPU needed.
// Settings come from the environment (or a gitignored .env file): LLM_PROVIDER, LLM_MODEL, OLLAMA_URL, GROQ_API_KEY.
import fs from 'node:fs';
import path from 'node:path';

// Tiny .env loader (no dependency). Real environment variables win over the file.
try {
  for (const line of fs.readFileSync(path.resolve('.env'), 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env */ }

const DEFAULTS = {
  ollama: { url: 'http://127.0.0.1:11434', model: 'qwen2.5:7b' },
  groq: { url: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b' },
};

export const LLM_URL = () => process.env.OLLAMA_URL || DEFAULTS.ollama.url;
export const LLM_MODEL = () => process.env.LLM_MODEL || DEFAULTS[LLM_PROVIDER()].model;
export const LLM_PROVIDER = () => (process.env.LLM_PROVIDER || 'ollama').toLowerCase();

// Resolve the effective endpoint for a provider (explicit args win over the environment).
export function endpoint({ provider = LLM_PROVIDER(), url, model, key } = {}) {
  if (provider === 'groq') return { provider, url: url ?? process.env.GROQ_URL ?? DEFAULTS.groq.url, model: model ?? process.env.LLM_MODEL ?? DEFAULTS.groq.model, key: key ?? process.env.GROQ_API_KEY };
  return { provider: 'ollama', url: url ?? LLM_URL(), model: model ?? process.env.LLM_MODEL ?? DEFAULTS.ollama.model };
}
export const label = (ep) => `${ep.provider === 'groq' ? 'groq:' : ''}${ep.model}`;

async function timed(url, init, ms) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(t); }
}

// { up, hasModel, models, reason? }
export async function llmStatus(opts = {}) {
  const ep = endpoint(opts);
  try {
    if (ep.provider === 'groq') {
      if (!ep.key) return { up: false, hasModel: false, models: [], reason: 'GROQ_API_KEY is not set' };
      const res = await timed(`${ep.url}/models`, { headers: { authorization: `Bearer ${ep.key}` } }, 8000);
      if (!res.ok) return { up: false, hasModel: false, models: [], reason: `Groq answered HTTP ${res.status}` };
      const models = ((await res.json()).data ?? []).map((m) => m.id);
      return { up: true, hasModel: models.includes(ep.model), models };
    }
    const res = await timed(`${ep.url}/api/tags`, {}, 1500);
    const models = ((await res.json()).models ?? []).map((m) => m.name);
    return { up: true, hasModel: models.some((m) => m === ep.model || m === `${ep.model}:latest`), models };
  } catch (e) { return { up: false, hasModel: false, models: [], reason: e.message }; }
}

const strictify = (schema) => ({ ...schema, additionalProperties: false });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Ask for a JSON object matching `schema`. Temperature 0 + fixed seed for repeatability.
export async function llmJson({ system, user, schema, timeoutMs = 180000, ...opts }) {
  const ep = endpoint(opts);
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];

  if (ep.provider === 'groq') {
    const call = async (response_format) => {
      const body = { model: ep.model, messages, temperature: 0, seed: 7, response_format, max_completion_tokens: 1500 };
      if (/gpt-oss/.test(ep.model)) body.reasoning_effort = 'low'; // keep the reasoning model quick
      for (let attempt = 0; attempt < 4; attempt++) {
        const res = await timed(`${ep.url}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ep.key}` }, body: JSON.stringify(body) }, timeoutMs);
        if (res.status === 429) { await sleep(Math.min(20000, (Number(res.headers.get('retry-after')) || 2 ** attempt) * 1000)); continue; } // free-tier rate limit
        if (!res.ok) { const e = new Error(`Groq answered HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`); e.status = res.status; throw e; }
        return JSON.parse((await res.json()).choices[0].message.content);
      }
      throw new Error('Groq rate limit: still 429 after retries');
    };
    try { return await call({ type: 'json_schema', json_schema: { name: 'answer', strict: true, schema: strictify(schema) } }); }
    catch (e) { // models without strict structured output: fall back to plain JSON mode (the prompt asks for JSON)
      if (e.status !== 400) throw e;
      return call({ type: 'json_object' });
    }
  }

  const res = await timed(`${ep.url}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: ep.model, stream: false, format: schema, options: { temperature: 0, seed: 7, num_ctx: 8192 }, messages }),
  }, timeoutMs);
  if (!res.ok) throw new Error(`LLM server answered HTTP ${res.status}`);
  return JSON.parse((await res.json()).message?.content ?? '');
}
