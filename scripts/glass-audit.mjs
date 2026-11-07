#!/usr/bin/env node
// glass-audit.mjs — the liquid-glass-ui-ux glass gate. Real Chromium, real pixels. Works on both tiers:
//   T3 optical renderer: elements with [data-gl] + window.LiquidGlass.instances
//   DOM tier:            elements with [data-glass] (assets/dom)
// usage: node glass-audit.mjs <page.html | url> [--out report.json] [--scroll 0,0.4,0.8]
// Needs Playwright (require('playwright')). Exit code 1 when any check fails.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require(require.resolve('playwright', { paths: [process.cwd(), '/opt/node22/lib/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules'] }))); } catch { console.error('Playwright not found. Install it or run where require("playwright") works.'); process.exit(2); } }

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const target = process.argv[2]; if (!target) { console.error('usage: node glass-audit.mjs <page.html | url> [--out report.json]'); process.exit(2); }
const URL0 = /^https?:|^file:/.test(target) ? target : pathToFileURL(resolve(target)).href;
const URL = URL0 + (URL0.includes('?') ? '&' : '?') + 'fixed';
const scrolls = arg('scroll', '0,0.45,0.85').split(',').map(Number);
const GLARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const results = []; const rec = (id, ok, detail, rule) => { results.push({ id, ok, detail, rule }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(14)} ${detail}`); };
const errors = [];
const wait = (p, ms) => p.waitForTimeout(ms);

async function open(browser, w, h, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 700, reducedMotion: o.rm ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(URL); await wait(page, o.settle ?? 4500); return { ctx, page };
}
const INFO = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 1 && r.height > 1 && cs.display !== 'none' && cs.visibility !== 'hidden' && !e.closest('[hidden]'); };
  const glass = [...document.querySelectorAll('[data-gl],[data-glass]')];
  const api = window.LiquidGlass && window.LiquidGlass.instances && window.LiquidGlass.instances[0];
  const dbg = api ? api.debug() : [];
  return { tier: api ? 'T3' : (document.querySelector('[data-glass]') ? 'DOM' : 'none'), webgl: api ? api.webgl : null, config: api ? api.config : null,
    items: glass.map((e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e), d = dbg.find((x) => x.el === (e.id || e.className)) || {};
      return { name: e.id || e.className || e.tagName, role: e.dataset.role || '', vis: vis(e), lens: e.dataset.role === 'lens', level: d.level ?? 1, appear: d.appear ?? 1, merge: d.merge ?? 0, adapt: e.dataset.adapt === 'on' || e.hasAttribute('data-adaptive'),
        text: (e.innerText || '').trim().length, nestedIn: !!(e.parentElement && e.parentElement.closest('[data-gl],[data-glass]')), r: { x: r.x, y: r.y, w: r.width, h: r.height }, radius: parseFloat(cs.borderTopLeftRadius) || 0,
        layerContent: !!e.closest('[data-layer="content"]') }; }) };
};

const browser = await chromium.launch({ args: GLARGS });

/* ---------- structure at phone and wide widths ---------- */
for (const [w, h] of [[390, 844], [1440, 900]]) {
  const { ctx, page } = await open(browser, w, h);
  const I = await page.evaluate(INFO);
  if (w === 390) rec('tier', I.tier !== 'none', `tier ${I.tier}${I.tier === 'T3' ? ', WebGL2 ' + I.webgl : ''}, ${I.items.length} glass elements`, 'page uses a glass tier');
  const v = I.items.filter((x) => x.vis && x.level > .01);
  const ROLES = ['control', 'bar', 'accessory', 'surface', 'lens', 'sidebar', 'toolbar'];
  if (I.tier === 'T3') { const bad = I.items.filter((x) => !ROLES.includes(x.role)); rec(`roles@${w}`, bad.length === 0, bad.length ? 'no valid data-role: ' + bad.map((x) => x.name).join(', ') : 'every glass element declares a role', 'effects are opt-in by role'); }
  const nest = I.items.filter((x) => x.nestedIn && !x.lens);
  rec(`nesting@${w}`, nest.length === 0, nest.length ? 'glass inside glass: ' + nest.map((x) => x.name).join(', ') : 'no glass inside glass (only the lens role may sit on glass)', 'no glass on glass');
  const inContent = I.items.filter((x) => x.layerContent);
  rec(`layer@${w}`, inContent.length === 0, inContent.length ? 'glass in the content layer: ' + inContent.map((x) => x.name).join(', ') : 'no glass inside [data-layer=content]', 'glass only in the functional layer');
  const budget = v.filter((x) => !x.lens).length;
  rec(`budget@${w}`, budget <= 6, `${budget} visible glass shapes (max 6)`, 'glass is used sparingly');
  const wordy = v.filter((x) => x.text > 180 && x.role !== 'surface');
  rec(`text-load@${w}`, wordy.length === 0, wordy.length ? 'long text on non-surface glass: ' + wordy.map((x) => x.name).join(', ') : 'long text only on surface-role glass', 'text-heavy glass must be a surface');
  const caps = v.filter((x) => ['control', 'bar', 'accessory'].includes(x.role) && Math.abs(x.radius - Math.min(x.r.w, x.r.h) / 2) > 1.5);
  if (I.tier === 'T3') rec(`round@${w}`, caps.length === 0, caps.length ? 'not capsule: ' + caps.map((x) => `${x.name} r${x.radius}/${Math.min(x.r.w, x.r.h) / 2}`).join(', ') : 'controls, bars and accessories are capsules', 'lean round where it fits');
  const bars = v.filter((x) => (x.role === 'bar' || x.role === 'accessory') && x.r.y > h * .6);   // floating bottom bars only
  const badBars = bars.filter((b) => { const L = b.r.x, R = w - (b.r.x + b.r.w), maxW = Math.min(w - 32, Math.max(w / 3, 340), 520) + 2; return b.r.w > maxW || Math.abs(L - R) > 2.5 || L < 15; });
  if (bars.length) rec(`bars@${w}`, badBars.length === 0, badBars.length ? 'bars not compact+centred: ' + badBars.map((b) => `${b.name} w${Math.round(b.r.w)} L${Math.round(b.r.x)}`).join(', ') : `${bars.length} floating bar(s) compact and centred (w ${bars.map((b) => Math.round(b.r.w)).join('/')})`, 'floating bars hug the centre');
  if (w === 390) {
    const small = await page.evaluate(() => [...document.querySelectorAll('[data-gl] button,[data-gl][role=button],[data-gl] [role=tab],[data-glass] button,button[data-gl],button[data-glass]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 1 && !e.closest('[hidden]') && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).pointerEvents !== 'none' && +getComputedStyle(e).opacity > .05; }).map((e) => { const r = e.getBoundingClientRect(); return { n: e.getAttribute('aria-label') || e.textContent.trim().slice(0, 20), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((x) => x.w < 44 || x.h < 44));
    rec('targets@390', small.length === 0, small.length ? 'under 44×44: ' + JSON.stringify(small.slice(0, 5)) : 'every control on glass is at least 44×44', 'touch targets');
  }
  if (I.tier === 'T3' && w === 390) {
    await wait(page, 2500); const m = await page.evaluate(() => window.LiquidGlass.instances[0].debug().filter((d) => d.merge > .01).map((d) => d.el + ':' + d.merge));
    rec('merge-rest', m.length === 0, m.length ? 'shapes melted at rest: ' + m.join(', ') : 'no shapes melted at rest (merging only during morphs)', 'merging is an animation, never a state');
    const c = I.config; const ok = c && c.dwell >= c.transition && c.cooldown >= c.transition && c.transition >= .3;
    rec('adapt-timing', !!ok, c ? `dwell ${c.dwell}s ≥ fade ${c.transition}s, cooldown ${c.cooldown}s` : 'no config', 'colour shift: hold as long as the fade, then cool down');
  }
  await ctx.close();
}

/* ---------- text contrast on glass, against the real rendered backdrop, at several scroll positions ---------- */
{
  const { ctx, page } = await open(browser, 390, 844);
  const fails = []; let measured = 0;
  const maxY = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight));
  for (const f of scrolls) {
    await page.evaluate((y) => scrollTo(0, y), Math.round(maxY * f)); await wait(page, 3200);
    const items = await page.evaluate(() => {
      const out = []; const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight && !e.closest('[hidden]') && getComputedStyle(e).visibility !== 'hidden' && +getComputedStyle(e).opacity > .5; };
      document.querySelectorAll('[data-gl],[data-glass]').forEach((g) => { if (!vis(g) || g.dataset.role === 'lens') return;
        g.querySelectorAll('*').forEach((e) => { if (e.closest('svg') || !vis(e)) return; const direct = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()); if (!direct) return; if (e.closest('.art,img')) return;
          let o = 1; for (let a = e; a && a !== document.body; a = a.parentElement) o *= +getComputedStyle(a).opacity; if (o < .5) return;
          const r = e.getBoundingClientRect(), cs = getComputedStyle(e); out.push({ g: g.id || g.className, t: e.textContent.trim().slice(0, 18), color: cs.color, size: parseFloat(cs.fontSize), weight: +cs.fontWeight || 400, r: { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(r.width, innerWidth - Math.max(0, r.x)), height: Math.min(r.height, innerHeight - Math.max(0, r.y)) } }); }); });
      return out; });
    await page.addStyleTag({ content: '[data-gl] *:not(svg):not(svg *), [data-glass] *:not(svg):not(svg *){ color: transparent !important; text-shadow: none !important; } #__x{}' });
    await wait(page, 500);
    for (const it of items) {
      if (it.r.width < 3 || it.r.height < 3) continue;
      const buf = await page.screenshot({ clip: it.r });
      const L = await page.evaluate(async (b64) => { const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; const f = (v) => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; const a = []; for (let k = 0; k < d.length; k += 4) a.push(.2126 * f(d[k]) + .7152 * f(d[k + 1]) + .0722 * f(d[k + 2])); a.sort((p, q) => p - q); return [a[Math.floor(a.length * .1)], a[Math.floor(a.length * .9)]]; }, buf.toString('base64'));
      const m = it.color.match(/[\d.]+/g).map(Number), al = m.length > 3 ? m[3] : 1, lin = (v) => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
      const ratio = (bgL) => { const g = 255 * (bgL <= .0031308 ? bgL * 12.92 : 1.055 * bgL ** (1 / 2.4) - .055); const fl = .2126 * lin(m[0] * al + g * (1 - al)) + .7152 * lin(m[1] * al + g * (1 - al)) + .0722 * lin(m[2] * al + g * (1 - al)); return (Math.max(fl, bgL) + .05) / (Math.min(fl, bgL) + .05); };
      const c = Math.min(ratio(L[0]), ratio(L[1])), large = it.size >= 24 || (it.size >= 18.66 && it.weight >= 700), need = large ? 3 : 4.5; measured++;
      if (c < need) fails.push(`${it.g}/"${it.t}" ${c.toFixed(2)}<${need} @scroll ${f}`);
    }
    await page.reload(); await wait(page, 4500);
  }
  rec('contrast', fails.length === 0, fails.length ? `${fails.length} of ${measured}: ` + fails.slice(0, 5).join(' | ') : `${measured} text measurements ≥ 4.5:1 (3:1 large) over the real backdrop at ${scrolls.length} scroll positions`, 'text on glass is readable');
  await ctx.close();
}

/* ---------- keyboard: every interactive glass element reachable, named, with a visible focus ring ---------- */
{
  const { ctx, page } = await open(browser, 1440, 900);
  const seen = [];
  for (let i = 0; i < 24; i++) { await page.keyboard.press('Tab'); seen.push(await page.evaluate(() => { const a = document.activeElement; if (!a || a === document.body) return null; const cs = getComputedStyle(a); return { glass: !!a.closest('[data-gl],[data-glass]'), id: (a.className && a.className.baseVal === undefined ? a.className : a.tagName), name: a.getAttribute('aria-label') || a.textContent.trim().slice(0, 24), ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 }; })); }
  const g = seen.filter((x) => x && x.glass), noName = g.filter((x) => !x.name), noRing = g.filter((x) => !x.ring);
  rec('keyboard', g.length > 0 && noName.length === 0 && noRing.length === 0, `${g.length} glass controls reached by Tab; unnamed ${noName.length}; no focus ring ${noRing.length}${noRing.length ? ' (' + noRing.map((x) => x.id || x.name).slice(0, 4).join(', ') + ')' : ''}`, 'keyboard, names, focus');
  await ctx.close();
}

/* ---------- reduced motion: glass appears without springing ---------- */
{
  const { ctx, page } = await open(browser, 390, 844, { rm: true, settle: 1500 });
  const t = await page.evaluate(() => { const api = window.LiquidGlass && window.LiquidGlass.instances && window.LiquidGlass.instances[0]; if (!api) return null; return api.debug().filter((d) => d.role !== 'lens').map((d) => d.appear); });
  if (t) rec('reduced-motion', t.every((a) => Math.abs(a - 1) < .03), `appear values under reduced motion: ${t.map((a) => a.toFixed(2)).join(' ')} (no overshoot)`, 'reduced motion: no springs');
  await ctx.close();
}
await browser.close();

/* ---------- no WebGL: still usable ---------- */
{
  const b2 = await chromium.launch({ args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] });
  const ctx = await b2.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(URL); await wait(page, 2500);
  const f = await page.evaluate(() => ({ tier: !!(window.LiquidGlass && window.LiquidGlass.instances), cls: document.documentElement.classList.contains('lg-no-webgl'), styled: [...document.querySelectorAll('[data-gl]')].every((e) => { const cs = getComputedStyle(e); return cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || (cs.backdropFilter && cs.backdropFilter !== 'none'); }) }));
  if (f.tier) rec('no-webgl', f.cls && f.styled && errs.length === 0, `fallback class ${f.cls}, glass styled ${f.styled}, page errors ${errs.length}`, 'usable without WebGL');
  await b2.close();
}
rec('console', errors.length === 0, errors.length ? [...new Set(errors)].slice(0, 3).join(' | ') : 'no page errors', 'clean console');
const failed = results.filter((r) => !r.ok);
const out = arg('out'); if (out) writeFileSync(out, JSON.stringify({ target: URL0, at: new Date().toISOString(), results }, null, 1));
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? ' · failing: ' + failed.map((r) => r.id).join(', ') : ''}`);
process.exit(failed.length ? 1 : 0);
