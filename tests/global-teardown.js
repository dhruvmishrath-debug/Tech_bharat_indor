import { buildDashboard } from '../engine/dashboard.js';

// Always rebuild the dashboard when a run ends, whichever reporter was used on the command line.
export default async function globalTeardown() {
  const { out, runs } = buildDashboard();
  console.log(`\nSelf-heal dashboard: ${out} (${runs} runs)  →  npm run dashboard`);
}
