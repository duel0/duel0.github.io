(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Theme ─────────────────────────────────────────────── */
  const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
  const currentTheme = () => root.dataset.theme || (prefersDark() ? 'dark' : 'light');
  const applyTheme = () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) { /* storage unavailable */ }
  };
  // Circular wipe from the toggle (View Transitions API), falls back to an instant switch.
  const toggleTheme = () => {
    if (!document.startViewTransition || reduceMotion) return applyTheme();
    const b = document.querySelector('.theme-toggle')?.getBoundingClientRect();
    const x = b ? b.left + b.width / 2 : innerWidth, y = b ? b.top + b.height / 2 : 0;
    root.style.setProperty('--wipe-x', `${x}px`);
    root.style.setProperty('--wipe-y', `${y}px`);
    root.style.setProperty('--wipe-r', `${Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))}px`);
    root.classList.add('theme-wipe');
    const vt = document.startViewTransition(applyTheme);
    vt.ready.catch(() => {});
    vt.finished.catch(() => {}).finally(() => root.classList.remove('theme-wipe'));
  };
  window.__wipe = (fn, x, y) => {             // shared with fx.js (red alert restore)
    if (!document.startViewTransition || reduceMotion) return fn();
    root.style.setProperty('--wipe-x', `${x}px`); root.style.setProperty('--wipe-y', `${y}px`);
    root.style.setProperty('--wipe-r', `${Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))}px`);
    root.classList.add('theme-wipe');
    const vt = document.startViewTransition(fn);
    vt.ready.catch(() => {});
    vt.finished.catch(() => {}).finally(() => root.classList.remove('theme-wipe'));
  };

  /* ── Publication filter ────────────────────────────────── */
  const filterBtns = document.querySelectorAll('.filter button');
  const pubs = document.querySelectorAll('#pubs li');
  filterBtns.forEach(btn => btn.addEventListener('click', () => {
    const f = btn.dataset.filter;
    filterBtns.forEach(b => {
      const on = b === btn;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    pubs.forEach(li => { li.hidden = f === 'first' && !li.hasAttribute('data-first'); });
    // "First author" shows its full (short) list; "All" goes back to the collapsed view.
    if (pubList && toggle) { pubList.classList.toggle('is-collapsed', f === 'all' && !expanded); toggle.hidden = f !== 'all'; }
  }));

  /* ── Publications: show key papers, expand for the full list ── */
  const pubList = document.getElementById('pubs');
  const toggle = document.querySelector('.pubs-toggle');
  let expanded = false;
  if (pubList && toggle && pubList.querySelector('[data-key]')) {
    const total = pubs.length;
    const label = () => {
      toggle.innerHTML = expanded ? 'Show fewer <span aria-hidden="true">↑</span>' : `Show all ${total} papers <span aria-hidden="true">↓</span>`;
      toggle.setAttribute('aria-expanded', String(expanded));
    };
    pubList.classList.add('is-collapsed'); toggle.hidden = false; label();
    toggle.addEventListener('click', () => {
      expanded = !expanded;
      pubList.classList.toggle('is-collapsed', !expanded);
      label();
      if (!expanded) pubList.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  /* ── Blog: copy link / copy code ───────────────────────── */
  const flash = (btn, text) => { const t = btn.textContent; btn.textContent = text; setTimeout(() => { btn.textContent = t; }, 1400); };
  document.querySelectorAll('[data-copy-link]').forEach((btn) => btn.addEventListener('click', () => {
    navigator.clipboard?.writeText(location.href.split('#')[0]).then(() => flash(btn, 'Copied ✓'), () => flash(btn, 'Copy failed'));
  }));
  document.querySelectorAll('.copy-code').forEach((btn) => btn.addEventListener('click', () => {
    const code = btn.closest('.codeblock')?.querySelector('code')?.innerText ?? '';
    navigator.clipboard?.writeText(code).then(() => flash(btn, 'copied'), () => flash(btn, 'failed'));
  }));

  /* ── Blog: category filter ─────────────────────────────── */
  const chipsEl = document.querySelector('.chips');
  if (chipsEl) {
    const feature = document.querySelector('.blog-feed .feature');
    const featureRow = document.querySelector('.blog-feed .feature-row');
    const items = document.querySelectorAll('.blog-feed .rows li:not(.feature-row)');
    chipsEl.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => {
      const cat = btn.dataset.catFilter, all = cat === 'all';
      chipsEl.querySelectorAll('button').forEach((b) => { b.classList.toggle('is-active', b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
      if (feature) feature.hidden = !all;
      if (featureRow) featureRow.hidden = all || featureRow.dataset.cat !== cat;
      items.forEach((li) => { li.hidden = !all && li.dataset.cat !== cat; });
    }));
  }

  /* ── Footer year ───────────────────────────────────────── */
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  /* ── Reveal on scroll ──────────────────────────────────── */
  const revealables = document.querySelectorAll('.section-head, .card, .featured, .pubs li, .hl li, .about-grid, .interests, .contact-line, .links');
  if (!reduceMotion && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    revealables.forEach(el => { el.classList.add('reveal'); io.observe(el); });

    // Grow the featured bars when they come into view.
    const figs = document.querySelector('.featured-figs');
    if (figs) {
      figs.querySelectorAll('b').forEach(b => b.style.setProperty('--grow', '0'));
      new IntersectionObserver((entries, obs) => {
        if (entries[0].isIntersecting) {
          figs.querySelectorAll('b').forEach((b, i) => setTimeout(() => b.style.setProperty('--grow', '1'), 120 * i));
          obs.disconnect();
        }
      }, { threshold: 0.4 }).observe(figs);
    }
  }

  /* ── Terminal trace (illustrative) ─────────────────────── */
  const trace = document.getElementById('trace');
  if (!trace) return;

  // [class, text] — class: d=dim, r=red agent, b=blue agent, g=green/ok, '' = default
  const script = [
    ['d', '$ range up --agents offensive,defensive'],
    ['d', '[range] 6 hosts · wazuh · velociraptor · elastic'],
    ['',  ''],
    ['r', 'off ▸ recon 10.0.4.0/24 … 3 services exposed'],
    ['b', 'def ▸ baseline captured, watching auth.log'],
    ['r', 'off ▸ T1190 exploit public-facing app → shell'],
    ['b', 'def ▸ alert: anomalous child proc (www-data)'],
    ['b', 'def ▸ patch + rotate creds · service still up'],
    ['r', 'off ▸ T1078 valid accounts … denied'],
    ['r', 'off ▸ pivoting: emulate APT29 playbook'],
    ['b', 'def ▸ TTP match: APT29? attribution conf. 0.41'],
    ['d', '[eval] who was it, really?'],
    ['g', '✓ round complete, results logged'],
  ];

  const cls = { d: 't-dim', r: 't-red', b: 't-blue', g: 't-green' };
  const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const lineHTML = ([c, txt]) => (cls[c] ? `<span class="${cls[c]}">${esc(txt)}</span>` : esc(txt));

  if (reduceMotion) {
    trace.innerHTML = script.map(lineHTML).join('\n');
    return;
  }

  const MAX_LINES = 13;
  let done = [];
  let li = 0, ci = 0;
  let paused = false;

  const render = (partial) => {
    const lines = done.slice(-MAX_LINES + 1);
    const cur = partial ? lineHTML(partial) : '';
    trace.innerHTML = lines.map(lineHTML).join('\n') + (lines.length ? '\n' : '') + cur + '<span class="cursor"></span>';
  };

  const tick = () => {
    if (paused) return setTimeout(tick, 400);
    if (li >= script.length) {
      setTimeout(() => { done = []; li = 0; ci = 0; tick(); }, 4200);
      return;
    }
    const [c, txt] = script[li];
    if (ci <= txt.length) {
      render([c, txt.slice(0, ci)]);
      ci += c === 'd' ? 3 : 1;           // tool output prints faster than "agent" lines
      setTimeout(tick, c === 'd' ? 8 : 18 + Math.random() * 22);
    } else {
      done.push([c, txt]);
      li++; ci = 0;
      render(null);
      setTimeout(tick, txt === '' ? 120 : 380 + Math.random() * 300);
    }
  };

  // Pause typing when the hero is off-screen or the tab is hidden.
  document.addEventListener('visibilitychange', () => { paused = document.hidden; });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => { paused = !en.isIntersecting || document.hidden; }).observe(trace);
  }

  setTimeout(tick, 500);
})();
