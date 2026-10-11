import { test, expect, loadIntent, INTENTS } from '../fixtures/selfheal.js';
import { resetPlan } from '../../engine/runner.js';

// Every intent walks the same UI evolution: A → renamed ids → B redesign → D redesign.
// What each step must do, in order. Each test reuses the plan the previous one stored.
const EVOLUTION = [
  ['a',         { status: 'passed', mode: 'recorded' },     'derives the plan from the intent'],
  ['a',         { status: 'passed', mode: 'replay' },       'replays the stored plan'],
  ['a-renamed', { status: 'healed', mode: 'locator-heal' }, 'ids renamed → locators repaired in place'],
  ['b',         { status: 'healed', mode: 'replan' },       'wizard redesign → workflow rebuilt from intent'],
  ['b',         { status: 'passed', mode: 'replay' },       'healed plan replays on the wizard'],
  ['d',         { status: 'healed', mode: 'replan' },       'accordion redesign with new wording → rebuilt again'],
  ['d',         { status: 'passed', mode: 'replay' },       'healed plan replays on the accordion'],
];

test.describe.configure({ mode: 'serial' });
for (const name of INTENTS) {
  const spec = loadIntent(name);
  test.describe(`Intent · ${spec.name}`, () => {
    test.beforeAll(() => resetPlan(spec.id));
    for (const [version, expected, title] of EVOLUTION) {
      test(`Version ${version}: ${title}`, async ({ selfHeal }) => {
        expect(await selfHeal(version, spec)).toMatchObject(expected);
      });
    }
  });
}
