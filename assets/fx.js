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
  const FLAG_SHA256 = '0211c4cc7ac7846b6ef11a6db6bafcde02093797e3c044245f3723678b89ad21';
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
      'Francesco Balassone — AI Security Research Lead @ CYBER RANGES,',
      'industrial PhD student @ University of Naples Federico II.',
      'Offensive & defensive AI agents, adversary emulation, cyber ranges.',
    ],
    'napwnli.txt': [
      'napwnli — competitive hacking team of the University of Naples Federico II.',
      'Born in 2024 from the CyberChallenge.IT Naples finalists. Co-founder & captain.',
      `→ ${LINKS.napwnli}`,
    ],
    'contact.txt': Object.entries(LINKS).map(([k, v]) => `${k.padEnd(9)} ${v}`),
    '.part3': ['3/3 (rot13): _4yy}', 'now: submit flag{...}'],
  };

  const initConsole = () => {
    const box = el('div', { class: 'console', role: 'dialog', 'aria-label': 'Console', 'aria-hidden': 'true' });
    box.innerHTML = `
      <div class="console-bar mono"><span class="lights" aria-hidden="true"><i></i><i></i><i></i></span><span>visitor@balassone: ~</span><button type="button" class="console-x" aria-label="Close console">esc</button></div>
      <div class="console-out mono" aria-live="polite"></div>
      <label class="console-in mono"><span class="console-ps"></span><input type="text" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Command"></label>`;
    document.body.append(box);
    const out = box.querySelector('.console-out'), input = box.querySelector('input'), ps = box.querySelector('.console-ps');
    const isRoot = () => store.get('pwned') === '1';
    const prompt = () => { ps.textContent = isRoot() ? 'root@balassone:~#' : 'visitor@balassone:~$'; };
    const history = []; let hi = 0, opened = false;

    const print = (lines, cls = '') => {
      [].concat(lines).forEach((l) => {
        const p = el('div', { class: `cl ${cls}` });
        if (typeof l === 'object' && l.href) {
          const a = el('a', { href: l.href, target: l.href.startsWith('http') ? '_blank' : '_self', rel: 'noopener' });
          a.textContent = l.text; p.append(l.pre || '', a);
        } else p.textContent = l;
        out.append(p);
      });
      out.scrollTop = out.scrollHeight;
    };
    const sha256 = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

    const COMMANDS = {
      help: () => print([
        'commands:',
        '  whoami · about · papers · ctf · blog · contact · links',
        '  ls [-a] · cat <file> · clear · history · date · exit',
        '  redteam         — you probably shouldn\'t.',
        '  submit <flag>   — found something? (there is a flag hidden on this site)',
      ], 'dim'),
      whoami: () => print(isRoot() ? 'root — flag captured. respect. 🫡' : 'visitor — curious, apparently. try `help`.'),
      about: () => print(FILES['about.txt']),
      ls: (args) => print(Object.keys(FILES).filter((f) => args.includes('-a') || args.includes('-la') || !f.startsWith('.')).join('   ')),
      cat: ([f]) => (FILES[f] ? print(FILES[f]) : print(`cat: ${f || ''}: No such file or directory`, 'red')),
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
      exit: () => toggle(false),
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
          store.set('pwned', '1'); prompt(); markPwned();
          print([
            '   __    _              _',
            '  / _|  | |  __ _   __ _| |  ✓ correct',
            ' |  _|  | | / _` | / _` |_|',
            ' |_|    |_| \\__,_| \\__, (_)  the donkey sees all.',
            '                   |___/',
            'You are now root. Screenshot this and send it to me on LinkedIn —',
          ], 'green');
          print({ pre: '→ ', text: LINKS.linkedin, href: LINKS.linkedin }, 'green');
        } else print('✕ wrong flag. the format is flag{...}', 'red');
      },
    };
    const NAMES = Object.keys(COMMANDS);

    const run = async (raw) => {
      const line = raw.trim();
      print(`${ps.textContent} ${line}`, 'cmd');
      if (!line) return;
      history.push(line); hi = history.length;
      const [cmd, ...args] = line.split(/\s+/);
      const fn = COMMANDS[cmd.toLowerCase()];
      if (fn) await fn(args); else print(`${cmd}: command not found. try \`help\``, 'red');
    };

    const toggle = (force) => {
      const open = force ?? !box.classList.contains('is-open');
      box.classList.toggle('is-open', open);
      box.setAttribute('aria-hidden', String(!open));
      if (open) {
        if (!opened) {
          opened = true; prompt();
          print(['napwnli shell v1.0 — type `help` to start.', 'hint: there is a flag somewhere on this site. 3 parts.'], 'dim');
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
        else if (c === 'cat') { const m = Object.keys(FILES).filter((f) => f.startsWith(rest[0] || '')); if (m.length === 1) input.value = `cat ${m[0]}`; }
      } else if (e.key === 'Escape') toggle(false);
      e.stopPropagation();
    });
    box.querySelector('.console-x').addEventListener('click', () => toggle(false));
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const palette = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      const plain = !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === '\\' || e.key === '~' || e.key === '`' || e.code === 'Backquote');
      if (palette || plain) { e.preventDefault(); toggle(); }
      else if (e.key === 'Escape' && box.classList.contains('is-open')) toggle(false);
    });
    document.querySelectorAll('[data-console]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); toggle(true); }));
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
    if (store.get('pwned') !== '1' || document.querySelector('.pwned')) return;
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
      console.log('%cThere is a flag hidden on this site (3 parts). Start with the page source. Press T for a shell.', 'font:12px monospace');
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

  const boot = () => {
    initAttackPath();
    initFetch();
    initDecrypt();
    initReticle();
    initConsole();
    initAlert();
    markPwned();
    greet();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
