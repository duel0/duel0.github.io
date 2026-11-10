/* ──────────────────────────────────────────────────────────────
   fx.js — the "wow" layer
   1. Scroll-drawn attack path through the page (home)
   2. Decrypting section titles
   3. Crosshair cursor over figures
   4. Console (press \\, ~ or Ctrl/⌘+K)
   5. Hidden CTF (flag check)
   No dependencies. Everything respects prefers-reduced-motion.
   ────────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const SVG = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, ns) => {
    const n = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };

  /* ══════════════════════════════════════════════════════════
     1. ATTACK PATH — a red line drawn down the margin as you
        scroll, one kill-chain stage per section, contained at
        the end by a blue shield.
     ══════════════════════════════════════════════════════════ */
  const initAttackPath = () => {
    const STAGES = [
      ['#research', 'recon'],
      ['#publications', 'weaponize'],
      ['#team', 'exploit'],
      ['#writing', 'persist'],
      ['#about', 'escalate'],
      ['#contact', 'contained'],
    ].map(([sel, name]) => ({ sec: document.querySelector(sel), name })).filter((s) => s.sec);
    const startEl = document.getElementById('scene-caption');
    if (STAGES.length < 3 || !startEl) return;

    const svg = el('svg', { class: 'attack-path', 'aria-hidden': 'true' }, SVG);
    const route = el('path', { class: 'ap-route' }, SVG);
    const line = el('path', { class: 'ap-line' }, SVG);
    const head = el('g', { class: 'ap-head' }, SVG);
    head.append(el('circle', { r: 9, class: 'ap-ring' }, SVG), el('circle', { r: 3.4, class: 'ap-dot' }, SVG));
    const nodes = el('g', {}, SVG);
    const shield = el('g', { class: 'ap-shield' }, SVG);
    shield.innerHTML = '<path d="M0 -13Q6 -9 11 -9.5V0Q11 9 0 14Q-11 9 -11 0V-9.5Q-6 -9 0 -13Z"/><path class="ap-shield-in" d="M0 -9.4V10M-7.9 -2H7.9"/>';
    svg.append(route, line, nodes, head, shield);
    document.body.append(svg);

    let samples = [], total = 0, nodeEls = [], ready = false, lastL = -1;

    const layout = () => {
      const docH = document.documentElement.scrollHeight;
      const wrap = document.querySelector('.section.wrap .section-head') || document.querySelector('.wrap');
      const contentLeft = wrap.getBoundingClientRect().left + window.scrollX;
      const baseX = contentLeft - 44;
      svg.classList.toggle('is-hidden', baseX < 36);
      svg.classList.toggle('no-labels', baseX < 140);
      svg.setAttribute('width', document.documentElement.clientWidth);
      svg.setAttribute('height', docH);
      svg.style.height = `${docH}px`;
      if (baseX < 36) { ready = false; return; }

      const y0 = startEl.getBoundingClientRect().bottom + window.scrollY + 36;
      const pts = [[baseX, y0]];
      STAGES.forEach((s, i) => {
        const r = s.sec.querySelector('.section-head')?.getBoundingClientRect() || s.sec.getBoundingClientRect();
        pts.push([baseX - (i % 2 ? 18 : 0), r.top + window.scrollY + r.height * 0.55]);
      });
      let d = `M${pts[0][0]} ${pts[0][1]}`;
      for (let i = 1; i < pts.length; i++) {
        const [px, py] = pts[i - 1], [nx, ny] = pts[i], dy = ny - py;
        d += ` C${px} ${py + dy * 0.45} ${nx} ${ny - dy * 0.45} ${nx} ${ny}`;
      }
      route.setAttribute('d', d); line.setAttribute('d', d);
      total = line.getTotalLength();
      line.style.strokeDasharray = `${total}`;
      samples = [];
      for (let l = 0; l <= total; l += 6) { const p = line.getPointAtLength(l); samples.push([l, p.x, p.y]); }

      nodes.innerHTML = ''; nodeEls = [];
      pts.slice(1).forEach(([x, y], i) => {
        const g = el('g', { class: 'ap-node' + (i === pts.length - 2 ? ' is-last' : ''), transform: `translate(${x} ${y})` }, SVG);
        g.append(el('rect', { x: -4, y: -4, width: 8, height: 8 }, SVG));
        const t = el('text', { x: -14, y: 3.5, 'text-anchor': 'end' }, SVG);
        t.textContent = `${String(i + 1).padStart(2, '0')} · ${STAGES[i].name}`;
        g.append(t);
        nodes.append(g);
        const near = samples.reduce((b, s) => (Math.abs(s[2] - y) < Math.abs(b[2] - y) ? s : b), samples[0]);
        nodeEls.push({ g, l: near[0] });
      });
      const end = pts[pts.length - 1];
      shield.setAttribute('transform', `translate(${end[0]} ${end[1]})`);
      ready = true; lastL = -1;
      update();
    };

    const update = () => {
      if (!ready) return;
      const target = reduceMotion ? Infinity : window.scrollY + window.innerHeight * 0.62;
      let L = 0;
      for (const s of samples) { if (s[2] <= target) L = s[0]; else break; }
      if (target === Infinity) L = total;
      if (Math.abs(L - lastL) < 0.5) return;
      lastL = L;
      line.style.strokeDashoffset = `${total - L}`;
      const p = line.getPointAtLength(L);
      head.setAttribute('transform', `translate(${p.x} ${p.y})`);
      nodeEls.forEach((n) => n.g.classList.toggle('is-on', L >= n.l - 2));
      const done = L >= total - 2;
      svg.classList.toggle('is-contained', done);
      svg.classList.toggle('is-started', L > 4);
    };

    let raf = 0;
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); };
    let t = 0;
    const relayout = () => { clearTimeout(t); t = setTimeout(layout, 120); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', relayout);
    new ResizeObserver(relayout).observe(document.body);
    window.addEventListener('load', relayout);
    if (document.fonts?.ready) document.fonts.ready.then(relayout);
    layout();
  };

  /* ══════════════════════════════════════════════════════════
     2. DECRYPTING TITLES — ciphertext resolves to plaintext.
     ══════════════════════════════════════════════════════════ */
  const initDecrypt = () => {
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    const GLYPHS = '!<>-_\\/[]{}=+*^?#$%&01ABCDEFabcdef';
    const targets = [...document.querySelectorAll('.section-title, .blog-h1')].filter((n) => n.children.length === 0 && n.textContent.trim());
    const run = (node) => {
      const text = node.textContent, dur = 520 + text.length * 18, t0 = performance.now();
      node.style.minWidth = `${node.getBoundingClientRect().width}px`;
      node.setAttribute('aria-label', text);
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        let out = '';
        for (let i = 0; i < text.length; i++) {
          const reveal = (i / text.length) * 0.7 + 0.3;
          out += text[i] === ' ' || k >= reveal ? text[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        node.textContent = out;
        if (k < 1) requestAnimationFrame(step);
        else { node.textContent = text; node.style.minWidth = ''; }
      };
      requestAnimationFrame(step);
    };
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); run(e.target); } }), { threshold: 0.6 });
    targets.forEach((n) => io.observe(n));
  };

  /* ══════════════════════════════════════════════════════════
     3. CROSSHAIR CURSOR over figures, with live coordinates.
     ══════════════════════════════════════════════════════════ */
  const initReticle = () => {
    if (!finePointer) return;
    const SEL = 'canvas[data-fig], #scene, .post-cover canvas';
    const r = el('div', { class: 'reticle', 'aria-hidden': 'true' });
    r.innerHTML = '<i class="rx"></i><i class="ry"></i><i class="rc"></i><span class="rr"></span>';
    document.body.append(r);
    const rx = r.querySelector('.rx'), ry = r.querySelector('.ry'), rc = r.querySelector('.rc'), rr = r.querySelector('.rr');
    document.documentElement.classList.add('fx-cursor');
    let target = null;
    document.addEventListener('pointermove', (e) => {
      const t = e.target.closest?.(SEL);
      if (t !== target) { target = t; r.classList.toggle('is-on', !!t); }
      if (!t) return;
      const b = t.getBoundingClientRect();
      const x = e.clientX, y = e.clientY;
      rx.style.cssText = `left:${b.left}px;width:${b.width}px;top:${y}px`;
      ry.style.cssText = `top:${b.top}px;height:${b.height}px;left:${x}px`;
      rc.style.cssText = `left:${x}px;top:${y}px`;
      const fx = ((x - b.left) / b.width).toFixed(3), fy = ((y - b.top) / b.height).toFixed(3);
      rr.textContent = t.dataset.hover ? `${t.dataset.hover}  ·  click for logs` : `x ${fx}  y ${fy}`;
      const right = x + 150 > b.right;
      rr.style.cssText = `left:${right ? x - 12 : x + 12}px;top:${y + 12}px;transform:translateX(${right ? '-100%' : '0'})`;
    }, { passive: true });
    document.addEventListener('pointerleave', () => { target = null; r.classList.remove('is-on'); });
  };

  /* ══════════════════════════════════════════════════════════
     4. CONSOLE — press \\ (Italian keyboards: key left of 1), ~, ` or Ctrl/⌘+K.
     5. CTF — the flag check lives here (hash only).
     ══════════════════════════════════════════════════════════ */
  const FLAG_SHA256 = '7f282c73354da5b9b278064fd03c1767d2a6798e12a42123d4745b5ef7754ba3';
  // Root state is bound to the current flag, so changing the flag resets everyone.
  const PWN_TOKEN = FLAG_SHA256.slice(0, 16);
  const ROOT = document.querySelector('link[rel="icon"]')?.getAttribute('href')?.replace('favicon.svg', '') ?? '';

  const LINKS = {
    linkedin: 'https://www.linkedin.com/in/francesco-balassone/',
    github: 'https://github.com/duel0',
    scholar: 'https://scholar.google.com/citations?user=uGcv2pcAAAAJ',
    x: 'https://x.com/0xduel0',
    napwnli: 'https://napwn.li',
  };
  const FILES = {
    'about.txt': [
      'Francesco Balassone, AI Security Research Lead @ CYBER RANGES,',
      'industrial PhD student @ University of Naples Federico II.',
      'Offensive & defensive AI agents, adversary emulation, cyber ranges.',
    ],
    'napwnli.txt': [
      'napwnli, competitive hacking team of the University of Naples Federico II.',
      'Born in 2024 from the CyberChallenge.IT Naples finalists. Co-founder & captain.',
      `→ ${LINKS.napwnli}`,
    ],
    'contact.txt': Object.entries(LINKS).map(([k, v]) => `${k.padEnd(9)} ${v}`),
    '.part3': ['3/3 (rot13): _f3zce3}', 'now: submit flag{...}'],
  };
  // /root, only reachable after the flag is captured.
  const ROOT_FILES = {
    'README.root': [
      'welcome to /root. you earned it.',
      '',
      'few people make it this far. the ones who do usually end up',
      'in a CTF team. napwnli is always looking for curious people.',
      '',
      'things to try here:',
      '  cat hall_of_fame.txt',
      '  cat donkey.ans',
      '  ./forza.sh',
    ],
    'hall_of_fame.txt': [
      '┌─ HALL OF FAME ─────────────────────────────┐',
      '│ 1. duel0 (wrote the challenge, cheated)    │',
      '│ 2. you?                                    │',
      '└────────────────────────────────────────────┘',
      'send me a screenshot of this shell on LinkedIn to get listed.',
      `→ ${LINKS.linkedin}`,
    ],
    'forza.sh': ['#!/bin/bash', '# run me: ./forza.sh', 'echo "FORZA NAPWNLI" | figlet | lolcat --azzurro', 'celebrate --confetti --colors azzurro,white'],
    'donkey.ans': null, // rendered by cat (ascii donkey)
    '.bash_history': [
      'nmap -sV duel0.github.io',
      'curl -s duel0.github.io/robots.txt',
      'cat /home/visitor/.part3',
      'echo "..." | tr a-z n-za-m',
      'submit flag{REDACTED}',
      'sudo hire duel0',
      'cd /root',
    ],
    '.ssh': null, // a directory, but locked
  };

  const initConsole = () => {
    const box = el('div', { class: 'console', role: 'dialog', 'aria-label': 'Console', 'aria-hidden': 'true' });
    box.innerHTML = `
      <div class="console-bar mono"><span class="lights" aria-hidden="true"><i></i><i></i><i></i></span><span>visitor@duel0: ~</span><button type="button" class="console-x" aria-label="Close console">esc</button></div>
      <div class="console-out mono" aria-live="polite"></div>
      <label class="console-in mono"><span class="console-ps"></span><input type="text" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Command"></label>`;
    document.body.append(box);
    const out = box.querySelector('.console-out'), input = box.querySelector('input'), ps = box.querySelector('.console-ps');
    const isRoot = () => store.get('pwned') === PWN_TOKEN;
    // Tiny filesystem: /, /home, /home/visitor, /root.
    const HOME = () => (isRoot() ? '/root' : '/home/visitor');
    let cwd = '/home/visitor';
    const resolve = (p) => {
      if (!p || p === '~') return HOME();
      const parts = (p.startsWith('/') ? [] : cwd.split('/')).concat(p.replace(/^~(?=\/|$)/, HOME()).split('/'));
      const stack = [];
      parts.forEach((s) => { if (!s || s === '.') return; if (s === '..') stack.pop(); else stack.push(s); });
      return `/${stack.join('/')}`;
    };
    const DIRS = { '/': ['home/', 'root/'], '/home': ['visitor/'] };
    const filesIn = (d) => (d === '/home/visitor' ? FILES : d === '/root' ? ROOT_FILES : null);
    const isDir = (d) => d in DIRS || !!filesIn(d);
    const short = (d) => (d === HOME() ? '~' : d.startsWith(`${HOME()}/`) ? `~${d.slice(HOME().length)}` : d);
    const prompt = () => {
      const tag = `${isRoot() ? 'root' : 'visitor'}@duel0:${short(cwd)}`;
      ps.textContent = `${tag}${isRoot() ? '#' : '$'}`;
      box.querySelector('.console-bar span:nth-child(2)').textContent = `${isRoot() ? 'root' : 'visitor'}@duel0: ${short(cwd)}`;
    };
    // split "dir/file" into [dir, name]
    const locate = (p) => { const full = resolve(p); const i = full.lastIndexOf('/'); return [full.slice(0, i) || '/', full.slice(i + 1), full]; };
    const denied = (d) => d === '/root' && !isRoot();
    const confetti = () => {
      if (reduceMotion) return;
      const c = el('canvas', { class: 'confetti', 'aria-hidden': 'true' });
      Object.assign(c.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '9999' });
      document.body.append(c);
      const dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
      c.width = W * dpr; c.height = H * dpr;
      const g = c.getContext('2d'); g.scale(dpr, dpr);
      const cols = ['#12a0d7', '#5fc8f0', '#ffffff', '#003c82'];
      const bits = Array.from({ length: 220 }, () => ({ x: Math.random() * W, y: -20 - Math.random() * H * 0.6, vx: (Math.random() - 0.5) * 2.4, vy: 2 + Math.random() * 3.5, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, w: 5 + Math.random() * 6, c: pick(cols) }));
      const t0 = performance.now();
      const step = (t) => {
        g.clearRect(0, 0, W, H);
        bits.forEach((b) => { b.x += b.vx; b.y += b.vy; b.vy += 0.03; b.r += b.vr; g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.w / 4, b.w, b.w / 2); g.restore(); });
        if (t - t0 < 4500) requestAnimationFrame(step); else c.remove();
      };
      requestAnimationFrame(step);
    };
    const history = []; let hi = 0, opened = false;

    const print = (lines, cls = '') => {
      if (capture) { [].concat(lines).forEach((l) => capture.push(...String(typeof l === 'object' ? (l.pre || '') + l.text : l).split('\n'))); return; }
      if (/\bart\b/.test(cls)) { const p = el('div', { class: `cl ${cls}` }); p.textContent = [].concat(lines).join('\n'); out.append(p); out.scrollTop = out.scrollHeight; return; }
      [].concat(lines).forEach((l) => {
        const p = el('div', { class: `cl ${cls}` });
        if (typeof l === 'object' && l.href) {
          const a = el('a', { href: l.href, target: l.href.startsWith('http') ? '_blank' : '_self', rel: 'noopener' });
          a.textContent = l.text; p.append(l.pre || '', a);
        } else p.textContent = l === "" ? "\u00a0" : l;
        out.append(p);
      });
      out.scrollTop = out.scrollHeight;
    };
    const sha256 = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

    /* ── toy helpers ─────────────────────────────────────── */
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const pick = (a) => a[(Math.random() * a.length) | 0];
    const FORTUNES = [
      'The most secure system is the one you haven\'t deployed yet.',
      'Every "temporary" firewall rule is permanent.',
      'If the attacker is faster than your patch cycle, the attacker is your patch cycle.',
      'Defenders need to be right every time. So do attackers, eventually. Log everything.',
      'An agent with a shell is a shell with opinions.',
      'There are two kinds of networks: compromised, and not yet aware.',
      'It\'s not a bug, it\'s an undocumented attack surface.',
      'The flag is never where you looked first. Look again.',
      'Your password is in a wordlist. Your passphrase might not be.',
      'Assume breach. Then make breach boring.',
      'Read the logs. The logs read you back.',
      'The donkey does not hurry, yet the donkey always gets the flag.',
    ];
    const bubble = (text) => {
      const words = String(text).replace(/\s+/g, ' ').trim().split(' '), lines = []; let cur = '';
      for (const w of words) { if ((cur + ' ' + w).trim().length > 38) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
      if (cur) lines.push(cur);
      const W = Math.max(...lines.map((l) => l.length));
      const mid = lines.length === 1 ? [`< ${lines[0]} >`] : lines.map((l, i) => {
        const [a, b] = i === 0 ? ['/', '\\'] : i === lines.length - 1 ? ['\\', '/'] : ['|', '|'];
        return `${a} ${l.padEnd(W)} ${b}`;
      });
      return [' ' + '_'.repeat(W + 2), ...mid, ' ' + '-'.repeat(W + 2)];
    };
    const COW = [
      '        \\   ^__^',
      '         \\  (oo)\\_______',
      '            (__)\\       )\\/\\',
      '                ||----w |',
      '                ||     ||',
    ];
    const DONKEY = [
      '        \\    /\\  /\\',
      '         \\  / / / /',
      '           ( (_( (___',
      '           /  o       \\___',
      '          (_.         ____)  napwnli',
      '            \\_______/',
    ];
    // 5-row block font (3–5 cols wide)
    const FONT = {
      A: ['###', '# #', '###', '# #', '# #'], B: ['## ', '# #', '## ', '# #', '## '], C: ['###', '#  ', '#  ', '#  ', '###'],
      D: ['## ', '# #', '# #', '# #', '## '], E: ['###', '#  ', '## ', '#  ', '###'], F: ['###', '#  ', '## ', '#  ', '#  '],
      G: ['###', '#  ', '# #', '# #', '###'], H: ['# #', '# #', '###', '# #', '# #'], I: ['###', ' # ', ' # ', ' # ', '###'],
      J: ['  #', '  #', '  #', '# #', '###'], K: ['# #', '# #', '## ', '# #', '# #'], L: ['#  ', '#  ', '#  ', '#  ', '###'],
      M: ['#   #', '## ##', '# # #', '#   #', '#   #'], N: ['#  #', '## #', '# ##', '#  #', '#  #'], O: ['###', '# #', '# #', '# #', '###'],
      P: ['###', '# #', '###', '#  ', '#  '], Q: ['###', '# #', '# #', '###', '  #'], R: ['###', '# #', '## ', '# #', '# #'],
      S: ['###', '#  ', '###', '  #', '###'], T: ['###', ' # ', ' # ', ' # ', ' # '], U: ['# #', '# #', '# #', '# #', '###'],
      V: ['# #', '# #', '# #', '# #', ' # '], W: ['#   #', '#   #', '# # #', '## ##', '#   #'], X: ['# #', '# #', ' # ', '# #', '# #'],
      Y: ['# #', '# #', ' # ', ' # ', ' # '], Z: ['###', '  #', ' # ', '#  ', '###'],
      0: ['###', '# #', '# #', '# #', '###'], 1: [' # ', '## ', ' # ', ' # ', '###'], 2: ['###', '  #', '###', '#  ', '###'],
      3: ['###', '  #', '###', '  #', '###'], 4: ['# #', '# #', '###', '  #', '  #'], 5: ['###', '#  ', '###', '  #', '###'],
      6: ['###', '#  ', '###', '# #', '###'], 7: ['###', '  #', '  #', '  #', '  #'], 8: ['###', '# #', '###', '# #', '###'],
      9: ['###', '# #', '###', '  #', '###'], ' ': ['  ', '  ', '  ', '  ', '  '], '!': ['#', '#', '#', ' ', '#'], '.': [' ', ' ', ' ', ' ', '#'],
      '?': ['###', '  #', ' ##', '   ', ' # '], '-': ['   ', '   ', '###', '   ', '   '], '_': ['   ', '   ', '   ', '   ', '###'],
      '{': [' ##', ' # ', '## ', ' # ', ' ##'], '}': ['## ', ' # ', ' ##', ' # ', '## '], '@': ['####', '#  #', '# ##', '#   ', '####'],
    };
    const figlet = (text) => {
      const chars = [...String(text).toUpperCase().slice(0, 14)].map((c) => FONT[c] || FONT['?']);
      return [0, 1, 2, 3, 4].map((r) => chars.map((g) => g[r].replace(/#/g, '█')).join(' '));
    };
    const rainbow = (lines, hues = ['#ff5f4f', '#f0b36a', '#f6d58e', '#8ad19b', '#6fa6ff', '#c6a4ff']) => {
      lines.forEach((line, li) => {
        const p = el('div', { class: 'cl art' });
        [...String(line)].forEach((ch, i) => { const s = el('span'); s.textContent = ch; s.style.color = hues[(i + li * 2) % hues.length]; p.append(s); });
        if (capture) capture.push(String(line)); else out.append(p);
      });
      out.scrollTop = out.scrollHeight;
    };
    const neofetch = () => {
      const art = ['█████▒▒   ', '██    ▒▒  ', '██    ▒▒  ', '████████  ', '██     ███', '██      ██', '████████ ●'];
      const info = ['visitor@duel0', '─────────────', 'OS: napwnliOS (Napoli)', 'Host: duel0.github.io', `Shell: ${isRoot() ? 'bash (root)' : 'rbash'}`, 'Theme: offense ↔ defense', `Uptime: ${Math.floor(performance.now() / 60000)} min`];
      return art.map((a, i) => `${a}  ${info[i] || ''}`);
    };
    const animate = async (frames, ms, cls) => {
      if (capture) { capture.push(...frames[frames.length - 1]); return; }
      const p = el('div', { class: `cl ${cls}` }); out.append(p);
      for (const f of reduceMotion ? [frames[frames.length - 1]] : frames) { p.textContent = f.join('\n'); out.scrollTop = out.scrollHeight; await sleep(ms); }
      p.remove();
    };
    const slFrames = () => {
      const T = [
        '      ====        ________                ___________ ',
        '  _D _|  |_______/        \\__I_I_____===__|_________| ',
        '   |(_)---  |   H\\________/ |   |        =|___ ___|   ',
        '   /     |  |   H  |  |     |   |         ||_| |_||   ',
        '  |      |  |   H  |__--------------------| [___] |   ',
        '  | ________|___H__/__|_____/[][]~\\_______|       |   ',
        '  |/ |   |-----------I_____I [][] []  D   |=======|__ ',
        '__/ =| o |=-~~\\  /~~\\  /~~\\  /~~\\ ____Y___________|__ ',
        ' |/-=|___|=    ||    ||    ||    |_____/~\\___/        ',
        '  \\_/      \\O=====O=====O=====O_/      \\_/            ',
      ];
      const W = 62, frames = [];
      for (let x = W; x > -T[0].length; x -= 2) frames.push(T.map((row) => (x > 0 ? ' '.repeat(x) + row : row.slice(-x)).slice(0, W)));
      frames.push(['', '(the train has left the station.)']);
      return frames;
    };
    const matrixFrames = () => {
      const W = 56, H = 12, glyphs = 'ｱｲｳｴｵｶｷｸｹｺ01ﾅﾆﾇﾈﾉ$#%&napwnli', drops = Array.from({ length: W }, () => -Math.floor(Math.random() * H * 2));
      const grid = Array.from({ length: H }, () => Array(W).fill(' ')), frames = [];
      for (let f = 0; f < 46; f++) {
        for (let r = H - 1; r > 0; r--) for (let c = 0; c < W; c++) if (Math.random() < 0.08) grid[r][c] = ' ';
        drops.forEach((d, c) => { if (d >= 0 && d < H) grid[d][c] = glyphs[(Math.random() * glyphs.length) | 0]; drops[c] = d >= H + 4 ? -Math.floor(Math.random() * H) : d + 1; });
        frames.push(grid.map((r) => r.join('')));
      }
      frames.push(['wake up, visitor…  follow the white donkey.']);
      return frames;
    };
    let capture = null;

    const COMMANDS = {
      help: () => print([
        'commands:',
        '  whoami · about · papers · ctf · blog · contact · links',
        '  ls [-a] · cd · pwd · cat <file> · clear · history · date · exit',
        '  fun:  cowsay · donkeysay · fortune · figlet · lolcat · sl · cmatrix',
        '        neofetch · ping · hack · uname -a · ps · uptime · echo · man',
        '  pipes work too:  fortune | cowsay | lolcat',
        '  redteam         you probably shouldn\'t.',
        '  submit <flag>   found something? (there is a flag hidden on this site)',
      ], 'dim'),
      whoami: () => print(isRoot() ? 'root, flag captured. respect. 🫡' : 'visitor, curious, apparently. try `help`.'),
      about: () => print(FILES['about.txt']),
      ls: (args) => {
        const all = args.some((a) => /^-\w*a/.test(a));
        const target = resolve(args.find((a) => !a.startsWith('-')) || '.');
        if (denied(target)) return print(`ls: cannot open directory '${target}': Permission denied`, 'red');
        if (!isDir(target)) return print(`ls: cannot access '${target}': No such file or directory`, 'red');
        const names = DIRS[target] || Object.keys(filesIn(target)).map((f) => (f === '.ssh' ? '.ssh/' : f === 'forza.sh' ? 'forza.sh*' : f));
        print(names.filter((f) => all || !f.startsWith('.')).join('   ') || '');
      },
      cat: ([f]) => {
        if (!f) return print('usage: cat <file>', 'dim');
        const [dir, name, full] = locate(f);
        if (denied(dir)) return print(`cat: ${f}: Permission denied`, 'red');
        if (isDir(full)) return print(`cat: ${f}: Is a directory`, 'red');
        const files = filesIn(dir);
        if (!files || !(name in files)) return print(`cat: ${f}: No such file or directory`, 'red');
        if (name === '.ssh') return print(`cat: ${f}: Is a directory`, 'red');
        if (name === 'donkey.ans') return print(bubble('forza napwnli sempre.').concat(DONKEY), 'art');
        print(files[name].map((l) => (l.startsWith('→ http') ? { pre: '→ ', text: l.slice(2), href: l.slice(2) } : l)));
      },
      papers: () => {
        const items = [...document.querySelectorAll('#pubs li')].slice(0, 6);
        if (!items.length) { print({ pre: 'full list → ', text: 'publications', href: `${ROOT}#publications` }); return; }
        items.forEach((li) => { const a = li.querySelector('.pub-title'); print({ pre: `${li.querySelector('.pub-year')?.textContent || ''}  `, text: a.textContent.trim(), href: a.href }); });
        print({ pre: 'more → ', text: 'Google Scholar', href: LINKS.scholar }, 'dim');
      },
      ctf: () => { print(FILES['napwnli.txt']); },
      napwnli: () => COMMANDS.ctf(),
      blog: () => { print('opening the blog…', 'dim'); location.href = `${ROOT}blog/`; },
      contact: () => Object.entries(LINKS).forEach(([k, v]) => print({ pre: `${k.padEnd(9)} `, text: v, href: v })),
      links: () => COMMANDS.contact(),
      clear: () => { out.innerHTML = ''; },
      history: () => print(history.map((h, i) => `${String(i + 1).padStart(3)}  ${h}`)),
      date: () => print(new Date().toString()),
      sudo: (args) => {
        if (args.join(' ').startsWith('hire')) print(['[sudo] password for visitor: ********', 'Sorry, try again. Or skip the exploit and just ask:'], 'red'), COMMANDS.contact();
        else print('visitor is not in the sudoers file. This incident will be reported. 🙃', 'red');
      },
      rm: (args) => print(args.includes('-rf') ? 'nice try. the Defensive Agent has isolated your session. 🛡️' : 'rm: permission denied', 'blue'),
      redteam: () => { print('engaging…', 'red'); toggle(false); setTimeout(redAlert, 350); },
      nmap: () => print([
        'Starting Nmap … balassone',
        'PORT      STATE  SERVICE',
        '80/tcp    open   research',
        '443/tcp   open   publications',
        '1337/tcp  open   napwnli',
        '31337/tcp open   ??? (try harder)',
      ]),
      submit: async ([flag]) => {
        if (!flag) return print('usage: submit flag{...}', 'dim');
        if (!crypto?.subtle) return print('submit needs a secure context (https).', 'red');
        if ((await sha256(flag.trim())) === FLAG_SHA256) {
          store.set('pwned', PWN_TOKEN); prompt(); markPwned();
          print([
            '   __    _              _',
            '  / _|  | |  __ _   __ _| |  ✓ correct',
            ' |  _|  | | / _` | / _` |_|',
            ' |_|    |_| \\__,_| \\__, (_)  forza napwnli sempre.',
            '                   |___/',
            'You are now root. try: cd /root',
            'and screenshot it for me on LinkedIn:',
          ], 'green');
          print({ pre: '→ ', text: LINKS.linkedin, href: LINKS.linkedin }, 'green');
        } else print('✕ wrong flag. the format is flag{...}', 'red');
      },
    };
    Object.assign(COMMANDS, {
      /* ── toys ─────────────────────────────────────────── */
      echo: (args, stdin) => print(args.length ? args.join(' ') : (stdin || []).join('\n')),
      pwd: () => print(cwd),
      cd: ([p]) => {
        const target = resolve(p);
        if (target === '/root/.ssh') return print(`cd: ${p}: even root has limits. 🔒`, 'red');
        if (!isDir(target)) return print(`cd: ${p}: No such file or directory`, 'red');
        if (denied(target)) return print(`cd: ${p}: Permission denied (capture the flag first)`, 'red');
        cwd = target; prompt();
        if (target === '/root') print('you made it. try `ls -a`.', 'green');
      },
      './forza.sh': async () => {
        rainbow(figlet('FORZA'), ['#12a0d7', '#5fc8f0', '#ffffff']);
        rainbow(figlet('NAPWNLI'), ['#12a0d7', '#5fc8f0', '#ffffff']);
        print('sempre. 💙', 'blue');
        if (!capture) confetti();
      },
      uname: (args) => print(args.includes('-a') ? 'napwnliOS 6.6.6-duel0 #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Donkey' : 'napwnliOS'),
      uptime: () => { const s = Math.floor(performance.now() / 1000); print(` ${new Date().toTimeString().slice(0, 8)} up ${Math.floor(s / 60)} min, 1 user, load average: 0.42, 0.13, 0.37`); },
      ps: () => print([
        '  PID TTY          TIME CMD',
        '    1 ?        00:00:01 init',
        '  404 ?        00:00:13 offensive-agent --quiet',
        '  405 ?        00:00:21 defensive-agent --watch',
        ` 1337 pts/0    00:00:00 ${isRoot() ? 'bash' : 'rbash'}`,
        ' 1338 pts/0    00:00:00 ps',
      ]),
      neofetch: () => print(neofetch(), 'art'),
      fortune: () => print(pick(FORTUNES)),
      cowsay: (args, stdin) => print(bubble(args.length ? args.join(' ') : (stdin || []).join(' ') || 'moo.').concat(COW), 'art'),
      donkeysay: (args, stdin) => print(bubble(args.length ? args.join(' ') : (stdin || []).join(' ') || 'hee-haw. try harder.').concat(DONKEY), 'art'),
      figlet: (args, stdin) => print(figlet(args.length ? args.join(' ') : (stdin || []).join(' ') || 'napwnli'), 'art block'),
      banner: (args, stdin) => COMMANDS.figlet(args, stdin),
      lolcat: (args, stdin) => rainbow(args.length ? [args.join(' ')] : stdin || ['meow? (try: fortune | cowsay | lolcat)']),
      ping: async (args) => {
        const host = args.find((a) => !a.startsWith('-')) || '8.8.8.8';
        print(`PING ${host} (${/^\d/.test(host) ? host : '93.184.215.14'}) 56(84) bytes of data.`);
        for (let i = 1; i <= 4; i++) {
          await sleep(reduceMotion ? 0 : 420);
          print(`64 bytes from ${host}: icmp_seq=${i} ttl=117 time=${(8 + Math.random() * 14).toFixed(1)} ms`);
        }
        print([`--- ${host} ping statistics ---`, '4 packets transmitted, 4 received, 0% packet loss', '(simulated, browsers can\'t send ICMP. the donkey pinged it for you.)'], 'dim');
      },
      sl: () => animate(slFrames(), 70, 'art'),
      cmatrix: () => animate(matrixFrames(), 70, 'green art'),
      matrix: () => COMMANDS.cmatrix(),
      hack: async () => {
        const lines = ['[*] bypassing firewall… (it was turned off)', '[*] downloading more RAM… 512 GB ✓', '[*] enhancing… enhancing… ENHANCE', '[*] reversing the polarity of the neutron flow', '[*] hacking the mainframe with two keyboards', '[+] access granted. (no it isn\'t.)'];
        for (const l of lines) { await sleep(reduceMotion ? 0 : 380); print(l, l.startsWith('[+]') ? 'green' : 'red'); }
      },
      vim: () => print(['~', '~', '~', '"you are now stuck in vim."', 'just kidding, this is not a real editor. type :q! anyway for the vibes.'], 'dim'),
      vi: () => COMMANDS.vim(), nano: () => COMMANDS.vim(), emacs: () => print('emacs: nice OS, lacks a decent editor.', 'dim'),
      ':q!': () => print('you escaped. most people never do.', 'green'),
      coffee: () => print('HTTP/1.1 418 I\'m a teapot', 'red'),
      yes: () => print(Array(12).fill('y').concat('^C'), 'dim'),
      man: ([c]) => print(c && COMMANDS[c] ? `${c}(1), it does what it says. probably. see \`help\`.` : 'What manual page do you want?\nFor example, try \'man cowsay\'.'),
      exit: () => toggle(false),
    });
    const NAMES = Object.keys(COMMANDS).filter((n) => /^[a-z]/.test(n));

    const run = async (raw) => {
      const line = raw.trim();
      print(`${ps.textContent} ${line}`, 'cmd');
      if (!line) return;
      history.push(line); hi = history.length;
      const stages = line.split('|').map((x) => x.trim()).filter(Boolean);
      let stdin = null;
      for (let i = 0; i < stages.length; i++) {
        const [cmd, ...args] = stages[i].split(/\s+/);
        let fn = COMMANDS[cmd] || COMMANDS[cmd.toLowerCase()];
        const last = i === stages.length - 1;
        // executing a path: ./forza.sh, /root/forza.sh, sh forza.sh
        const exe = /^(sh|bash)$/.test(cmd) && args[0] ? args[0] : /^[./~]/.test(cmd) ? cmd : null;
        if (exe) {
          const r = resolve(exe);
          if (r === '/root/forza.sh' && isRoot()) fn = COMMANDS['./forza.sh'];
          else { capture = null; print(`bash: ${exe}: ${denied(r.replace(/\/[^/]*$/, '') || '/') ? 'Permission denied' : isDir(r) ? 'Is a directory' : 'No such file or directory'}`, 'red'); return; }
        }
        if (!fn) { capture = null; print(`${cmd}: command not found. try \`help\``, 'red'); return; }
        if (!last) capture = [];
        await fn(args, stdin);
        if (!last) { stdin = capture; capture = null; }
      }
    };

    const toggle = (force) => {
      const open = force ?? !box.classList.contains('is-open');
      box.classList.toggle('is-open', open);
      document.body.classList.toggle('console-open', open);
      box.setAttribute('aria-hidden', String(!open));
      if (open) {
        if (!opened) {
          opened = true; prompt();
          print(['napwnli shell v1.0, type `help` to start.', 'hint: there is a flag somewhere on this site. 3 parts.'], 'dim');
        }
        setTimeout(() => input.focus(), 30);
      } else input.blur();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const v = input.value; input.value = ''; run(v); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (hi > 0) input.value = history[--hi]; }
      else if (e.key === 'ArrowDown') { e.preventDefault(); input.value = hi < history.length - 1 ? history[++hi] : ((hi = history.length), ''); }
      else if (e.key === 'Tab') {
        e.preventDefault();
        const [c, ...rest] = input.value.split(' ');
        if (!rest.length) { const m = NAMES.filter((n) => n.startsWith(c)); if (m.length === 1) input.value = m[0] + ' '; else if (m.length) print(m.join('   '), 'dim'); }
        else if (c === 'cat') { const m = Object.keys(filesIn(cwd) || {}).filter((f) => f.startsWith(rest[0] || '')); if (m.length === 1) input.value = `cat ${m[0]}`; }
      } else if (e.key === 'Escape') toggle(false);
      e.stopPropagation();
    });
    box.querySelector('.console-x').addEventListener('click', () => toggle(false));
    // Clicking anywhere in the window focuses the prompt, unless it hits a link/button or selects text to copy.
    box.addEventListener('click', (e) => {
      if (e.target.closest('a, button, input')) return;
      if (String(window.getSelection() || '')) return;
      input.focus({ preventScroll: true });
      const n = input.value.length; input.setSelectionRange(n, n);
    });
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === 'Escape' && box.classList.contains('is-open')) toggle(false);
    });
    document.querySelectorAll('[data-console]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); toggle(true); }));
    // Floating terminal button (bottom right).
    const fab = el('button', { type: 'button', class: 'term-fab mono', 'aria-label': 'Open terminal', title: 'Open terminal' });
    fab.innerHTML = '<span class="term-fab-ico" aria-hidden="true">&gt;<i></i></span><span class="term-fab-label">terminal</span>';
    fab.addEventListener('click', () => toggle());
    document.body.append(fab);
  };


  /* ══════════════════════════════════════════════════════════
     6. RED ALERT — Konami code or `redteam` in the console.
        ~10 s of alarm, then the Defensive Agent restores the page.
     ══════════════════════════════════════════════════════════ */
  let alertActive = false;
  const redAlert = () => {
    if (alertActive) return;
    alertActive = true;
    const html = document.documentElement;
    const banner = el('div', { class: 'alert-banner mono', role: 'status' });
    document.body.append(banner);
    const set = (on) => { if (on) html.dataset.alert = 'on'; else delete html.dataset.alert; window.dispatchEvent(new CustomEvent('fx:alert', { detail: on })); };
    set(true);
    let n = reduceMotion ? 3 : 10;
    const tick = () => {
      if (n > 0) { banner.innerHTML = `<b>⚠ RED TEAM ENGAGEMENT IN PROGRESS</b><span>Offensive Agent loose on the page · T-${String(n).padStart(2, '0')}</span>`; n--; setTimeout(tick, 1000); return; }
      banner.classList.add('is-blue');
      banner.innerHTML = '<b>🛡 DEFENSIVE AGENT ENGAGED</b><span>isolating · patching · restoring</span>';
      setTimeout(() => {
        const restore = () => set(false);
        if (window.__wipe) window.__wipe(restore, innerWidth / 2, innerHeight / 2); else restore();
        banner.innerHTML = '<b>✓ CONTAINED</b><span>all systems nominal</span>';
        setTimeout(() => { banner.classList.add('is-out'); setTimeout(() => { banner.remove(); alertActive = false; }, 500); }, 1400);
      }, 1300);
    };
    tick();
  };
  const initAlert = () => {
    const K = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let i = 0;
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const inTail = i >= 8 && k === K[i];                 // the "b a" ending: don't let it fire B/A shortcuts
      i = k === K[i] ? i + 1 : (k === K[0] ? 1 : 0);
      if (inTail) { e.preventDefault(); e.stopImmediatePropagation(); }
      if (i === K.length) { i = 0; redAlert(); }
    }, true);
  };

  const markPwned = () => {
    if (store.get('pwned') !== PWN_TOKEN || document.querySelector('.pwned')) return;
    const f = document.querySelector('.site-footer');
    if (!f) return;
    const s = el('span', { class: 'pwned mono', title: 'Flag captured' });
    s.textContent = '■ PWNED · flag captured';
    f.append(s);
  };

  // A greeting for people who open DevTools.
  const greet = () => {
    try {
      console.log('%c napwnli says hi ', 'background:#c2352a;color:#fff;font:600 12px monospace;padding:4px 6px');
      console.log('%cThere is a flag hidden on this site (3 parts). Start with the page source. The terminal button (bottom right) opens a shell.', 'font:12px monospace');
    } catch (e) { /* ignore */ }
  };

  // neofetch card: reveal its lines one by one when it scrolls into view.
  const initFetch = () => {
    const f = document.querySelector('.fetch');
    if (!f || reduceMotion || !('IntersectionObserver' in window)) return;
    f.classList.add('will-reveal');
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { f.classList.add('is-in'); io.disconnect(); } }, { threshold: 0.35 });
    io.observe(f);
    f.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f.click(); } });
  };

  // Hero status: cycles through verbs with a scramble; at night in Naples it is just sleeping.
  const initStatus = () => {
    const st = document.querySelector('.hero-meta .status');
    if (!st) return;
    const word = el('span', { class: 'status-word' });
    word.textContent = st.lastChild.textContent.trim(); st.lastChild.remove(); st.append(word);
    // braille spinner instead of the dot; slow "z" frames while sleeping
    const spin = st.querySelector('i'); st.classList.add('has-spin');
    const nows = [...document.querySelectorAll('.tl-now i')]; nows.forEach((n) => n.closest('.tl-now').classList.add('has-spin'));
    const FR = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏', ZZ = ['z  ', 'zz ', 'zzz', '   '];
    let f = 0;
    const spinStep = () => {
      const night = 'night' in st.dataset;
      spin.textContent = night ? ZZ[f % ZZ.length] : reduceMotion ? '⠿' : FR[f % FR.length];
      nows.forEach((n) => { n.textContent = reduceMotion ? '⠿' : FR[(f + 3) % FR.length]; });
      f++;
      setTimeout(spinStep, night ? 600 : 80);
    };
    spinStep();
    const VERBS = [
      ['researching'], ['hacking', 'red'], ['pwning', 'red'], ['fuzzing'], ['reversing'], ['exploiting', 'red'],
      ['defending', 'blue'], ['threat hunting', 'blue'], ['popping shells', 'red'], ['pivoting', 'red'], ['triaging', 'blue'],
      ['training agents'], ['writing papers'], ['grading CTFs'], ['brewing espresso'], ['cheering for Napoli'], ['reading logs', 'blue'],
    ];
    const hourInNaples = () => Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Rome' }).format(new Date()));
    const GLYPHS = '!<>-_/[]{}=+*^?#$%&01abcdef';
    const set = (text, tone) => {
      st.dataset.tone = tone || '';
      if (reduceMotion) { word.textContent = text; return; }
      const from = word.textContent, len = Math.max(from.length, text.length), t0 = performance.now(), dur = 420 + len * 14;
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        let out = '';
        for (let i = 0; i < len; i++) {
          const at = (i / len) * 0.6 + 0.4;
          if (k >= at) out += text[i] || '';
          else if (k >= at - 0.4) out += text[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
          else out += from[i] || '';
        }
        word.textContent = out;
        if (k < 1) requestAnimationFrame(step); else word.textContent = text;
      };
      requestAnimationFrame(step);
    };
    let i = 0, timer;
    const tick = () => {
      const h = hourInNaples();
      if (h >= 2 && h < 7) { st.dataset.night = ''; if (word.textContent !== 'sleeping') set('sleeping', 'dim'); }
      else {
        delete st.dataset.night;
        i = (i + 1 + Math.floor(Math.random() * 2)) % VERBS.length;
        set(...VERBS[i]);
      }
      timer = setTimeout(tick, 3200);
    };
    document.addEventListener('visibilitychange', () => { clearTimeout(timer); if (!document.hidden) timer = setTimeout(tick, 1200); });
    const h = hourInNaples();
    if (h >= 2 && h < 7) { st.dataset.night = ''; word.textContent = 'sleeping'; st.dataset.tone = 'dim'; }
    timer = setTimeout(tick, 2600);
  };

  const boot = () => {
    initAttackPath();
    initFetch();
    initStatus();
    initDecrypt();
    initReticle();
    initConsole();
    initAlert();
    markPwned();
    greet();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
