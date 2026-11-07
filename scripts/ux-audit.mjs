#!/usr/bin/env node
/* ux-audit.mjs — does the page FEEL like Apple's own app on each device?  (companion to glass-audit.mjs)
 *   node ux-audit.mjs <file-or-url> [--only phone|mac] [--json]
 * Conventions the gate reads (set by liquid-ux.js or by you):
 *   [data-entity]           something you open (album, item, person, file). Phone: rises a sheet over the page. Mac: inline detail or a card.
 *   [data-lux-overscroll]   the layer LUX.overscroll stretches (set automatically)
 *   input[type=search]      search field; on Mac ⌘F / Ctrl+F must focus it
 * Exit code 1 when any check fails. Every check is proven to fail on a real regression: python3 ux-mutations.py runs 16 injected regressions (16/16 caught). */
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import fs from 'fs';
const req = createRequire(import.meta.url);
let pw; for (const p of [null, '/usr/lib/node_modules/', '/usr/local/lib/node_modules/', process.env.HOME + '/.npm-global/lib/node_modules/']) { try { pw = p ? createRequire(p)('playwright') : req('playwright'); break; } catch {} }
if (!pw) { console.error('playwright not found (npm i -D playwright)'); process.exit(2); }
const args = process.argv.slice(2), target = args.find((a) => !a.startsWith('--')), only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null, asJSON = args.includes('--json');
if (!target) { console.error('usage: ux-audit.mjs <file-or-url> [--only phone|mac] [--json]'); process.exit(2); }
const url = /^https?:|^file:/.test(target) ? target : pathToFileURL(fs.realpathSync(target)).href + (target.includes('?') ? '' : '?fixed');
const results = []; const ok = (area, name, pass, detail = '') => results.push({ area, name, pass: !!pass, detail });
const wait = (p, ms) => p.waitForTimeout(ms);
// poll for an outcome (headless GPUs can run at a few fps; real devices settle in < .6s)
const until = async (p, fn, ms = 4000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await p.evaluate(fn).catch(() => null); if (v) return v; await wait(p, 120); } return v; };
const MENU = () => [...document.querySelectorAll('.lux-ctx, [role="menu"]')].find((m) => m.getClientRects().length && +getComputedStyle(m).opacity > .1 && m.getBoundingClientRect().height > 10);
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function ctx(opts) {
  const c = await browser.newContext(opts), p = await c.newPage(), errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto(url); await wait(p, 1800); return { c, p, errs };
}
const touch = async (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y })) });
async function drag(cdp, p, x0, y0, x1, y1, ms = 300, hold = 0) {
  await touch(cdp, 'touchStart', [[x0, y0]]); const n = Math.max(6, Math.round(ms / 16));
  for (let i = 1; i <= n; i++) { await touch(cdp, 'touchMove', [[x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]]); await wait(p, ms / n); }
  if (hold) await wait(p, hold); return async () => touch(cdp, 'touchEnd', []);
}
const offY = (p) => p.evaluate(() => { const e = document.querySelector('[data-lux-overscroll]'); if (!e) return null; const t = getComputedStyle(e).translate; return t === 'none' ? 0 : parseFloat(t.split(' ')[1] || 0); });

/* ============================ iPhone ============================ */
async function phone() {
  const A = 'phone', { c, p, errs } = await ctx({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const cdp = await c.newCDPSession(p);
  const idiom = await p.evaluate(() => document.documentElement.dataset.idiom);
  ok(A, 'idiom', idiom === 'phone', `data-idiom=${idiom} (needs <meta name=viewport content="width=device-width">)`);
  const ty = await p.evaluate(() => { const fs = parseFloat(getComputedStyle(document.body).fontSize); let min = 99, who = '';
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); while (w.nextNode()) { const n = w.currentNode, e = n.parentElement; if (!n.textContent.trim() || !e || !e.offsetParent || e.closest('[aria-hidden="true"], .lux-sr')) continue; const s = parseFloat(getComputedStyle(e).fontSize); if (s < min) { min = s; who = n.textContent.trim().slice(0, 24); } } return { fs, min, who }; });
  ok(A, 'type', ty.fs >= 16.5 && ty.min >= 10.5, `body ${ty.fs}px (iOS Body 17), smallest ${ty.min}px “${ty.who}” (min 11)`);
  const small = await p.evaluate(() => [...document.querySelectorAll('button, a[href], [role="button"], [role="tab"], input, [data-entity]')].filter((e) => { const r = e.getBoundingClientRect(); return e.offsetParent && r.width && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[inert], .lux-sr') && (r.width < 43.5 || r.height < 43.5) && !(e.tagName === 'A' && getComputedStyle(e).display === 'inline'); }).map((e) => `${e.getAttribute('aria-label') || e.textContent.trim().slice(0, 16)} ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`));
  ok(A, 'targets', !small.length, small.length ? 'under 44pt: ' + small.slice(0, 5).join(', ') : 'all ≥ 44pt');
  // press feedback: lights on touch-down, cancels when the finger moves away (so scrolling never triggers it)
  let ent = await p.$('[data-entity]'); const eb = ent && await ent.boundingBox();
  if (eb) {
    const cx = eb.x + eb.width / 2, cy = eb.y + eb.height / 2;
    const look = (e) => { const t = e.style.transition; e.style.transition = 'none'; const c = getComputedStyle(e), v = c.scale + '|' + c.opacity + '|' + c.backgroundColor + '|' + c.transform; e.style.transition = t; return v; };
    const rest = await ent.evaluate((e, f) => new Function('e', 'return (' + f + ')(e)')(e), look.toString());
    await touch(cdp, 'touchStart', [[cx, cy]]); await wait(p, 60); const on = await ent.evaluate((e) => e.hasAttribute('data-pressed') || !!e.querySelector('[data-pressed]'));
    const downLook = await ent.evaluate((e, f) => new Function('e', 'return (' + f + ')(e)')(e), look.toString()); const visible = downLook !== rest;
    for (let i = 1; i <= 6; i++) { await touch(cdp, 'touchMove', [[cx, cy - i * 8]]); await wait(p, 16); }
    const off = await ent.evaluate((e) => !e.hasAttribute('data-pressed')); await touch(cdp, 'touchEnd', []); await wait(p, 300);
    const dlgAfterScroll = await p.$('[role="dialog"]');
    ok(A, 'press', on && visible && off && !dlgAfterScroll, `touch-down ${on ? (visible ? 'highlights' : 'sets data-pressed but nothing visibly changes') : 'NO highlight'}; move 48px ${off ? 'cancels' : 'does NOT cancel'}${dlgAfterScroll ? '; a scroll-drag opened the item' : ''}`);
  } else ok(A, 'press', false, 'no [data-entity] to test');
  // overscroll: stretch past the top edge, follow the finger with resistance, spring back on release
  await p.evaluate(() => scrollTo(0, 0)); await wait(p, 200);
  const end = await drag(cdp, p, 195, 300, 195, 560, 320, 120); const pulled = await offY(p); await end();
  await until(p, () => { const e = document.querySelector('[data-lux-overscroll]'); const t = e && getComputedStyle(e).translate; return !e || t === 'none' || Math.abs(parseFloat(t.split(' ')[1] || 0)) < 1.5; }, 5000); const settled = await offY(p);
  ok(A, 'overscroll', pulled !== null && pulled > 30 && pulled < 260 && Math.abs(settled) < 1.5, pulled === null ? 'LUX.overscroll not attached' : `pulled 260px → stretched ${pulled?.toFixed(0)}px (rubber band < 1:1), released → ${settled?.toFixed(1)}px`);
  await wait(p, 1200); ent = await p.$('[data-entity]');   // a pull-to-refresh may have re-rendered the list
  // entity → a sheet rising over the page, not a navigation
  if (eb) {
    const href0 = p.url(); await p.evaluate(() => scrollTo(0, 0)); await wait(p, 300); const b2 = await ent.boundingBox();
    await p.tap('[data-entity]', { position: { x: b2.width / 2, y: b2.height / 2 } }).catch(() => ent.click());
    await wait(p, 160); const sk = await p.evaluate(() => !!document.querySelector('[role="dialog"] .lux-sk'));
    await wait(p, 1800);
    const d = await p.evaluate(() => { const s = document.querySelector('[role="dialog"]'); if (!s) return null; const r = s.getBoundingClientRect(); return { top: r.top, modal: s.getAttribute('aria-modal'), named: !!s.getAttribute('aria-label') || !!s.getAttribute('aria-labelledby'), sk: !!s.querySelector('.lux-sk'), focusIn: s.contains(document.activeElement), rich: s.textContent.trim().length }; });
    ok(A, 'entity-sheet', d && p.url() === href0 && d.top > 60 && d.top < 844, d ? `sheet at y=${Math.round(d.top)} over the page, URL unchanged` : 'tapping an entity opened no dialog');
    ok(A, 'sheet-a11y', d && d.modal === 'true' && d.named && d.focusIn, d ? `aria-modal=${d.modal}, named=${d.named}, focus inside=${d.focusIn}` : '—');
    ok(A, 'skeleton', d && sk && !d.sk && d.rich > 20, `skeleton during load: ${sk}, replaced by content: ${d && !d.sk}`);
    // drag down on the grabber with a throw → dismiss
    if (d) { const g = await p.$('[role="dialog"] .lux-grab'); const gb = g && await g.boundingBox(); const y0 = gb ? gb.y + 3 : d.top + 10;
      const e2 = await drag(cdp, p, 195, y0, 195, y0 + 340, 140); const mid = await p.evaluate(() => document.querySelector('[role="dialog"]')?.getBoundingClientRect().top); await e2();
      const gone = await until(p, () => !document.querySelector('[role="dialog"]'));
      ok(A, 'sheet-drag', gone && mid > y0 + 150, `follows finger (top ${Math.round(y0)}→${Math.round(mid || 0)}), throw ${gone ? 'dismisses' : 'does NOT dismiss'}`);
      const focus = await p.evaluate(() => !!document.activeElement?.closest('[data-entity]'));
      ok(A, 'focus-return', focus, focus ? 'focus back on the item that opened it' : 'focus lost after close (on ' + await p.evaluate(() => document.activeElement?.tagName + '.' + document.activeElement?.className) + ')');
    }
    // second open: cached → no skeleton flash
    await ent.evaluate((e) => e.click()); await wait(p, 200); const sk2 = await p.evaluate(() => !!document.querySelector('[role="dialog"] .lux-sk'));
    await wait(p, 1200); await p.keyboard.press('Escape'); const esc = await until(p, () => !document.querySelector('[role="dialog"]'));
    ok(A, 'no-flash', !sk2, sk2 ? 'skeleton flashed for content that was already loaded' : 'instant content shows no skeleton');
    ok(A, 'escape', esc, 'Escape closes the sheet');
  }
  // touch-and-hold → context menu (a lifted item, dimmed page) when the page declares one
  let hasCtx = await p.evaluate(() => [...document.querySelectorAll('*')].some((e) => e._luxMenu && e.offsetParent));
  if (!hasCtx && await p.$('[data-entity]')) { await p.evaluate(() => document.querySelector('[data-entity]').click()); hasCtx = await until(p, () => [...document.querySelectorAll('*')].some((e) => e._luxMenu && e.offsetParent), 3000); await wait(p, 2200); }   // let the sheet settle
  if (hasCtx) {
    const h = await p.evaluateHandle(() => [...document.querySelectorAll('*')].find((e) => e._luxMenu && e.offsetParent));
    if (await h.evaluate((e) => !!e)) { await h.evaluate((e) => e.scrollIntoView({ block: 'center' })); await wait(p, 300); const hb = await h.boundingBox();
      const hit = await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.className, [hb.x + 30, hb.y + hb.height / 2]); await touch(cdp, 'touchStart', [[hb.x + 30, hb.y + hb.height / 2]]); const m = !!(await until(p, `(${MENU})()`, 2500)); const dbg = m ? '' : await p.evaluate(() => document.querySelectorAll('.lux-ctx').length); await touch(cdp, 'touchEnd', []); await wait(p, 200);
      const clicked = await p.evaluate(() => document.querySelectorAll('[role="dialog"]').length > 1);   // the hold must not also act as a tap that opens something
      ok(A, 'hold-menu', m && !clicked, m ? 'touch-and-hold opens the menu (and does not also tap)' : 'touch-and-hold opened nothing (under finger: ' + hit + '; menus in DOM: ' + dbg + ')');
      await p.keyboard.press('Escape'); await wait(p, 300); }
  }
  ok(A, 'console', !errs.length, errs.slice(0, 3).join(' | ') || 'no errors');
  await c.close();
  // reduced motion: same results, no travel animations
  const r = await ctx({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  if (await r.p.$('[data-entity]')) { await r.p.evaluate(() => document.querySelector('[data-entity]').click()); await wait(r.p, 120);
    const t1 = await r.p.evaluate(() => document.querySelector('[role="dialog"]')?.getBoundingClientRect().top); await wait(r.p, 500); const t2 = await r.p.evaluate(() => document.querySelector('[role="dialog"]')?.getBoundingClientRect().top);
    ok(A, 'reduced-motion', t1 !== undefined && Math.abs(t1 - t2) < 2, `sheet at final position immediately (Δ ${t1 === undefined ? '—' : Math.abs(t1 - t2).toFixed(1)}px)`); }
  ok(A, 'console-rm', !r.errs.length, r.errs.slice(0, 3).join(' | ') || 'no errors'); await r.c.close();
}

/* ============================ Mac ============================ */
async function mac() {
  const A = 'mac', { c, p, errs } = await ctx({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const idiom = await p.evaluate(() => document.documentElement.dataset.idiom);
  ok(A, 'idiom', idiom === 'mac', `data-idiom=${idiom}`);
  const ty = await p.evaluate(() => { const fs = parseFloat(getComputedStyle(document.body).fontSize); let min = 99; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); while (w.nextNode()) { const e = w.currentNode.parentElement; if (!w.currentNode.textContent.trim() || !e?.offsetParent || e.closest('[aria-hidden="true"], .lux-sr')) continue; min = Math.min(min, parseFloat(getComputedStyle(e).fontSize)); } return { fs, min }; });
  ok(A, 'type', ty.fs >= 12.5 && ty.fs <= 14 && ty.min >= 10, `body ${ty.fs}px (macOS Body 13), smallest ${ty.min}px (min 10)`);
  const ctl = await p.evaluate(() => [...document.querySelectorAll('button, [role="button"], input')].filter((e) => e.offsetParent && !e.closest('.lux-sr, [inert], [data-entity]') && !e.matches('[data-entity]')).map((e) => (e.closest('label') || e).getBoundingClientRect().height).filter((h) => h > 0));   // cards/tiles are content, not controls
  const big = ctl.filter((h) => h > 40).length, tiny = ctl.filter((h) => h < 19.5).length;
  ok(A, 'density', big <= Math.max(2, ctl.length * .2) && !tiny, `${ctl.length} controls; ${big} taller than 40pt (Mac controls ~28pt), ${tiny} under 20pt`);
  // hover: something visibly responds to the pointer on items
  const ent = await p.$('[data-entity]');
  if (ent) {
    await p.mouse.move(5, 790); await wait(p, 200); const before = await p.screenshot({ clip: await ent.boundingBox() }); await ent.hover(); await wait(p, 900); const after = await p.screenshot({ clip: await ent.boundingBox() });
    ok(A, 'hover', !before.equals(after), before.equals(after) ? 'no hover response on items' : 'items respond to hover');
    // click doesn't squash
    const bb = await ent.boundingBox(); await p.mouse.move(bb.x + 20, bb.y + 20); await p.mouse.down(); await wait(p, 120);
    const sc = await ent.evaluate((e) => { const t = e.style.transition; e.style.transition = 'none'; const v = getComputedStyle(e).scale; e.style.transition = t; return v; });   // target style, not a frame of the transition await p.mouse.move(5, 790); await p.mouse.up(); await wait(p, 300);
    ok(A, 'no-squash', sc === 'none' || sc === '1', `pressed scale=${sc} (Mac controls darken, they do not shrink)`);
    // entity → inline detail in the same window (or a centred card), never a bottom sheet, never a page load
    const href0 = p.url(); await ent.click(); await wait(p, 2200);
    const st = await p.evaluate(() => { const d = document.querySelector('[role="dialog"]'); const r = d?.getBoundingClientRect(); return { dlg: !!d, bottomSheet: d ? r.bottom >= innerHeight - 2 && r.width > innerWidth * .9 : false, sk: !!document.querySelector('.lux-sk') }; });
    ok(A, 'entity-inline', p.url() === href0 && !st.bottomSheet, st.dlg ? (st.bottomSheet ? 'opened a phone-style bottom sheet on Mac' : 'opened a centred card') : 'opened inline in the window, URL unchanged');
    ok(A, 'loaded', !st.sk, 'content replaced its skeleton');
    await p.keyboard.press('Escape'); await wait(p, 700);
    await until(p, () => !!document.querySelector('[data-entity]')?.offsetParent, 3000);
    const back = await p.evaluate(() => { const e = document.querySelector('[data-entity]'); return !!e && !!e.offsetParent && (document.activeElement === e || !!document.activeElement?.closest('[data-entity]')); });
    ok(A, 'back', back, back ? 'Esc returns to the list with focus on the item' : 'Esc did not return to the list / focus lost');
  }
  // right-click → menu at the pointer, no page dim
  const cm = await p.evaluateHandle(() => [...document.querySelectorAll('*')].find((e) => e._luxMenu));
  if (await cm.evaluate((e) => !!e)) {
    if (ent) { await ent.click(); await wait(p, 1400); }
    const h = await p.evaluateHandle(() => [...document.querySelectorAll('*')].find((e) => e._luxMenu && e.offsetParent)); const hb = await h.boundingBox();
    if (hb) { await p.mouse.click(hb.x + 40, hb.y + hb.height / 2, { button: 'right' }); await wait(p, 400);
      const m = await p.evaluate(`(${MENU})()`) && await p.evaluate(() => { const m = [...document.querySelectorAll('.lux-ctx, [role="menu"]')].find((m) => m.getClientRects().length && +getComputedStyle(m).opacity > .1 && m.getBoundingClientRect().height > 10), l = m?.parentElement; if (!m) return null; const r = m.getBoundingClientRect(), bg = l && getComputedStyle(l).backgroundColor; const b = m.querySelector('button').getBoundingClientRect(); return { x: r.left, y: r.top, dim: bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg), rowH: b.height }; });
      ok(A, 'right-click', m && Math.abs(m.x - (hb.x + 40)) < 12 && !m.dim && m.rowH <= 30, m ? `menu at pointer (Δ${Math.round(Math.abs(m.x - hb.x - 40))}px), dim=${m.dim}, item ${Math.round(m.rowH)}pt` : 'no menu');
      await p.keyboard.press('Escape'); await wait(p, 200); }
    await p.keyboard.press('Escape'); await wait(p, 400);
  }
  // ⌘F / Ctrl+F focuses search
  const hasSearch = await p.evaluate(() => [...document.querySelectorAll('input[type="search"]')].some((e) => e.offsetParent));
  if (hasSearch) { await p.mouse.click(700, 700); await p.keyboard.press('Control+f'); await wait(p, 150); const f = await p.evaluate(() => document.activeElement?.type === 'search'); ok(A, 'cmd-f', f, f ? '⌘F focuses search' : '⌘F does not focus search'); }
  ok(A, 'console', !errs.length, errs.slice(0, 3).join(' | ') || 'no errors');
  await c.close();
}

if (only !== 'mac') await phone();
if (only !== 'phone') await mac();
await browser.close();
const fail = results.filter((r) => !r.pass);
if (asJSON) console.log(JSON.stringify({ url, pass: !fail.length, results }, null, 1));
else { for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.area.padEnd(5)} ${r.name.padEnd(15)} ${r.detail}`); console.log(`\n${results.length - fail.length}/${results.length} passed`); }
process.exit(fail.length ? 1 : 0);
