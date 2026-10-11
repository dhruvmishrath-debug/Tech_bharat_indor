import { resetPlans } from '../engine/runner.js';
import { resetHistory } from '../engine/recorder.js';

// Start every Playwright run with a clean plan store and run history, so the dashboard reflects exactly this run.
export default async function globalSetup() { resetPlans(); resetHistory(); }
