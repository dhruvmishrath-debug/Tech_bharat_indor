import { test, expect, checkoutSpec } from '../fixtures/selfheal.js';
import { resetPlan } from '../../engine/runner.js';

// The headline story from the brief, as a serial suite: each test builds on the plan the previous one stored.
test.describe.configure({ mode: 'serial' });

test.describe('Journey: "Complete checkout with a valid credit card"', () => {
  test.beforeAll(() => resetPlan(checkoutSpec.id));

  test('Version A: derives a plan from the intent and passes', async ({ selfHeal }) => {
    expect(await selfHeal('a')).toMatchObject({ status: 'passed', mode: 'recorded' });
  });

  test('Version A: replays the stored plan', async ({ selfHeal }) => {
    expect(await selfHeal('a')).toMatchObject({ status: 'passed', mode: 'replay' });
  });

  test('Version B (redesign): detects the break, explains it, rebuilds the workflow, passes', async ({ selfHeal }) => {
    const r = await selfHeal('b');
    expect(r).toMatchObject({ status: 'healed', mode: 'replan' });
    expect(r.brokeAt.stepIndex).toBe(0);
    expect(r.brokeAt.step.locator.css).toBe('#checkout-button');
    expect(r.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'renamed', text: '"Checkout" → "Continue to shipping"' }),
      expect.objectContaining({ kind: 'renamed', text: '"Pay now" → "Place order"' }),
      expect.objectContaining({ kind: 'added', text: expect.stringContaining('Continue to payment') }),
      expect.objectContaining({ kind: 'removed', text: expect.stringContaining('Name on card') }),
    ]));
    expect(r.newSteps.length).toBeGreaterThan(10);
  });

  test('Version B: the healed plan now replays cleanly', async ({ selfHeal }) => {
    expect(await selfHeal('b')).toMatchObject({ status: 'passed', mode: 'replay' });
  });

  test('Version C (redesign + broken payments API): real bug is reported, not healed', async ({ selfHeal }) => {
    const r = await selfHeal('c');
    expect(r.status).toBe('failed');
    expect(r.category).toBe('application-failure');
    expect(r.evidence.consoleErrors.join()).toMatch(/HTTP 500/);
  });
});

test.describe('Guard rails', () => {
  test.beforeEach(() => resetPlan(checkoutSpec.id));

  test('a declined card on an unchanged UI is a failure, not a "UI change"', async ({ selfHeal }) => {
    await selfHeal('a', checkoutSpec, { record: false });
    const bad = { ...checkoutSpec, data: { ...checkoutSpec.data, cardNumber: '4242 4242 4242 4241' } };
    expect(await selfHeal('a', bad)).toMatchObject({ status: 'failed', category: 'application-failure' });
  });

  test('a pure id rename is repaired in place (locator-level healing)', async ({ selfHeal }) => {
    await selfHeal('a', checkoutSpec, { record: false });
    const r = await selfHeal('a-renamed');
    expect(r).toMatchObject({ status: 'healed', mode: 'locator-heal' });
    expect(r.healedLocators).toHaveLength(2);
  });

  test('the oracle checks details: a wrong expected order total fails the run', async ({ selfHeal }) => {
    // The app shows $73.00; a test that expects another amount must fail (this is what catches wrong-amount bugs).
    await selfHeal('a', checkoutSpec, { record: false });
    const wrong = { ...checkoutSpec, expect: { ...checkoutSpec.expect, contains: ['\\$99\\.99'] } };
    const r = await selfHeal('a', wrong);
    expect(r).toMatchObject({ status: 'failed', category: 'application-failure' });
    expect(r.reason).toMatch(/expected detail/);
  });
});
