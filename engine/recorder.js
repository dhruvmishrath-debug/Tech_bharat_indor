// Persists every run (result + screenshots) so the dashboard can show history. Append-only JSON.
import fs from 'node:fs';
import path from 'node:path';

export const REPORTS = path.resolve('reports');
const HISTORY = path.join(REPORTS, 'history.json');

export const readHistory = () => (fs.existsSync(HISTORY) ? JSON.parse(fs.readFileSync(HISTORY, 'utf8')) : []);
// Clears run history, screenshots and the dashboard. Option-comparison results (reports/comparison/) are kept.
export function resetHistory() { for (const f of ['history.json', 'screenshots', 'dashboard']) fs.rmSync(path.join(REPORTS, f), { recursive: true, force: true }); }
export function newRunId() { return `${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`; }
export const shotPath = (runId, name) => ({ file: path.join(REPORTS, 'screenshots', `${runId}-${name}.png`), rel: `screenshots/${runId}-${name}.png` });

export function recordRun(record) {
  fs.mkdirSync(REPORTS, { recursive: true });
  const all = readHistory(); all.push(record);
  fs.writeFileSync(HISTORY, JSON.stringify(all, null, 2));
  return record;
}
