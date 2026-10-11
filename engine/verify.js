// The oracle. Decides whether the page shows the intended outcome. Healing never changes this; it is the guard against masked bugs.
//   expect.outcome   text signal that must be visible
//   expect.contains  extra regex details that must also be visible (e.g. the correct order total)
//   expect.absent    outcomes that must NOT be visible (e.g. "order confirmed" after a declined card)
import { outcomeRegex } from './lexicon.js';

export function verify(text, expect) {
  if (!outcomeRegex(expect.outcome).test(text)) return { ok: false, kind: 'outcome-missing' };
  for (const a of expect.absent ?? []) {
    if (outcomeRegex(a).test(text)) return { ok: false, kind: 'unexpected-outcome', reason: `"${a}" is visible but must not be.` };
  }
  for (const c of expect.contains ?? []) {
    if (!new RegExp(c, 'i').test(text)) return { ok: false, kind: 'detail-missing', reason: `The outcome appeared, but the expected detail /${c}/ is not on the page (wrong amount or content).` };
  }
  return { ok: true };
}
