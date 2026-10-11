// A STAND-IN for a local model server (Ollama API), used only to test the LLM integration without a real model:
// prompt building, JSON parsing, answer validation, fallback, and the "model cannot mask a bug" guarantee.
// It is NOT an LLM and says nothing about real-model quality; it answers by parsing the prompt with simple heuristics.
// `mode`: 'ok' | 'garbage' (not JSON) | 'badindex' (hallucinated element number) | 'down' (HTTP 500)
//         | 'ignore-options' (never applies the promo code / delivery option: the mistake a small real model made)
import http from 'node:http';
import { classifyField, advanceScore, similarity } from '../../engine/lexicon.js';

const lines = (txt, header) => (txt.split(header)[1] ?? '').split('\n').slice(1).filter((l) => /^\[\d+\]/.test(l));
const parse = (l) => { const m = /^\[(\d+)\] (\S+) "(.*?)"(?: \((.*)\))?$/.exec(l); return m && { i: +m[1], role: m[2], name: m[3], flags: m[4] ?? '' }; };

function decide(user, mode) {
  const data = Object.fromEntries(user.split('\n').filter((l) => /^ {2}\w+ = /.test(l)).map((l) => l.trim().split(' = ')));
  if (mode === 'ignore-options') { delete data.promo; delete data.shipping; }
  const els = lines(user, 'VISIBLE CONTROLS:').map(parse).filter(Boolean);
  const as = (e) => ({ name: e.name, placeholder: '', autocomplete: '', nameAttr: '', id: '', type: e.role });
  for (const e of els) if (e.role === 'textbox' && e.flags === 'empty') { const k = classifyField(as(e)); if (k && data[k] !== undefined) return { action: 'fill', element: e.i, field: k, reason: `${e.name} needs ${k}` }; }
  const want = data.shipping;
  if (want) for (const e of els) if (e.role === 'radio' && e.flags === 'unchecked' && new RegExp(want, 'i').test(e.name)) return { action: 'check', element: e.i, field: 'shipping', reason: 'requested delivery option' };
  for (const e of els) if (e.role === 'checkbox' && e.flags === 'unchecked' && /terms|agree|accept/i.test(e.name)) return { action: 'check', element: e.i, reason: 'consent' };
  if (data.promo && !/applied/i.test(user.split('PAGE TEXT:')[1]?.split('VISIBLE')[0] ?? '') && !user.includes('Apply') === false) {
    const filled = els.some((e) => e.role === 'textbox' && /promo|discount/i.test(e.name) && e.flags.startsWith('filled'));
    const btn = els.find((e) => e.role === 'button' && /apply|redeem/i.test(e.name) && !e.flags.includes('already'));
    if (filled && btn) return { action: 'click', element: btn.i, reason: 'apply promo' };
  }
  const best = els.filter((e) => e.role === 'button' && !/DISABLED|already/.test(e.flags)).map((e) => ({ e, s: advanceScore(e.name) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)[0];
  return best ? { action: 'click', element: best.e.i, reason: 'moves toward the goal' } : { action: 'stuck', reason: 'nothing helps' };
}

function locate(user) {
  const m = /it targeted: (\S+) named "(.*?)"/.exec(user);
  const [, role, name] = m ?? [];
  const pool = lines(user, 'CURRENT CONTROLS OF THE RIGHT KIND:').map(parse).filter(Boolean);
  const as = (n) => ({ name: n, placeholder: '', autocomplete: '', nameAttr: '', id: '' });
  const key = classifyField(as(name));
  let best = null;
  for (const e of pool) {
    const sim = key && classifyField(as(e.name)) === key ? 0.9 : Math.max(similarity(name, e.name), role === 'button' && advanceScore(name) && advanceScore(name) === advanceScore(e.name) ? 0.75 : 0);
    if (sim > (best?.sim ?? 0.5)) best = { e, sim };
  }
  return best ? { element: best.e.i, confidence: best.sim, reason: `same purpose as "${name}"` } : { element: -1, confidence: 0, reason: 'no counterpart on this screen' };
}

export async function startMockLlm() {
  const state = { mode: 'ok', calls: 0 };
  const server = http.createServer((req, res) => {
    if (req.url === '/api/tags') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ models: [{ name: 'mock:1' }] })); }
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => {
      state.calls++;
      if (state.mode === 'down') { res.writeHead(500); return res.end('boom'); }
      const [sys, usr] = JSON.parse(body).messages.map((m) => m.content);
      let ans;
      if (state.mode === 'garbage') ans = 'I think you should click the blue button!';
      else if (/operate a web page/.test(sys)) ans = state.mode === 'badindex' ? { action: 'click', element: 999, reason: 'hallucinated' } : decide(usr, state.mode);
      else if (/maintain automated UI tests/.test(sys)) ans = locate(usr);
      else { const f = /Facts: (.*)\n/.exec(usr)?.[1] ?? '{}'; const j = JSON.parse(f); ans = { summary: `Mock summary: verdict ${j.verdict}.` }; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: { content: typeof ans === 'string' ? ans : JSON.stringify(ans) } }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, state, close: () => new Promise((r) => server.close(r)) };
}
