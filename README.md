# francesco balassone — personal site

Static site + blog. No frameworks, no dependencies — just Node (≥ 18) for the build.

```
index.html              home page (sections, publications, highlights…)
assets/style.css        design tokens + layout (light/dark via CSS variables)
assets/main.js          theme toggle, keyboard shortcuts, paper filter, terminal
assets/graphics.js      hero network animation + research figures (canvas)
content/posts/*.md      blog posts (Markdown)
content/media/          images for posts → served at /media/…
templates/layout.html   shell for blog pages
build.mjs               builds everything into _site/
.github/workflows/      builds + deploys to GitHub Pages on every push to main
```

## Write a post

Start drafts in `content/drafts/` (git-ignored — they never leave your machine), then move the file to
`content/posts/` when it's ready to publish. Name files `YYYY-MM-DD-my-slug.md`:

```md
---
title: My post title
description: One-line subtitle for the post header, lists and RSS.
category: Research     # Research · Red team · CTF · Notes … (filter chips on the blog index)
tags: [agents, red-team]
cover: network        # optional: adversary | network | signal | offense | evaluation | terrain
seed: 42              # optional: pick a different variation of the cover
draft: true           # drafts are skipped in production builds
---

Intro paragraph…

# A numbered section       ← h2 (the title is the h1)
```

Every post gets a generated line-art cover (same engine as the research figures). Leave `cover`
out and one is picked from the slug. The blog index shows a filter chip per `category`.
Start a new post by copying `content/posts/_template.md`.

**Blocks** — see `content/drafts/2026-11-01-blocks-reference.md` (a draft, rendered at
`/blog/blocks-reference/` when you preview with `--drafts`) for every block with examples:

| Block | Syntax |
|---|---|
| Callout | `> [!NOTE] Title` — also `INFO`, `TIP`, `IDEA`, `WARNING`, `DANGER`, `OFFENSE` (red), `DEFENSE` (blue) |
| Pull quote | `> [!PULL]` … last line `— Attribution` |
| Toggle | `::: toggle Summary` … `:::` |
| Stat tiles | `::: stats` with lines `value \| label` |
| Link card | `::: bookmark URL` + title line + description line |
| Terminal | `::: terminal title` (lines starting with `$`, `off`, `def`, `✓` are coloured) |
| Code | ```` ```python title="file.py" ```` |
| Generated figure | `::: figure network` + caption |
| Calculator | `::: calculator monthly=200 years=40 rate=5 age=25` + caption (interactive compound-growth chart) |
| Columns | `::: columns` with `\|\|\|` separators |
| Contents | `::: toc` + `:::` |
| Divider | `***` (ornament) or `---` (rule) |
| Inline | `==highlight==`, `~~strike~~`, `[[Ctrl]]` keys, tables, `- [x]` tasks |

The latest 3 posts appear automatically in the home page “Writing” section, plus `/blog/` and `/feed.xml`.

## Link previews

`::: bookmark URL` cards show the target page's own preview image, title and description. The build
fetches them once and caches them in `content/media/links/` (commit that folder). Use
`node build.mjs --offline` to skip fetching. Delete an entry from `manifest.json` to re-fetch it.

## Social preview cards

After adding or editing a post, render its 1200×630 card (needs Google Chrome installed locally):

```sh
node build.mjs --og      # renders only new/changed cards into assets/og/ — commit them
```

The CI build reuses the committed PNGs, so it doesn't need Chrome.

## Easter eggs

The floating terminal button (bottom right) opens a console (`help` for commands). The Konami code (or `redteam` in the console) triggers red alert mode.
There is a hidden 3-part CTF on the site — the flag is checked by SHA-256 in `assets/fx.js`, so it never
appears in plain text in the repo. Keep it that way if you change it.

## Preview locally

```sh
node build.mjs --drafts --serve     # → http://localhost:8000, rebuilds on save
```

## Deploy (GitHub Pages)

1. Create a repo named **`duel0.github.io`** and push to `main`.
2. Repo → Settings → Pages → **Source: GitHub Actions**.
3. Every push runs `node build.mjs` and publishes `_site/`.

Using a custom domain? Add a `CNAME` file at the root and update `SITE.url` in `build.mjs`.

## Updating content

- **Papers:** copy an `<li>` in `<ol class="pubs">` in `index.html`; add `data-first="true"` for first-author.
- **Scholar stats:** update `<dl class="stats">` in `index.html`.
- **Hero animation:** topology, stages and captions live at the top of `initScene()` in `assets/graphics.js`.
