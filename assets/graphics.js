/* ──────────────────────────────────────────────────────────────
   Technical line-art graphics
   1. Hero: left-to-right wireframe network (attacker → internet →
      perimeter → DMZ → internal → SOC) with an animated Offensive
      Agent kill chain and Defensive Agent response.
   2. Research figures: generative contour maps with overlays.
   Pure canvas, no dependencies.
   ────────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';

  /* ── Theme colors (re-read on theme change) ───────────────── */
  let C = {};
  const readColors = () => {
    const cs = getComputedStyle(document.documentElement);
    const g = (n) => cs.getPropertyValue(n).trim();
    C = { ink: g('--ink'), ink2: g('--ink-2'), ink3: g('--ink-3'), accent: g('--accent'), blue: g('--blue'), paper: g('--paper') };
  };
  readColors();
  const onTheme = [];
  let ALERT = false; // red alert mode (fx.js)
  window.addEventListener('fx:alert', (e) => { ALERT = !!e.detail; onTheme.forEach((f) => f()); });
  const themeChanged = () => { readColors(); onTheme.forEach((f) => f()); };
  new MutationObserver(themeChanged).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', themeChanged);

  /* ── Helpers ──────────────────────────────────────────────── */
  const setupCanvas = (canvas) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: r.width, h: r.height };
  };

  const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const makeNoise = (seed) => {
    const rnd = mulberry32(seed);
    const g = new Float32Array(256 * 256);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    const v = (x, y) => g[((y & 255) << 8) + (x & 255)];
    const s = (t) => t * t * (3 - 2 * t);
    const n = (x, y) => {
      const ix = Math.floor(x), iy = Math.floor(y);
      const fx = s(x - ix), fy = s(y - iy);
      const a = v(ix, iy), b = v(ix + 1, iy), c = v(ix, iy + 1), d = v(ix + 1, iy + 1);
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
    return (x, y) => n(x, y) * 0.62 + n(x * 2.07 + 11, y * 2.07 + 5) * 0.28 + n(x * 4.3 + 3, y * 4.3 + 17) * 0.1;
  };

  // Marching squares: strokes iso-lines of `field` at each level.
  const drawContours = (ctx, w, h, field, levels, cell) => {
    const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell), stride = cols + 1;
    const F = new Float32Array((rows + 1) * stride);
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) F[j * stride + i] = field(i * cell, j * cell);
    ctx.beginPath();
    for (const L of levels) {
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const a = F[j * stride + i], b = F[j * stride + i + 1];
          const c = F[(j + 1) * stride + i + 1], d = F[(j + 1) * stride + i];
          const idx = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0);
          if (idx === 0 || idx === 15) continue;
          const x = i * cell, y = j * cell, t = (p, q) => (L - p) / (q - p);
          const T = () => [x + cell * t(a, b), y];
          const R = () => [x + cell, y + cell * t(b, c)];
          const B = () => [x + cell * t(d, c), y + cell];
          const Lf = () => [x, y + cell * t(a, d)];
          const seg = (p, q) => { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); };
          switch (idx) {
            case 1: case 14: seg(Lf(), B()); break;
            case 2: case 13: seg(B(), R()); break;
            case 3: case 12: seg(Lf(), R()); break;
            case 4: case 11: seg(T(), R()); break;
            case 5: seg(Lf(), T()); seg(B(), R()); break;
            case 6: case 9: seg(T(), B()); break;
            case 7: case 8: seg(Lf(), T()); break;
            case 10: seg(T(), R()); seg(Lf(), B()); break;
          }
        }
      }
    }
    ctx.stroke();
  };

  const range = (a, b, step) => { const r = []; for (let v = a; v <= b + 1e-9; v += step) r.push(v); return r; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

  let MINI = false; // set while drawing thumbnails: no text
  const label = (ctx, x, y, text, dir = 1, color = C.ink2, dot = true, lift = 18) => {
    if (MINI) return;
    ctx.save();
    ctx.font = `10px ${MONO}`;
    {                                                                       // flip if the tag would leave the figure
      const W = ctx.canvas.clientWidth || ctx.canvas.width, tw0 = ctx.measureText(text).width;
      const lx0 = x + Math.max(10, lift * 0.7) * dir + 11 * dir;
      if (dir > 0 && lx0 + tw0 + 6 > W) dir = -1; else if (dir < 0 && lx0 - tw0 - 6 < 0) dir = 1;
    }
    const lx = x + Math.max(10, lift * 0.7) * dir, ly = y - lift;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 0.75; ctx.globalAlpha = 0.9;
    if (dot) { ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(lx, ly); ctx.lineTo(lx + 8 * dir, ly); ctx.stroke();
    ctx.font = `10px ${MONO}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = dir > 0 ? 'left' : 'right';
    const tx = lx + 11 * dir, tw = ctx.measureText(text).width;
    ctx.globalAlpha = 0.92; ctx.fillStyle = C.paper;                      // tag behind the text
    ctx.fillRect(dir > 0 ? tx - 4 : tx - tw - 4, ly - 8, tw + 8, 16);
    ctx.globalAlpha = 1; ctx.fillStyle = color; ctx.fillText(text, tx, ly);
    ctx.restore();
  };

  const crosshairs = (ctx, w, h, inset = 8, size = 5) => {
    ctx.beginPath();
    for (const [x, y] of [[inset, inset], [w - inset, inset], [inset, h - inset], [w - inset, h - inset]]) {
      ctx.moveTo(x - size, y); ctx.lineTo(x + size, y);
      ctx.moveTo(x, y - size); ctx.lineTo(x, y + size);
    }
    ctx.stroke();
  };

  const whenVisible = (el, cb, opts = { threshold: 0.25 }) => {
    if (!('IntersectionObserver' in window)) return cb();
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { io.disconnect(); cb(); } }, opts);
    io.observe(el);
  };

  /* ══════════════════════════════════════════════════════════
     1. HERO SCENE
     ══════════════════════════════════════════════════════════ */
  const initScene = () => {
    const canvas = document.getElementById('scene');
    if (!canvas) return;
    const hudEl = document.getElementById('hud');
    const hud = hudEl ? Object.fromEntries([...hudEl.querySelectorAll('[data-hud]')].map((e) => [e.dataset.hud, e])) : {};

    /* ── Topology, left → right (world units, y up) ──
       attacker host → home router → internet → edge router → external FW
       → DMZ → internal FW → user / server subnets → SOC stack */
    const zones = [
      { x0: -600, x1: -405, z0: -70, z1: 70, name: 'ZONE 0 · ATTACKER' },
      { x0: -255, x1: -185, z0: -60, z1: 60, name: 'EXTERNAL NET' },
      { x0: -150, x1: 10,  z0: -105, z1: 105, name: 'DMZ' },
      { x0: 60,  x1: 300, z0: 20,  z1: 125, name: 'USERS VLAN' },
      { x0: 60,  x1: 300, z0: -125, z1: -5, name: 'SERVERS VLAN' },
      { x0: 345, x1: 520, z0: -95, z1: 95, name: 'SOC' },
    ];
    // Boxes: servers / appliances.
    const boxes = [
      { id: 'router', x: -445, z: 0,   w: 26, d: 18, h: 8,  units: 0, label: 'R-01 Home router', lift: 30 },
      { id: 'edge',   x: -220, z: 0,   w: 32, d: 32, h: 26, units: 2, label: 'E-01 Edge router · ISP', lift: 40 },
      { id: 'web',    x: -105, z: -55, w: 34, d: 34, h: 62, units: 5, label: 'D-01 Web', lift: 18 },
      { id: 'mail',   x: -40,  z: 20,  w: 34, d: 34, h: 56, units: 4, label: 'D-02 Mail', lift: 22 },
      { id: 'dns',    x: -110, z: 70,  w: 26, d: 26, h: 36, units: 3, label: 'D-03 DNS · VPN', lift: 14 },
      { id: 'file',   x: 105,  z: -70, w: 30, d: 30, h: 52, units: 4, label: 'S-21 File', lift: 16 },
      { id: 'app',    x: 175,  z: -85, w: 32, d: 32, h: 70, units: 5, label: 'S-22 App', lift: 30 },
      { id: 'dc',     x: 255,  z: -60, w: 40, d: 40, h: 104, units: 8, label: 'S-23 DC01 · AD', lift: 22 },
    ];
    const walls = [
      { id: 'xfw', x: -165, z: 0, w: 10, d: 190, h: 66, label: 'F-01 External firewall', lift: 46 },
      { id: 'ifw', x: 35,   z: 0, w: 10, d: 230, h: 66, label: 'F-02 Internal firewall', lift: 46 },
    ];
    const desks = [
      { id: 'ws1', x: 105, z: 75 }, { id: 'ws2', x: 175, z: 70 }, { id: 'ws3', x: 245, z: 80 },
    ];
    const soc = { x: 435, z: 0, w: 74, d: 74, layers: ['C-01 SIEM', 'C-02 EDR · XDR', 'C-03 SOAR'], gap: 26 };
    const globe = { x: -330, y: 72, z: 0, r: 46 };
    const laptop = { x: -520, z: 0, w: 44, d: 30 };

    const byId = Object.fromEntries([...boxes, ...walls].map((b) => [b.id, b]));
    const top = (id) => {
      const b = byId[id]; if (b) return [b.x, b.h, b.z];
      const d = desks.find((k) => k.id === id); if (d) return [d.x, 22, d.z];
      return null;
    };
    const N = {
      host: [laptop.x, 18, laptop.z],
      off: [laptop.x + 10, 118, laptop.z],
      router: top('router'), net: [globe.x, globe.y, globe.z], edge: top('edge'),
      web: top('web'), mail: top('mail'), dns: top('dns'),
      ws1: top('ws1'), ws2: top('ws2'), ws3: top('ws3'),
      file: top('file'), app: top('app'), dc: top('dc'),
      siem: [soc.x, soc.gap * 2 + 8, soc.z],
      def: [soc.x + 10, 150, soc.z],
      xfw: top('xfw'), ifw: top('ifw'),
    };
    const links = [
      ['host', 'router'], ['router', 'net'], ['net', 'edge'], ['edge', 'web'], ['edge', 'mail'], ['edge', 'dns'],
      ['web', 'app'], ['mail', 'ws1'], ['dns', 'ws2'], ['ws1', 'ws2'], ['ws2', 'ws3'], ['ws3', 'dc'],
      ['file', 'app'], ['app', 'dc'], ['file', 'dc'],
    ];
    const sensors = ['xfw', 'web', 'mail', 'ifw', 'ws1', 'ws3', 'file', 'dc'];

    // Kill chain on a 15 s loop: [from, to, t0, t1, phase]
    const LOOP = 15;
    const chain = [
      ['host', 'router', 1.2, 2.0, 'egress · home router'],
      ['router', 'net', 2.0, 2.9, 'transit · internet'],
      ['net', 'edge', 2.9, 3.7, 'external network'],
      ['edge', 'mail', 3.7, 4.9, 'initial access · phishing T1566'],
      ['mail', 'ws1', 4.9, 6.1, 'execution · T1204'],
      ['ws1', 'ws3', 6.1, 6.9, 'discovery · T1018'],
      ['ws3', 'dc', 6.9, 8.0, 'lateral movement · T1021'],
    ];
    const T_DETECT = 7.4, T_RESPOND = 8.6, T_CONTAIN = 10.6, T_RESET = 13.6;
    const STAGES = [
      { t: 0,    name: 'Recon',          tech: 'T1595', focus: ['host', 'router'],          text: 'The Offensive Agent probes for a way in from the attacker host.' },
      { t: 1.2,  name: 'Egress',         tech: '',      focus: ['host', 'router'],          text: "Traffic leaves through the attacker's home router." },
      { t: 2.0,  name: 'Internet',       tech: '',      focus: ['router', 'net'],           text: 'It crosses the internet towards the target.' },
      { t: 2.9,  name: 'Perimeter',      tech: '',      focus: ['net', 'edge'],             text: "It reaches the target's edge router on the external network." },
      { t: 3.7,  name: 'Initial access', tech: 'T1566', focus: ['edge', 'xfw', 'mail'],     text: 'A phishing email passes the external firewall and lands on the DMZ mail relay.' },
      { t: 4.9,  name: 'Execution',      tech: 'T1204', focus: ['mail', 'ifw', 'ws1'],      text: 'A user opens it: the payload runs on a workstation behind the internal firewall.' },
      { t: 6.1,  name: 'Discovery',      tech: 'T1018', focus: ['ws1', 'ws3'],              text: 'The agent maps the users VLAN.' },
      { t: 6.9,  name: 'Lateral',        tech: 'T1021', focus: ['ws3', 'dc'],               text: 'It pivots to the domain controller.' },
      { t: 8.0,  name: 'Detect',         tech: '',      focus: ['siem', 'ws1', 'dc'],       text: 'EDR telemetry reaches the SIEM: the SOC raises an alert.' },
      { t: 8.6,  name: 'Respond',        tech: '',      focus: ['siem', 'dc', 'ws1', 'ifw'], text: 'The Defensive Agent isolates the hosts, cuts the path and hardens the internal firewall.' },
      { t: 10.6, name: 'Contained',      tech: '',      focus: ['siem', 'dc'],              text: 'Threat contained. The scenario replays.' },
    ];
    const stageAt = (t) => { let i = 0; STAGES.forEach((st, k) => { if (t >= st.t) i = k; }); return i; };
    const phaseAt = (t) => { const st = STAGES[stageAt(t)]; return st.tech ? `${st.name.toLowerCase()} · ${st.tech}` : st.name.toLowerCase(); };
    let showAll = false;

    let vertexCount = 0;

    // ── View ──
    const D = 1400;
    let baseYaw = -0.42, basePitch = 0.5;
    let yawOff = 0, pitchOff = 0;
    let yaw = baseYaw, pitch = basePitch;
    let W = 0, H = 0, ctx, S = 1, ox = 0, oy = 0;

    const raw = (x, y, z, yw, pt) => {
      const cy = Math.cos(yw), sy = Math.sin(yw), cp = Math.cos(pt), sp = Math.sin(pt);
      const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
      const y1 = y * cp + z1 * sp, z2 = -y * sp + z1 * cp;
      const f = D / (D + z2);
      return [x1 * f, -y1 * f];
    };
    const P = (x, y, z) => { const r = raw(x, y, z, yaw, pitch); return [ox + r[0] * S, oy + r[1] * S]; };
    const Pv = (v) => P(v[0], v[1], v[2]);

    let hudRect = null;
    const resize = () => {
      ({ ctx, w: W, h: H } = setupCanvas(canvas));
      const narrow = W < 700;
      baseYaw = narrow ? -0.62 : -0.36;
      basePitch = narrow ? 0.95 : 0.56;
      // Fit the whole topology into the canvas at the base view.
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      const pts = [];
      zones.forEach((z) => pts.push([z.x0, 0, z.z0], [z.x1, 0, z.z1], [z.x0, 0, z.z1], [z.x1, 0, z.z0]));
      pts.push(N.off, N.def, [globe.x, globe.y + globe.r, 0], [globe.x, globe.y - globe.r, 0]);
      pts.forEach(([x, y, z]) => {
        const r = raw(x, y, z, baseYaw, basePitch);
        minX = Math.min(minX, r[0]); maxX = Math.max(maxX, r[0]); minY = Math.min(minY, r[1]); maxY = Math.max(maxY, r[1]);
      });
      // Keep the drawing clear of the HUD box (bottom-right).
      hudRect = null;
      if (hudEl) {
        const c = canvas.getBoundingClientRect(), r = hudEl.getBoundingClientRect();
        hudRect = [r.left - c.left, r.top - c.top, r.right - c.left, r.bottom - c.top];
      }
      const hudH = hudRect ? H - hudRect[1] : 0;
      const padX = narrow ? 24 : 60, padTop = narrow ? 56 : 64, padBot = Math.max(narrow ? 70 : 40, hudH + 10);
      S = Math.min((W - padX * 2) / (maxX - minX), (H - padTop - padBot) / (maxY - minY));
      ox = padX + ((W - padX * 2) - (maxX - minX) * S) / 2 - minX * S;
      oy = padTop + ((H - padTop - padBot) - (maxY - minY) * S) / 2 - minY * S;
    };

    // ── Primitives ──
    const mv = (p) => ctx.moveTo(p[0], p[1]);
    const ln = (p) => ctx.lineTo(p[0], p[1]);
    const line3 = (a, b) => { mv(Pv(a)); ln(Pv(b)); vertexCount += 2; };
    const arcPt = (a, b, t) => {
      const dx = b[0] - a[0], dz = b[2] - a[2];
      const lift = Math.min(80, Math.hypot(dx, dz) * 0.3);
      return [a[0] + dx * t, a[1] + (b[1] - a[1]) * t + Math.sin(Math.PI * t) * lift, a[2] + dz * t];
    };
    const arc3 = (a, b, t0 = 0, t1 = 1, n = 26) => {
      for (let i = 0; i <= n; i++) { const p = Pv(arcPt(a, b, t0 + (t1 - t0) * (i / n))); i ? ln(p) : mv(p); }
    };
    const circle3 = (c, r, y, n = 48) => {
      for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2, p = P(c[0] + Math.cos(a) * r, y, c[2] + Math.sin(a) * r); i ? ln(p) : mv(p); }
    };
    const cuboid = (x, y, z, w, h, d) => {
      const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y1 = y + h;
      const c = [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
      [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([i, j]) => line3(c[i], c[j]));
    };
    const octa = (c, s) => {
      const [x, y, z] = c;
      const v = [[x + s, y, z], [x - s, y, z], [x, y + s * 1.3, z], [x, y - s * 1.3, z], [x, y, z + s], [x, y, z - s]];
      [[0, 2], [0, 3], [1, 2], [1, 3], [4, 2], [4, 3], [5, 2], [5, 3], [0, 4], [4, 1], [1, 5], [5, 0]].forEach(([i, j]) => line3(v[i], v[j]));
    };
    /* ── Solids: opaque line art with hidden-line removal ─────────
       Every object is a set of faces. Each frame the solids are sorted
       back-to-front; for each one only camera-facing faces are filled
       with the paper colour (hiding what's behind) and their unique
       edges are stroked. */
    const toView = (x, y, z) => {
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
      return [x1, y * cp + z1 * sp, -y * sp + z1 * cp];
    };
    const facing = (n, c) => {
      const nv = toView(n[0], n[1], n[2]), cv = toView(c[0], c[1], c[2]);
      return nv[0] * cv[0] + nv[1] * cv[1] + nv[2] * (cv[2] + D) < 0;
    };
    const centroid = (v) => v.reduce((a, p) => [a[0] + p[0] / v.length, a[1] + p[1] / v.length, a[2] + p[2] / v.length], [0, 0, 0]);

    const makeBox = (id, x, y, z, w, h, d, extra = {}) => {
      const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y0 = y, y1 = y + h;
      let faces = [
        { k: 'top', n: [0, 1, 0],  v: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]] },
        { k: 'zf',  n: [0, 0, -1], v: [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]] },
        { k: 'zb',  n: [0, 0, 1],  v: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] },
        { k: 'xl',  n: [-1, 0, 0], v: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]] },
        { k: 'xr',  n: [1, 0, 0],  v: [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]] },
      ];
      if (extra.skip) faces = faces.filter((f) => !extra.skip.includes(f.k));
      return { id, type: 'box', center: [x, y + h / 2, z], faces, x0, x1, y0, y1, z0, z1, ...extra };
    };

    const solids = [];
    // Attacker laptop: base + screen (screen on the far edge, facing the viewer).
    {
      const { x, z, w, d } = laptop, zb = z + d / 2;
      solids.push(makeBox('host', x, 0, z, w, 3, d));
      solids.push({ id: 'host', type: 'plane', center: [x, 16, zb + 3], v: [[x - w / 2, 3, zb], [x + w / 2, 3, zb], [x + w / 2, 30, zb + 7], [x - w / 2, 30, zb + 7]], screen: true });
    }
    // Router + antennas.
    {
      const b = byId.router;
      solids.push(makeBox('router', b.x, 0, b.z, b.w, b.h, b.d));
      solids.push({ id: 'router', type: 'lines', center: [b.x, b.h + 9, b.z + 6], l: [[[b.x - 8, b.h, b.z + 4], [b.x - 11, b.h + 18, b.z + 7]], [[b.x + 8, b.h, b.z + 4], [b.x + 11, b.h + 18, b.z + 7]]] });
    }
    solids.push({ id: 'net', type: 'globe', center: [globe.x, globe.y, globe.z] });
    boxes.filter((b) => b.id !== 'router').forEach((b) => solids.push(makeBox(b.id, b.x, 0, b.z, b.w, b.h, b.d, { units: b.units })));
    // Firewalls: split into segments along z so depth-sorting stays correct.
    walls.forEach((f) => {
      const n = 6, seg = f.d / n, z0 = f.z - f.d / 2;
      const internal = Array.from({ length: n - 1 }, (_, i) => z0 + seg * (i + 1));
      for (let i = 0; i < n; i++) {
        const skip = [];
        if (i > 0) skip.push('zf');
        if (i < n - 1) skip.push('zb');
        solids.push(makeBox(f.id, f.x, 0, z0 + seg * (i + 0.5), f.w, f.h, seg, { skip, internalZ: internal, wall: f }));
      }
    });
    // Workstations: tower + monitor.
    desks.forEach((d) => {
      solids.push(makeBox(d.id, d.x, 0, d.z, 22, 6, 14));
      const zb = d.z + 5;
      solids.push({ id: d.id, type: 'plane', center: [d.x, 16, zb], v: [[d.x - 11, 8, zb], [d.x + 11, 8, zb], [d.x + 11, 24, zb], [d.x - 11, 24, zb]], stand: [[d.x, 6, zb - 1], [d.x, 8, zb]] });
    });
    // SOC stack.
    soc.layers.forEach((_, i) => solids.push(makeBox('siem', soc.x, i * soc.gap, soc.z, soc.w - i * 8, 9, soc.d - i * 8, { soc: true })));
    {
      const hw = (soc.w - 16) / 2;
      solids.push({ id: 'siem', type: 'lines', center: [soc.x, soc.gap, soc.z],
        l: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => [[soc.x + sx * hw, 9, soc.z + sz * hw], [soc.x + sx * hw, soc.gap, soc.z + sz * hw]])
          .concat([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => [[soc.x + sx * (hw - 4), soc.gap + 9, soc.z + sz * (hw - 4)], [soc.x + sx * (hw - 4), soc.gap * 2, soc.z + sz * (hw - 4)]])) });
    }

    const polyPath = (v) => { v.forEach((p, i) => (i ? ln(Pv(p)) : mv(Pv(p)))); ctx.closePath(); };

    const drawSolid = (s, st) => {
      ctx.strokeStyle = st.color; ctx.lineWidth = st.lw;
      if (s.type === 'lines') {
        ctx.globalAlpha = st.alpha; ctx.beginPath(); s.l.forEach(([a, b]) => line3(a, b)); ctx.stroke();
        return;
      }
      if (s.type === 'plane') {
        ctx.globalAlpha = 1; ctx.fillStyle = C.paper; ctx.beginPath(); polyPath(s.v); ctx.fill();
        if (st.tint) { ctx.globalAlpha = st.tintA; ctx.fillStyle = st.tint; ctx.fill(); }
        ctx.globalAlpha = st.alpha; ctx.beginPath(); polyPath(s.v);
        if (s.stand) line3(s.stand[0], s.stand[1]);
        ctx.stroke(); vertexCount += 4;
        if (s.screen) {
          const [a, , , d] = s.v; ctx.globalAlpha = st.alpha * 0.5; ctx.beginPath();
          for (let k = 0; k < 4; k++) {
            const u = 0.25 + k * 0.17, y = a[1] + (d[1] - a[1]) * u, z = a[2] + (d[2] - a[2]) * u - 0.5;
            line3([a[0] + 5, y, z], [a[0] + 10 + ((k * 7) % 20), y, z]);
          }
          ctx.stroke();
        }
        return;
      }
      if (s.type === 'globe') {
        const { x, y, z, r } = globe;
        const c = Pv([x, y, z]), f = D / (D + toView(x, y, z)[2]);
        ctx.globalAlpha = 1; ctx.fillStyle = C.paper; ctx.beginPath(); ctx.arc(c[0], c[1], r * f * S, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = st.alpha; ctx.beginPath(); ctx.arc(c[0], c[1], r * f * S, 0, Math.PI * 2); ctx.stroke();
        const seg = (pts) => {
          for (let i = 1; i < pts.length; i++) {
            const m = [(pts[i][0] + pts[i - 1][0]) / 2, (pts[i][1] + pts[i - 1][1]) / 2, (pts[i][2] + pts[i - 1][2]) / 2];
            if (!facing([m[0] - x, m[1] - y, m[2] - z], m)) continue;
            line3(pts[i - 1], pts[i]);
          }
        };
        ctx.beginPath();
        for (const k of [-0.6, -0.25, 0.1, 0.45, 0.75]) {
          const yy = y + k * r, rr = Math.sqrt(1 - k * k) * r;
          seg(Array.from({ length: 41 }, (_, i) => { const a = (i / 40) * Math.PI * 2; return [x + Math.cos(a) * rr, yy, z + Math.sin(a) * rr]; }));
        }
        for (let m = 0; m < 6; m++) {
          const ph = (m / 6) * Math.PI;
          seg(Array.from({ length: 41 }, (_, i) => { const a = (i / 40) * Math.PI * 2; return [x + Math.cos(a) * r * Math.cos(ph), y + Math.sin(a) * r, z + Math.cos(a) * r * Math.sin(ph)]; }));
        }
        ctx.stroke();
        return;
      }
      // Box.
      const vis = s.faces.filter((f) => facing(f.n, centroid(f.v)));
      ctx.globalAlpha = 1; ctx.fillStyle = C.paper;
      ctx.beginPath(); vis.forEach((f) => polyPath(f.v)); ctx.fill();
      if (st.tint) { ctx.globalAlpha = st.tintA; ctx.fillStyle = st.tint; ctx.fill(); }
      const seen = new Set();
      ctx.globalAlpha = st.alpha; ctx.beginPath();
      vis.forEach((f) => f.v.forEach((a, i) => {
        const b = f.v[(i + 1) % f.v.length];
        if (s.internalZ && Math.abs(a[2] - b[2]) < 1e-6 && s.internalZ.some((v) => Math.abs(v - a[2]) < 1e-6)) return;   // seam between wall segments
        const key = [a, b].map((p) => p.join(',')).sort().join('|');
        if (seen.has(key)) return;
        seen.add(key); line3(a, b);
      }));
      ctx.stroke();
      // Surface detail on visible side faces.
      ctx.globalAlpha = st.alpha * 0.45; ctx.lineWidth = 0.6; ctx.beginPath();
      vis.forEach((f) => {
        if (f.k === 'top') return;
        const [a, b] = f.v;                                  // bottom edge of the face
        if (s.units) {
          const step = (s.y1 - s.y0) / (s.units + 1), inset = 4;
          const len = Math.hypot(b[0] - a[0], b[2] - a[2]), ux = (b[0] - a[0]) / len, uz = (b[2] - a[2]) / len;
          for (let k = 1; k <= s.units; k++) line3([a[0] + ux * inset, k * step, a[2] + uz * inset], [b[0] - ux * inset, k * step, b[2] - uz * inset]);
        }
        if (s.wall && (f.k === 'xl' || f.k === 'xr')) {
          const rows = 6, rh = s.y1 / rows, bw = 26, wz0 = s.wall.z - s.wall.d / 2, xf = a[0];
          for (let r = 1; r < rows; r++) line3([xf, r * rh, s.z0], [xf, r * rh, s.z1]);
          for (let r = 0; r < rows; r++) {
            const off = (r % 2) * bw / 2;
            for (let zz = wz0 + bw - off; zz < s.wall.z + s.wall.d / 2; zz += bw) if (zz > s.z0 && zz < s.z1) line3([xf, r * rh, zz], [xf, (r + 1) * rh, zz]);
          }
        }
      });
      ctx.stroke();
    };


    // ── Agent icons: same line-art language as the scene ──
    // Outlines only (paper fill just to occlude), 1px strokes, detail at lower alpha.
    const iconStroke = (color, g, alpha) => { ctx.strokeStyle = color; ctx.lineWidth = 1.05 / g; ctx.globalAlpha = alpha; };
    const sword = (angle, color, g, alpha) => {
      ctx.save(); ctx.rotate(angle);
      // Local frame: blade along +x, tip at x = -17, hilt end at x = +15.
      ctx.beginPath();
      ctx.moveTo(-17, 0); ctx.lineTo(-13, -1.6); ctx.lineTo(7, -1.6); ctx.lineTo(7, 1.6); ctx.lineTo(-13, 1.6); ctx.closePath();
      ctx.fillStyle = C.paper; ctx.globalAlpha = 1; ctx.fill(); iconStroke(color, g, alpha); ctx.stroke();
      ctx.globalAlpha = alpha * 0.55; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(6, 0); ctx.stroke();      // fuller
      iconStroke(color, g, alpha);
      ctx.beginPath(); ctx.rect(7, -4.5, 1.8, 9); ctx.fillStyle = C.paper; ctx.globalAlpha = 1; ctx.fill(); iconStroke(color, g, alpha); ctx.stroke(); // guard
      ctx.beginPath(); ctx.rect(8.8, -1, 4.6, 2); ctx.stroke();                                                         // grip
      ctx.beginPath(); ctx.arc(15, 0, 1.6, 0, Math.PI * 2); ctx.stroke();                                              // pommel
      ctx.restore();
    };
    const skullIcon = (p, g, alpha) => {
      ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(g, g);
      sword(Math.PI / 4, C.accent, g, alpha);
      sword((3 * Math.PI) / 4, C.accent, g, alpha);
      // Cranium + jaw.
      ctx.beginPath();
      ctx.arc(0, -3, 9, Math.PI * 0.8, Math.PI * 0.2);
      ctx.lineTo(5, 4.5); ctx.lineTo(5, 9); ctx.lineTo(-5, 9); ctx.lineTo(-5, 4.5);
      ctx.closePath();
      ctx.fillStyle = C.paper; ctx.globalAlpha = 1; ctx.fill();
      iconStroke(C.accent, g, alpha); ctx.stroke();
      // Sockets, nose, teeth — outlines only.
      ctx.beginPath(); ctx.arc(-3.6, -2.4, 2.4, 0, Math.PI * 2); ctx.moveTo(6, -2.4); ctx.arc(3.6, -2.4, 2.4, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = alpha * 0.55; ctx.beginPath();
      ctx.moveTo(0, 0.9); ctx.lineTo(-1.3, 3.2); ctx.lineTo(1.3, 3.2); ctx.closePath();
      for (const x of [-2.5, 0, 2.5]) { ctx.moveTo(x, 6); ctx.lineTo(x, 9); }
      ctx.moveTo(-5, 6); ctx.lineTo(5, 6);
      ctx.stroke();
      ctx.restore();
    };
    const shieldIcon = (p, g, pulse) => {
      ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(g, g);
      const shape = (k) => {
        ctx.beginPath();
        ctx.moveTo(0, -13 * k);
        ctx.quadraticCurveTo(6 * k, -9 * k, 11 * k, -9.5 * k);
        ctx.lineTo(11 * k, 0);
        ctx.quadraticCurveTo(11 * k, 9 * k, 0, 14 * k);
        ctx.quadraticCurveTo(-11 * k, 9 * k, -11 * k, 0);
        ctx.lineTo(-11 * k, -9.5 * k);
        ctx.quadraticCurveTo(-6 * k, -9 * k, 0, -13 * k);
        ctx.closePath();
      };
      if (pulse >= 0) {                                   // response: expanding outlines
        for (let i = 0; i < 2; i++) {
          const kk = (pulse * 0.9 + i * 0.5) % 1;
          iconStroke(C.blue, g, (1 - kk) * 0.6); shape(1 + kk * 0.9); ctx.stroke();
        }
      }
      shape(1); ctx.fillStyle = C.paper; ctx.globalAlpha = 1; ctx.fill();
      iconStroke(C.blue, g, 1); ctx.stroke();
      ctx.globalAlpha = 0.55;
      shape(0.72); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -9.4); ctx.lineTo(0, 10); ctx.moveTo(-7.9, -2); ctx.lineTo(7.9, -2); ctx.stroke();
      ctx.restore();
    };

    // ── Frame ──
    let placed = [];
    let hits = {}, hoverId = null, selId = null;
    const draw = (t) => {
      vertexCount = 0; placed = hudRect ? [hudRect.slice()] : [];
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const small = W < 700;

      // Frame marks.
      ctx.strokeStyle = C.ink3; ctx.lineWidth = 0.75; ctx.globalAlpha = 0.7;
      crosshairs(ctx, W, H);
      ctx.beginPath(); ctx.moveTo(18, 30); ctx.lineTo(18, H * 0.4);
      for (let y = 30; y <= H * 0.4; y += 12) { ctx.moveTo(18, y); ctx.lineTo((y - 30) % 60 === 0 ? 26 : 22, y); }
      ctx.stroke();

      // Zones: thin dashed outlines with corner ticks.
      zones.forEach((z) => {
        ctx.strokeStyle = C.ink; ctx.lineWidth = 0.6; ctx.globalAlpha = 0.22; ctx.setLineDash([2, 5]); ctx.beginPath();
        line3([z.x0, 0, z.z0], [z.x1, 0, z.z0]); line3([z.x1, 0, z.z0], [z.x1, 0, z.z1]);
        line3([z.x1, 0, z.z1], [z.x0, 0, z.z1]); line3([z.x0, 0, z.z1], [z.x0, 0, z.z0]);
        ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 0.55; ctx.lineWidth = 0.8; ctx.beginPath();
        for (const [cx, cz, sx, sz] of [[z.x0, z.z0, 1, 1], [z.x1, z.z0, -1, 1], [z.x1, z.z1, -1, -1], [z.x0, z.z1, 1, -1]]) {
          line3([cx, 0, cz], [cx + 10 * sx, 0, cz]); line3([cx, 0, cz], [cx, 0, cz + 10 * sz]);
        }
        ctx.stroke();
        if (!small || ['DMZ', 'SOC', 'ZONE 0 · ATTACKER'].includes(z.name)) {
          const p = P(z.x0, 0, z.z0 - 8);
          ctx.globalAlpha = 0.85; ctx.fillStyle = C.ink3; ctx.font = `9.5px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.lineWidth = 3; ctx.strokeStyle = C.paper; ctx.strokeText(z.name, p[0], p[1] + 2);
          ctx.fillText(z.name, p[0], p[1] + 2);
          placed.push([p[0], p[1], p[0] + ctx.measureText(z.name).width, p[1] + 14]);
        }
      });

      // Network links + telemetry (drawn first: objects occlude them).
      ctx.strokeStyle = C.ink; ctx.globalAlpha = showAll ? 0.3 : 0.2; ctx.lineWidth = 0.75; ctx.setLineDash([3, 4]);
      ctx.beginPath(); links.forEach(([a, b]) => arc3(N[a], N[b])); ctx.stroke();
      ctx.strokeStyle = C.blue; ctx.globalAlpha = 0.18; ctx.setLineDash([1, 5]);
      ctx.beginPath(); sensors.forEach((s) => arc3(N[s], N.siem, 0, 1, 20)); ctx.stroke();
      ctx.setLineDash([]);

      // Solids, back to front.
      const stage = STAGES[stageAt(t)];
      const focus = new Set(showAll ? [] : stage.focus);
      const owned = new Set(chain.filter((c) => t >= c[3] && t < T_RESET).map((c) => c[1]));
      const responding = t >= T_RESPOND && t < T_RESET;
      const isolated = new Set(responding ? ['dc', 'ws1', 'ws3'] : []);
      const lit = t >= 8.0 && t < T_CONTAIN ? 0.6 + 0.4 * Math.sin(t * 9) : 0;
      const hardened = responding ? clamp((t - T_RESPOND) * 1.5 - 0.5, 0, 1) : 0;
      const order = solids.map((s) => ({ s, z: toView(...s.center)[2] })).sort((a, b) => b.z - a.z);
      hits = {};
      order.forEach(({ s, z }) => {
        const picked = s.id === hoverId || s.id === selId;
        const on = focus.has(s.id) || picked;
        const st = { alpha: showAll || on ? (on ? 1 : 0.9) : 0.45, lw: s.id === selId ? 1.7 : on ? 1.25 : 0.85, color: C.ink, tint: null, tintA: 0 };
        // Screen-space bounds for click / hover picking.
        const pts = s.type === 'box' ? s.faces.flatMap((f) => f.v) : s.type === 'plane' ? s.v : s.type === 'lines' ? s.l.flat() : null;
        let bx;
        if (pts) {
          const pp = pts.map(Pv), xs = pp.map((q) => q[0]), ys = pp.map((q) => q[1]);
          bx = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
        } else {                                           // globe
          const c = Pv([globe.x, globe.y, globe.z]), r = globe.r * S * (D / (D + toView(globe.x, globe.y, globe.z)[2]));
          bx = [c[0] - r, c[1] - r, c[0] + r, c[1] + r];
        }
        const prev = hits[s.id];
        hits[s.id] = prev ? { b: [Math.min(prev.b[0], bx[0]), Math.min(prev.b[1], bx[1]), Math.max(prev.b[2], bx[2]), Math.max(prev.b[3], bx[3])], z: Math.min(prev.z, z) } : { b: bx, z };
        if (isolated.has(s.id)) { st.tint = C.blue; st.tintA = 0.14; }
        else if (owned.has(s.id)) { st.tint = C.accent; st.tintA = 0.1; }
        if (s.soc && lit) { st.tint = C.blue; st.tintA = 0.22 * lit; }
        if (s.id === 'ifw' && hardened > 0) { st.color = C.blue; st.alpha = Math.max(st.alpha, hardened); st.lw = 1.5; st.tint = C.blue; st.tintA = 0.1 * hardened; }
        drawSolid(s, st);
      });

      // Telemetry packets flowing to the SOC (always on; alerts in red after detection).
      sensors.forEach((s, i) => {
        const k = ((t * 0.22) + i * 0.137) % 1;
        const p = Pv(arcPt(N[s], N.siem, k));
        const alert = t >= T_DETECT && t < T_RESPOND + 0.6 && (s === 'ws1' || s === 'ws3' || s === 'dc');
        ctx.fillStyle = alert ? C.accent : C.blue; ctx.globalAlpha = alert ? 1 : 0.55;
        ctx.beginPath(); ctx.arc(p[0], p[1], alert ? 2.4 : 1.4, 0, Math.PI * 2); ctx.fill();
      });

      // Agents.
      const bob = Math.sin(t * 1.6) * 4;
      const offPos = [N.off[0], N.off[1] + bob, N.off[2]];
      const defPos = [N.def[0], N.def[1] - bob, N.def[2]];
      ctx.lineWidth = 1.05;
      const g = clamp(S * 1.5, 0.95, 1.9);
      const contained = t >= T_CONTAIN && t < T_RESET;
      ctx.strokeStyle = C.accent; ctx.globalAlpha = 0.45; ctx.setLineDash([2, 4]);
      ctx.beginPath(); line3([offPos[0], offPos[1] - 16, offPos[2]], N.host); ctx.stroke();
      ctx.strokeStyle = C.blue;
      ctx.beginPath(); line3([defPos[0], defPos[1] - 16, defPos[2]], N.siem); ctx.stroke(); ctx.setLineDash([]);
      skullIcon(Pv(offPos), g, contained ? 0.4 : 1);
      shieldIcon(Pv(defPos), g, t >= T_RESPOND && t < T_RESET ? (t - T_RESPOND) : -1);
      for (const [id, pos] of [['off', offPos], ['def', defPos]]) {
        const q = Pv(pos), r = 19 * g;
        hits[id] = { b: [q[0] - r, q[1] - r, q[0] + r, q[1] + r], z: -Infinity };
        if (id === selId || id === hoverId) {
          ctx.strokeStyle = id === 'off' ? C.accent : C.blue; ctx.globalAlpha = 0.8; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
          ctx.beginPath(); ctx.arc(q[0], q[1], r + 3, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        }
      }

      // Recon: scan rays from the attacker host.
      if (t < 1.4) {
        ctx.strokeStyle = C.accent; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.55 * (0.5 + 0.5 * Math.sin(t * 22)); ctx.setLineDash([2, 5]);
        ctx.beginPath(); ['router', 'net'].forEach((n) => line3(N.off, N[n])); ctx.stroke(); ctx.setLineDash([]);
      }

      // Kill chain.
      const fade = t > T_CONTAIN ? clamp(1 - (t - T_CONTAIN) / 2.4, 0.12, 1) : 1;
      let head = null;
      chain.forEach(([a, b, t0, t1]) => {
        if (t < t0) return;
        const k = ease((t - t0) / (t1 - t0));
        ctx.strokeStyle = C.accent; ctx.globalAlpha = fade; ctx.lineWidth = 1.6;
        ctx.beginPath(); arc3(N[a], N[b], 0, k); ctx.stroke();
        if (t < t1) head = arcPt(N[a], N[b], k);
        else if (['mail', 'ws1', 'ws3', 'dc'].includes(b)) {        // compromised host marker
          const c = N[b]; ctx.globalAlpha = 0.85 * fade; ctx.lineWidth = 1.1;
          ctx.beginPath(); circle3([c[0], 0, c[2]], b === 'dc' ? 34 : 22, c[1], 36); ctx.stroke();
        }
      });
      if (head) {
        const p = Pv(head);
        ctx.fillStyle = C.accent; ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = C.accent; ctx.lineWidth = 0.75; ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.arc(p[0], p[1], 7 + 2 * Math.sin(t * 10), 0, Math.PI * 2); ctx.stroke();
        if (!small) {
          ctx.globalAlpha = 0.9; ctx.font = `9.5px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(`x ${(head[0] / 1000).toFixed(4)} z ${(head[2] / 1000).toFixed(4)}`, p[0] + 12, p[1] + 14);
        }
      }

      // Response: Defensive Agent isolates hosts and blocks the path.
      if (t >= T_RESPOND && t < T_RESET) {
        const k = (t - T_RESPOND) / (T_RESET - T_RESPOND);
        ctx.strokeStyle = C.blue; ctx.lineWidth = 1.3; ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ['dc', 'ws1', 'ifw'].forEach((n, i) => arc3(defPos, N[n], 0, ease(k * 3 - i * 0.25)));
        ctx.stroke();
        ['dc', 'ws1'].forEach((n) => {                               // isolation rings
          const c = N[n];
          for (let i = 0; i < 2; i++) {
            const kk = (k * 2.4 + i * 0.5) % 1;
            ctx.globalAlpha = (1 - kk) * 0.75; ctx.beginPath(); circle3([c[0], 0, c[2]], 26 + kk * 50, 0, 40); ctx.stroke();
          }
        });
        // Severed hops.
        ctx.lineWidth = 1.5; ctx.globalAlpha = clamp(k * 4, 0, 1);
        [['ws3', 'dc'], ['mail', 'ws1']].forEach(([a, b]) => {
          const m = Pv(arcPt(N[a], N[b], 0.5));
          ctx.beginPath(); ctx.moveTo(m[0] - 5, m[1] - 5); ctx.lineTo(m[0] + 5, m[1] + 5); ctx.moveTo(m[0] + 5, m[1] - 5); ctx.lineTo(m[0] - 5, m[1] + 5); ctx.stroke();
        });
      }

      // Dimension line on the DC.
      if (!small) {
        const dc = byId.dc, dx = dc.x + dc.w / 2 + 16;
        const a = P(dx, 0, dc.z + dc.d / 2), b = P(dx, dc.h, dc.z + dc.d / 2);
        ctx.strokeStyle = C.ink3; ctx.globalAlpha = 0.8; ctx.lineWidth = 0.7;
        ctx.beginPath(); mv(a); ln(b); ctx.moveTo(a[0] - 4, a[1]); ctx.lineTo(a[0] + 4, a[1]); ctx.moveTo(b[0] - 4, b[1]); ctx.lineTo(b[0] + 4, b[1]); ctx.stroke();
        ctx.fillStyle = C.ink3; ctx.font = `9.5px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(dc.h.toFixed(1), (a[0] + b[0]) / 2 + 6, (a[1] + b[1]) / 2);
      }

      // Labels — placed with simple collision avoidance.
      const lab = (pt, text, lift, color = C.ink2, dir = 1) => {
        ctx.font = `10px ${MONO}`;
        const tw = ctx.measureText(text).width;
        const fits = (r) => r[0] > 4 && r[2] < W - 4 && r[1] > 26 && !placed.some((q) => r[0] < q[2] + 4 && r[2] > q[0] - 4 && r[1] < q[3] + 3 && r[3] > q[1] - 3);
        for (let extra = 0; extra <= 96; extra += 12) {
          for (const d of [dir, -dir]) {
            const L = lift + extra, lx = pt[0] + Math.max(10, L * 0.7) * d, ly = pt[1] - L;
            const r = d > 0 ? [lx, ly - 7, lx + 11 + tw, ly + 7] : [lx - 11 - tw, ly - 7, lx, ly + 7];
            if (fits(r)) { placed.push(r); label(ctx, pt[0], pt[1], text, d, color, true, L); return; }
          }
        }
      };
      { const q = Pv(offPos); lab([q[0] + 10 * g, q[1] - 12 * g], 'A-00 Offensive Agent', 14, C.accent); }
      { const q = Pv(defPos); lab([q[0] - 9 * g, q[1] - 11 * g], 'B-00 Defensive Agent', 14, C.blue, -1); }
      const items = [
        ['host', P(laptop.x + laptop.w / 2, 30, laptop.z - laptop.d / 2 - 7), 'A-01 Attacker host', 16],
        ['net', P(globe.x + globe.r * 0.7, globe.y + globe.r * 0.7, 0), 'I-00 Internet', 16],
        ...[...boxes, ...walls].map((b) => [b.id, P(b.x + b.w / 2, b.h, b.z - b.d / 2), b.label, b.lift]),
        ['ws1', P(desks[0].x + 11, 24, desks[0].z - 2), 'U-11 Workstation', 14],
        ['ws3', P(desks[2].x + 11, 24, desks[2].z - 2), 'U-13 Workstation', 14],
      ];
      items.forEach(([id, pt, text, lift]) => {
        const active = focus.has(id);
        if (!showAll && !active && !owned.has(id) && id !== hoverId && id !== selId) return;
        if (showAll && small && !['xfw', 'ifw', 'dc', 'mail'].includes(id)) return;
        lab(pt, small ? text.split(' ').slice(1).join(' ') : text, lift, active ? C.ink : owned.has(id) ? C.accent : C.ink2);
      });
      if (showAll && !small) {
        soc.layers.forEach((name, i) => lab(P(soc.x + (soc.w - i * 8) / 2, i * soc.gap + 9, soc.z + (soc.d - i * 8) / 2), name, 10 + i * 4, C.ink2, 1));
      } else {
        lab(P(soc.x + soc.w / 2, soc.gap * 2 + 9, soc.z + soc.d / 2 - 8), small ? 'SOC stack' : 'C-00 SOC · SIEM · EDR · SOAR', 14, focus.has('siem') ? C.blue : C.ink2, 1);
      }
      ctx.globalAlpha = 1;
    };

    // ── HUD ──
    let lastHud = 0;
    const updateHud = (t, now, force) => {
      if (!force && now - lastHud < 120) return;
      lastHud = now;
      const set = (k, v) => { if (hud[k] && hud[k].textContent !== v) hud[k].textContent = v; };
      set('scale', `1:${S.toFixed(2)}`);
      set('nodes', String(boxes.length + walls.length + desks.length + 6));
      set('links', String(links.length + sensors.length));
      set('vertices', String(vertexCount));
      set('yaw', `${((yaw * 180) / Math.PI).toFixed(1)}°`);
      set('pitch', `${((pitch * 180) / Math.PI).toFixed(1)}°`);
      set('phase', phaseAt(t));
      renderLog(t);
    };

    // ── Interaction: drag to rotate, eases back to the base view ──
    let dragging = false, lx = 0, ly = 0, lastInteract = -1e9;
    const pick = (e) => {
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, pad = 4;
      let best = null;
      for (const [id, h] of Object.entries(hits)) {
        const [x0, y0, x1, y1] = h.b;
        if (x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad && (!best || h.z < best.z)) best = { id, z: h.z };
      }
      return best && LOGS[best.id] ? best.id : null;
    };
    let downX = 0, downY = 0, moved = false;
    canvas.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; moved = false; });
    canvas.addEventListener('pointermove', (e) => {
      if (dragging) { if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) moved = true; return; }
      const id = pick(e);
      if (id !== hoverId) {
        hoverId = id;
        if (id) canvas.dataset.hover = LOGS[id].title; else delete canvas.dataset.hover;
        canvas.classList.toggle('is-hot', !!id);
        if (!running) still();
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      if (moved) return;
      const id = pick(e);
      const r = canvas.getBoundingClientRect();
      if (id) openLog(id, e.clientX - r.left < r.width / 2 ? 'right' : 'left'); else closeLog();
    });
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true; lx = e.clientX; ly = e.clientY;
      canvas.setPointerCapture(e.pointerId); canvas.classList.add('is-dragging');
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      yawOff = clamp(yawOff + (e.clientX - lx) * 0.006, -1.2, 1.2);
      pitchOff = clamp(pitchOff + (e.clientY - ly) * 0.004, -0.35, 0.45);
      lx = e.clientX; ly = e.clientY; lastInteract = performance.now();
    });
    const endDrag = () => { dragging = false; canvas.classList.remove('is-dragging'); };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    // ── Log window (click a machine) ──
    const LOGS = window.SCENE_LOGS || {};
    const fig = canvas.parentElement;
    const win = document.createElement('div');
    win.className = 'logwin'; win.hidden = true;
    win.innerHTML = '<div class="logwin-bar mono"><span class="lights" aria-hidden="true"><i></i><i></i><i></i></span><span class="logwin-title"></span><span class="logwin-src"></span><button type="button" class="logwin-x" aria-label="Close logs">esc</button></div><div class="logwin-body mono" role="log" aria-live="off"></div><div class="logwin-foot mono">simulated logs · synced to the attack · click another machine</div>';
    fig.append(win);
    const body = win.querySelector('.logwin-body');
    let shown = -1;
    const stamp = (t, i) => { const s0 = 14 * 3600 + Math.round(t * 60) + (i * 7) % 11, h = Math.floor(s0 / 3600), m = Math.floor(s0 / 60) % 60, s1 = s0 % 60; return [h, m, s1].map((v) => String(v).padStart(2, '0')).join(':'); };
    const renderLog = (t, force) => {
      if (!selId) return;
      const lines = LOGS[selId].lines.filter((l) => l[0] <= t);
      if (!force && lines.length === shown) return;
      const grow = lines.length > shown && shown >= 0 && !force;
      shown = lines.length;
      if (!lines.length) { body.innerHTML = '<div class="ll dim">… waiting for events (nothing has reached this machine yet)</div>'; return; }
      body.innerHTML = '';
      lines.forEach(([lt, kind, text], i) => {
        const row = document.createElement('div');
        row.className = `ll ${kind}`;
        const ts = document.createElement('span'); ts.className = 'll-t'; ts.textContent = stamp(lt, i);
        row.append(ts, document.createTextNode(text));
        if (grow && i === lines.length - 1) row.classList.add('is-new');
        body.append(row);
      });
      body.scrollTop = body.scrollHeight;
    };
    const openLog = (id, side = 'left') => {
      selId = id; shown = -1;
      win.classList.toggle('is-right', side === 'right');
      win.querySelector('.logwin-title').textContent = LOGS[id].title;
      win.querySelector('.logwin-src').textContent = LOGS[id].src;
      win.hidden = false; win.classList.toggle('is-off', id === 'off'); win.classList.toggle('is-def', id === 'def');
      renderLog(clock, true);
      if (!running) still();
    };
    const closeLog = () => { if (!selId) return; selId = null; win.hidden = true; if (!running) still(); };
    win.querySelector('.logwin-x').addEventListener('click', closeLog);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && selId && !document.querySelector('.console.is-open')) closeLog(); });

    // ── Stage rail + caption ──
    const rail = document.getElementById('stages');
    const capEl = document.getElementById('scene-caption');
    const playBtn = document.getElementById('scene-play');
    let lastStage = -1;
    const railItems = rail ? STAGES.map((st, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      if (i >= 8) b.classList.add('is-def');
      const n = document.createElement('span'); n.className = 'st-n'; n.textContent = String(i).padStart(2, '0');
      const nm = document.createElement('span'); nm.className = 'st-name'; nm.textContent = st.name;
      b.append(n, nm);
      b.addEventListener('click', () => { clock = st.t + 0.001; lastStage = -1; if (!running) still(); });
      li.appendChild(b); rail.appendChild(li);
      return b;
    }) : [];
    const updateRail = (t) => {
      const i = stageAt(t);
      const next = STAGES[i + 1]?.t ?? LOOP;
      if (i !== lastStage) {
        railItems.forEach((b, j) => {
          b.classList.toggle('is-active', j === i); b.classList.toggle('is-done', j < i);
          if (j === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
        });
        if (capEl) capEl.textContent = STAGES[i].text;
        capEl?.classList.toggle('is-def', i >= 8);
        hudEl?.classList.toggle('is-def', i >= 8);
        const b = railItems[i];
        if (b && rail.scrollWidth > rail.clientWidth + 2) {
          rail.scrollTo({ left: b.parentElement.offsetLeft - rail.clientWidth / 2 + b.offsetWidth / 2, behavior: reduceMotion ? 'auto' : 'smooth' });
        }
        lastStage = i;
      }
      railItems[i]?.style.setProperty('--k', clamp((t - STAGES[i].t) / (next - STAGES[i].t), 0, 1).toFixed(3));
    };

    canvas.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { showAll = true; if (!running) still(); } });
    canvas.addEventListener('pointerleave', () => { showAll = false; if (!running) still(); });

    // ── Loop ──
    const STILL = 9.2; // frame used for reduced motion: full chain + response
    let running = false, visible = true, playing = !reduceMotion, clock = reduceMotion ? STILL : 0;
    let prev = performance.now();
    const frame = (now) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      if (!dragging && now - lastInteract > 2000) { yawOff *= Math.pow(0.15, dt); pitchOff *= Math.pow(0.15, dt); }
      const sway = playing ? Math.sin(now / 5200) * 0.07 : 0;
      yaw = baseYaw + yawOff + sway; pitch = basePitch + pitchOff;
      if (playing) clock = (clock + dt * (ALERT ? 2.6 : 1)) % LOOP;
      draw(clock); updateHud(clock, now); updateRail(clock);
      requestAnimationFrame(frame);
    };
    const start = () => { if (running || !playing) return; running = true; prev = performance.now(); requestAnimationFrame(frame); };
    const stop = () => { running = false; };
    const sync = () => (visible && !document.hidden ? start() : stop());
    const still = () => { yaw = baseYaw + yawOff; pitch = basePitch + pitchOff; draw(clock); updateHud(clock, 0, true); updateRail(clock); };
    const setPlayLabel = () => {
      if (!playBtn) return;
      playBtn.textContent = playing ? '❚❚ Pause' : '▶ Play';
      playBtn.setAttribute('aria-pressed', String(!playing));
    };
    playBtn?.addEventListener('click', () => {
      playing = !playing; setPlayLabel();
      if (playing) sync(); else { stop(); still(); }
    });
    // While paused, dragging still redraws.
    canvas.addEventListener('pointermove', () => { if (!running && dragging) still(); });

    resize(); setPlayLabel();
    if (playing) start(); else still();
    new ResizeObserver(() => { resize(); if (!running) still(); }).observe(canvas);
    onTheme.push(() => { if (!running) still(); });
    document.addEventListener('visibilitychange', sync);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([en]) => { visible = en.isIntersecting; sync(); }).observe(canvas);
    }
  };

  /* ══════════════════════════════════════════════════════════
     2. RESEARCH FIGURES
     ══════════════════════════════════════════════════════════ */
  const FIGS = {
    // A — attack vectors converging on a target.
    offense(ctx, w, h, p, rnd) {
      const T = [w * 0.74, h * 0.34];
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1;
      // Target crosshair.
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(T[0], T[1], 10, 0, Math.PI * 2); ctx.moveTo(T[0] - 16, T[1]); ctx.lineTo(T[0] + 16, T[1]); ctx.moveTo(T[0], T[1] - 16); ctx.lineTo(T[0], T[1] + 16); ctx.stroke();
      label(ctx, T[0] + 6, T[1] - 6, 'T-01 10.0.4.12', w - T[0] < 110 ? -1 : 1, C.ink2, false);
      // Arrows.
      const N = 54;
      ctx.strokeStyle = C.accent; ctx.fillStyle = C.accent; ctx.lineWidth = 1.2;
      for (let i = 0; i < N; i++) {
        const u = rnd(), v = rnd();
        const x = w * (0.04 + u * 0.62), y = h * (0.42 + v * 0.55);
        const ang = Math.atan2(T[1] - y, T[0] - x) + (rnd() - 0.5) * 0.35;
        const len = 7 + rnd() * 18;
        if (i / N > p) continue;
        ctx.globalAlpha = 0.45 + rnd() * 0.5;
        const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(ang - 0.45) * 4.5, ey - Math.sin(ang - 0.45) * 4.5);
        ctx.lineTo(ex - Math.cos(ang + 0.45) * 4.5, ey - Math.sin(ang + 0.45) * 4.5);
        ctx.closePath(); ctx.fill();
      }
      // Successful path.
      const pts = [[w * 0.06, h * 0.94], [w * 0.28, h * 0.72], [w * 0.36, h * 0.58], [w * 0.55, h * 0.5], [T[0] - 8, T[1] + 8]];
      ctx.globalAlpha = 1; ctx.lineWidth = 1.4; ctx.setLineDash([4, 3]);
      ctx.beginPath(); polyPart(ctx, pts, p); ctx.stroke(); ctx.setLineDash([]);
    },

    // B — APT trails converging; one synthetic copy.
    adversary(ctx, w, h, p, rnd) {
      const actors = ['APT28', 'APT29', 'APT41', 'APT44', 'Lazarus'];
      const starts = [[0.08, 0.12], [0.1, 0.85], [0.9, 0.1], [0.92, 0.88], [0.5, 0.06]];
      const Cn = [w * 0.52, h * 0.56];
      const trails = actors.map((name, i) => {
        let [x, y] = [starts[i][0] * w, starts[i][1] * h];
        const pts = [[x, y]];
        for (let s = 0; s < 34; s++) {
          const ang = Math.atan2(Cn[1] - y, Cn[0] - x) + (rnd() - 0.5) * 1.6;
          const st = 4 + rnd() * 6;
          x += Math.cos(ang) * st; y += Math.sin(ang) * st;
          pts.push([x, y]);
        }
        return { name, pts };
      });
      ctx.lineWidth = 1;
      trails.forEach(({ name, pts }, i) => {
        ctx.strokeStyle = C.ink; ctx.fillStyle = C.ink; ctx.globalAlpha = 0.75;
        ctx.beginPath(); polyPart(ctx, pts, p); ctx.stroke();
        const n = Math.floor(pts.length * p);
        for (let k = 0; k < n; k += 5) { ctx.beginPath(); ctx.arc(pts[k][0], pts[k][1], 1.6, 0, Math.PI * 2); ctx.fill(); }
        if (MINI) return;
        ctx.globalAlpha = 1; ctx.font = `10px ${MONO}`; ctx.fillStyle = C.ink2;
        ctx.textAlign = starts[i][0] > 0.6 ? 'right' : 'left'; ctx.textBaseline = starts[i][1] > 0.5 ? 'bottom' : 'top';
        ctx.fillText(name, pts[0][0], pts[0][1] + (starts[i][1] > 0.5 ? -4 : 4));
      });
      // Synthetic APT29: mimics the real trail with a slight offset.
      const src = trails[1].pts;
      const syn = src.map(([x, y]) => [x + 4 + (rnd() - 0.5) * 3, y - 4 + (rnd() - 0.5) * 3]);
      ctx.strokeStyle = C.accent; ctx.globalAlpha = 1; ctx.lineWidth = 1.4; ctx.setLineDash([4, 3]);
      ctx.beginPath(); polyPart(ctx, syn, p); ctx.stroke(); ctx.setLineDash([]);
      if (p > 0.95) {
        const e = syn[syn.length - 1];
        label(ctx, e[0], e[1], 'synthetic APT29?', 1, C.accent);
      }
      // Convergence zone.
      ctx.strokeStyle = C.ink3; ctx.globalAlpha = 0.7; ctx.lineWidth = 0.75; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.arc(Cn[0], Cn[1], 28, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    },

    // C — range blocks, captured flags and the route between them.
    evaluation(ctx, w, h, p, rnd) {
      const blocks = [];
      const split = (x, y, bw, bh, depth) => {
        if (depth > 4 || (bw < 60 && bh < 60) || (depth > 2 && rnd() < 0.25)) { blocks.push([x, y, bw, bh]); return; }
        const gap = 6;
        if (bw > bh) {
          const s = bw * (0.35 + rnd() * 0.3);
          split(x, y, s - gap / 2, bh, depth + 1); split(x + s + gap / 2, y, bw - s - gap / 2, bh, depth + 1);
        } else {
          const s = bh * (0.35 + rnd() * 0.3);
          split(x, y, bw, s - gap / 2, depth + 1); split(x, y + s + gap / 2, bw, bh - s - gap / 2, depth + 1);
        }
      };
      split(10, 10, w - 20, h - 20, 0);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 0.8;
      blocks.forEach(([x, y, bw, bh]) => {
        ctx.globalAlpha = 0.55; ctx.strokeRect(x + 0.5, y + 0.5, bw, bh);
        // Buildings inside each block.
        ctx.globalAlpha = 0.3;
        const n = 1 + Math.floor(rnd() * 4);
        for (let i = 0; i < n; i++) {
          const iw = bw * (0.2 + rnd() * 0.35), ih = bh * (0.2 + rnd() * 0.35);
          ctx.strokeRect(x + 3 + rnd() * (bw - iw - 6), y + 3 + rnd() * (bh - ih - 6), iw, ih);
        }
      });
      // Captured flags + route.
      const picks = blocks.slice().sort(() => rnd() - 0.5).slice(0, 6)
        .map(([x, y, bw, bh]) => [x + bw / 2, y + bh / 2, Math.min(bw, bh)])
        .sort((a, b) => a[0] - b[0]);
      const route = [];
      picks.forEach(([x, y], i) => { if (i) route.push([x, route[route.length - 1][1]]); route.push([x, y]); });
      ctx.strokeStyle = C.accent; ctx.globalAlpha = 1; ctx.lineWidth = 1.5;
      ctx.beginPath(); polyPart(ctx, route, p); ctx.stroke();
      ctx.fillStyle = C.accent;
      picks.forEach(([x, y, s], i) => {
        if ((i + 0.5) / picks.length > p) return;
        const q = Math.max(6, Math.min(14, s * 0.25));
        ctx.globalAlpha = 0.9; ctx.fillRect(x - q / 2, y - q / 2, q, q);
      });
      if (p > 0.95) {
        const last = picks[picks.length - 1];
        label(ctx, last[0], last[1] - 6, `flags ${picks.length}/${picks.length}`, last[0] > w * 0.6 ? -1 : 1, C.accent, false);
      }
    },
    // D — layered network graph: red path left→right, blue containment at the end.
    network(ctx, w, h, p, rnd) {
      const cols = Math.max(4, Math.round(w / 90)), layers = [];
      for (let c = 0; c < cols; c++) {
        const n = 2 + Math.floor(rnd() * 3), x = w * (0.08 + 0.84 * (c / (cols - 1)));
        layers.push(Array.from({ length: n }, (_, i) => [x + (rnd() - 0.5) * 18, h * (0.18 + 0.64 * ((i + 0.5) / n)) + (rnd() - 0.5) * 20]));
      }
      ctx.strokeStyle = C.ink; ctx.lineWidth = 0.75; ctx.globalAlpha = 0.35; ctx.setLineDash([3, 4]);
      ctx.beginPath();
      for (let c = 0; c < cols - 1; c++) layers[c].forEach((a) => layers[c + 1].forEach((b) => { if (rnd() < 0.55) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } }));
      ctx.stroke(); ctx.setLineDash([]);
      const path = layers.map((l) => l[Math.floor(rnd() * l.length)]);
      ctx.strokeStyle = C.accent; ctx.lineWidth = 1.6; ctx.globalAlpha = 1;
      ctx.beginPath(); polyPart(ctx, path, Math.min(1, p * 1.15)); ctx.stroke();
      const q = MINI ? 3 : 4;
      layers.flat().forEach(([x, y]) => {
        const hit = path.some((pp, i) => pp[0] === x && pp[1] === y && i / (cols - 1) <= p * 1.15);
        ctx.globalAlpha = 1; ctx.fillStyle = hit ? C.accent : C.paper; ctx.strokeStyle = hit ? C.accent : C.ink;
        ctx.beginPath(); ctx.rect(x - q, y - q, q * 2, q * 2); ctx.fill(); ctx.stroke();
      });
      if (p > 0.85) {
        const k = (p - 0.85) / 0.15, last = path[path.length - 1];
        ctx.strokeStyle = C.blue; ctx.lineWidth = 1.2; ctx.globalAlpha = k;
        for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(last[0], last[1], 8 + i * 7, 0, Math.PI * 2); ctx.stroke(); }
        label(ctx, last[0], last[1] - 30, 'contained', -1, C.blue, false);
      }
      label(ctx, path[0][0], path[0][1], 'entry', 1, C.accent);
    },

    // E — telemetry waveforms with an anomaly the defender brackets.
    signal(ctx, w, h, p, rnd) {
      const rows = Math.max(6, Math.round(h / 26)), ax = w * (0.55 + rnd() * 0.15), hitRows = new Set([2, 3, 4].map((r) => r + Math.floor(rnd() * (rows - 6))));
      for (let r = 0; r < rows; r++) {
        const y = h * (0.12 + 0.76 * (r / (rows - 1))), amp = 2 + rnd() * 3, freq = 0.04 + rnd() * 0.05, ph = rnd() * 10;
        const pts = [];
        for (let x = 10; x <= w - 10; x += 3) {
          let v = Math.sin(x * freq + ph) * amp + (rnd() - 0.5) * 2;
          if (hitRows.has(r)) v += Math.exp(-Math.pow((x - ax) / 9, 2)) * -(14 + rnd() * 6);
          pts.push([x, y + v]);
        }
        ctx.strokeStyle = hitRows.has(r) ? C.accent : C.ink; ctx.globalAlpha = hitRows.has(r) ? 1 : 0.55; ctx.lineWidth = hitRows.has(r) ? 1.2 : 0.8;
        ctx.beginPath(); polyPart(ctx, pts, p); ctx.stroke();
      }
      if (p > 0.7) {
        const k = (p - 0.7) / 0.3, ys = [...hitRows].map((r) => h * (0.12 + 0.76 * (r / (rows - 1))));
        const y0 = Math.min(...ys) - 24, y1 = Math.max(...ys) + 10, x0 = ax - 22, x1 = ax + 22;
        ctx.strokeStyle = C.blue; ctx.globalAlpha = k; ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x0 + 6, y0); ctx.lineTo(x0, y0); ctx.lineTo(x0, y1); ctx.lineTo(x0 + 6, y1);
        ctx.moveTo(x1 - 6, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y1); ctx.lineTo(x1 - 6, y1);
        ctx.stroke();
        label(ctx, x1, y0, 'alert · 0.97', 1, C.blue, false);
      }
    },

    // F — survey terrain: markers, a measured line, red and blue positions.
    terrain(ctx, w, h, p, rnd) {
      const pts = Array.from({ length: 4 }, () => [w * (0.15 + rnd() * 0.7), h * (0.2 + rnd() * 0.6)]);
      const [a, b] = pts;
      ctx.strokeStyle = C.ink; ctx.globalAlpha = 0.8; ctx.lineWidth = 0.8; ctx.setLineDash([4, 4]);
      ctx.beginPath(); polyPart(ctx, [a, b], p); ctx.stroke(); ctx.setLineDash([]);
      if (p > 0.9 && !MINI) {
        ctx.font = `10px ${MONO}`; ctx.fillStyle = C.ink2; ctx.textAlign = 'center';
        ctx.fillText(`${Math.hypot(b[0] - a[0], b[1] - a[1]).toFixed(1)} m`, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 8);
      }
      pts.forEach(([x, y], i) => {
        const col = i === 0 ? C.accent : i === 1 ? C.blue : C.ink;
        ctx.strokeStyle = col; ctx.globalAlpha = i < 2 ? 1 : 0.7; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y); ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 12); ctx.stroke();
        label(ctx, x + 5, y - 5, `${(x / w).toFixed(3)}, ${(y / h).toFixed(3)}`, x > w * 0.7 ? -1 : 1, i < 2 ? col : C.ink3, false, 14);
      });
    },
    // K — Attack/Defense CTF round: teams in a ring around the game server.
    ad(ctx, w, h, p, rnd) {
      const cx = w / 2, cy = h * 0.5, R = Math.min(w, h) * 0.37, N = 8, us = 0;
      const rot = Math.PI / 2 + (rnd() - 0.5) * 0.3;                 // "us" sits at the bottom
      const teams = Array.from({ length: N }, (_, i) => {
        const a = rot + (i / N) * Math.PI * 2;
        return [cx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.86];
      });
      // Game server.
      ctx.strokeStyle = C.ink; ctx.lineWidth = 0.9; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI * 2); ctx.stroke();
      // Network spokes to the game server.
      ctx.setLineDash([2, 5]); ctx.globalAlpha = 0.3; ctx.beginPath();
      teams.forEach(([x, y]) => { ctx.moveTo(x, y); ctx.lineTo(cx, cy); });
      ctx.stroke(); ctx.setLineDash([]);
      // Exploits: us → a few targets (red); flags ride back.
      const targets = [1, 2, 3, 4, 5, 6, 7].sort(() => rnd() - 0.5).slice(0, 4);
      const curve = (a, b, bend) => {
        const mx = (a[0] + b[0]) / 2 + (cx - (a[0] + b[0]) / 2) * bend, my = (a[1] + b[1]) / 2 + (cy - (a[1] + b[1]) / 2) * bend;
        return Array.from({ length: 25 }, (_, k) => { const t = k / 24, u = 1 - t; return [u * u * a[0] + 2 * u * t * mx + t * t * b[0], u * u * a[1] + 2 * u * t * my + t * t * b[1]]; });
      };
      targets.forEach((ti, k) => {
        const start = k * 0.14, local = clamp((p - start) / 0.45, 0, 1);
        if (local <= 0) return;
        const path = curve(teams[us], teams[ti], 0.45);
        ctx.strokeStyle = C.accent; ctx.globalAlpha = 0.95; ctx.lineWidth = 1.3;
        ctx.beginPath(); polyPart(ctx, path, local); ctx.stroke();
        if (local >= 1) {                                         // flag returning
          const back = clamp((p - start - 0.45) / 0.35, 0, 1), q = path[Math.round((1 - back) * 24)];
          ctx.fillStyle = C.accent; ctx.globalAlpha = back < 1 ? 1 : 0.5;
          ctx.beginPath(); ctx.moveTo(q[0], q[1] - 4); ctx.lineTo(q[0] + 4, q[1]); ctx.lineTo(q[0], q[1] + 4); ctx.lineTo(q[0] - 4, q[1]); ctx.closePath(); ctx.fill();
        }
      });
      // Incoming attacks: others → us, stopped by patched services (blue).
      const attackers = [1, 2, 3, 4, 5, 6, 7].filter((t) => !targets.includes(t)).slice(0, 2);
      attackers.forEach((ai, k) => {
        const start = 0.2 + k * 0.2, local = clamp((p - start) / 0.4, 0, 1);
        if (local <= 0) return;
        const path = curve(teams[ai], teams[us], 0.3).slice(0, 21);   // stops short: blocked
        ctx.strokeStyle = C.ink3; ctx.globalAlpha = 0.8; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath(); polyPart(ctx, path, local); ctx.stroke(); ctx.setLineDash([]);
        if (local >= 1) {
          const e = path[path.length - 1];
          ctx.strokeStyle = C.blue; ctx.globalAlpha = 1; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(e[0] - 5, e[1] - 5); ctx.lineTo(e[0] + 5, e[1] + 5); ctx.moveTo(e[0] + 5, e[1] - 5); ctx.lineTo(e[0] - 5, e[1] + 5); ctx.stroke();
        }
      });
      // Team vulnboxes: box + three service slots.
      teams.forEach(([x, y], i) => {
        const me = i === us, s = me ? 11 : 8;
        ctx.globalAlpha = 1; ctx.fillStyle = C.paper; ctx.strokeStyle = me ? C.ink : C.ink2; ctx.lineWidth = me ? 1.5 : 1;
        ctx.beginPath(); ctx.rect(x - s, y - s, s * 2, s * 2); ctx.fill(); ctx.stroke();
        for (let k = 0; k < 3; k++) {
          const sx = x - s + 3 + k * ((s * 2 - 6) / 3), sw = (s * 2 - 6) / 3 - 1.5;
          const owned = !me && targets.includes(i) && p > targets.indexOf(i) * 0.14 + 0.45 && k === (i % 3);
          ctx.fillStyle = owned ? C.accent : 'transparent'; ctx.strokeStyle = owned ? C.accent : (me ? C.blue : C.ink3); ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.rect(sx, y + s * 0.15, sw, s * 0.55); if (owned) ctx.fill(); ctx.stroke();
        }
        if (me && p > 0.55) {                                       // patched: shield rings
          ctx.strokeStyle = C.blue; ctx.globalAlpha = Math.min(1, (p - 0.55) * 3); ctx.lineWidth = 1;
          for (let r = 1; r <= 2; r++) { ctx.beginPath(); ctx.arc(x, y, s + 6 * r, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); }
        }
        if (!MINI) {
          ctx.globalAlpha = 1; ctx.fillStyle = me ? C.ink : C.ink3; ctx.font = `${me ? 10.5 : 9.5}px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.fillText(me ? 'napwnli' : `T${String(i).padStart(2, '0')}`, x, y + s + 5);
        }
      });
      if (!MINI) {
        const tick = 1 + Math.floor(p * 119), flags = targets.filter((t, k) => p > k * 0.14 + 0.8).length;
        ctx.globalAlpha = 1; ctx.font = `9.5px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = C.ink2; ctx.textBaseline = 'top'; ctx.lineWidth = 3; ctx.strokeStyle = C.paper;
        ctx.strokeText(`tick ${String(tick).padStart(3, '0')}`, cx, cy + 26); ctx.fillText(`tick ${String(tick).padStart(3, '0')}`, cx, cy + 26);
        ctx.beginPath(); ctx.arc(cx, cy, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = C.accent; ctx.fillText(`flags +${flags}`, 12, 12);
        ctx.fillStyle = C.blue; ctx.fillText(`blocked ${attackers.filter((a, k) => p > 0.6 + k * 0.2).length}/${attackers.length}`, 12, 26);
      }
    },
    // L — paper glyph: a harmonograph (two damped pendulums per axis).
    // Frequencies + phases come from the seed (arXiv number), so every paper has its own figure.
    glyph(ctx, w, h, p, rnd) { FIGS._harmonograph(ctx, w, h, p, rnd, C.ink); },
    'glyph-red'(ctx, w, h, p, rnd) { FIGS._harmonograph(ctx, w, h, p, rnd, C.accent); },
    _harmonograph(ctx, w, h, p, rnd, color) {
      const ratios = [[1, 2], [2, 3], [3, 4], [1, 3], [3, 5], [2, 5], [4, 5], [1, 1]];
      const [a, b] = ratios[Math.floor(rnd() * ratios.length)];
      const detune = () => (rnd() - 0.5) * 0.03;
      const fx1 = a + detune(), fx2 = b + detune(), fy1 = b + detune(), fy2 = a + detune();
      const px1 = rnd() * Math.PI * 2, px2 = rnd() * Math.PI * 2, py1 = rnd() * Math.PI * 2, py2 = rnd() * Math.PI * 2;
      const d1 = 0.004 + rnd() * 0.006, d2 = 0.004 + rnd() * 0.006, mix = 0.35 + rnd() * 0.3;
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.44;
      const pts = [];
      for (let t = 0; t < 140; t += 0.07) {
        const e1 = Math.exp(-d1 * t), e2 = Math.exp(-d2 * t);
        pts.push([
          cx + R * ((1 - mix) * Math.sin(fx1 * t + px1) * e1 + mix * Math.sin(fx2 * t + px2) * e2),
          cy + R * 0.86 * ((1 - mix) * Math.sin(fy1 * t + py1) * e1 + mix * Math.sin(fy2 * t + py2) * e2),
        ]);
      }
      // Faint full trace first, then the drawn-on portion on top.
      ctx.strokeStyle = color; ctx.lineWidth = 0.6; ctx.globalAlpha = 0.12;
      ctx.beginPath(); polyPart(ctx, pts, 1); ctx.stroke();
      ctx.lineWidth = MINI ? 0.8 : 1; ctx.globalAlpha = 0.85;
      ctx.beginPath(); polyPart(ctx, pts, p); ctx.stroke();
      // Pen position + origin crosshair.
      const k = Math.max(1, Math.min(pts.length - 1, Math.floor(pts.length * p)));
      ctx.globalAlpha = 1; ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(pts[k][0], pts[k][1], MINI ? 1.6 : 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.ink3; ctx.lineWidth = 0.7; ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 5, cy); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 5); ctx.stroke();
    },
    // M — places: Atlantic map (Natural Earth coastlines), home base + remote work arcs.
    map(ctx, w, h, p) {
      const land = window.GEO_LAND || [];
      const V = { lon0: -86, lon1: 24, lat0: 31, lat1: 53 }, k = Math.cos((41 * Math.PI) / 180);
      const sx = (w - 40) / ((V.lon1 - V.lon0) * k), sy = (h - 40) / (V.lat1 - V.lat0), s = Math.min(sx, sy);
      const ox = (w - (V.lon1 - V.lon0) * k * s) / 2, oy = (h - (V.lat1 - V.lat0) * s) / 2;
      const P = (lon, lat) => [ox + (lon - V.lon0) * k * s, oy + (V.lat1 - lat) * s];
      // Graticule.
      ctx.strokeStyle = C.ink; ctx.lineWidth = 0.6; ctx.globalAlpha = 0.08; ctx.beginPath();
      for (let lon = -80; lon <= 20; lon += 10) { const a = P(lon, V.lat0), b = P(lon, V.lat1); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      for (let lat = 35; lat <= 50; lat += 5) { const a = P(V.lon0, lat), b = P(V.lon1, lat); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      ctx.stroke();
      if (!MINI) {
        ctx.globalAlpha = 0.5; ctx.fillStyle = C.ink3; ctx.font = `9px ${MONO}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
        for (let lon = -80; lon <= 20; lon += 20) { const a = P(lon, V.lat0); ctx.fillText(`${Math.abs(lon)}°${lon < 0 ? 'W' : 'E'}`, a[0] + 3, a[1] - 13); }
      }
      // Coastlines, drawn on.
      ctx.strokeStyle = C.ink; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.55; ctx.lineJoin = 'round';
      const shown = Math.ceil(land.length * clamp(p * 1.6, 0, 1));
      ctx.beginPath();
      for (let i = 0; i < shown; i++) land[i].forEach(([lon, lat], j) => { const q = P(lon, lat); j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
      ctx.stroke();
      // Great-circle arcs from home.
      const R = Math.PI / 180;
      const gc = (a, b, n = 64) => {
        const [l1, p1] = [a[0] * R, a[1] * R], [l2, p2] = [b[0] * R, b[1] * R];
        const v = (l, ph) => [Math.cos(ph) * Math.cos(l), Math.cos(ph) * Math.sin(l), Math.sin(ph)];
        const A = v(l1, p1), B = v(l2, p2), d = Math.acos(A[0] * B[0] + A[1] * B[1] + A[2] * B[2]);
        const pts = [];
        for (let i = 0; i <= n; i++) {
          const f = i / n, s1 = Math.sin((1 - f) * d) / Math.sin(d), s2 = Math.sin(f * d) / Math.sin(d);
          const x = s1 * A[0] + s2 * B[0], y = s1 * A[1] + s2 * B[1], z = s1 * A[2] + s2 * B[2];
          pts.push(P(Math.atan2(y, x) / R, Math.atan2(z, Math.hypot(x, y)) / R));
        }
        return { pts, km: Math.round((d * 6371) / 50) * 50 };
      };
      const home = [14.27, 40.85];
      const places = [
        { at: [-77.46, 38.42], name: 'STAFFORD, VA', sub: 'CYBER RANGES · remote · now', color: C.accent, dash: [] },
        { at: [-2.67, 42.85], name: 'VITORIA-GASTEIZ', sub: 'Alias Robotics · remote · former', color: C.ink2, dash: [5, 4], former: true },
      ];
      const ap = clamp((p - 0.45) / 0.55, 0, 1);
      places.forEach((pl) => {
        const { pts, km } = gc(home, pl.at);
        ctx.strokeStyle = pl.color; ctx.globalAlpha = 1; ctx.lineWidth = 1.4; ctx.setLineDash(pl.dash);
        ctx.beginPath(); polyPart(ctx, pts, ap); ctx.stroke(); ctx.setLineDash([]);
        if (ap > 0.9 && !MINI) {
          const m = pts[Math.floor(pts.length / 2)], txt = `≈ ${km.toLocaleString('en')} km`;
          const ty = pl.former ? m[1] + 16 : m[1] - 12;
          ctx.font = `10px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const tw = ctx.measureText(txt).width;
          ctx.globalAlpha = 0.92; ctx.fillStyle = C.paper; ctx.fillRect(m[0] - tw / 2 - 4, ty - 8, tw + 8, 16);
          ctx.globalAlpha = 1; ctx.fillStyle = pl.color; ctx.fillText(txt, m[0], ty);
        }
      });
      // Pins + labels.
      const pin = (lonlat, color, big) => {
        const [x, y] = P(...lonlat);
        ctx.globalAlpha = 1; ctx.strokeStyle = color; ctx.lineWidth = 1.1; ctx.fillStyle = C.paper;
        ctx.beginPath(); ctx.arc(x, y, big ? 6 : 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 11, y); ctx.lineTo(x - 7, y); ctx.moveTo(x + 7, y); ctx.lineTo(x + 11, y);
        ctx.moveTo(x, y - 11); ctx.lineTo(x, y - 7); ctx.moveTo(x, y + 7); ctx.lineTo(x, y + 11); ctx.stroke();
        if (big) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill(); }
        return [x, y];
      };
      const two = (x, y, a, b, color, dir = 1, lift = 26) => {
        if (MINI) return;
        const lx = x + 14 * dir, ly = y - lift;
        ctx.strokeStyle = color; ctx.globalAlpha = 0.9; ctx.lineWidth = 0.75;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(lx, ly); ctx.lineTo(lx + 10 * dir, ly); ctx.stroke();
        ctx.textAlign = dir > 0 ? 'left' : 'right'; ctx.textBaseline = 'middle';
        const tx = lx + 14 * dir;
        ctx.font = `500 11px ${MONO}`; const wa = ctx.measureText(a).width;
        ctx.font = `10px ${MONO}`; const wb = ctx.measureText(b).width, tw = Math.max(wa, wb);
        ctx.globalAlpha = 0.92; ctx.fillStyle = C.paper; ctx.fillRect(dir > 0 ? tx - 5 : tx - tw - 5, ly - 9, tw + 10, 32);
        ctx.globalAlpha = 1;
        ctx.font = `500 11px ${MONO}`; ctx.fillStyle = color; ctx.fillText(a, tx, ly);
        ctx.font = `10px ${MONO}`; ctx.fillStyle = C.ink2; ctx.fillText(b, tx, ly + 14);
      };
      if (p > 0.35) {
        const n = pin(home, C.accent, true);
        two(n[0], n[1], 'NAPLES · home base', 'UniNA · DIETI · DARKLAB · napwnli', C.accent, -1, -30);
      }
      if (ap > 0.98) places.forEach((pl) => { const q = pin(pl.at, pl.color, false); two(q[0], q[1], pl.name, pl.sub, pl.color, pl.at[0] < -40 ? 1 : -1, pl.at[0] < -40 ? 30 : 46); });
    },

    // N — DARKLAB: isometric wireframe of the DIETI campus on Via Claudio, next to the Maradona stadium.
    campus(ctx, w, h, p) {
      const s = Math.min(w / 370, h / 250), c = Math.cos(Math.PI / 6), si = Math.sin(Math.PI / 6);
      const cx = w * 0.5, cy = h * 0.53;
      const I = (x, y, z = 0) => [cx + (x - y) * c * s, cy + (x + y) * si * s - z * s];
      const mv = (q) => ctx.moveTo(q[0], q[1]), ln = (q) => ctx.lineTo(q[0], q[1]);
      const reveal = (i, n) => clamp(p * 1.25 * n - i, 0, 1);       // staggered draw-on
      // Ground grid.
      ctx.strokeStyle = C.ink; ctx.lineWidth = 0.5; ctx.globalAlpha = 0.08; ctx.beginPath();
      for (let x = -150; x <= 150; x += 15) { mv(I(x, -130)); ln(I(x, 130)); }
      for (let y = -130; y <= 130; y += 15) { mv(I(-150, y)); ln(I(150, y)); }
      ctx.stroke();
      // Via Claudio (between campus and stadium).
      ctx.globalAlpha = 0.45; ctx.lineWidth = 0.8; ctx.beginPath();
      mv(I(-150, -18)); ln(I(150, -18)); mv(I(-150, -6)); ln(I(150, -6)); ctx.stroke();
      ctx.setLineDash([5, 6]); ctx.globalAlpha = 0.3; ctx.beginPath(); mv(I(-150, -12)); ln(I(150, -12)); ctx.stroke(); ctx.setLineDash([]);
      // Campus blocks (north side of the road). [x, y, w, d, h, id]
      const blocks = [
        [-120, -70, 34, 30, 16], [-80, -78, 28, 40, 26], [-42, -66, 36, 26, 20], [-2, -80, 30, 44, 36, 'dieti'],
        [36, -70, 40, 30, 14], [80, -84, 26, 52, 22], [-100, -112, 50, 22, 10], [20, -116, 46, 20, 12],
      ].sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
      const box = (x, y, bw, bd, bh, k, hot, band) => {
        const x1 = x + bw, y1 = y + bd;
        const top = [I(x, y, bh), I(x1, y, bh), I(x1, y1, bh), I(x, y1, bh)];
        const right = [I(x1, y, 0), I(x1, y1, 0), I(x1, y1, bh), I(x1, y, bh)];
        const front = [I(x, y1, 0), I(x1, y1, 0), I(x1, y1, bh), I(x, y1, bh)];
        ctx.globalAlpha = k; ctx.fillStyle = C.paper;
        [top, right, front].forEach((f) => { ctx.beginPath(); f.forEach((q, i) => (i ? ln(q) : mv(q))); ctx.closePath(); ctx.fill(); });
        if (hot) { ctx.globalAlpha = 0.18 * k; ctx.fillStyle = C.accent; [top, right, front].forEach((f) => { ctx.beginPath(); f.forEach((q, i) => (i ? ln(q) : mv(q))); ctx.closePath(); ctx.fill(); }); }
        ctx.globalAlpha = k * (hot ? 1 : 0.85); ctx.strokeStyle = hot ? C.accent : C.ink; ctx.lineWidth = hot ? 1.3 : 0.9;
        ctx.beginPath(); [top, right, front].forEach((f) => { f.forEach((q, i) => (i ? ln(q) : mv(q))); ctx.closePath(); }); ctx.stroke();
        // floors
        ctx.globalAlpha = k * 0.35; ctx.lineWidth = 0.6; ctx.beginPath();
        for (let z = 6; z < bh; z += 6) { mv(I(x1, y, z)); ln(I(x1, y1, z)); ln(I(x, y1, z)); }
        ctx.stroke();
        if (band) {                                         // the lab: one floor of the building, in red
          const [z0, z1] = band, faces = [
            [I(x1, y, z0), I(x1, y1, z0), I(x1, y1, z1), I(x1, y, z1)],
            [I(x, y1, z0), I(x1, y1, z0), I(x1, y1, z1), I(x, y1, z1)],
          ];
          ctx.globalAlpha = 0.28 * k; ctx.fillStyle = C.accent;
          faces.forEach((f) => { ctx.beginPath(); f.forEach((q, i) => (i ? ln(q) : mv(q))); ctx.closePath(); ctx.fill(); });
          ctx.globalAlpha = k; ctx.strokeStyle = C.accent; ctx.lineWidth = 1.3;
          ctx.beginPath(); faces.forEach((f) => { f.forEach((q, i) => (i ? ln(q) : mv(q))); ctx.closePath(); }); ctx.stroke();
          // window slits
          ctx.globalAlpha = 0.7 * k; ctx.lineWidth = 0.8; ctx.beginPath();
          for (let t = 4; t < bw - 2; t += 5) { mv(I(x + t, y1, z0 + 1.5)); ln(I(x + t, y1, z1 - 1.5)); }
          for (let t = 4; t < bd - 2; t += 5) { mv(I(x1, y + t, z0 + 1.5)); ln(I(x1, y + t, z1 - 1.5)); }
          ctx.stroke();
          return { top: I(x + bw / 2, y + bd / 2, bh), lab: I(x1, y1, (z0 + z1) / 2) };
        }
        return { top: I(x + bw / 2, y + bd / 2, bh) };
      };
      let dieti = null;
      blocks.forEach((b, i) => { const t = box(b[0], b[1], b[2], b[3], b[4], reveal(i, blocks.length + 4), false, b[5] === 'dieti' ? [30, 36] : null); if (b[5] === 'dieti') dieti = t; });
      // Stadio Diego Armando Maradona (south side): stands as two rings + radial seating.
      const k = reveal(blocks.length, blocks.length + 4), S0 = [10, 62];
      const ring = (rx, ry, z, a0 = 0, a1 = Math.PI * 2) => { ctx.beginPath(); for (let a = a0, i = 0; a <= a1 + 1e-6; a += Math.PI / 48, i++) { const q = I(S0[0] + Math.cos(a) * rx, S0[1] + Math.sin(a) * ry, z); i ? ln(q) : mv(q); } ctx.stroke(); };
      if (k > 0) {
        ctx.strokeStyle = C.ink; ctx.lineWidth = 0.9;
        ctx.globalAlpha = 0.85 * k; ring(78, 56, 0); ring(78, 56, 18); ring(50, 32, 5);
        ctx.globalAlpha = 0.4 * k; ctx.beginPath();
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 24) {
          mv(I(S0[0] + Math.cos(a) * 78, S0[1] + Math.sin(a) * 56, 0)); ln(I(S0[0] + Math.cos(a) * 78, S0[1] + Math.sin(a) * 56, 18));
          ln(I(S0[0] + Math.cos(a) * 50, S0[1] + Math.sin(a) * 32, 5));
        }
        ctx.stroke();
        ctx.globalAlpha = 0.25 * k; ring(64, 44, 11.5);
        // Pitch.
        const kp = reveal(blocks.length + 1, blocks.length + 4);
        ctx.strokeStyle = C.blue; ctx.globalAlpha = 0.8 * kp; ctx.lineWidth = 0.9; ctx.beginPath();
        const px0 = S0[0] - 34, px1 = S0[0] + 34, py0 = S0[1] - 20, py1 = S0[1] + 20;
        [I(px0, py0), I(px1, py0), I(px1, py1), I(px0, py1)].forEach((q, i) => (i ? ln(q) : mv(q))); ctx.closePath();
        mv(I(S0[0], py0)); ln(I(S0[0], py1));
        ctx.stroke();
        ctx.beginPath(); for (let a = 0, i = 0; a <= Math.PI * 2 + 1e-6; a += Math.PI / 24, i++) { const q = I(S0[0] + Math.cos(a) * 7, S0[1] + Math.sin(a) * 7); i ? ln(q) : mv(q); } ctx.stroke();
        [[px0, 8], [px1, -8]].forEach(([bx, d]) => { ctx.beginPath(); [I(bx, S0[1] - 9), I(bx + d, S0[1] - 9), I(bx + d, S0[1] + 9), I(bx, S0[1] + 9)].forEach((q, i) => (i ? ln(q) : mv(q))); ctx.stroke(); });
      }
      // Labels.
      const kl = reveal(blocks.length + 2, blocks.length + 4);
      if (kl > 0.5) {
        if (dieti) label(ctx, dieti.lab[0], dieti.lab[1], 'ARCLAB · DARKLAB', 1, C.accent, true, -26);
        const st = I(S0[0] - 14, S0[1] + 55, 0); label(ctx, st[0], st[1], 'Stadio Diego Armando Maradona', 1, C.ink2, true, -22);
        const rd = I(130, -12); label(ctx, rd[0], rd[1], 'Via Claudio', 1, C.ink3, false, 10);
        if (dieti) label(ctx, dieti.top[0], dieti.top[1], 'DIETI · UniNA', 1, C.ink2, true, 26);
        if (!MINI) {
          ctx.globalAlpha = 0.8; ctx.fillStyle = C.ink3; ctx.font = `10px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText('FUORIGROTTA · NAPOLI · 40.82°N 14.19°E', 14, h - 22);
          ctx.textAlign = 'right'; ctx.fillText('schematic · not to scale', w - 14, h - 22);
          const n0 = [w - 30, 30]; ctx.strokeStyle = C.ink3; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(n0[0], n0[1] + 12); ctx.lineTo(n0[0], n0[1] - 8); ctx.lineTo(n0[0] - 4, n0[1] - 2); ctx.moveTo(n0[0], n0[1] - 8); ctx.lineTo(n0[0] + 4, n0[1] - 2); ctx.stroke();
          ctx.textAlign = 'center'; ctx.fillText('N', n0[0], n0[1] + 15);
        }
      }
    },
  };

  // Draw the first `p` fraction (by length) of a polyline.
  function polyPart(ctx, pts, p) {
    if (pts.length < 2) return;
    let total = 0;
    const seg = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); total += l; }
    let left = total * clamp(p, 0, 1);
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length && left > 0; i++) {
      const l = seg[i - 1], k = Math.min(1, left / l);
      ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k);
      left -= l;
    }
  }

  const initFigures = () => {
    document.querySelectorAll('canvas[data-fig]').forEach((canvas, idx) => {
      const kind = canvas.dataset.fig;
      let seed = Number(canvas.dataset.seed) || ({ offense: 7, adversary: 29, evaluation: 23 }[kind] ?? idx + 1);
      const loop = canvas.hasAttribute('data-loop');
      const mini = canvas.hasAttribute('data-mini');
      const isStatic = canvas.hasAttribute('data-static') || (document.documentElement.dataset.vt === '1' && canvas.closest('.post-cover'));
      let progress = reduceMotion || isStatic ? 1 : 0;

      const render = () => {
        const { ctx, w, h } = setupCanvas(canvas);
        ctx.clearRect(0, 0, w, h);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        // Contour base.
        const noise = makeNoise(seed);
        const sc = 1 / 95;
        ctx.strokeStyle = C.ink; ctx.lineWidth = 0.7;
        ctx.globalAlpha = { evaluation: 0.12, signal: 0.07, network: 0.14, ad: 0.12, glyph: 0.05, 'glyph-red': 0.05, map: 0, campus: 0.06 }[kind] ?? 0.26;
        drawContours(ctx, w, h, (x, y) => noise(x * sc + seed % 97, y * sc), range(0.18, 0.86, mini ? 0.07 : 0.045), mini ? 9 : 7);
        // Frame.
        ctx.globalAlpha = 0.6; ctx.strokeStyle = C.ink3; ctx.lineWidth = 0.75;
        crosshairs(ctx, w, h, 6, 4);
        // Overlay.
        ctx.globalAlpha = 1;
        MINI = mini;
        FIGS[kind]?.(ctx, w, h, progress, mulberry32(seed * 101));
        MINI = false;
      };

      render();
      new ResizeObserver(render).observe(canvas);
      onTheme.push(render);

      if (!reduceMotion && !isStatic) {
        whenVisible(canvas, () => {
          const dur = mini ? 1100 : 1600 + Math.min(idx, 4) * 150;
          const play = () => {
            const t0 = performance.now();
            const step = (now) => {
              progress = ease((now - t0) / dur);
              render();
              if (progress < 1) requestAnimationFrame(step);
              else if (loop) setTimeout(() => {           // hold, then redraw with a fresh layout
                if (document.hidden) { document.addEventListener('visibilitychange', play, { once: true }); return; }
                seed = (seed * 48271) % 9973 + 1; play();
              }, 2600);
            };
            requestAnimationFrame(step);
          };
          play();
        });
      }
    });
  };


  /* ══════════════════════════════════════════════════════════
     3. PAGE BACKGROUND — faint topographic survey map
     Contours of a noise field, re-traced as you scroll (parallax),
     masked so the reading column stays clean.
     ══════════════════════════════════════════════════════════ */
  const initBackground = () => {
    if (document.documentElement.hasAttribute('data-no-bg')) return;
    const canvas = document.createElement('canvas');
    canvas.id = 'bg'; canvas.setAttribute('aria-hidden', 'true');
    document.body.prepend(canvas);
    const noise = makeNoise(4242);
    const SC = 1 / 260, PARALLAX = 0.18, CELL = 12;
    const levels = range(0.2, 0.84, 0.05);
    let fade = reduceMotion ? 1 : 0, queued = false, lastY = -1;

    const render = () => {
      queued = false;
      const { ctx, w, h } = setupCanvas(canvas);
      const oy = (reduceMotion ? 0 : window.scrollY) * PARALLAX;
      lastY = window.scrollY;
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = 'round';
      // Contours.
      ctx.strokeStyle = ALERT ? C.accent : C.ink; ctx.lineWidth = 0.7; ctx.globalAlpha = (ALERT ? 0.24 : 0.11) * fade;
      drawContours(ctx, w, h, (x, y) => noise(x * SC, (y + oy) * SC), levels, CELL);
      // One emphasised index contour, like on a survey map.
      ctx.globalAlpha = 0.16 * fade; ctx.lineWidth = 1;
      drawContours(ctx, w, h, (x, y) => noise(x * SC, (y + oy) * SC), [0.52], CELL);
      // Registration crosshairs on a coarse grid that scrolls with the map.
      const G = 360, start = -((oy % G) + G) % G;
      ctx.strokeStyle = C.ink3; ctx.globalAlpha = 0.35 * fade; ctx.lineWidth = 0.75;
      ctx.beginPath();
      for (let gy = start; gy < h + G; gy += G) {
        for (let gx = 60; gx < w; gx += G) {
          const row = Math.round((gy + oy) / G);
          if (((row * 7 + gx / G * 3) % 5) > 1) continue;      // sparse, deterministic
          ctx.moveTo(gx - 5, gy); ctx.lineTo(gx + 5, gy); ctx.moveTo(gx, gy - 5); ctx.lineTo(gx, gy + 5);
        }
      }
      ctx.stroke();
    };
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(render); } };

    render();
    window.addEventListener('resize', queue);
    onTheme.push(render);
    if (!reduceMotion) {
      window.addEventListener('scroll', () => { if (Math.abs(window.scrollY - lastY) > 2) queue(); }, { passive: true });
      const t0 = performance.now();
      const step = (now) => { fade = ease((now - t0) / 1400); render(); if (fade < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
  };

  const boot = () => { readColors(); initBackground(); initScene(); initFigures(); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(boot); else boot();
})();
