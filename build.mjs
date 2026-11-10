#!/usr/bin/env node
/*
  Static build for the site + blog. Zero dependencies (Node ≥ 18).

    node build.mjs                 build into _site/
    node build.mjs --drafts        also include posts with `draft: true`
    node build.mjs --serve         build, serve on http://localhost:8000 and rebuild on change

  Posts live in content/posts/YYYY-MM-DD-slug.md. See README.md for the
  front matter and the block syntax (callouts, toggles, stats, figures…).
*/
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, '_site');
const POSTS_DIR = path.join(ROOT, 'content', 'posts');
const TEMPLATES = path.join(ROOT, 'templates');

const SITE = {
  url: 'https://duel0.github.io',          // change if you use a custom domain
  title: 'Francesco Balassone',
  author: 'Francesco Balassone',
  description: 'Notes on offensive AI, autonomous agents, cyber ranges and CTFs, and everything that comes to my mind.',
};
const COVER_STYLES = ['adversary', 'network', 'signal', 'offense', 'evaluation', 'terrain'];   // auto-picked
const EXTRA_COVERS = ['compound'];                                                              // opt-in via cover:

const args = new Set(process.argv.slice(2));
const INCLUDE_DRAFTS = args.has('--drafts');

/* ── Utilities ─────────────────────────────────────────────────── */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (d) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
const readTime = (text) => Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 220));
const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, p.endsWith('.html') ? stamp(s) : s); };
const fill = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : ''));
const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

/* ── Inline markdown ───────────────────────────────────────────── */
function inline(src) {
  const codes = [];
  let s = src.replace(/`([^`]+)`/g, (_, c) => { codes.push(`<code>${esc(c)}</code>`); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src2) => `<img src="${src2}" alt="${alt}" loading="lazy">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) => {
    const ext = /^https?:\/\//.test(href);
    return `<a href="${href}"${ext ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`;
  });
  s = s.replace(/\[\[([^\]]+)\]\]/g, '<kbd>$1</kbd>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/==([^=]+)==/g, '<mark>$1</mark>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  s = s.replace(/ -- /g, ', ');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[+i]);
}

/* ── Block markdown ────────────────────────────────────────────── */
/* ── Callouts ──────────────────────────────────────────────────── */
// Line-art icons (16×16, stroke = currentColor) in the same style as the site's figures.
const ICON = {
  note:    '<path d="M4 1.8h5.5L12.5 5v9.2H4z"/><path d="M9.5 1.8V5h3M6 8h4.5M6 10.8h3.2"/>',
  info:    '<circle cx="8" cy="8" r="6.2"/><path d="M8 7.2v4.3M8 4.6v.5"/>',
  tip:     '<path d="M5.6 10.6A4.2 4.2 0 1 1 10.4 10.6V12H5.6z"/><path d="M6.2 14.2h3.6M8 6.2v3.2"/>',
  idea:    '<path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M3.4 3.4l2.1 2.1M10.5 10.5l2.1 2.1M3.4 12.6l2.1-2.1M10.5 5.5l2.1-2.1"/>',
  warning: '<path d="M8 1.8l6.6 11.7H1.4z"/><path d="M8 6.2v3.6M8 11.4v.4"/>',
  danger:  '<path d="M5.4 1.5h5.2l3.9 3.9v5.2l-3.9 3.9H5.4l-3.9-3.9V5.4z"/><path d="M6 6l4 4M10 6l-4 4"/>',
  offense: '<circle cx="8" cy="8" r="4.4"/><circle cx="8" cy="8" r="1.1"/><path d="M8 .8v3.4M8 11.8v3.4M.8 8h3.4M11.8 8h3.4"/>',
  defense: '<path d="M8 1.4l5.4 2.1v4.3c0 3.3-2.3 5.6-5.4 6.8-3.1-1.2-5.4-3.5-5.4-6.8V3.5z"/><path d="M8 4.4v8.2M4.6 7.4h6.8"/>',
};
const CALLOUTS = {
  note: 'Note', info: 'Info', tip: 'Tip', idea: 'Idea', warning: 'Warning', danger: 'Danger', offense: 'Offense', defense: 'Defense',
};
const CALLOUT_ALIAS = { red: 'offense', blue: 'defense', caution: 'danger', important: 'warning' };

function callout(type, title, bodyHtml) {
  const t = CALLOUT_ALIAS[type] || (CALLOUTS[type] ? type : 'note');
  return `<aside class="callout callout-${t}">
  <p class="callout-tag mono"><svg viewBox="0 0 16 16" aria-hidden="true">${ICON[t]}</svg>${CALLOUTS[t]}</p>
  <div class="callout-body">${title ? `<p class="callout-title">${inline(title)}</p>` : ''}${bodyHtml}</div>
</aside>`;
}

/* ── Syntax highlighting (small, dependency-free) ──────────────── */
const words = (s) => new Set(s.split(/\s+/).filter(Boolean));
const STR_DQ = /"(?:\\.|[^"\\\n])*"/.source, STR_SQ = /'(?:\\.|[^'\\\n])*'/.source;
const NUM = /\b(?:0[xX][\da-fA-F_]+|0[bBoO][0-7_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)\b/.source;
const WORD = /[A-Za-z_$][\w$]*/.source;
const C_COM = /\/\/[^\n]*|\/\*[\s\S]*?\*\//.source;

function classify({ kw, consts = '', builtins = '', defs = '' }) {
  const K = words(kw), CO = words(consts), B = words(builtins), DEF = words(defs);
  return (w, code, start, end, prev) => {
    if (DEF.has(prev)) return 'def';
    if (K.has(w)) return 'kw';
    if (CO.has(w)) return 'const';
    if (w === 'self' || w === 'this' || w === 'cls') return 'self';
    const call = /^\s*\(/.test(code.slice(end, end + 40));
    if (B.has(w)) return 'builtin';
    if (call) return 'fn';
    if (/^[A-Z][a-z]\w*$/.test(w)) return 'type';
    return '';
  };
}

const LANGS = {
  python: {
    rules: [['com', /#[^\n]*/.source], ['str', `[rRbBfFuU]{0,2}(?:"""[\\s\\S]*?"""|'''[\\s\\S]*?'''|${STR_DQ}|${STR_SQ})`], ['dec', /@[\w.]+/.source], ['num', NUM], ['word', WORD]],
    word: classify({
      kw: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case',
      consts: 'True False None',
      builtins: 'print len range open str int float list dict set tuple bool bytes type isinstance enumerate zip map filter sorted sum min max abs any all super object input repr hash iter next format round getattr setattr hasattr Exception ValueError KeyError TypeError RuntimeError',
      defs: 'def class',
    }),
  },
  js: {
    rules: [['com', C_COM], ['str', `\`(?:\\\\.|[^\`\\\\])*\`|${STR_DQ}|${STR_SQ}`], ['num', NUM], ['word', WORD]],
    word: classify({
      kw: 'async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch throw try typeof var void while with yield as type interface implements enum readonly private public protected',
      consts: 'true false null undefined NaN Infinity',
      builtins: 'console window document JSON Math Promise Array Object String Number Boolean Error Map Set Date RegExp Symbol require module process fetch',
      defs: 'function class interface type enum',
    }),
  },
  bash: {
    rules: [['com', /(?<=^|\s)#[^\n]*/.source], ['str', `${STR_DQ}|${STR_SQ}`], ['var', /\$\{[^}\n]*\}|\$\w+|\$[@#?$!*0-9]/.source], ['flag', /(?<=\s)--?[A-Za-z][\w-]*/.source], ['num', NUM], ['word', /[A-Za-z_][\w.-]*/.source]],
    word: (w, code, start) => {
      const K = words('if then else elif fi for while until do done case esac function in select return exit local export readonly declare source sudo');
      if (K.has(w)) return 'kw';
      const before = code.slice(code.lastIndexOf('\n', start - 1) + 1, start);
      if (/^\s*(?:\$\s+)?$/.test(before) || /(?:[|;&]|&&|\|\||\$\()\s*$/.test(before)) return 'fn';
      return '';
    },
  },
  json: {
    rules: [['str', STR_DQ], ['num', /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/.source], ['word', WORD]],
    keys: true,
    word: (w) => (['true', 'false', 'null'].includes(w) ? 'const' : ''),
  },
  yaml: {
    rules: [['com', /(?<=^|\s)#[^\n]*/.source], ['key', /^[ \t]*(?:- )?[\w.-]+(?=\s*:)/.source], ['str', `${STR_DQ}|${STR_SQ}`], ['num', NUM], ['word', WORD]],
    word: (w) => (['true', 'false', 'null', 'yes', 'no', 'on', 'off'].includes(w) ? 'const' : ''),
  },
  c: {
    rules: [['com', C_COM], ['dec', /#\s*\w+/.source], ['str', `${STR_DQ}|${STR_SQ}`], ['num', NUM], ['word', WORD]],
    word: classify({
      kw: 'auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while bool class public private protected template typename namespace using new delete virtual override final import package extends implements interface throws throw try catch finally var',
      consts: 'true false NULL nullptr null',
      builtins: 'printf scanf malloc free memcpy strlen std cout cin endl System',
      defs: 'struct class enum interface',
    }),
  },
  go: {
    rules: [['com', C_COM], ['str', `\`[^\`]*\`|${STR_DQ}|${STR_SQ}`], ['num', NUM], ['word', WORD]],
    word: classify({
      kw: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var',
      consts: 'true false nil iota',
      builtins: 'append cap close copy delete len make new panic print println recover fmt errors',
      defs: 'func type',
    }),
  },
  rust: {
    rules: [['com', C_COM], ['str', STR_DQ], ['dec', /#!?\[[^\]\n]*\]/.source], ['num', NUM], ['word', WORD]],
    word: classify({
      kw: 'as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return static struct super trait type unsafe use where while',
      consts: 'true false None Some Ok Err Self',
      builtins: 'println print format vec panic assert Vec String Box Option Result',
      defs: 'fn struct enum trait type mod',
    }),
  },
};
const LANG_ALIAS = {
  py: 'python', python3: 'python', javascript: 'js', ts: 'js', typescript: 'js', jsx: 'js', tsx: 'js', node: 'js', mjs: 'js',
  sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', yml: 'yaml', cpp: 'c', 'c++': 'c', h: 'c', java: 'c', cs: 'c', csharp: 'c',
  golang: 'go', rs: 'rust',
};

function highlight(code, langRaw) {
  const spec = LANGS[LANG_ALIAS[langRaw?.toLowerCase()] || langRaw?.toLowerCase()];
  if (!spec) return esc(code);
  const re = new RegExp(spec.rules.map(([, src]) => `(${src})`).join('|'), 'gm');
  let out = '', last = 0, prev = '', m;
  while ((m = re.exec(code))) {
    if (!m[0]) { re.lastIndex++; continue; }
    out += esc(code.slice(last, m.index));
    const type = spec.rules[m.slice(1).findIndex((g) => g !== undefined)][0];
    let cls = type;
    if (type === 'word') cls = spec.word(m[0], code, m.index, re.lastIndex, prev);
    else if (type === 'str' && spec.keys && /^\s*:/.test(code.slice(re.lastIndex))) cls = 'key';
    out += cls ? `<span class="tk-${cls}">${esc(m[0])}</span>` : esc(m[0]);
    if (type === 'word') prev = m[0];
    else if (type !== 'com') prev = '';
    last = re.lastIndex;
  }
  return out + esc(code.slice(last));
}

function pullQuote(md, ctx) {
  const lines = md.trim().split('\n');
  let cite = '';
  if (/^(—|--)\s*/.test(lines[lines.length - 1] || '')) cite = lines.pop().replace(/^(—|--)\s*/, '');
  return `<figure class="pullquote"><blockquote>${render(lines.join('\n'), ctx)}</blockquote>${cite ? `<figcaption class="mono">${inline(cite)}</figcaption>` : ''}</figure>`;
}

function terminal(title, body) {
  const line = (l) => {
    const e = esc(l);
    if (/^\$ /.test(l)) return `<span class="t-cmd"><span class="t-dim">$</span> ${e.slice(2)}</span>`;
    if (/^(off|red)\b/.test(l)) return `<span class="t-red">${e}</span>`;
    if (/^(def|blue)\b/.test(l)) return `<span class="t-blue">${e}</span>`;
    if (/^(✓|ok\b)/.test(l)) return `<span class="t-green">${e}</span>`;
    if (/^(#|\[)/.test(l)) return `<span class="t-dim">${e}</span>`;
    return e;
  };
  return `<figure class="term">
  <div class="term-bar mono"><span class="lights" aria-hidden="true"><i></i><i></i><i></i></span><span>${esc(title || 'terminal')}</span></div>
  <pre class="mono">${body.replace(/\n+$/, '').split('\n').map(line).join('\n')}</pre>
</figure>`;
}

function codeBlock(meta, code) {
  const lang = (meta.match(/^([\w+-]+)/) || [])[1] || '';
  const title = (meta.match(/title="([^"]+)"/) || [])[1] || '';
  if (lang === 'terminal') return terminal(title, code);
  const body = highlight(code, lang);
  return `<figure class="codeblock">
  <div class="codeblock-bar mono"><span>${esc(title || lang || 'code')}</span>${title && lang ? `<span class="codeblock-lang">${esc(lang)}</span>` : ''}<button type="button" class="copy-code" aria-label="Copy code">copy</button></div>
  <pre><code>${body}</code></pre>
</figure>`;
}

function table(rows) {
  const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const head = cells(rows[0]);
  const align = cells(rows[1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /-+:$/.test(c) ? 'right' : 'left'));
  const body = rows.slice(2).map(cells);
  const td = (tag, c, i) => `<${tag}${align[i] !== 'left' ? ` style="text-align:${align[i]}"` : ''}>${inline(c)}</${tag}>`;
  return `<div class="table-wrap"><table><thead><tr>${head.map((c, i) => td('th', c, i)).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c, i) => td('td', c, i)).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function container(type, arg, body, ctx) {
  if (CALLOUTS[type] || CALLOUT_ALIAS[type]) return callout(type, arg, render(body, ctx));
  switch (type) {
    case 'toggle':
      return `<details class="toggle"><summary>${inline(arg || 'Details')}</summary><div class="toggle-body">${render(body, ctx)}</div></details>`;
    case 'pull':
      return pullQuote(body, ctx);
    case 'terminal':
      return terminal(arg, body);
    case 'stats': {
      const tiles = body.trim().split('\n').filter(Boolean).map((l) => {
        const [v, ...rest] = l.split('|');
        return `<div><b>${inline(v.trim())}</b><span>${inline(rest.join('|').trim())}</span></div>`;
      });
      return `<div class="stat-tiles">${tiles.join('')}</div>`;
    }
    case 'bookmark': {
      const meta = LINKS[arg] || {};
      const [t0, d0] = body.trim().split('\n').map((s) => s.trim());
      const title = t0 || meta.title || arg, desc = d0 || meta.description || '';
      const art = meta.image
        ? `<span class="bookmark-art bookmark-media"><img src="/${LINK_DIR_URL}/${meta.image}" alt="" loading="lazy"></span>`
        : `<canvas class="bookmark-art" data-fig="terrain" data-seed="${hash(arg) % 9973 + 1}" data-mini aria-hidden="true"></canvas>`;
      return `<a class="bookmark${meta.image ? ' has-img' : ''}" href="${esc(arg)}" target="_blank" rel="noopener">
  <span class="bookmark-text"><b>${inline(esc(title))}</b>${desc ? `<span>${inline(esc(desc))}</span>` : ''}<span class="bookmark-url mono">${esc(domainOf(arg))} ↗</span></span>
  ${art}
</a>`;
    }
    case 'figure': {
      const style = COVER_STYLES.includes(arg.split(/\s+/)[0]) ? arg.split(/\s+/)[0] : 'adversary';
      ctx.fig += 1;
      return `<figure class="gen-fig"><canvas data-fig="${style}" data-seed="${hash(body + style) % 9973 + 1}" aria-hidden="true"></canvas><figcaption class="mono"><span>FIG. ${String(ctx.fig).padStart(2, '0')}</span>${inline(body.trim())}</figcaption></figure>`;
    }
    case 'calculator': {
      const o = Object.fromEntries(arg.split(/\s+/).filter(Boolean).map((kv) => kv.split('=')));
      const n = (k, d) => (o[k] !== undefined && !Number.isNaN(Number(o[k])) ? Number(o[k]) : d);
      const slider = (name, label, min, max, step, val) => `<label><span>${label} <b data-show="${name}"></b></span><input type="range" name="${name}" min="${min}" max="${max}" step="${step}" value="${val}"></label>`;
      ctx.fig += 1;
      return `<figure class="calc">
  <div class="calc-controls mono">
    ${slider('monthly', 'Monthly', 0, 2000, 25, n('monthly', 200))}
    ${slider('years', 'Years', 5, 50, 1, n('years', 40))}
    ${slider('rate', 'Return / yr', 0, 12, 0.5, n('rate', 5))}
    ${slider('start', 'Starting amount', 0, 50000, 500, n('start', 0))}
    <input type="hidden" name="age" value="${n('age', 25)}">
    <label class="calc-check"><input type="checkbox" name="crash"${o.crash === 'on' ? ' checked' : ''}> Add a −35% crash</label>
  </div>
  <canvas aria-label="Chart of money paid in versus portfolio value over time"></canvas>
  <dl class="calc-out mono"></dl>
  <figcaption class="mono"><span>FIG. ${String(ctx.fig).padStart(2, '0')}</span>${inline(body.trim() || 'Illustrative only, fixed return, no fees, taxes or inflation. Not financial advice.')}</figcaption>
</figure>`;
    }
    case 'columns': {
      const cols = body.split(/^\|\|\|\s*$/m);
      return `<div class="columns columns-${cols.length}">${cols.map((c) => `<div>${render(c, ctx)}</div>`).join('')}</div>`;
    }
    case 'toc':
      return '<!--toc-->';
    default:
      return render(body, ctx);
  }
}

function render(md, ctx) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  const para = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para.length = 0; } };
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ::: containers (nestable)
    const open = line.match(/^:::\s*([\w-]+)\s*(.*)$/);
    if (open) {
      flush();
      let depth = 1; const buf = []; i++;
      while (i < lines.length) {
        if (/^:::\s*[\w-]+/.test(lines[i])) depth++;
        else if (/^:::\s*$/.test(lines[i]) && --depth === 0) break;
        buf.push(lines[i++]);
      }
      i++;
      out.push(container(open[1].toLowerCase(), open[2].trim().replace(/^"|"$/g, ''), buf.join('\n'), ctx));
      continue;
    }
    // ``` fences
    if (/^```/.test(line)) {
      flush();
      const meta = line.slice(3).trim(); const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(codeBlock(meta, buf.join('\n')));
      continue;
    }
    if (!line.trim()) { flush(); i++; continue; }
    // headings: # → h2, ## → h3, ### → h4 (the post title is the h1)
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flush();
      const level = h[1].length + 1, html = inline(h[2]), id = slugify(h[2]);
      if (level === 2) ctx.toc.push({ id, html });
      out.push(`<h${level} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${html}</h${level}>`);
      i++; continue;
    }
    if (/^\*{3,}\s*$/.test(line)) { flush(); out.push('<div class="ornament" aria-hidden="true"><span></span><i>◆</i><span></span></div>'); i++; continue; }
    if (/^-{3,}\s*$/.test(line)) { flush(); out.push('<hr>'); i++; continue; }
    // tables
    if (/^\|/.test(line) && /^\|?\s*:?-{3,}/.test(lines[i + 1] || '')) {
      flush();
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      out.push(table(rows));
      continue;
    }
    // blockquotes, GitHub-style alerts ([!NOTE] …) and pull quotes ([!PULL])
    if (/^>\s?/.test(line)) {
      flush();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      const alert = (buf[0] || '').match(/^\[!(\w+)\]\s*(.*)$/);
      if (alert) {
        const type = alert[1].toLowerCase();
        const body = buf.slice(1).join('\n');
        out.push(type === 'pull' ? pullQuote(body, ctx) : callout(type, alert[2], render(body, ctx)));
      } else {
        out.push(`<blockquote>${render(buf.join('\n'), ctx)}</blockquote>`);
      }
      continue;
    }
    // lists (with - [ ] / - [x] task items)
    const li = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (li) {
      flush();
      const ordered = /\d/.test(li[2]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
        if (m) { items.push(m[3]); i++; continue; }
        if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) { items[items.length - 1] += ' ' + lines[i].trim(); i++; continue; }
        break;
      }
      const isTask = items.every((t) => /^\[( |x|X)\]\s/.test(t));
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}${isTask ? ' class="tasks"' : ''}>${items.map((t) => {
        if (!isTask) return `<li>${inline(t)}</li>`;
        const done = /^\[(x|X)\]/.test(t);
        return `<li class="${done ? 'done' : ''}"><span class="check" aria-hidden="true">${done ? '✓' : ''}</span>${inline(t.replace(/^\[( |x|X)\]\s/, ''))}</li>`;
      }).join('')}</${tag}>`);
      continue;
    }
    // images on their own line → numbered figures
    const img = line.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s*$/);
    if (img) {
      flush();
      ctx.fig += 1;
      const cap = img[3] || '';
      out.push(`<figure class="img-fig"><img src="${img[2]}" alt="${esc(img[1])}" loading="lazy"><figcaption class="mono"><span>FIG. ${String(ctx.fig).padStart(2, '0')}</span>${inline(cap)}</figcaption></figure>`);
      i++; continue;
    }
    // raw HTML
    if (/^\s*</.test(line)) {
      flush();
      const buf = [];
      while (i < lines.length && lines[i].trim()) buf.push(lines[i++]);
      out.push(buf.join('\n'));
      continue;
    }
    para.push(line.trim());
    i++;
  }
  flush();
  return out.join('\n');
}

function markdown(md) {
  const ctx = { fig: 0, toc: [] };
  let html = render(md, ctx);
  html = html.replace('<!--toc-->', ctx.toc.length
    ? `<nav class="toc" aria-label="Contents"><p class="mono">Contents</p><ol>${ctx.toc.map((h) => `<li><a href="#${h.id}">${h.html}</a></li>`).join('')}</ol></nav>`
    : '');
  return html;
}

/* ── Front matter ──────────────────────────────────────────────── */
function parseFrontMatter(raw) {
  const m = raw.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    else if (v === 'true' || v === 'false') v = v === 'true';
    else v = v.replace(/^["']|["']$/g, '');
    data[kv[1]] = v;
  }
  return { data, body: m[2] };
}

// content/drafts/ is git-ignored: work in progress stays on your machine.
const DRAFTS_DIR = path.join(ROOT, 'content', 'drafts');
function loadPosts() {
  const dirs = [POSTS_DIR, ...(INCLUDE_DRAFTS ? [DRAFTS_DIR] : [])].filter((d) => fs.existsSync(d));
  return dirs.flatMap((dir) => fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}-.+\.md$/.test(f)).map((f) => [dir, f]))
    .map(([dir, file]) => {
      const { data, body } = parseFrontMatter(read(path.join(dir, file)));
      const slug = data.slug || file.slice(11, -3);
      const h = hash(slug);
      const category = data.category || 'Notes';
      return {
        file, slug,
        html: markdown(body),
        title: data.title || slug,
        description: data.description || '',
        tags: Array.isArray(data.tags) ? data.tags : data.tags ? [data.tags] : [],
        draft: data.draft === true,
        date: new Date(`${data.date || file.slice(0, 10)}T00:00:00Z`),
        minutes: readTime(body),
        category,
        cat: slugify(category),
        cover: [...COVER_STYLES, ...EXTRA_COVERS].includes(data.cover) ? data.cover : COVER_STYLES[h % COVER_STYLES.length],
        seed: Number(data.seed) || (h % 9973) + 1,
      };
    })
    .filter((p) => INCLUDE_DRAFTS || !p.draft)
    .sort((a, b) => b.date - a.date || a.title.localeCompare(b.title));
}

/* ── Fragments ─────────────────────────────────────────────────── */
const vt = (kind, p, on = true) => (on ? ` style="view-transition-name: ${kind}-${p.slug.replace(/[^a-z0-9-]/g, '')}"` : '');
const cover = (p, mini = false) => `<canvas data-fig="${p.cover}" data-seed="${p.seed}"${mini ? ' data-mini' : ''} aria-hidden="true"></canvas>`;
const meta = (p) => `${fmtDate(p.date)} · ${p.minutes} min read${p.draft ? ' · <span class="badge">draft</span>' : ''}`;
const kicker = (p) => `<p class="kicker mono"><span class="cat">${esc(p.category)}</span>${p.tags.length ? ' · ' + p.tags.map(esc).join(' · ') : ''}</p>`;

function feed(posts, root, limit = Infinity, withFilterRow = false) {
  if (!posts.length) return '<p class="posts-empty">First posts are on the way.</p>';
  const [first, ...rest] = posts.slice(0, limit);
  const url = (p) => `${root}blog/${p.slug}/`;
  const row = (p, hidden = false) => `
        <li data-cat="${p.cat}"${hidden ? ' class="feature-row" hidden' : ''}><a class="row" href="${url(p)}">
          <div class="row-text">
            ${kicker(p)}
            <h3 class="row-title"${vt('t', p, !hidden)}>${esc(p.title)}</h3>
            ${p.description ? `<p class="row-desc">${esc(p.description)}</p>` : ''}
            <p class="post-meta mono">${meta(p)}</p>
          </div>
          <div class="row-thumb"${vt('c', p, !hidden)}>${cover(p, true)}</div>
        </a></li>`;
  return `<a class="feature" data-cat="${first.cat}" href="${url(first)}">
        <div class="feature-cover"${vt('c', first)}>${cover(first)}</div>
        <div class="feature-text">
          ${kicker(first)}
          <h3 class="feature-title"${vt('t', first)}>${esc(first.title)}</h3>
          ${first.description ? `<p class="feature-desc">${esc(first.description)}</p>` : ''}
          <p class="post-meta mono">${meta(first)}</p>
        </div>
      </a>
      ${rest.length || withFilterRow ? `<ol class="rows">${withFilterRow ? row(first, true) : ''}${rest.map((p) => row(p)).join('')}
      </ol>` : ''}`;
}

function chips(posts) {
  const counts = new Map();
  posts.forEach((p) => counts.set(p.cat, { label: p.category, n: (counts.get(p.cat)?.n || 0) + 1 }));
  if (counts.size < 2) return '';
  const list = [...counts.entries()].sort((a, b) => b[1].n - a[1].n);
  return `<div class="chips mono" role="group" aria-label="Filter by category">
        <button type="button" class="is-active" data-cat-filter="all" aria-pressed="true">All <span>${posts.length}</span></button>
        ${list.map(([cat, { label, n }]) => `<button type="button" data-cat-filter="${cat}" aria-pressed="false">${esc(label)} <span>${n}</span></button>`).join('')}
      </div>`;
}

/* ── Link previews ─────────────────────────────────────────────
   For every `::: bookmark URL` in posts/drafts, fetch the page's
   og:image / title / description once and cache them in
   content/media/links/ (committed). Builds then work offline and the
   site never hotlinks third-party images. */
const LINK_DIR = path.join(ROOT, 'content', 'media', 'links');
const LINK_DIR_URL = 'media/links';
const LINK_MANIFEST = path.join(LINK_DIR, 'manifest.json');
let LINKS = fs.existsSync(LINK_MANIFEST) ? JSON.parse(fs.readFileSync(LINK_MANIFEST, 'utf8')) : {};

async function fetchLinkPreviews() {
  const dirs = [POSTS_DIR, path.join(ROOT, 'content', 'drafts')].filter((d) => fs.existsSync(d));
  const urls = new Set();
  for (const d of dirs) for (const f of fs.readdirSync(d)) if (f.endsWith('.md')) {
    for (const m of fs.readFileSync(path.join(d, f), 'utf8').matchAll(/^:::\s*bookmark\s+(\S+)/gm)) urls.add(m[1]);
  }
  const todo = [...urls].filter((u) => !LINKS[u]);
  if (!todo.length) return;
  fs.mkdirSync(LINK_DIR, { recursive: true });
  const UA = { 'user-agent': 'Mozilla/5.0 (compatible; duel0-site-build/1.0; +https://duel0.github.io)' };
  const attr = (html, re) => { const m = html.match(re); return m ? m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim() : ''; };
  const metaTag = (html, key) =>
    attr(html, new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)`, 'i')) ||
    attr(html, new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`, 'i'));
  for (const url of todo) {
    const entry = {};
    try {
      const res = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(15000) });
      const html = (await res.text()).slice(0, 400000);
      entry.title = metaTag(html, 'og:title') || attr(html, /<title[^>]*>([^<]+)/i);
      entry.description = metaTag(html, 'og:description') || metaTag(html, 'description');
      let img = metaTag(html, 'og:image') || metaTag(html, 'twitter:image');
      if (img) {
        img = new URL(img, res.url).href;
        const ir = await fetch(img, { headers: UA, signal: AbortSignal.timeout(15000) });
        const type = ir.headers.get('content-type') || '';
        const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : type.includes('gif') ? 'gif' : 'jpg';
        const buf = Buffer.from(await ir.arrayBuffer());
        if (ir.ok && type.startsWith('image/') && buf.length < 3_000_000) {
          entry.image = `${hash(url).toString(36)}.${ext}`;
          fs.writeFileSync(path.join(LINK_DIR, entry.image), buf);
        }
      }
      console.log(`links: ${url} → ${entry.image ? 'image ✓' : 'no image'}`);
    } catch (e) {
      console.warn(`links: ${url} → failed (${e.message}); using line-art fallback`);
    }
    LINKS[url] = entry;
  }
  fs.writeFileSync(LINK_MANIFEST, JSON.stringify(LINKS, null, 2));
}

/* ── Cache busting ─────────────────────────────────────────────
   GitHub Pages caches assets for 10 min; stamp CSS/JS URLs with a
   content hash so a deploy never mixes new HTML with old CSS/JS. */
const stampCache = new Map();
function stamp(html) {
  return html.replace(/((?:src|href)=")((?:\.\.\/)*|\/)?(assets\/[\w./-]+\.(?:css|js))(")/g, (m, a, pre = '', file, z) => {
    const abs = path.join(ROOT, file);
    if (!fs.existsSync(abs)) return m;
    if (!stampCache.has(abs)) stampCache.set(abs, hash(read(abs)).toString(36));
    return `${a}${pre}${file}?v=${stampCache.get(abs)}${z}`;
  });
}

/* ── Social preview cards (Open Graph) ───────────────────────────
   `node build.mjs --og` renders a 1200×630 PNG per post (+ one for the
   site) with headless Chrome into assets/og/. The PNGs are committed, so
   the CI build doesn't need Chrome. Unchanged cards are skipped. */
const OG_DIR = path.join(ROOT, 'assets', 'og');
// Versioned URL: platforms cache previews per URL, so a new image gets a new ?v=
const ogUrl = (key) => {
  const f = fs.existsSync(path.join(OG_DIR, `${key}.png`)) ? key : 'site';
  return `${SITE.url}/assets/og/${f}.png?v=${hash(fs.readFileSync(path.join(OG_DIR, `${f}.png`)).toString('latin1')).toString(36)}`;
};

function findChrome() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  return candidates.find((c) => fs.existsSync(c));
}

const OG_LOGOS = `    <div class="og-logos" aria-hidden="true">
      <img class="cr" src="{{root}}assets/logos/cyber-ranges.png">
      <span class="napwnli"><img class="nap" src="{{root}}assets/team/napwnli-sm.png"><span>NAPWNLI</span></span>
      <img class="un" src="{{root}}assets/logos/unina.png">
    </div>
`;
async function generateOg(posts) {
  const chrome = findChrome();
  if (!chrome) { console.warn('og: Chrome not found — skipping social cards'); return; }
  const { execFileSync } = await import('node:child_process');
  const tpl = read(path.join(TEMPLATES, 'og.html'));
  fs.mkdirSync(OG_DIR, { recursive: true });
  const manifestPath = path.join(OG_DIR, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(read(manifestPath)) : {};
  const tplHash = hash(tpl + read(path.join(ROOT, 'assets', 'graphics.js')) + read(path.join(ROOT, 'assets', 'style.css'))).toString(36);   // redraw when the figures change
  const cards = [
    { key: 'site', kicker: 'AI Security Research Lead · CYBER RANGES', title: 'Teaching machines to <em>attack</em>, so we learn how to <em class="def">defend</em><span class="h1-cursor"></span>', desc: 'Offensive & defensive AI agents, adversary emulation, cyber ranges.', fig: 'network', seed: 11, url: 'duel0.github.io' },
    ...posts.filter((p) => !p.draft || INCLUDE_DRAFTS).map((p) => ({ key: p.slug, kicker: [p.category, ...p.tags].join(' · '), title: esc(p.title), desc: esc(p.description), fig: p.cover, seed: p.seed, url: `duel0.github.io/blog/${p.slug}` })),
  ];
  const os = await import('node:os');
  const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'og-src-'));   // outside _site: a dev-server rebuild can't wipe it
  let made = 0;
  for (const c of cards) {
    const key = hash(JSON.stringify(c) + tplHash).toString(36);
    const png = path.join(OG_DIR, `${c.key}.png`);
    if (manifest[c.key] === key && fs.existsSync(png)) continue;
    const html = path.join(srcDir, `${c.key}.html`);
    const figure = c.key === 'site'
      ? '<div class="og-scene"><canvas id="scene" data-static data-quiet aria-hidden="true"></canvas></div>'
      : `<div class="og-fig"><canvas data-fig="${c.fig}" data-seed="${c.seed}" data-static aria-hidden="true"></canvas></div>`;
    const logos = c.key === 'site' ? OG_LOGOS : '';
    write(html, fill(tpl, { root: `file://${ROOT}/`, ...c, kicker: esc(c.kicker), figure, logos: fill(logos, { root: `file://${ROOT}/` }) }));
    const { mkdtempSync } = fs;
    for (let attempt = 0; attempt < 3; attempt++) {
      const profile = mkdtempSync(path.join(os.tmpdir(), 'og-chrome-'));
      try {
        fs.rmSync(png, { force: true });
        execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
          `--user-data-dir=${profile}`, '--force-device-scale-factor=1', '--window-size=1200,630', '--virtual-time-budget=5000',
          `--screenshot=${png}`, `file://${html}`], { stdio: process.env.OG_DEBUG ? 'inherit' : 'ignore', timeout: 60000 });
      } catch (e) { /* retry */ } finally { fs.rmSync(profile, { recursive: true, force: true }); }
      if (fs.existsSync(png)) break;
    }
    if (!fs.existsSync(png)) { console.warn(`og: failed to render ${c.key}`); continue; }
    manifest[c.key] = key; made++;
  }
  write(manifestPath, JSON.stringify(manifest, null, 2));
  fs.rmSync(srcDir, { recursive: true, force: true });
  fs.cpSync(OG_DIR, path.join(OUT, 'assets', 'og'), { recursive: true });
  console.log(`og: ${made} card(s) rendered`);
}

/* ── Build ─────────────────────────────────────────────────────── */
function build() {
  const t0 = Date.now();
  stampCache.clear();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  for (const f of ['assets', 'favicon.svg', '.nojekyll', 'CNAME', 'robots.txt', '.well-known']) {
    const src = path.join(ROOT, f);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(OUT, f), { recursive: true });
  }
  const media = path.join(ROOT, 'content', 'media');
  if (fs.existsSync(media)) fs.cpSync(media, path.join(OUT, 'media'), { recursive: true });

  const posts = loadPosts();
  const layout = read(path.join(TEMPLATES, 'layout.html'));
  const page = (vars) => fill(layout, { siteTitle: SITE.title, ...vars });

  // Home page: latest posts.
  let home = read(path.join(ROOT, 'index.html'));
  home = home.replace(/<!-- blog:start -->[\s\S]*?<!-- blog:end -->/, `<!-- blog:start -->\n      ${feed(posts, '', 3)}\n      <!-- blog:end -->`);
  home = home.split('https://duel0.github.io/assets/og/site.png').join(ogUrl('site'));
  write(path.join(OUT, 'index.html'), home);

  // Blog index.
  write(path.join(OUT, 'blog', 'index.html'), page({
    root: '../',
    title: `Blog · ${SITE.title}`,
    description: SITE.description,
    canonical: `${SITE.url}/blog/`,
    ogType: 'website',
    ogImage: ogUrl('site'),
    content: `
    <section class="wrap blog-hero">
      <h1 class="blog-h1">Blog</h1>
      <p class="blog-sub">${esc(SITE.description)}</p>
      <a class="btn" href="../feed.xml">Subscribe via RSS <span aria-hidden="true">↗</span></a>
    </section>
    <section class="wrap blog-feed">
      ${chips(posts)}
      ${feed(posts, '../', Infinity, true)}
    </section>`,
  }));

  // Posts.
  posts.forEach((p, i) => {
    const newer = posts[i - 1], older = posts[i + 1];
    const canonical = `${SITE.url}/blog/${p.slug}/`;
    const share = `<div class="share mono">
          <button type="button" data-copy-link>Copy link</button>
          <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(canonical)}" target="_blank" rel="noopener">LinkedIn ↗</a>
          <a href="https://x.com/intent/post?url=${encodeURIComponent(canonical)}&amp;text=${encodeURIComponent(p.title)}" target="_blank" rel="noopener">X ↗</a>
        </div>`;
    const navCard = (q, dir) => q
      ? `<a class="nav-card${dir === 'newer' ? ' next' : ''}" href="../${q.slug}/"><div class="nav-thumb">${cover(q, true)}</div><span class="mono">${dir === 'newer' ? 'Newer →' : '← Older'}</span><b>${esc(q.title)}</b></a>`
      : '<span></span>';
    write(path.join(OUT, 'blog', p.slug, 'index.html'), page({
      root: '../../',
      title: `${esc(p.title)} · ${SITE.title}`,
      description: esc(p.description),
      canonical,
      ogType: 'article',
      ogImage: ogUrl(p.slug),
      content: `
    <article class="post">
      <header class="post-head narrow">
        <a class="back mono" href="../">← Blog</a>
        ${kicker(p)}
        <h1 class="post-h1"${vt('t', p)}>${esc(p.title)}</h1>
        ${p.description ? `<p class="post-lede">${esc(p.description)}</p>` : ''}
        <div class="byline">
          <img class="byline-avatar" src="../../assets/me/avatar.jpg" alt="" width="36" height="36">
          <div class="byline-who"><b>${esc(SITE.author)}</b><span class="mono"><time datetime="${p.date.toISOString().slice(0, 10)}">${meta(p)}</time></span></div>
          ${share}
        </div>
      </header>
      <figure class="post-cover">
        <div${vt('c', p)}>${cover(p)}</div>
        <figcaption class="mono"><span>FIG. 00 · Cover</span><span>${p.cover} · seed ${p.seed}</span></figcaption>
      </figure>
      <div class="prose narrow">
${p.html}
      </div>
      <footer class="post-foot narrow">
        <div class="end-card">
          <div class="ornament" aria-hidden="true"><span></span><i>◆</i><span></span></div>
          <p class="end-title">Thanks for reading.</p>
          <p class="end-sub">New posts on offensive AI, agents and cyber ranges, straight to your reader.</p>
          <div class="end-actions"><a class="btn btn-solid" href="../../feed.xml">Subscribe via RSS <span aria-hidden="true">↗</span></a>${share}</div>
        </div>
        <nav class="post-nav" aria-label="More posts">${navCard(older, 'older')}${navCard(newer, 'newer')}</nav>
      </footer>
    </article>`,
    }));
  });

  // RSS.
  const items = posts.filter((p) => !p.draft).map((p) => `
    <item>
      <title>${esc(p.title)}</title>
      <link>${SITE.url}/blog/${p.slug}/</link>
      <guid>${SITE.url}/blog/${p.slug}/</guid>
      <pubDate>${p.date.toUTCString()}</pubDate>
      <description>${esc(p.description)}</description>
    </item>`).join('');
  write(path.join(OUT, 'feed.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(SITE.title)} · Blog</title>
    <link>${SITE.url}/blog/</link>
    <description>${esc(SITE.description)}</description>${items}
  </channel>
</rss>
`);

  console.log(`built ${posts.length} post(s)${INCLUDE_DRAFTS ? ' (drafts included)' : ''} → _site/ in ${Date.now() - t0}ms`);
  return posts;
}

if (!args.has('--offline')) await fetchLinkPreviews();
const builtPosts = build();
if (args.has('--og')) await generateOg(builtPosts);

/* ── Dev server ────────────────────────────────────────────────── */
if (args.has('--serve')) {
  const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
  http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(OUT, p);
    if (!file.startsWith(OUT)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404, { 'content-type': 'text/plain' }).end('404'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  }).listen(8000, () => console.log('serving _site/ on http://localhost:8000 (watching for changes)'));

  let timer;
  const rebuild = () => { clearTimeout(timer); timer = setTimeout(() => { try { build(); } catch (e) { console.error(e.message); } }, 120); };
  // Watch directories (not single files): editors and sed replace files, which breaks per-file watchers.
  for (const dir of ['assets', 'templates', 'content']) {
    const target = path.join(ROOT, dir);
    if (fs.existsSync(target)) fs.watch(target, { recursive: true }, rebuild);
  }
  fs.watch(ROOT, (ev, name) => { if (['index.html', 'robots.txt', 'favicon.svg'].includes(name)) rebuild(); });
}
