/* liquid-glass.js : runtime for MASTER.md (v0.1). No dependencies.
   API: LG.init(), LG.lens(el,opts), LG.tone(), LG.spring(...), LG.move(el,rect), LG.pop(el,trigger,open), LG.pref(name,val)
*/
(function (global) {
  'use strict';
  const doc = document, root = doc.documentElement;
  const mm = (q) => global.matchMedia && global.matchMedia(q).matches;
  const LG = { tier: 1, prefs: {}, _lens: new Map(), _id: 0 };

  /* ---------- preferences (system + user toggles), MASTER §10 ---------- */
  LG.reducedMotion = () => mm('(prefers-reduced-motion: reduce)') || root.hasAttribute('data-lg-reduce-motion');
  LG.reducedTransparency = () => mm('(prefers-reduced-transparency: reduce)') || root.hasAttribute('data-lg-reduce-transparency');
  LG.pref = function (name, on) {
    const attr = { transparency: 'data-lg-reduce-transparency', motion: 'data-lg-reduce-motion' }[name];
    if (attr) { on ? root.setAttribute(attr, '') : root.removeAttribute(attr); }
    if (name === 'contrast') on ? root.setAttribute('data-lg-contrast', 'more') : root.removeAttribute('data-lg-contrast');
    if (name === 'lens') { LG.prefs.lens = on; LG.refresh(); }
    if (name === 'scheme') root.setAttribute('data-lg-scheme', on);
    LG.refresh();
  };

  /* ---------- springs → CSS linear() / WAAPI easing, MASTER §9.3 ---------- */
  // critically-parametrised spring, unit mass; returns {easing, duration(ms), overshoot}
  LG.spring = function (zeta, omega) {
    const dt = 1 / 120; let x = 0, v = 0, t = 0, over = 0; const pts = [];
    for (let i = 0; i < 1200; i++) {
      const a = -2 * zeta * omega * v - omega * omega * (x - 1);
      v += a * dt; x += v * dt; t += dt; pts.push(x); over = Math.max(over, x - 1);
      if (i > 20 && Math.abs(x - 1) < 0.0015 && Math.abs(v) < 0.01) break;
    }
    const n = Math.min(40, pts.length), out = [];
    for (let i = 0; i < n; i++) out.push((pts[Math.floor(i * (pts.length - 1) / (n - 1))]).toFixed(4));
    out[out.length - 1] = '1';
    return { easing: 'linear(0,' + out.join(',') + ')', duration: Math.round(t * 1000), overshoot: over };
  };
  const SPR = {
    press: LG.spring(0.55, 22), morph: LG.spring(0.72, 13), pop: LG.spring(0.75, 17), sheet: LG.spring(0.85, 14),
  };
  LG.SPR = SPR;
  root.style.setProperty('--lg-spring-press', SPR.press.easing);
  root.style.setProperty('--lg-spring-morph', SPR.morph.easing);

  /* animate with interrupt-safety (MASTER §9.1, "cancellable"): a new animation starts from the CURRENT
     visual state of any running one, never from a fixed keyframe. No commitStyles, so no stale inline style. */
  LG.anim = function (el, frames, opts) {
    const running = el.getAnimations ? el.getAnimations().filter((a) => a._lg) : [];
    let cur = null;
    if (running.length) { const cs = getComputedStyle(el); cur = { opacity: cs.opacity, transform: cs.transform === 'none' ? 'none' : cs.transform }; running.forEach((a) => a.cancel()); }
    const rm = LG.reducedMotion();
    let k = frames, o = Object.assign({ fill: 'both' }, opts);
    if (rm) { // §9.6: replace travel with a fade, no overshoot, ≤200ms
      k = [{ opacity: cur ? +cur.opacity : (opts && opts.fadeFrom != null ? opts.fadeFrom : 0) }, { opacity: 1 }];
      o = { duration: 160, easing: 'ease-out', fill: 'both' };
    } else if (cur && k.length) { k = k.map((f) => Object.assign({}, f)); if ('opacity' in k[0]) k[0].opacity = cur.opacity; if ('transform' in k[0]) k[0].transform = cur.transform; }
    const a = el.animate(k, o); a._lg = true; return a;
  };

  /* shared-geometry move (tab indicator, segmented thumb): FLIP from current to target rect */
  LG.move = function (el, target, spring) {
    const s = spring || SPR.morph;
    const cur = el.getBoundingClientRect();
    const first = cur.width ? cur : target;
    el.style.left = target.x + 'px'; el.style.top = target.y + 'px'; el.style.width = target.w + 'px'; el.style.height = target.h + 'px';
    const last = el.getBoundingClientRect();
    const dx = first.left - last.left, dy = first.top - last.top, sx = first.width / (last.width || 1), sy = first.height / (last.height || 1);
    if (LG.reducedMotion() || (Math.abs(dx) < .5 && Math.abs(sx - 1) < .01)) return null;
    // squash a little mid-flight like liquid (§9.2 morph)
    return LG.anim(el, [
      { transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})`, transformOrigin: '0 0' },
      { transform: 'none', transformOrigin: '0 0' },
    ], { duration: s.duration, easing: s.easing });
  };

  /* pop from source (menus, popovers): grows out of the trigger (§7.5, §9.2) */
  LG.pop = function (el, trigger, open) {
    const t = trigger.getBoundingClientRect();
    const ox = (t.left + t.width / 2) - el.offsetLeft, oy = (t.top + t.height / 2) - el.offsetTop; // offset geometry ignores in-flight transforms
    el.style.transformOrigin = ox + 'px ' + oy + 'px';
    if (open) {
      el.hidden = false; el.dataset.open = 'true';
      return LG.anim(el, [{ opacity: 0, transform: 'scale(.55)' }, { opacity: 1, transform: 'scale(1)' }], { duration: SPR.pop.duration, easing: SPR.pop.easing, fadeFrom: 0 });
    }
    el.dataset.open = 'false';
    const a = LG.anim(el, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.7)' }], { duration: 180, easing: 'ease-out', fadeFrom: 1 });
    a.onfinish = () => { if (el.dataset.open === 'false') el.hidden = true; };
    return a;
  };

  /* ---------- T2 lens: generated bezel displacement map (MASTER §4) ---------- */
  const isChromium = () => {
    const b = navigator.userAgentData && navigator.userAgentData.brands;
    if (b) return b.some((x) => /Chromium|Google Chrome|Microsoft Edge/.test(x.brand));
    return /Chrom(e|ium)\//.test(navigator.userAgent) && !/Edg\//.test(navigator.userAgent) ? true : /Edg\//.test(navigator.userAgent);
  };
  LG.lensSupported = () => isChromium() && !LG.reducedTransparency() && !root.hasAttribute('data-lg-contrast') && LG.prefs.lens !== false;

  function mapURL(W, H, R, bezel) {
    const c = doc.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'), im = x.createImageData(W, H), d = im.data, n = 1.5;
    const prof = (t) => { if (t <= 0) return 1; if (t >= 1) return 0; const s = (1 - t) / Math.sqrt(1 - (1 - t) * (1 - t)); const th = Math.atan(s * 0.5); return Math.tan(th - Math.asin(Math.sin(th) / n)) / 1.12; };
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const px = i + .5 - W / 2, py = j + .5 - H / 2, qx = Math.abs(px) - (W / 2 - R), qy = Math.abs(py) - (H / 2 - R);
      const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R, dep = -sd; let ox, oy;
      if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy) || 1; ox = Math.sign(px) * qx / l; oy = Math.sign(py) * qy / l; }
      else if (qx > qy) { ox = Math.sign(px); oy = 0; } else { ox = 0; oy = Math.sign(py); }
      const m = prof(Math.max(0, Math.min(1, dep / bezel))), k = (j * W + i) * 4;
      d[k] = 128 - ox * m * 127; d[k + 1] = 128 - oy * m * 127; d[k + 2] = 128; d[k + 3] = 255;
    }
    x.putImageData(im, 0, 0); return c.toDataURL();
  }
  function svgHost() {
    let s = doc.getElementById('lg-defs');
    if (!s) { s = doc.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.id = 'lg-defs'; s.setAttribute('width', '0'); s.setAttribute('height', '0'); s.setAttribute('aria-hidden', 'true'); s.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'; s.appendChild(doc.createElementNS('http://www.w3.org/2000/svg', 'defs')); doc.body.prepend(s); }
    return s.firstChild;
  }
  const chan = (r, g, b) => `${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`;
  LG.lens = function (el, opts) {
    opts = Object.assign({ bezel: 0.38, disp: 15, aberration: 0.07, blur: 7 }, opts);
    const cs = getComputedStyle(el), W = Math.round(el.offsetWidth), H = Math.round(el.offsetHeight);
    if (!W || !H) return;
    const R = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, W / 2, H / 2);
    const key = W + 'x' + H + 'r' + R; let rec = LG._lens.get(el);
    if (rec && rec.key === key) return;
    const id = rec ? rec.id : 'lg-lens-' + (++LG._id);
    const bezel = Math.max(6, Math.min(W, H) * opts.bezel);
    const S = opts.disp * 2;
    const url = mapURL(W, H, R, bezel);
    let f = doc.getElementById(id); if (f) f.remove();
    const NS = 'http://www.w3.org/2000/svg';
    f = doc.createElementNS(NS, 'filter'); f.id = id;
    ['x', 'y'].forEach((a) => f.setAttribute(a, '0')); f.setAttribute('width', W); f.setAttribute('height', H);
    f.setAttribute('filterUnits', 'userSpaceOnUse'); f.setAttribute('primitiveUnits', 'userSpaceOnUse'); f.setAttribute('color-interpolation-filters', 'sRGB');
    const a = opts.aberration;
    f.innerHTML = `<feImage href="${url}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" result="m"/>
      <feDisplacementMap in="SourceGraphic" in2="m" scale="${S}" xChannelSelector="R" yChannelSelector="G" result="dr"/>
      <feDisplacementMap in="SourceGraphic" in2="m" scale="${S * (1 - a)}" xChannelSelector="R" yChannelSelector="G" result="dg"/>
      <feDisplacementMap in="SourceGraphic" in2="m" scale="${S * (1 - 2 * a)}" xChannelSelector="R" yChannelSelector="G" result="db"/>
      <feColorMatrix in="dr" type="matrix" values="${chan(1, 0, 0)}" result="r"/>
      <feColorMatrix in="dg" type="matrix" values="${chan(0, 1, 0)}" result="g"/>
      <feColorMatrix in="db" type="matrix" values="${chan(0, 0, 1)}" result="b"/>
      <feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen" result="rgb"/>
      <feGaussianBlur in="rgb" stdDeviation="${opts.blur}"/>`;
    svgHost().appendChild(f);
    el.style.setProperty('--lg-lens-filter', `url(#${id}) saturate(var(--lg-sat)) brightness(1.04)`);
    el.setAttribute('data-lg-lens', '');
    LG._lens.set(el, { key, id, opts });
  };
  LG.unlens = function (el) { const r = LG._lens.get(el); if (r) { const f = doc.getElementById(r.id); f && f.remove(); LG._lens.delete(el); } el.removeAttribute('data-lg-lens'); el.style.removeProperty('--lg-lens-filter'); };

  /* ---------- adaptive tone: small glass flips light/dark with what is behind (MASTER §3.3) ---------- */
  const lumaCache = new WeakMap();
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  function rasterise(el) { // svg/img content → small luminance grid, cached
    if (lumaCache.has(el)) return lumaCache.get(el);
    const rec = { grid: null, w: 0, h: 0, ready: false }; lumaCache.set(el, rec);
    const draw = (img) => { const w = 48, h = Math.max(8, Math.round(48 * el.getBoundingClientRect().height / Math.max(1, el.getBoundingClientRect().width))); const c = doc.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h); const d = x.getImageData(0, 0, w, h).data; const g = new Float32Array(w * h); for (let i = 0; i < w * h; i++) g[i] = L(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); rec.grid = g; rec.w = w; rec.h = h; rec.ready = true; LG.tone(); };
    try {
      if (el.tagName.toLowerCase() === 'svg') { const s = new XMLSerializer().serializeToString(el); const im = new Image(); im.onload = () => draw(im); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s); }
      else if (el.tagName === 'IMG') { if (el.complete) draw(el); else el.onload = () => draw(el); }
    } catch (e) {}
    return rec;
  }
  function lumaAt(rect) { // average relative luminance behind a rect, from the topmost sampled content
    const pts = [[.5, .5], [.2, .5], [.8, .5], [.5, .2], [.5, .8]]; let sum = 0, n = 0;
    for (const [fx, fy] of pts) {
      const x = rect.left + rect.width * fx, y = rect.top + rect.height * fy;
      const stack = doc.elementsFromPoint(x, y);
      for (const e of stack) {
        if (e.closest('[data-glass],.lg-edge,[data-lg-ignore]')) continue;
        const src = e.closest('[data-luma-source]');
        if (src) {
          const rec = rasterise(src.tagName.toLowerCase() === 'svg' ? src : (src.querySelector('svg,img') || src)), sr = (src.querySelector('svg,img') || src).getBoundingClientRect();
          if (rec.ready) { const gx = Math.max(0, Math.min(rec.w - 1, Math.floor((x - sr.left) / sr.width * rec.w))), gy = Math.max(0, Math.min(rec.h - 1, Math.floor((y - sr.top) / sr.height * rec.h))); sum += rec.grid[gy * rec.w + gx]; n++; break; }
        }
        const bg = getComputedStyle(e).backgroundColor, m = bg.match(/rgba?\(([^)]+)\)/);
        if (m) { const p = m[1].split(/[ ,\/]+/).map(Number); const a = p.length > 3 ? p[3] : 1; if (a > 0.6) { sum += L(p[0], p[1], p[2]); n++; break; } }
      }
    }
    return n ? sum / n : 0.5;
  }
  // Tone model (MASTER §3.3): choose the ink whose contrast against the TINTED backdrop is higher.
  // Derived from the audit (G5): the flip point is ~0.10 backdrop luminance, not the 0.18-0.34 first guessed;
  // saturated mid-luminance colours (red ≈0.2) need DARK ink.
  const TINT = { light: { a: 0.34, L: 0.011, ink: 0.93 }, dark: { a: 0.32, L: 1, ink: 0.005 } };
  const contrastFor = (tone, Lb) => { const t = TINT[tone]; const bg = Lb * (1 - t.a) + t.L * t.a; return (Math.max(bg, t.ink) + 0.05) / (Math.min(bg, t.ink) + 0.05); };
  LG.toneFor = (Lb, cur) => { const cl = contrastFor('light', Lb), cd = contrastFor('dark', Lb); if (!cur) return cl >= cd ? 'light' : 'dark'; return cur === 'light' ? (cd > cl * 1.15 ? 'dark' : 'light') : (cl > cd * 1.15 ? 'light' : 'dark'); };
  LG.DWELL = .5; LG.COOLDOWN = 1;
  LG.tone = function () {
    doc.querySelectorAll('[data-glass][data-adaptive]').forEach((el) => {
      if (el.hasAttribute('data-prominent')) return;
      // owner rule (master §3.8): switch only after the new state held for DWELL, then a COOLDOWN; CSS fades the change
      const l = lumaAt(el.getBoundingClientRect()), cur = el.dataset.tone, want = LG.toneFor(l, cur), t = performance.now() / 1000;
      el.dataset.luma = l.toFixed(2);
      if (!cur) { el.dataset.tone = want; el._lgLast = t; return; }
      if (want === cur) { el._lgPend = null; return; }
      if (el._lgPend !== want) { el._lgPend = want; el._lgPendT = t; setTimeout(LG.tone, LG.DWELL * 1000 + 30); return; }
      if (t - el._lgPendT >= LG.DWELL && t - (el._lgLast || 0) >= LG.COOLDOWN) { el.dataset.tone = want; el._lgLast = t; el._lgPend = null; }
    });
  };

  /* ---------- press + glow: delegated, touch gets full effect, pointer a subdued one (§9.1) ---------- */
  function pressStart(e) {
    const el = e.target.closest('[data-press]'); if (!el || el.hasAttribute('aria-disabled')) return;
    const r = el.getBoundingClientRect(); const g = el.closest('[data-glass]') || el;
    g.style.setProperty('--gx', (e.clientX - g.getBoundingClientRect().left) + 'px'); g.style.setProperty('--gy', (e.clientY - g.getBoundingClientRect().top) + 'px');
    if (!LG.reducedMotion()) { el.classList.add('is-pressed'); g.classList.add('is-glow'); }
    const end = () => { el.classList.remove('is-pressed'); g.classList.remove('is-glow'); ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => el.removeEventListener(t, end)); };
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => el.addEventListener(t, end));
  }

  /* ---------- scroll-aware bar minimise (§7.1, §9.4) ---------- */
  LG.minimiseOnScroll = function (bar) {
    let last = scrollY, acc = 0;
    addEventListener('scroll', () => {
      const y = scrollY, d = y - last; last = y; acc = Math.sign(d) === Math.sign(acc) ? acc + d : d;
      if (y < 8) { bar.dataset.min = 'false'; return; }
      if (acc > 24) bar.dataset.min = 'true'; else if (acc < -12) bar.dataset.min = 'false';
    }, { passive: true });
  };

  LG.refresh = function () {
    const lensOn = LG.lensSupported();
    doc.querySelectorAll('[data-glass][data-lens]').forEach((el) => lensOn ? LG.lens(el, el._lensOpts) : LG.unlens(el));
    root.setAttribute('data-lg-tier', LG.reducedTransparency() || root.hasAttribute('data-lg-contrast') ? '0' : (lensOn ? '2' : '1'));
    LG.tone();
  };

  LG.init = function (opts) {
    opts = opts || {};
    if (!root.hasAttribute('data-lg-scheme')) root.setAttribute('data-lg-scheme', mm('(prefers-color-scheme: dark)') ? 'dark' : 'light');
    if (mm('(prefers-contrast: more)')) root.setAttribute('data-lg-contrast', 'more');
    doc.addEventListener('pointerdown', pressStart, { passive: true });
    let t; const rs = () => { cancelAnimationFrame(t); t = requestAnimationFrame(LG.refresh); };
    addEventListener('resize', rs); addEventListener('scroll', () => { cancelAnimationFrame(t); t = requestAnimationFrame(LG.tone); }, { passive: true });
    if ('ResizeObserver' in global) { const ro = new ResizeObserver(rs); doc.querySelectorAll('[data-glass][data-lens]').forEach((e) => ro.observe(e)); }
    ['(prefers-reduced-transparency: reduce)', '(prefers-reduced-motion: reduce)', '(prefers-contrast: more)', '(prefers-color-scheme: dark)'].forEach((q) => { try { matchMedia(q).addEventListener('change', LG.refresh); } catch (e) {} });
    LG.refresh();
    return LG;
  };
  global.LG = LG;
})(window);
