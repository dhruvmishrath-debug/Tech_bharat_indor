import { test, expect, loadIntent, INTENTS } from '../fixtures/selfheal.js';
import { resetPlan } from '../../engine/runner.js';

// Genuine regressions hidden inside UI redesigns. The system must report each one and never "heal" it.
// For every (bug, intent): `failed` + category, or `healed` where that intent legitimately doesn't touch the bug.
const BUGS = {
  c: {
    what: 'payments API answers HTTP 500',
    expect: () => ({ status: 'failed', category: 'application-failure' }),
    evidence: (e) => expect(e.consoleErrors.join()).toMatch(/HTTP 500/),
  },
  'c-silent': {
    what: 'payment succeeds but UI shows neither confirmation nor error',
    // A declined card never reaches the broken success path, so that intent is unaffected.
    expect: (name) => (name === 'declined-card' ? { status: 'healed' } : { status: 'failed', category: 'application-failure' }),
    evidence: (e, name) => name !== 'declined-card' && expect(e.apiCalls?.[0]).toMatchObject({ status: 200 }),
  },
  'c-total': {
    what: 'discount applied twice on the receipt (wrong amount)',
    // Only intents that use a promo code ever see the wrong total.
    expect: (name) => (['promo', 'full'].includes(name) ? { status: 'failed', category: 'application-failure' } : { status: 'healed' }),
  },
  'c-disabled': {
    what: 'pay button permanently disabled',
    expect: () => ({ status: 'failed', category: 'unresolved' }),
  },
};

test.describe.configure({ mode: 'serial' });
for (const [version, bug] of Object.entries(BUGS)) {
  test.describe(`Regression ${version}: ${bug.what}`, () => {
    for (const name of INTENTS) {
      const spec = loadIntent(name);
      test(`${name}`, async ({ selfHeal }) => {
        resetPlan(spec.id);
        await selfHeal('a', spec, { record: false }); // baseline plan recorded on the healthy original UI
        const r = await selfHeal(version, spec);
        expect(r).toMatchObject(bug.expect(name));
        bug.evidence?.(r.evidence ?? {}, name);
      });
    }
  });
}
