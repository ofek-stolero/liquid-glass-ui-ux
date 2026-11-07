/* liquid-glass-gl.js — optical Liquid Glass renderer (tier T3). No dependencies. WebGL2.
 * Part of the liquid-glass-ui skill. Rules it enforces are in references/master.md §3.6–3.9.
 *
 *   <canvas> is created behind the page; your content layer is drawn into it by drawBackdrop(ctx, W, H, t).
 *   Every element with [data-gl] becomes a glass shape; the DOM keeps its text, icons, focus and accessibility.
 *
 *   data-gl                   marks a glass element (the element's box and border-radius are its shape)
 *   data-role="control|bar|surface|accessory|lens"   which effects it gets (see ROLES)
 *   data-group="1..3"         shapes in the same group may melt together, but ONLY while glass.morph(group, true)
 *   data-adapt="on"           opt in to light/dark ink adaptation (smooth, delayed, hysteretic)
 *
 *   const glass = LiquidGlass.mount({ drawBackdrop, scrollEdge, config });
 *   glass.morph(group, on)    allow melting for a group during a morph animation; switch off when it settles
 *   glass.level(el, v)        visibility 0..1 (lens shows only while moving; shrink-away items)
 *   glass.set(el, {dim, frost, press, glow, ...})   change an element's profile live (e.g. control -> surface)
 *   glass.scale(el, s)        app-driven scale, composed with the press squash
 *   glass.inkTowards(el, v)   drive ink 0 (light) .. 1 (dark) from a morph instead of the timer; null releases
 *   glass.reduceTransparency(on) · glass.transparency(0..1) · glass.debug() · glass.destroy()
 */
(function (global) {
  'use strict';
  const ROLES = {
    // refr: bend at the edge · disp: colour fringe · mag: magnifier · dim: darkening for text · frost: blur (px)
    control:   { thick: 16, dim: .12, frost: 0,   refr: .45, disp: 0,   mag: 1,    press: 1,  glow: 1, layer: 0, rimDark: 0 },   // icon buttons: clearest, interactive
    bar:       { thick: 16, dim: .16, frost: 0,   refr: .45, disp: 0,   mag: 1,    press: .5, glow: 1, layer: 0, rimDark: 0 },   // tab bar / toolbar: clear
    accessory: { thick: 14, dim: .28, frost: 2.5, refr: .42, disp: 0,   mag: 1,    press: 0,  glow: 0, layer: 0, rimDark: 0 },   // now playing: light text help
    surface:   { thick: 14, dim: .60, frost: 10,  refr: .40, disp: 0,   mag: 1,    press: 0,  glow: 0, layer: 0, rimDark: 0 },   // menus, popovers: text-heavy
    sidebar:   { thick: 12, dim: .34, frost: 6,   refr: .35, disp: 0,   mag: 1,    press: 0,  glow: 0, layer: 0, rimDark: 0 },   // Mac/iPad sidebar: edge to edge, more opaque (macOS 27)
    toolbar:   { thick: 12, dim: .22, frost: 4,   refr: .35, disp: 0,   mag: 1,    press: 0,  glow: 0, layer: 0, rimDark: 0 },   // Mac uniform toolbar band (macOS 27)
    lens:      { thick: 22, dim: 0,   frost: 0,   refr: 1.4, disp: 1.4, mag: 1.16, press: 0,  glow: 0, layer: 1, rimDark: .55 }  // selection bubble: glass over glass, only while moving
  };
  const CONFIG = {
    maxShapes: 10, mergeRadius: 18, bezelMax: 22, lensReach: 9,
    appearSpring: [90, 13],                 // ONE appear transition for every glass element (consistency)
    lightAngle: Math.atan2(.8, .6),         // light travels from the top-left
    sweepOnAppear: 1.3,                     // seconds the light takes once around the silhouette on appear (0 = off)
    dwell: .5, transition: .5, cooldown: 1, // adaptive ink: hold, fade, wait
    morphRamp: .12,                         // merge factor ramp time (s)
    maxDpr: 2, adaptiveResolution: true
  };
  const lin = (v) => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
  const spring = (x, v, t, k, c, dt) => { const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n; for (let i = 0; i < n; i++) { const a = -k * (x - t) - c * v; v += a * h; x += v * h; } return [x, v]; };   // sub-stepped: stable even for stiff springs at low frame rates

  function mount(opts) {
    opts = opts || {};
    const C = Object.assign({}, CONFIG, opts.config || {}), R0 = Object.assign({}, ROLES, opts.roles || {}), N = C.maxShapes;
    const doc = document, root = doc.documentElement, scope = opts.root || doc;
    const mq = (q) => global.matchMedia && global.matchMedia(q).matches;
    let RM = mq('(prefers-reduced-motion: reduce)'), RT = mq('(prefers-reduced-transparency: reduce)'), forceRT = false, tintAmt = 0;
    const cv = opts.canvas || doc.createElement('canvas');
    if (!opts.canvas) { cv.setAttribute('aria-hidden', 'true'); cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;z-index:0;pointer-events:none'; doc.body.prepend(cv); }
    const bgc = doc.createElement('canvas'), bx = bgc.getContext('2d', { willReadFrequently: true });
    const FS = `#version 300 es
precision highp float;
uniform sampler2D uBG; uniform vec2 uRes; uniform float uDpr; uniform int uN; uniform float uK; uniform vec2 uLdir;
uniform vec4 uBox[${N}];  // cx, cy, halfW, halfH
uniform vec4 uPar[${N}];  // radius, thickness, dim, glow
uniform vec4 uSt[${N}];   // appear, glowX, glowY, frost
uniform vec4 uOpt[${N}];  // refr, disp, mag, layer
uniform vec4 uGrp[${N}];  // group, mergeFactor (0 at rest: never merge), rimDark, -
uniform float uFlip; uniform float uSolid; uniform float uReach;   // uSolid: reduce transparency (0..1); uReach: max refraction reach (css px)
out vec4 o;
float sdb(vec2 p, vec4 b, float r){ vec2 q=abs(p-b.xy)-b.zw+r; return length(max(q,0.))+min(max(q.x,q.y),0.)-r; }
float smin(float a,float b,float k){ float h=max(k-abs(a-b),0.)/k; return min(a,b)-h*h*k*.25; }
float U2(float g,float d,float k){ return g>9e4 ? d : (k<.5 ? min(g,d) : smin(g,d,k)); }
// Same-group shapes melt together (Apple's glass container); different groups never do; lens layer sits on top.
float field(vec2 p, out int id){
  float g0=1e5,g1=1e5,g2=1e5,g3=1e5, best=1e5, dt=1e5; int bid=0, tid=-1;
  for(int i=0;i<${N};i++){ if(i>=uN) break; float di=sdb(p,uBox[i],uPar[i].x);
    if(uOpt[i].w>.5){ if(di<dt){dt=di;tid=i;} continue; }
    if(di<best){best=di;bid=i;}
    int gi=int(uGrp[i].x);
    float kk=uK*uGrp[i].y; if(gi==0) g0=U2(g0,di,kk); else if(gi==1) g1=U2(g1,di,kk); else if(gi==2) g2=U2(g2,di,kk); else g3=U2(g3,di,kk);   // merging only while a morph animates
  }
  float d=min(min(g0,g1),min(g2,g3));
  if(tid>=0 && dt<0.){ id=tid; return dt; }
  id=bid; return d;
}
float F(vec2 p){ int k; return field(p,k); }
vec3 bgAt(vec2 p){ vec2 uv=clamp(p/uRes, vec2(.001), vec2(.999)); if(uFlip>.5) uv.y=1.-uv.y; return texture(uBG, uv).rgb; }
vec3 bgB(vec2 p,float r){ if(r<.6) return bgAt(p); vec3 acc=vec3(0.); float ws=0.;
  for(int i=0;i<16;i++){ float fi=float(i)+.5; float rr=r*sqrt(fi/16.); float an=fi*2.39996; float w=1.-.5*rr/r; acc+=bgAt(p+vec2(cos(an),sin(an))*rr)*w; ws+=w; }
  return acc/ws; }
void main(){
  vec2 p=vec2(gl_FragCoord.x, uRes.y-gl_FragCoord.y);
  int id; float d=field(p,id);
  vec3 bg=bgAt(p);
  float cov=1.-smoothstep(-.7*uDpr,.8*uDpr,d);
  // interaction glow spreads from the fingertip across the element and its merged neighbours
  if(cov<=.001){ o=vec4(bg,1.); return; }
  // blend parameters across melted shapes of the same group, so a merge reads as ONE body (no seam)
  float wS=0., T=0., dim=0., refr=0., disp=0., mag=0., app=0., Bz=0., fr=0.; vec2 cen=vec2(0.);
  if(uOpt[id].w>.5){ wS=1.; T=uPar[id].y; dim=uPar[id].z; refr=uOpt[id].x; disp=uOpt[id].y; mag=uOpt[id].z; app=uSt[id].x; fr=uSt[id].w; Bz=min(uBox[id].z,uBox[id].w); cen=uBox[id].xy; }
  else { float g=uGrp[id].x; float b0=sdb(p,uBox[id],uPar[id].x);
    for(int i=0;i<${N};i++){ if(i>=uN) break; if(uOpt[i].w>.5 || abs(uGrp[i].x-g)>.5) continue;
      float di=sdb(p,uBox[i],uPar[i].x); float kk=uK*uGrp[i].y; float w = (i==id) ? 1. : (kk<.5 ? 0. : exp(-max(di-b0,0.)/(kk*.35+1.)));
      wS+=w; T+=w*uPar[i].y; dim+=w*uPar[i].z; refr+=w*uOpt[i].x; disp+=w*uOpt[i].y; mag+=w*uOpt[i].z; app+=w*uSt[i].x; fr+=w*uSt[i].w; Bz+=w*min(uBox[i].z,uBox[i].w); cen+=w*uBox[i].xy; }
    T/=wS; fr/=wS; dim/=wS; refr/=wS; disp/=wS; mag/=wS; app/=wS; Bz/=wS; cen/=wS; }
  float depth=max(-d,0.);
  float B=min(22.*uDpr, Bz*.95);                         // flatter bevel (interview: B)
  float t=clamp(depth/B,0.,1.);
  float s2=sqrt(max(1.-(1.-t)*(1.-t),0.));
  float slope=(T*uDpr*app)/B*(1.-t)/max(s2,.2);
  float e=1.4*uDpr;
  vec2 gr=vec2(F(p+vec2(e,0.))-F(p-vec2(e,0.)), F(p+vec2(0.,e))-F(p-vec2(0.,e)));
  vec2 gdir=gr/max(length(gr),1e-4);
  vec3 N=normalize(vec3(gdir*slope,1.));
  vec2 ps=cen+(p-cen)/mix(1.,mag,app);                    // magnifier (lens role only)
  vec3 eta=vec3(1./(1.5-.055*disp),1./1.5,1./(1.5+.06*disp));
  vec3 Rr=refract(vec3(0,0,-1),N,eta.r), Rg=refract(vec3(0,0,-1),N,eta.g), Rb=refract(vec3(0,0,-1),N,eta.b);
  float reach=(T*uDpr*app*1.05+3.*uDpr)*refr;
  float frp=fr*uDpr*app; vec2 oR=Rr.xy/max(-Rr.z,.12)*reach, oG=Rg.xy/max(-Rg.z,.12)*reach, oB=Rb.xy/max(-Rb.z,.12)*reach; float mo=uReach*uDpr;
  oR*=min(1.,mo/max(length(oR),1e-3)); oG*=min(1.,mo/max(length(oG),1e-3)); oB*=min(1.,mo/max(length(oB),1e-3));   // cap the reach: fringe stays a thin line at the rim
  vec3 col=vec3(bgB(ps+oR,frp).r, bgB(ps+oG,frp).g, bgB(ps+oB,frp).b); // crystal clear: no blur, natural colour
  col = dim>=0. ? col*(1.-dim*app) : mix(col, vec3(1.), -dim*app*.55);   // lightening is gentler than darkening, so dark-ink glass stays glassy, not milky   // dark ink lightens the glass, light ink darkens it
  col*=1.-uGrp[id].z*(1.-smoothstep(0.,2.6*uDpr,depth))*app;          // lens: thin dark rim, like Apple's selection bubble
  // Apple's highlight: ONE lit silhouette. Edges facing the light glow; the opposite edge catches the light passing through.
  vec2 toL=-uLdir;
  float band=1.-smoothstep(.0,1.7*uDpr,depth);
  float key=pow(max(dot(gdir,toL),0.),2.2), thru=pow(max(dot(gdir,-toL),0.),2.2)*.42;
  float inner=(1.-smoothstep(0.,7.*uDpr,depth))*pow(max(dot(gdir,toL),0.),3.)*.10;  // faint light inside the facing bevel
  col+=vec3((band*(key+thru)*.85+inner)*app);
  col+=uPar[id].w*exp(-length(p-uSt[id].yz)/(110.*uDpr))*vec3(.28,.30,.34);   // glow stays inside the pressed element
  if(uSolid>0.){ float L=dot(col,vec3(.2126,.7152,.0722)); col=mix(col, dim>=0. ? vec3(.11,.115,.13) : vec3(.93,.935,.95), uSolid*.88); }   // Reduce Transparency: frosted-solid
  col=mix(bg,col,cov*clamp(app*1.6,0.,1.));
  o=vec4(col,1.);
}`;
    const VS = `#version 300 es\nin vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }`;
    let gl = null; try { gl = cv.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' }); } catch (e) {}
    let glp, U = {}, tex, fbo = null, compTex = null, DPR = 1, W = 0, H = 0, cap = C.maxDpr;
    if (gl) {
      const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
      try { glp = gl.createProgram(); gl.attachShader(glp, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(glp, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(glp); gl.useProgram(glp); } catch (e) { console.warn('liquid-glass: shader failed, using fallback', e); gl = null; }
    }
    if (gl) {
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); const a = gl.getAttribLocation(glp, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      ['uBG', 'uRes', 'uDpr', 'uN', 'uK', 'uLdir', 'uBox', 'uPar', 'uSt', 'uOpt', 'uGrp', 'uFlip', 'uSolid', 'uReach'].forEach((n) => (U[n] = gl.getUniformLocation(glp, n)));
      const tp = () => [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]].forEach(([k, v]) => gl.texParameteri(gl.TEXTURE_2D, k, v));
      tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); tp(); compTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, compTex); tp(); fbo = gl.createFramebuffer();
    } else {
      // Fallback: show the backdrop canvas itself; the DOM tier CSS (assets/dom) gives the elements a frosted look.
      root.classList.add('lg-no-webgl'); bgc.setAttribute('aria-hidden', 'true'); bgc.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;z-index:0;pointer-events:none'; if (!opts.canvas) cv.replaceWith(bgc); else cv.after(bgc);
    }
    function resize() {
      DPR = Math.min(global.devicePixelRatio || 1, cap); W = global.innerWidth; H = global.innerHeight;
      const pw = Math.round(W * DPR), ph = Math.round(H * DPR); if (bgc.width === pw && bgc.height === ph) return;
      bgc.width = pw; bgc.height = ph;
      if (gl) { cv.width = pw; cv.height = ph; gl.viewport(0, 0, pw, ph); gl.bindTexture(gl.TEXTURE_2D, compTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, pw, ph, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, compTex, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
    }
    global.addEventListener('resize', resize); resize();

    /* ---------- objects ---------- */
    let objs = [];
    const press = (o) => (ev) => { o.pressed = true; o.gx = ev.clientX; o.gy = ev.clientY; };
    // data-tint="#rrggbb": an accent that stays legible on this glass. Light ink (dark glass) → tint lifted toward white;
    // dark ink (light glass) → tint deepened toward black; follows the same faded tone as the ink. Read it as var(--lg-tint).
    const hex = (h) => (h && /^#[0-9a-f]{6}$/i.test(h)) ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : null;
    function tintInk(o, k) { const t = o.tint, m = (c, to, a) => Math.round(c + (to - c) * a); const lt = t.map((c) => m(c, 255, .55)), dk = t.map((c) => m(c, 0, .5)); o.e.style.setProperty('--lg-tint', `rgb(${lt.map((c, i) => m(c, dk[i], k)).join(' ')})`); }
    function scan() {
      const els = [...scope.querySelectorAll('[data-gl]')].filter((e) => e.getClientRects().length).slice(0, N);   // display:none elements do not take a slot
      objs = els.map((e, i) => {
        const old = objs.find((x) => x.e === e); if (old) return old;
        const role = R0[e.dataset.role] ? e.dataset.role : 'control';
        const o = { e, tint: hex(e.dataset.tint), role, r: Object.assign({}, R0[role]), group: +(e.dataset.group || 0), adaptOn: e.dataset.adapt === 'on', appear: 0, vA: 0, t0: now + .15 + i * .06, press: 0, vP: 0, pressed: false, gx: -999, gy: -999, lvl: 1, userScale: 1, tn: 0, tnLin: 0, toneTarget: 0, pend: null, pendT: 0, lastFlip: -9, init: false, kf: 0, inkLock: null };
        if (o.r.press || o.r.glow) { e.addEventListener('pointerdown', press(o)); e.addEventListener('pointermove', (ev) => { if (o.pressed) { o.gx = ev.clientX; o.gy = ev.clientY; } }); ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => e.addEventListener(t, () => (o.pressed = false))); }
        if (o.tint) tintInk(o, 0);
        return o; });
    }
    let now = 0; scan();
    const byEl = (el) => objs.find((o) => o.e === el);
    const morphOn = new Set(), kfs = {};

    /* ---------- light ---------- */
    let light = C.lightAngle, sweep = (RM || !C.sweepOnAppear) ? 0 : 1;

    /* ---------- scroll edge (Apple soft style): content fades under floating bars ---------- */
    function scrollEdge(ctx) {
      const se = opts.scrollEdge; if (!se) return; const col = se.color || '18,19,23';
      if (se.top) { const a = (typeof se.topAlpha === 'function' ? se.topAlpha() : (se.topAlpha ?? .85)); if (a > 0) { const g = ctx.createLinearGradient(0, 0, 0, se.top); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, se.top); } }
      if (se.bottom) { const st = se.bottomStops || [[0, 0], [.45, .5], [.7, .78], [1, .86]]; const g = ctx.createLinearGradient(0, H - se.bottom, 0, H); st.forEach(([p, a]) => g.addColorStop(p, `rgba(${col},${a})`)); ctx.fillStyle = g; ctx.fillRect(0, H - se.bottom, W, se.bottom); }
    }

    /* ---------- adaptive ink (opt-in): time-averaged, delayed, faded, cooled down ---------- */
    let tick = 0;
    function adapt(dt) {
      if (++tick % 2 === 0) objs.forEach((o) => {
        if (!o.adaptOn || o.inkLock !== null) return; const r = o.e.getBoundingClientRect(); let L = 0, n = 0;
        for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 4; gx++) { const x = Math.round((r.left + r.width * (gx + .5) / 4) * DPR), y = Math.round((r.top + r.height * (gy + .5) / 3) * DPR); if (x < 0 || y < 0 || x >= bgc.width || y >= bgc.height) continue; const d = bx.getImageData(x, y, 1, 1).data; L += .2126 * lin(d[0]) + .7152 * lin(d[1]) + .0722 * lin(d[2]); n++; }
        if (!n) return; L /= n; o.Lavg = o.Lavg === undefined ? L : o.Lavg + (L - o.Lavg) * Math.min(1, (now - (o.Lt || now)) / .35 + .02); o.Lt = now; L = o.Lavg;
        const dm = o.r.dim, cl = 1.05 / (L * (1 - dm) + .05), cd = (L * (1 - dm) + dm + .05) / .055;
        if (!o.init) { o.init = true; o.toneTarget = o.tnLin = cd > cl ? 1 : 0; o.lastFlip = now; return; }
        const cur = o.toneTarget, want = cur === 0 ? (cd > cl * 1.15 ? 1 : 0) : (cl > cd * 1.15 ? 0 : 1);
        if (want === cur) { o.pend = null; return; }
        if (o.pend !== want) { o.pend = want; o.pendT = now; return; }
        if (now - o.pendT >= C.dwell && now - o.lastFlip >= C.cooldown) { o.toneTarget = want; o.lastFlip = now; o.pend = null; }
      });
      objs.forEach((o) => {
        if (!o.adaptOn && o.inkLock === null) return;
        if (o.inkLock !== null) o.tnLin = o.inkLock; else if (o.tnLin !== o.toneTarget) o.tnLin += Math.sign(o.toneTarget - o.tnLin) * Math.min(Math.abs(o.toneTarget - o.tnLin), dt / (RM ? .15 : C.transition));
        const k = o.tnLin * o.tnLin * (3 - 2 * o.tnLin); if (k === o.tn && o.inked) return; o.tn = k; o.inked = true;
        const c = Math.round(255 - 244 * k), b = Math.round(255 - 239 * k), ink = `rgb(${c} ${c} ${b})`;
        o.e.style.color = ink; o.e.style.setProperty('--lg-ink', ink); if (o.tint) tintInk(o, k); o.e.style.setProperty('--lg-ink-2', `rgb(${c} ${c} ${b} / .74)`);
      });
    }

    /* ---------- frame ---------- */
    const bx4 = new Float32Array(N * 4), par = new Float32Array(N * 4), st = new Float32Array(N * 4), opt = new Float32Array(N * 4), grp = new Float32Array(N * 4);
    let last = performance.now(), slow = 0, raf = 0, alive = true;
    function pack(list) {
      let n = 0;
      list.forEach((o) => {
        const r = o.e.getBoundingClientRect(), cs = getComputedStyle(o.e), a = Math.max(0, Math.min(1.15, o.appear)) * o.lvl * (+cs.opacity); if (r.width < 2 || a < .005 || n >= N) return;
        if (cs.visibility === 'hidden' || cs.display === 'none') return;   // CSS opacity fades the glass with its content
        const sc = r.width / (o.e.offsetWidth || r.width), hw = r.width / 2 * DPR, hh = r.height / 2 * DPR, i4 = n * 4, q = o.r;
        bx4.set([(r.left + r.width / 2) * DPR, (r.top + r.height / 2) * DPR, hw, hh], i4);
        par.set([Math.min(parseFloat(cs.borderTopLeftRadius) * sc * DPR || 0, hw, hh), q.thick * (1 + .3 * o.press * q.press), q.dim * (1 - 2 * (o.tn || 0)), q.glow * o.press], i4);
        st.set([a, o.gx * DPR, o.gy * DPR, q.frost || 0], i4); opt.set([q.refr, q.disp * (q.layer ? o.lvl : 1), q.mag, q.layer], i4); grp.set([o.group, o.group ? (kfs[o.group] || 0) : 0, q.rimDark || 0, 0], i4); n++;
      });
      return n;
    }
    function pass(list, src, fb, flip) {
      const n = pack(list); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, cv.width, cv.height); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src);
      gl.uniform1i(U.uBG, 0); gl.uniform1f(U.uFlip, flip ? 1 : 0); gl.uniform1f(U.uSolid, (RT || forceRT) ? 1 : tintAmt * .6); gl.uniform1f(U.uReach, C.lensReach);
      gl.uniform2f(U.uRes, cv.width, cv.height); gl.uniform1f(U.uDpr, DPR); gl.uniform1i(U.uN, n); gl.uniform1f(U.uK, C.mergeRadius * DPR); gl.uniform2f(U.uLdir, Math.cos(light), Math.sin(light));
      gl.uniform4fv(U.uBox, bx4); gl.uniform4fv(U.uPar, par); gl.uniform4fv(U.uSt, st); gl.uniform4fv(U.uOpt, opt); gl.uniform4fv(U.uGrp, grp); gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function frame(tm) {
      if (!alive) return;
      const raw = (tm - last) / 1000, dt = Math.min(.04, Math.max(0, raw)); last = tm; now += dt;
      if (C.adaptiveResolution && !/[?&]fixed\b/.test(location.search)) { slow = raw > .034 ? slow + 1 : Math.max(0, slow - 1); if (slow > 24 && cap > 1) { cap = Math.max(1, cap - .5); slow = 0; resize(); } }
      if (sweep > 0 && now > .2) { sweep = Math.max(0, sweep - dt / C.sweepOnAppear); light = C.lightAngle + (1 - sweep) * Math.PI * 2; if (!sweep) light = C.lightAngle; }
      Object.keys(kfs).concat([...morphOn]).forEach((g) => { kfs[g] = (kfs[g] || 0) + ((morphOn.has(+g) ? 1 : 0) - (kfs[g] || 0)) * Math.min(1, dt / C.morphRamp); });
      const ap = RM ? [900, 80] : C.appearSpring;
      objs.forEach((o) => { if (RM) { o.appear = 1; o.vA = 0; } else if (now > o.t0) [o.appear, o.vA] = spring(o.appear, o.vA, 1, ap[0], ap[1], dt); /* reduced motion: glass is simply there */ [o.press, o.vP] = spring(o.press, o.vP, o.pressed ? 1 : 0, RM ? 900 : 260, RM ? 80 : 15, dt); const s = (1 - .04 * o.press * o.r.press * (RM ? 0 : 1)) * o.userScale; o.e.style.scale = String(s); });
      bx.setTransform(DPR, 0, 0, DPR, 0, 0); if (opts.drawBackdrop) opts.drawBackdrop(bx, W, H, now); scrollEdge(bx);
      if (api.backdropDim > 0) { bx.fillStyle = `rgba(0,0,0,${Math.min(.9, api.backdropDim)})`; bx.fillRect(0, 0, W, H); }   // modal dim lives INSIDE the refracted backdrop, so a sheet's glass bends the dimmed page
      adapt(dt);
      if (gl) {
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bgc);
        const base = objs.filter((o) => !o.r.layer), top = objs.filter((o) => o.r.layer && o.appear * o.lvl > .005);
        if (top.length) { pass(base, tex, fbo, false); pass(top, compTex, null, true); } else pass(base, tex, null, false);
      }
      raf = global.requestAnimationFrame(frame);
    }
    ['(prefers-reduced-motion: reduce)', '(prefers-reduced-transparency: reduce)'].forEach((q) => { try { global.matchMedia(q).addEventListener('change', () => { RM = mq('(prefers-reduced-motion: reduce)'); RT = mq('(prefers-reduced-transparency: reduce)'); }); } catch (e) {} });
    raf = global.requestAnimationFrame(frame);

    const api = {
      backdropDim: 0,
      config: C, roles: R0, get webgl() { return !!gl; }, get now() { return now; },
      refresh: scan,
      morph(group, on) { on ? morphOn.add(+group) : morphOn.delete(+group); },
      level(el, v) { const o = byEl(el); if (o) o.lvl = Math.max(0, Math.min(1, v)); },
      set(el, patch) { const o = byEl(el); if (o) Object.assign(o.r, patch); },
      role(el) { const o = byEl(el); return o ? Object.assign({}, R0[o.role]) : null; },
      scale(el, s) { const o = byEl(el); if (o) o.userScale = s; },
      inkTowards(el, v) { const o = byEl(el); if (o) { o.inkLock = v === null ? null : Math.max(0, Math.min(1, v)); if (v === null) { o.toneTarget = o.tnLin > .5 ? 1 : 0; o.pend = null; } } },
      reduceTransparency(on) { forceRT = !!on; },
      // iOS/macOS 27 transparency slider: 0 = clear (default, owner's look) … 1 = tinted (more opaque, calmer over busy content)
      transparency(v) { tintAmt = Math.max(0, Math.min(1, +v || 0)); return tintAmt; },
      debug() { return objs.map((o) => ({ el: o.e.id || o.e.className, role: o.role, group: o.group, appear: +o.appear.toFixed(3), level: o.lvl, merge: +((o.group && kfs[o.group]) || 0).toFixed(3), ink: +o.tn.toFixed(3), toneTarget: o.toneTarget, adapt: o.adaptOn, luma: o.Lavg })); },
      destroy() { alive = false; global.cancelAnimationFrame(raf); global.removeEventListener('resize', resize); }
    };
    (global.LiquidGlass.instances = global.LiquidGlass.instances || []).push(api);   // lets the audit script find mounted renderers
    return api;
  }
  global.LiquidGlass = { mount, ROLES, CONFIG, version: '0.6.0' };
})(window);
