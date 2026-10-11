// A browser session over Playwright (real Chromium): open an app, observe it semantically, act on it.
import { chromium } from 'playwright';

export async function launchBrowser() { return chromium.launch(); }

// Runs inside the page: everything a person could interact with right now, described semantically.
function collect() {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const vis = (el) => el.checkVisibility({ visibilityProperty: true }) && el.getAttribute('aria-hidden') !== 'true';
  const nameOf = (el) => {
    const aria = el.getAttribute('aria-label'); if (aria) return norm(aria);
    const by = el.getAttribute('aria-labelledby');
    if (by) { const t = by.split(/\s+/).map((i) => document.getElementById(i)?.textContent).join(' '); if (norm(t)) return norm(t); }
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) return norm(l.textContent); }
    const wrap = el.closest('label'); if (wrap) return norm(wrap.textContent);
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' && ['submit', 'button'].includes(el.type)) return norm(el.value);
    if (tag === 'button' || tag === 'a') return norm(el.textContent);
    return norm(el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('name') || '');
  };
  const unique = (s, el) => { try { const m = document.querySelectorAll(s); return m.length === 1 && m[0] === el; } catch { return false; } };
  const selectorFor = (el) => {
    if (el.id && unique(`#${CSS.escape(el.id)}`, el)) return `#${CSS.escape(el.id)}`;
    for (const a of ['data-testid', 'aria-label', 'name']) {
      const v = el.getAttribute(a); const s = v && `${el.tagName.toLowerCase()}[${a}="${v}"]`;
      if (s && unique(s, el)) return s;
    }
    const parts = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.id && n !== el) { parts.unshift(`#${CSS.escape(n.id)}`); break; }
      const same = [...n.parentElement.children].filter((c) => c.tagName === n.tagName);
      parts.unshift(`${n.tagName.toLowerCase()}${same.length > 1 ? `:nth-of-type(${same.indexOf(n) + 1})` : ''}`);
    }
    return parts.join(' > ');
  };
  const elements = [];
  for (const el of document.querySelectorAll('input, textarea, select, button, a[href], [role=button]')) {
    if (!vis(el)) continue;
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || (tag === 'input' ? 'text' : '')).toLowerCase();
    const isField = ['input', 'textarea', 'select'].includes(tag) && !['submit', 'button', 'checkbox', 'radio', 'hidden'].includes(type);
    const isCheck = tag === 'input' && ['checkbox', 'radio'].includes(type);
    const kind = isField ? 'field' : isCheck ? 'checkbox' : 'action';
    elements.push({
      kind, tag, type,
      role: el.getAttribute('role') || (kind === 'action' ? (tag === 'a' ? 'link' : 'button') : kind === 'field' ? 'textbox' : type),
      name: nameOf(el), placeholder: el.getAttribute('placeholder') || '', autocomplete: el.getAttribute('autocomplete') || '',
      id: el.id || '', nameAttr: el.getAttribute('name') || '', value: el.value ?? '', checked: !!el.checked,
      selector: selectorFor(el), enabled: !el.disabled,
    });
  }
  const alerts = [...document.querySelectorAll('[role=alert], .error, .banner')].filter(vis).map((e) => norm(e.textContent)).filter(Boolean);
  return { elements, alerts, text: norm(document.body.innerText) };
}

const attached = new WeakMap(); // one agent wrapper (and one set of listeners) per Playwright page

export class Page {
  // Wrap a Playwright page (e.g. the test fixture's, so traces/videos/screenshots keep working).
  static attach(pw) {
    if (attached.has(pw)) return attached.get(pw);
    const p = new Page();
    p.pw = pw; p.errors = []; p.apiLog = [];
    pw.setDefaultTimeout(3000);
    pw.addInitScript(() => { window.__pending = 0; const f = window.fetch; window.fetch = (...a) => { window.__pending++; return f(...a).finally(() => window.__pending--); }; });
    pw.on('pageerror', (e) => p.errors.push(`Uncaught ${e.message}`));
    pw.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) p.errors.push(m.text()); });
    pw.on('response', (r) => {
      if (!r.url().includes('/api/')) return;
      const call = { method: r.request().method(), path: new URL(r.url()).pathname, status: r.status() };
      p.apiLog.push(call);
      if (call.status >= 400) p.errors.push(`HTTP ${call.status} ${call.method} ${call.path}`);
    });
    attached.set(pw, p);
    return p;
  }

  // Standalone use (demo): own context + page.
  static async open(browser, url) {
    const context = await browser.newContext();
    const p = Page.attach(await context.newPage());
    p.context = context;
    await p.goto(url);
    return p;
  }

  async goto(url) { this.errors.length = 0; this.apiLog.length = 0; await this.pw.goto(url); await this.settle(); }
  async close() { await this.context?.close(); } // pages owned by Playwright's test runner are left alone
  async screenshot(file) { await this.pw.screenshot({ path: file, fullPage: true }); }

  // DOM quiet for 100ms and no fetches in flight.
  settle() {
    return this.pw.evaluate(() => new Promise((res) => {
      let t; const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(done, 100); });
      const done = () => { if (window.__pending > 0) { t = setTimeout(done, 50); return; } mo.disconnect(); res(); };
      mo.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
      t = setTimeout(done, 100); setTimeout(() => { mo.disconnect(); res(); }, 4000);
    }));
  }

  async observe() { return { ...(await this.pw.evaluate(collect)), errors: [...this.errors] }; }
  async probe(css) {
    const l = this.pw.locator(css);
    if ((await l.count()) !== 1) return { exists: false };
    return { exists: true, visible: await l.isVisible(), enabled: await l.isEnabled() };
  }
  fill(css, value) { return this.pw.locator(css).fill(value); }
  check(css) { return this.pw.locator(css).check(); }
  click(css) { return this.pw.locator(css).click(); }
}
