// Standalone app server for Playwright's `webServer` (and for poking at the app by hand).
import { startServer } from './server.js';
const port = Number(process.env.PORT || 4173);
const s = await startServer({ port });
console.log(`ShopEasy test app on ${s.base}  (try /?v=a  /?v=b  /?v=c)`);
