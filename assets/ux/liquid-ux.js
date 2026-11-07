/* liquid-ux.js — Apple-style interaction runtime for the web (liquid-glass-ui-ux skill). No dependencies.
 * Rules and sources: references/ux.md. Every behaviour here follows Apple's fluid-interface principles:
 * respond instantly, track 1:1, stay interruptible, project momentum, rubber-band soft edges, springs (duration + bounce).
 *
 *   LUX.init({ autoPress: true, haptics: true })
 *   LUX.press        delegated press feedback for [data-press] (and every button/link/[role=button] with autoPress)
 *   LUX.sheet(opts)  a card that rises over the current page instead of navigating away (detents, drag, projection)
 *   LUX.overscroll(scroller, { content, onRefresh })   rubber-band edges + optional pull-to-refresh
 *   LUX.load(el, promise, { skeleton, render, delay, minShow })   skeleton without flash, then crossfade
 *   LUX.swipe(row, { actions })   swipe actions on list rows
 *   LUX.context(el, { items })    touch-and-hold / right-click context menu with a lifted preview
 *   LUX.haptic(type)   light | medium | heavy | selection | success | warning | error (no-op where unsupported)
 *   LUX.toast(text, { action, onAction })   non-blocking feedback with optional Undo
 *   LUX.spring, LUX.rubber, LUX.project      the physics, exported
 */
(function (global) {
  'use strict';
  const doc = document, root = doc.documentElement;
  const mq = (q) => global.matchMedia && global.matchMedia(q).matches;
  const RM = () => mq('(prefers-reduced-motion: reduce)');
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const LUX = { opts: { autoPress: true, haptics: true }, _sheets: [] };

  /* =============================== idiom: feel like the Apple app for THIS device =============================== */
  // phone  = iPhone patterns (compact width, touch): tab bar, rising sheets with detents, 17pt text, 44pt targets, haptics
  // tablet = iPad patterns (regular width, touch): sidebar or top tab bar, form sheets / popovers, touch physics
  // mac    = Mac patterns (wide, fine pointer + keyboard): sidebar + uniform toolbar, inline detail instead of modals,
  //          13pt text, 28pt controls, hover states, right-click menus, keyboard shortcuts, no haptics, no squash on click
  LUX.idiom = function () {
    const w = global.innerWidth, fine = mq('(pointer: fine)') && mq('(hover: hover)'), coarse = mq('(pointer: coarse)');
    const forced = root.getAttribute('data-idiom-force'); if (forced) return forced;
    if (w < 700) return 'phone'; if (fine && w >= 900) return 'mac'; return coarse || !fine ? 'tablet' : 'mac';
  };
  const setIdiom = () => { const i = LUX.idiom(); if (root.dataset.idiom !== i) { root.dataset.idiom = i; global.dispatchEvent(new CustomEvent('lux:idiom', { detail: i })); } };
  LUX.isTouchIdiom = () => LUX.idiom() !== 'mac';

  /* =============================== physics =============================== */
  // Apple (WWDC23 Animate with springs): stiffness = (2π/duration)², damping ratio ζ = 1 − bounce (bounce ≥ 0), mass 1.
  // Defaults: bounce 0. Add bounce (≤ .3) only when a gesture with momentum ends the motion.
  LUX.springParams = (duration = .5, bounce = 0) => { const w = 2 * Math.PI / duration; const z = bounce >= 0 ? 1 - bounce : 1 / (1 + bounce); return { k: w * w, c: 2 * z * w }; };
  // Animate a value with a spring, starting from any velocity (units/s). Interruptible: returns a handle with stop().
  LUX.spring = function (from, to, opts, onUpdate, onDone) {
    opts = opts || {}; const { k, c } = LUX.springParams(opts.duration ?? .5, opts.bounce ?? 0);
    let x = from, v = opts.velocity || 0, alive = true, last = performance.now(), raf;
    if (RM() || opts.instant) { onUpdate(to, 0); onDone && onDone(); return { stop() {}, get value() { return to; }, get velocity() { return 0; } }; }
    const step = (t) => { if (!alive) return; let dt = Math.min(.05, (t - last) / 1000); last = t; const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
      for (let i = 0; i < n; i++) { const a = -k * (x - to) - c * v; v += a * h; x += v * h; }
      const done = Math.abs(x - to) < (opts.epsilon ?? .3) && Math.abs(v) < (opts.vEpsilon ?? 8);
      if (done) { x = to; v = 0; } onUpdate(x, v); if (done) { alive = false; onDone && onDone(); } else raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return { stop() { alive = false; cancelAnimationFrame(raf); }, get value() { return x; }, get velocity() { return v; } };
  };
  // Rubber band (the elastic edge people expect from iOS scroll views): resistance grows with distance; never a hard stop.
  LUX.rubber = (overshoot, dim, c = .55) => { const s = Math.sign(overshoot), x = Math.abs(overshoot); return s * (1 - 1 / ((x * c / dim) + 1)) * dim; };
  // Momentum projection (WWDC18 sample code): where a thrown object would come to rest. rate .998 = normal deceleration.
  LUX.project = (velocityPxPerS, rate = .998) => (velocityPxPerS / 1000) * rate / (1 - rate);
  // Velocity from pointer history (last ~80ms), not just the last two events.
  function tracker() { const h = []; return { add(x, y) { const t = performance.now(); h.push({ x, y, t }); while (h.length > 2 && t - h[0].t > 80) h.shift(); },
    vel() { if (h.length < 2) return { x: 0, y: 0 }; const a = h[0], b = h[h.length - 1], dt = Math.max(1, b.t - a.t) / 1000; return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt }; }, reset() { h.length = 0; } }; }
  LUX.tracker = tracker;
  const SLOP = 10; // Apple: hysteresis is "usually 10 points"

  /* =============================== haptics =============================== */
  // Apple's patterns by meaning. Web: navigator.vibrate exists on Android Chrome; iOS Safari has no web haptics (silent no-op).
  const HAP = { light: [8], medium: [14], heavy: [22], soft: [6], rigid: [10], selection: [4], success: [10, 60, 14], warning: [16, 80, 16], error: [12, 50, 12, 50, 18] };
  LUX.haptic = (type) => { if (!LUX.opts.haptics || LUX.idiom() === 'mac') return; try { if (navigator.vibrate) navigator.vibrate(HAP[type] || HAP.light); } catch (e) {} };

  /* =============================== press feedback (everything touchable) =============================== */
  // Highlight on touch-down, confirm on touch-up, cancel by moving off or past the slop; no delay; keyboard gets the same.
  const PRESS_SEL = '[data-press], button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="switch"], summary, label[for], input[type="checkbox"], input[type="radio"]';
  let pressed = null;
  function pressStart(e) {
    if (e.button > 0) return; const el = e.target.closest(LUX.opts.autoPress ? PRESS_SEL : '[data-press]'); if (!el || el.closest('[data-press="off"]')) return;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') { nudge(el); return; }   // indicate when an action is not available
    pressed = { el, x: e.clientX, y: e.clientY, id: e.pointerId }; el.setAttribute('data-pressed', ''); el.style.setProperty('--lux-px', (e.clientX - el.getBoundingClientRect().left) + 'px'); el.style.setProperty('--lux-py', (e.clientY - el.getBoundingClientRect().top) + 'px');
  }
  function pressMove(e) { if (!pressed || e.pointerId !== pressed.id) return; if (Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) > SLOP * 1.5) pressEnd(); }
  function pressEnd() { if (!pressed) return; pressed.el.removeAttribute('data-pressed'); pressed = null; }
  function nudge(el) { if (RM()) return; el.animate([{ translate: '0' }, { translate: '-4px' }, { translate: '4px' }, { translate: '-2px' }, { translate: '0' }], { duration: 260, easing: 'ease-out' }); LUX.haptic('rigid'); }
  LUX.nudge = nudge;

  /* =============================== overscroll: rubber-band edges + pull to refresh =============================== */
  // scroller: element that scrolls (or window). content: element to stretch (translateY). Native bounce (iOS Safari) is left alone.
  // gestures that start on overlays or fixed chrome (sheets, menus, glass bars) belong to them, not to the page's edge
  const FOREIGN = '.lux-sheet, .lux-backdrop, .lux-ctx-layer, .lux-toast, [role="dialog"], [data-gl]:not([data-layer="content"] [data-gl]), [data-lux-chrome]';
  LUX.overscroll = function (scroller, o) {
    o = o || {}; const isWin = scroller === global || scroller === doc.scrollingElement || scroller === doc.body;
    const sc = isWin ? doc.scrollingElement : scroller, content = o.content || (isWin ? doc.body : scroller.firstElementChild); content.setAttribute('data-lux-overscroll', '');   // lets tests find the stretching layer
    const nativeBounce = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const dim = () => (isWin ? innerHeight : sc.clientHeight);
    let off = 0, anim = null, touch = null, wheelT = 0, refreshing = false, armed = false;
    const TH = o.threshold || 70;   // pull distance (after rubber banding) that arms a refresh
    const atTop = () => sc.scrollTop <= 0, atBottom = () => Math.ceil(sc.scrollTop + (isWin ? innerHeight : sc.clientHeight)) >= sc.scrollHeight - 1;
    const spinner = o.onRefresh ? (() => { const s = doc.createElement('div'); s.className = 'lux-refresh'; s.setAttribute('role', 'status'); s.setAttribute('aria-label', 'Refreshing'); s.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>'; (o.spinnerHost || (isWin ? doc.body : scroller)).prepend(s); return s; })() : null;
    const apply = (y) => { off = y; content.style.translate = y ? `0 ${y}px` : ''; if (o.onOffset) o.onOffset(y);
      if (spinner) { const p = clamp(y / TH, 0, 1); spinner.style.opacity = String(y > 4 ? Math.min(1, p * 1.4) : 0); spinner.style.setProperty('--p', p); spinner.toggleAttribute('data-spin', refreshing); if (!refreshing && o.onRefresh) { const a = y >= TH; if (a && !armed) LUX.haptic('light'); armed = a; } } };
    const settle = (vel) => { anim && anim.stop(); const target = refreshing ? TH * .8 : 0; anim = LUX.spring(off, target, { duration: .5, bounce: 0, velocity: vel || 0 }, (y) => apply(y)); };
    const release = (vel) => { if (o.onRefresh && armed && !refreshing && off > 0) { refreshing = true; armed = false; LUX.haptic('medium'); Promise.resolve(o.onRefresh()).finally(() => { refreshing = false; settle(0); }); } settle(vel); };
    // touch (Android, desktop touch). iOS keeps its native bounce.
    if (!nativeBounce) {
      sc.style.overscrollBehaviorY = 'none';   // replace the browser glow/stretch with the elastic edge
      const tgt = isWin ? global : scroller; const tr = tracker();
      tgt.addEventListener('touchstart', (e) => { if (e.touches.length !== 1 || (e.target.closest && e.target.closest(FOREIGN))) { touch = null; return; } anim && anim.stop(); tr.reset(); touch = { y0: e.touches[0].clientY, base: off, raw: 0, edge: null }; tr.add(0, e.touches[0].clientY); }, { passive: true });
      tgt.addEventListener('touchmove', (e) => { if (!touch) return; const y = e.touches[0].clientY, dy = y - touch.y0; tr.add(0, y);
        if (!touch.edge) { if (dy > 0 && atTop()) touch.edge = 'top'; else if (dy < 0 && atBottom()) touch.edge = 'bottom'; else return; touch.y0 = y - (touch.base ? 0 : 0); touch.start = y; }
        const raw = y - touch.start + (touch.baseRaw || 0); if ((touch.edge === 'top' && raw < 0) || (touch.edge === 'bottom' && raw > 0)) { apply(0); touch.edge = null; return; }
        if (e.cancelable) e.preventDefault(); apply(LUX.rubber(raw, dim())); }, { passive: false });
      tgt.addEventListener('touchend', () => { if (!touch) return; const v = tr.vel().y; touch = null; if (off) release(v * .2); }, { passive: true });
      tgt.addEventListener('touchcancel', () => { touch = null; if (off) release(0); }, { passive: true });
    }
    // wheel / trackpad at an edge: stretch, then spring back when the gesture pauses
    let wraw = 0; (isWin ? global : scroller).addEventListener('wheel', (e) => { if (e.target.closest && e.target.closest(FOREIGN)) return;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      if (!(dy < 0 && atTop()) && !(dy > 0 && atBottom()) && !wraw) return;
      if (e.cancelable && (wraw || (dy < 0 && atTop()) || (dy > 0 && atBottom()))) e.preventDefault();
      anim && anim.stop(); wraw = clamp(wraw - dy * .5, -dim(), dim()); if ((off > 0 && wraw < 0) || (off < 0 && wraw > 0)) wraw = 0; apply(LUX.rubber(wraw, dim()));
      clearTimeout(wheelT); wheelT = setTimeout(() => { wraw = 0; release(0); }, 140);
    }, { passive: false });
    return { get offset() { return off; }, refresh: () => { if (o.onRefresh && !refreshing) { armed = true; apply(TH); release(0); } } };
  };

  /* =============================== skeleton loading =============================== */
  // Apple: show something as soon as possible; never a blank screen. Web rule: don't flash a skeleton for fast loads
  // (show only after `delay`), and once shown keep it at least `minShow` so it does not flicker; then crossfade.
  LUX.load = function (el, promise, o) {
    o = Object.assign({ delay: 120, minShow: 350, fade: 180 }, o || {}); let shownAt = 0, done = false;
    const showSk = () => { if (done) return; el.innerHTML = typeof o.skeleton === 'function' ? o.skeleton() : (o.skeleton || LUX.skeleton.lines(3)); el.setAttribute('aria-busy', 'true'); shownAt = performance.now(); };
    const t = o.delay <= 0 ? (showSk(), 0) : setTimeout(showSk, o.delay);
    return Promise.resolve(promise).then((data) => new Promise((res) => {
      const finish = () => { done = true; clearTimeout(t); el.removeAttribute('aria-busy'); el.innerHTML = o.render ? o.render(data) : String(data); if (shownAt && !RM()) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: o.fade, easing: 'ease-out' }); res(data); };
      const wait = shownAt ? Math.max(0, o.minShow - (performance.now() - shownAt)) : 0; wait ? setTimeout(finish, wait) : finish();
    }), (err) => { done = true; clearTimeout(t); el.removeAttribute('aria-busy'); el.innerHTML = o.error ? o.error(err) : '<p class="lux-error">Couldn’t load this. Check your connection and try again.</p>'; throw err; });
  };
  LUX.skeleton = {
    lines: (n = 3, w = [92, 76, 58]) => Array.from({ length: n }, (_, i) => `<span class="lux-sk lux-sk-line" style="width:${w[i % w.length]}%"></span>`).join(''),
    block: (h = 160, r = 16) => `<span class="lux-sk" style="height:${h}px;border-radius:${r}px"></span>`,
    row: (thumb = 44) => `<span class="lux-sk-row"><span class="lux-sk" style="width:${thumb}px;height:${thumb}px;border-radius:10px"></span><span class="lux-sk-col">${'<span class="lux-sk lux-sk-line" style="width:70%"></span><span class="lux-sk lux-sk-line" style="width:40%"></span>'}</span></span>`
  };

  /* =============================== sheet: a card that rises over the page =============================== */
  // Use instead of navigating to a new page when the task or entity detail is scoped and the person will come back
  // (references/ux.md §2). Grows out of its source, rests at detents, follows the finger 1:1, projects the throw,
  // rubber-bands past the top, hands off to its own scroll, closes by swipe, Close button, backdrop or Escape.
  LUX.sheet = function (o) {
    o = Object.assign({ detents: ['medium', 'large'], start: null, title: '', closeLabel: 'Close', glass: true, onClose: null, inert: null }, o || {});
    const idiom = LUX.idiom(), compact = () => idiom === 'phone';
    const H = () => innerHeight, topInset = () => Math.max(10, (parseFloat(getComputedStyle(root).getPropertyValue('--lux-top')) || 0)) + (compact() ? 10 : 0);
    const detentY = (d) => { const h = H(); if (!compact()) return Math.max(24, h * .1); if (d === 'large') return topInset() + 14; if (d === 'medium') return Math.round(h * .5); return typeof d === 'number' ? h - d : h * .5; };
    const backdrop = doc.createElement('div'); backdrop.className = 'lux-backdrop';
    const el = doc.createElement('section'); el.className = 'lux-sheet' + (compact() ? '' : ' lux-sheet-wide'); el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); if (o.title || o.label) el.setAttribute('aria-label', o.title || o.label);   // label: accessible name when the content carries its own heading
    if (o.glass) { el.setAttribute('data-gl', ''); el.dataset.role = 'surface'; }
    el.dataset.idiom = idiom;
    // iPhone/iPad: grabber + title + Close (X) at top trailing. Mac: title at top, buttons at bottom trailing (Done = default, Return).
    el.innerHTML = idiom === 'mac'
      ? `<header class="lux-sheet-h"><h2 class="lux-sheet-t">${o.title || ''}</h2></header><div class="lux-sheet-b"></div><footer class="lux-sheet-f">${(o.actions || [{ label: 'Done', primary: true }]).map((a, i) => `<button data-a="${i}" class="${a.primary ? 'lux-primary' : ''}">${a.label}</button>`).join('')}</footer><button class="lux-close lux-sr" aria-label="${o.closeLabel}"></button>`
      : `<div class="lux-grab" role="button" tabindex="0" aria-label="Resize"></div><header class="lux-sheet-h"><h2 class="lux-sheet-t">${o.title || ''}</h2><button class="lux-close" aria-label="${o.closeLabel}"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button></header><div class="lux-sheet-b"></div>`;
    const body = el.querySelector('.lux-sheet-b'); if (o.content instanceof Node) body.append(o.content); else if (o.content) body.innerHTML = o.content;
    LUX._sheets.forEach((s) => s.close(true)); doc.body.append(backdrop, el); LUX._sheets = [api()]; root.classList.add('lux-sheet-open');   // one sheet at a time
    const inertEl = o.inert === null ? doc.querySelector('main, [data-lux-page]') : o.inert; if (inertEl) inertEl.inert = true;
    const page = doc.querySelector('[data-lux-page]');   // optional: the page behind recedes like iOS's card stack
    const prevFocus = (o.source && o.source.focus) ? o.source : doc.activeElement;   // iOS does not focus tapped buttons; return to the item that opened it
    let y = H(), anim = null, cur = o.start || o.detents[0], closing = false;
    const sheetH = () => (compact() ? H() - detentY('large') + 40 : Math.min(H() * .8, o.height || 640));
    el.style.height = sheetH() + 'px';
    const render = (yy) => {
      y = yy; const top = compact() ? yy : yy; el.style.translate = compact() ? `0 ${top}px` : `-50% ${top}px`;
      const m = detentY(o.detents[0]), L = detentY('large'), p = clamp((H() - yy) / (H() - L), 0, 1), full = clamp((m - yy) / Math.max(1, m - L), 0, 1);
      const dimV = compact() ? (.18 + .22 * full) * p : .4 * p;   // partial sheets keep context visible
      const G = global.LiquidGlass && global.LiquidGlass.instances && global.LiquidGlass.instances[0];
      if (G && G.webgl) { G.backdropDim = dimV; backdrop.style.opacity = '0'; } else backdrop.style.opacity = String(dimV);
      // The optical renderer paints all glass on one canvas BELOW the DOM, so DOM chrome under the sheet would show through it.
      // Anything the sheet covers ([data-gl] and [data-lux-chrome]) is hidden while covered: iOS draws the sheet above the tab bar.
      if (G && G.webgl) doc.querySelectorAll('[data-gl]:not(.lux-sheet):not(.lux-ctx):not(.lux-toast), [data-lux-chrome]').forEach((x) => { const r = x.getBoundingClientRect(); x.toggleAttribute('data-lux-covered', r.width > 0 && r.bottom > yy + 4); });
      el.style.setProperty('--lux-full', full.toFixed(3)); el.toggleAttribute('data-full', full > .98);
      if (page && compact() && !RM()) { const s = 1 - .06 * full; page.style.scale = String(s); page.style.borderRadius = (12 * full) + 'px'; page.style.overflow = full > .01 ? 'hidden' : ''; }
      if (o.onProgress) o.onProgress({ y: yy, open: p, full });
    };
    const to = (target, vel, bounce) => { anim && anim.stop(); anim = LUX.spring(y, target, { duration: bounce ? .45 : .5, bounce: bounce || 0, velocity: vel || 0 }, render, () => { if (closing) finishClose(); }); };
    // open: rise out of the source (tap = no bounce, Apple's Now Playing uses 100% damping)
    const src = o.source && o.source.getBoundingClientRect ? o.source.getBoundingClientRect() : null;
    render(H());
    if (idiom === 'mac' && !RM()) { el.animate([{ opacity: 0, scale: '.97' }, { opacity: 1, scale: '1' }], { duration: 220, easing: 'cubic-bezier(.2,.9,.25,1)' }); }
    else if (src && !RM()) { const r0 = el.getBoundingClientRect(); el.style.transformOrigin = `${src.left + src.width / 2 - r0.left}px 0`; el.animate([{ scale: String(Math.max(.25, src.width / r0.width)), opacity: .2 }, { scale: '1', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,.9,.25,1)' }); }
    requestAnimationFrame(() => to(detentY(cur), 0, 0));
    LUX.haptic('light');
    // drag: grabber/header anywhere; body only when it is scrolled to the top and the finger moves down (scroll handoff)
    const tr = tracker(); let drag = null;
    const down = (e) => { if (e.button > 0 || e.target.closest('.lux-close, input, textarea, select, [data-no-drag]')) return; const inBody = !!e.target.closest('.lux-sheet-b'); drag = { y0: e.clientY, x0: e.clientX, base: y, inBody, live: false, id: e.pointerId }; tr.reset(); tr.add(0, e.clientY); anim && anim.stop(); };
    const move = (e) => {
      if (!drag || e.pointerId !== drag.id) return; const dy = e.clientY - drag.y0; tr.add(0, e.clientY);
      if (!drag.live) { if (Math.abs(dy) < SLOP || Math.abs(e.clientX - drag.x0) > Math.abs(dy)) return;
        if (drag.inBody) { const atTop = body.scrollTop <= 0, canGrow = y > detentY('large') + 1; if (!((dy > 0 && atTop) || (dy < 0 && canGrow))) { drag = null; return; } }
        drag.live = true; drag.y0 = e.clientY; drag.base = y; el.setPointerCapture(e.pointerId); }
      let ny = drag.base + (e.clientY - drag.y0); const L = detentY(o.detents.includes('large') ? 'large' : o.detents[o.detents.length - 1]);
      if (ny < L) ny = L - LUX.rubber(L - ny, H());   // soft edge past the top detent
      render(ny); if (e.cancelable) e.preventDefault();
    };
    const up = (e) => {
      if (!drag) return; const was = drag; drag = null; if (!was.live) return; const v = tr.vel().y, proj = y + LUX.project(v, .99);
      const stops = o.detents.map(detentY), closeY = H() + 10; let best = null, bd = 1e9;
      [...stops, closeY].forEach((s) => { const d = Math.abs(proj - s); if (d < bd) { bd = d; best = s; } });
      if (best === closeY) { close(false, v); return; }
      cur = o.detents[stops.indexOf(best)]; LUX.haptic('selection'); to(best, v, Math.abs(v) > 600 ? .15 : 0);   // momentum earns a little bounce
    };
    if (idiom !== 'mac') el.addEventListener('pointerdown', down);   // Mac sheets are not dragged
    global.addEventListener('pointermove', move, { passive: false }); global.addEventListener('pointerup', up); global.addEventListener('pointercancel', up);
    // wide layouts: wheel/trackpad does not drag; backdrop click or Escape closes
    backdrop.addEventListener('click', () => close());
    el.querySelector('.lux-close').addEventListener('click', () => close());
    el.querySelectorAll('.lux-sheet-f button').forEach((b) => b.addEventListener('click', () => { const a = (o.actions || [{}])[+b.dataset.a] || {}; if (a.run) a.run(); close(); }));
    if (idiom === 'mac') el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.target.matches('textarea, button')) { const p = el.querySelector('.lux-primary'); p && p.click(); } });
    const grab = el.querySelector('.lux-grab') || doc.createElement('div'); grab.addEventListener('click', () => { const i = o.detents.indexOf(cur); cur = o.detents[(i + 1) % o.detents.length]; to(detentY(cur), 0, 0); });
    grab.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); grab.click(); } });
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } if (e.key === 'Tab') { const f = [...el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent); if (!f.length) return; const a = f[0], b = f[f.length - 1]; if (e.shiftKey && doc.activeElement === a) { e.preventDefault(); b.focus(); } else if (!e.shiftKey && doc.activeElement === b) { e.preventDefault(); a.focus(); } } };
    doc.addEventListener('keydown', key);
    setTimeout(() => (el.querySelector('[autofocus]') || el.querySelector('.lux-close')).focus({ preventScroll: true }), 30);
    if (global.LiquidGlass && global.LiquidGlass.instances) global.LiquidGlass.instances.forEach((g) => g.refresh());
    function close(instant, vel) {
      if (closing) return; if (o.confirmClose && !o.confirmClose()) { to(detentY(cur), 0, 0); return; }
      closing = true; LUX._sheets = LUX._sheets.filter((s) => s.el !== el); if (instant) return finishClose();
      to(H() + 20, vel || 0, 0);
    }
    function finishClose() {
      anim && anim.stop(); el.remove(); backdrop.remove(); doc.removeEventListener('keydown', key); global.removeEventListener('pointermove', move); global.removeEventListener('pointerup', up); global.removeEventListener('pointercancel', up);
      { const G = global.LiquidGlass && global.LiquidGlass.instances && global.LiquidGlass.instances[0]; if (G) G.backdropDim = 0; } root.classList.remove('lux-sheet-open'); doc.querySelectorAll('[data-lux-covered]').forEach((x) => x.removeAttribute('data-lux-covered'));
      if (inertEl) inertEl.inert = false; if (page) { page.style.scale = ''; page.style.borderRadius = ''; page.style.overflow = ''; }
      if (global.LiquidGlass && global.LiquidGlass.instances) global.LiquidGlass.instances.forEach((g) => g.refresh());
      if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true }); o.onClose && o.onClose();
    }
    function api() { return { el, body, close: (i) => close(i), detent: (d) => { cur = d; to(detentY(d), 0, 0); }, get detentName() { return cur; } }; }
    return api();
  };

  // present(): the right container per device. Mac/large displays: inline detail in the same window (fewer nested levels,
  // less modality — HIG Designing for macOS). iPhone: a sheet rising from the tapped item. iPad: a form sheet.
  LUX.present = function (o) { const i = LUX.idiom(); if (i === 'mac' && o.inline) return o.inline(); return LUX.sheet(o); };

  /* =============================== keyboard shortcuts (Mac first, iPad with keyboard) =============================== */
  // Standard meanings only (HIG Keyboards): ⌘F find, ⌘N new, ⌘, settings, ⌘W close, Esc cancel, ⌘[ back, ⌘Z undo.
  const isMacOS = /Mac|iPhone|iPad/.test(navigator.platform || '') || /Mac OS/.test(navigator.userAgent);
  LUX.shortcuts = function (map) {
    doc.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input, textarea, [contenteditable]') && !(e.metaKey || e.ctrlKey)) return;
      const mod = isMacOS ? e.metaKey : e.ctrlKey, k = (mod ? 'mod+' : '') + (e.shiftKey ? 'shift+' : '') + e.key.toLowerCase();
      const fn = map[k]; if (fn) { e.preventDefault(); fn(e); }
    });
    LUX.modLabel = isMacOS ? '⌘' : 'Ctrl+';
  };

  /* =============================== swipe actions on rows =============================== */
  // Horizontal drag reveals trailing actions; axis locks after the slop; full swipe runs the first action (offer Undo).
  LUX.swipe = function (row, o) {
    o = o || {}; const acts = o.actions || []; if (!acts.length) return;
    const wrap = doc.createElement('div'); wrap.className = 'lux-swipe-acts'; wrap.innerHTML = acts.map((a, i) => `<button data-i="${i}" class="${a.destructive ? 'lux-destructive' : ''}" aria-label="${a.label}">${a.icon || a.label}</button>`).join('');
    row.classList.add('lux-swipe'); row.append(wrap); const inner = row.querySelector('.lux-swipe-in') || row.firstElementChild;
    const W = () => acts.length * 74, tr = tracker(); let x = 0, d = null, anim = null;
    const set = (v) => { x = v; inner.style.translate = `${v}px 0`; wrap.style.setProperty('--w', Math.max(0, -v) + 'px'); };
    row.addEventListener('pointerdown', (e) => { if (e.target.closest('.lux-swipe-acts')) return; d = { x0: e.clientX, y0: e.clientY, base: x, live: false, id: e.pointerId }; tr.reset(); tr.add(e.clientX, 0); anim && anim.stop(); });
    row.addEventListener('pointermove', (e) => { if (!d || e.pointerId !== d.id) return; const dx = e.clientX - d.x0, dy = e.clientY - d.y0; tr.add(e.clientX, 0);
      if (!d.live) { if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) { d = null; return; } if (Math.abs(dx) < SLOP) return; d.live = true; d.x0 = e.clientX; row.setPointerCapture(e.pointerId); row.removeAttribute('data-pressed'); }
      let nx = d.base + (e.clientX - d.x0); if (nx > 0) nx = LUX.rubber(nx, row.offsetWidth); set(nx); });
    const end = () => { if (!d) return; const live = d.live; d = null; if (!live) return; const v = tr.vel().x, proj = x + LUX.project(v, .99);
      if (proj < -row.offsetWidth * .62 && acts[0]) { anim = LUX.spring(x, -row.offsetWidth, { duration: .3, velocity: v }, set, () => { acts[0].run && acts[0].run(row); }); LUX.haptic('medium'); return; }
      const target = proj < -W() / 2 ? -W() : 0; anim = LUX.spring(x, target, { duration: .45, velocity: v }, set); };
    row.addEventListener('pointerup', end); row.addEventListener('pointercancel', end);
    wrap.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const a = acts[+b.dataset.i]; anim = LUX.spring(x, 0, { duration: .4 }, set); a.run && a.run(row); });
    return { close: () => (anim = LUX.spring(x, 0, { duration: .4 }, set)) };
  };

  /* =============================== context menu: touch and hold / right click =============================== */
  function openMenu(el, o, px, py) {
      const lift = LUX.idiom() !== 'mac' && px !== undefined;   // only touch-and-hold lifts the item and dims the page
      LUX.haptic('medium'); const r = el.getBoundingClientRect(); const lay = doc.createElement('div'); lay.className = 'lux-ctx-layer' + (LUX.idiom() === 'mac' || px === undefined ? ' lux-ctx-mac' : '');   // only touch-and-hold dims and lifts
      const menu = doc.createElement('div'); menu.className = 'lux-ctx'; menu.setAttribute('role', 'menu'); if ((o.glass ?? LUX.idiom() !== 'mac') !== false) { menu.setAttribute('data-gl', '');   // Mac menus use the system's vibrant material (DOM), small and crisp
        menu.dataset.role = 'surface'; }
      const items = (o.items || []).filter((i) => !i.hidden);   // context menus hide unavailable items
      menu.innerHTML = items.map((it, i) => `<button role="menuitem" data-i="${i}" class="${it.destructive ? 'lux-destructive' : ''}">${it.label}${it.icon ? `<span aria-hidden="true">${it.icon}</span>` : ''}</button>`).join('');
      lay.append(menu); doc.body.append(lay); const mh = menu.offsetHeight, below = r.bottom + 10 + mh < innerHeight;
      menu.style.left = clamp(r.left, 12, innerWidth - menu.offsetWidth - 12) + 'px'; menu.style.top = (below ? r.bottom + 10 : Math.max(12, r.top - mh - 10)) + 'px';
      if (LUX.idiom() === 'mac' && px !== undefined) { menu.style.left = clamp(px, 8, innerWidth - menu.offsetWidth - 8) + 'px'; menu.style.top = clamp(py, 8, innerHeight - mh - 8) + 'px'; }   // Mac: menu opens at the pointer, no lift, no dim
      else if (!RM() && lift) { menu.style.transformOrigin = `${(px ?? r.left + r.width / 2) - parseFloat(menu.style.left)}px ${below ? 0 : mh}px`; menu.animate([{ scale: '.6', opacity: 0 }, { scale: '1', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.2,.9,.25,1.1)' }); el.animate([{ scale: '1' }, { scale: '1.03' }], { duration: 220, fill: 'forwards', easing: 'ease-out' }); }
      if (lift) el.classList.add('lux-lifted');
      const close = () => { lay.remove(); el.classList.remove('lux-lifted'); el.getAnimations().forEach((a) => a.cancel()); doc.removeEventListener('keydown', k); if (global.LiquidGlass && global.LiquidGlass.instances) global.LiquidGlass.instances.forEach((g) => g.refresh()); el.focus && el.focus({ preventScroll: true }); };
      const k = (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const b = [...menu.querySelectorAll('button')], i = b.indexOf(doc.activeElement); b[(i + (e.key === 'ArrowDown' ? 1 : -1) + b.length) % b.length].focus(); } };
      doc.addEventListener('keydown', k); lay.addEventListener('pointerdown', (e) => { if (!e.target.closest('.lux-ctx')) close(); });
      menu.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const it = items[+b.dataset.i]; close(); it.run && it.run(el); });
      if (global.LiquidGlass && global.LiquidGlass.instances) global.LiquidGlass.instances.forEach((g) => g.refresh());
      menu.querySelector('button') && menu.querySelector('button').focus({ preventScroll: true });
    }
  LUX.menu = (anchor, items) => openMenu(anchor, { items }, undefined, undefined);   // a pull-down menu from a control

  LUX.context = function (el, o) {
    o = o || {}; let timer = 0, start = null;
    const open = (px, py) => openMenu(el, o, px, py);
    el._luxMenu = open;
    el.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; start = { x: e.clientX, y: e.clientY }; clearTimeout(timer); timer = setTimeout(() => { start = null; el.removeAttribute('data-pressed'); open(e.clientX, e.clientY); el._luxSuppressClick = true; }, o.delay || 450); });
    el.addEventListener('pointermove', (e) => { if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP) { clearTimeout(timer); start = null; } });
    ['pointerup', 'pointercancel'].forEach((t) => el.addEventListener(t, () => { clearTimeout(timer); start = null; }));
    el.addEventListener('click', (e) => { if (el._luxSuppressClick) { el._luxSuppressClick = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); open(e.clientX, e.clientY); });
    el.addEventListener('keydown', (e) => { if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') { e.preventDefault(); open(); } });
  };

  /* =============================== toast with Undo =============================== */
  // Prefer Undo over a confirmation when the result is expected (Apple: don't warn when data loss is the expected result).
  LUX.toast = function (text, o) {
    o = o || {}; const t = doc.createElement('div'); t.className = 'lux-toast'; t.setAttribute('role', 'status'); if (o.glass !== false) { t.setAttribute('data-gl', ''); t.dataset.role = 'accessory'; }
    t.innerHTML = `<span>${text}</span>${o.action ? `<button>${o.action}</button>` : ''}`; doc.body.append(t);
    if (!RM()) t.animate([{ translate: '-50% 24px', opacity: 0 }, { translate: '-50% 0', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.2,.9,.25,1)' });
    if (global.LiquidGlass && global.LiquidGlass.instances) global.LiquidGlass.instances.forEach((g) => g.refresh());
    const done = () => { t.remove(); if (global.LiquidGlass && global.LiquidGlass.instances) global.LiquidGlass.instances.forEach((g) => g.refresh()); };
    const timer = setTimeout(done, o.duration || 5000);   // long enough to act; Undo also lives elsewhere (e.g. shake / edit menu)
    if (o.action) t.querySelector('button').addEventListener('click', () => { clearTimeout(timer); done(); o.onAction && o.onAction(); });
    return { close: done };
  };

  LUX.init = function (opts) {
    Object.assign(LUX.opts, opts || {});
    doc.addEventListener('pointerdown', pressStart, { passive: true }); doc.addEventListener('pointermove', pressMove, { passive: true });
    ['pointerup', 'pointercancel', 'dragstart'].forEach((t) => doc.addEventListener(t, pressEnd, { passive: true })); global.addEventListener('scroll', pressEnd, { passive: true, capture: true });
    doc.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && e.target.matches && e.target.matches(PRESS_SEL)) { e.target.setAttribute('data-pressed', ''); } });
    doc.addEventListener('keyup', (e) => { if (e.target.removeAttribute) e.target.removeAttribute('data-pressed'); });
    root.classList.add('lux'); setIdiom(); global.addEventListener('resize', setIdiom); try { global.matchMedia('(pointer: fine)').addEventListener('change', setIdiom); } catch (e) {}
    return LUX;
  };
  global.LUX = LUX;
})(window);
