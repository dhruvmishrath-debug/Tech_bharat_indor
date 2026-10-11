// The demo from the brief: pass on Version A, change the UI (Version B), watch the system detect, explain, rebuild, pass.
// Bonus: Version C is redesigned AND genuinely broken — the system must refuse to "heal" that.
import fs from 'node:fs';
import { runTest, resetPlans } from './runner.js';
import { printResult, C } from './cli-format.js';
import { startServer } from './server.js';
import { resetHistory } from './recorder.js';
import { launchBrowser } from './page.js';

const test = JSON.parse(fs.readFileSync('tests/intents/valid-card.intent.json', 'utf8'));
const server = await startServer();
const browser = await launchBrowser();
const app = (v) => server.url(v);
const run = (v) => runTest(test, app(v), { browser, source: 'demo' });
const banner = (t) => console.log(`\n${C.cyan('━'.repeat(78))}\n${C.b(t)}\n${C.cyan('━'.repeat(78))}`);

console.log(C.b('\nSelf-Healing Software Tests'));
console.log(C.dim(`Intent: “${test.intent}”   Traditional equivalent: click("#checkout-button") …`));
resetPlans(); resetHistory();

banner('1 · Version A — first run: intent → plan → pass');
printResult(await run('a'));

banner('2 · Version A — second run: replay the stored plan');
printResult(await run('a'));

banner('3 · Version B — UI redesigned (buttons renamed, steps added, fields relabelled)');
console.log(C.dim('   Old plan: click #checkout-button → fill #card-number, #expiry, #cvv → click #pay-btn'));
printResult(await run('b'));

banner('4 · Version B again — the healed plan now replays cleanly');
printResult(await run('b'));

banner('5 · Version C — redesigned again AND the payment API is broken (a real bug)');
const r = await run('c');
printResult(r);

console.log(`\n${C.dim('Plans are stored in .selfheal/ — the healed plan is plain JSON you can review in a PR.')}\n`);
await browser.close(); await server.close();
process.exit(r.status === 'failed' ? 0 : 1); // demo succeeds when the real bug is *not* healed away
