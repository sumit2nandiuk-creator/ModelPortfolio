# ModelPortfolio

A modern, elegant portfolio website for a model: a hero, an about section with
measurements, a filterable photo gallery with a full-screen viewer, a video
reel section, and a contact block.

The site is **static** (plain HTML, CSS and JavaScript). It has **no runtime
dependencies**, so there is nothing to install. You only need Node.js 18.17+
(`node -v`) to build and preview it.

Each model has its own URL, for example `/sushmita-ghosh/`. Models are fully
isolated from one another: a model's page only contains that model's text,
photos, and videos, and only that model's files are published.

---

## Quick start

```bash
npm run build     # validates everything and writes the site to dist/
npm run dev       # build + preview at http://localhost:3000
npm test          # runs the test suite
```

The preview server binds to `0.0.0.0`, so it can also be reached from other
devices on the same network. Set `PORT=8080` to use a different port.

Open the placeholder model at **http://localhost:3000/sushmita-ghosh/**.

---

## Project layout

```
models/
  sushmita-ghosh/            ← one folder per model; the folder name IS the URL slug
    model.json             ← all text, stats, photo/video list and contact details
    media/                 ← every photo, video and poster used by this model
  _template/               ← starter for a new model (ignored by the build)
scripts/
  build.mjs                ← validates models and generates dist/
  serve.mjs                ← local preview server (mirrors static hosting)
  lib/                     ← validation, HTML rendering, image-size reader
site/assets/
  site.css                 ← shared theme (no model-specific content)
  site.js                  ← shared behaviour: menu, filter, lightbox, reveals
tests/                     ← build and isolation tests
dist/                      ← generated output (git-ignored, do not edit)
```

---

## Editing the model's profile

Everything the visitor sees is set in `models/<slug>/model.json`. The file is
heavily commented by example in `models/_template/model.json`.

| Field | Purpose |
| --- | --- |
| `slug` | URL segment. Must equal the folder name. Lowercase letters, numbers, and hyphens only. |
| `name`, `tagline` | Shown in the hero, header, and page title. |
| `bio` | Array of paragraphs for the About section. |
| `stats` | Array of `{ "label", "value" }` shown as the measurements list. |
| `seo.description`, `seo.noindex` | Search-engine description, and `true` to keep the page out of search results (both optional). |
| `cover` | Hero image: `{ "file", "alt" }`. |
| `photos` | Gallery entries: `{ "file", "title", "category", "year", "alt" }`. Each distinct `category` gets a filter button automatically. |
| `videos` | Video entries: `{ "file", "poster", "title", "category", "description" }`. |
| `contact` | `email`, `phone`, `location`, `representation`, and optional `instagram`, `linkedin`, `tiktok`, `imdb`, `website` (full `https://` URLs). Empty values are hidden. |

Notes:

- `file` values are bare file names that must exist in `media/`. Nothing else is published.
- Videos should be **MP4 (H.264)** for the widest browser support. WebM also works.
- Photos should be **JPG, PNG, or WebP**, around 1600–2000 px on the long edge, to keep the page fast. The build reads the dimensions to prevent layout jumps.
- Sections with no content are hidden automatically. For example, a model with no videos gets no Videos section or menu link.

### Replacing the placeholder content

The current content is placeholder: the name **Sushmita Ghosh**, the bio, the
measurements, the contact details (`booking@example.com`), the agency, the
images (abstract studio scenes with no people), and the video (a generated
animation). Replace the images and video in `media/` and update `model.json`
to match. The placeholder texts are plainly marked so you can find them.

---

## Adding another model

Each new model gets its own page and its own folder. Existing models are not affected.

1. Copy `models/_template/` to `models/<new-slug>/` (for example `models/jane-doe/`). Remove the copied `README.md`.
2. Set `"slug"` in its `model.json` to exactly the folder name.
3. Put the model's files in `models/<new-slug>/media/`.
4. Fill in `model.json`, then run `npm run build`.

The new profile is published at `/<new-slug>/`. Slugs must be unique. The build
refuses to publish a slug that is already used or that is reserved
(`assets`, `media`, `api`, `admin`, `login`, `dashboard`, `index`, `404`, and similar).

If the build fails, it lists every problem, such as a missing file, a bad
email, or a mismatched slug. Nothing is published until the build passes.

---

## How isolation works

- **One URL per model.** Each profile lives at `/<slug>/`. Unknown or unpublished
  slugs return the neutral "Page not found" page.
- **Only that model's data reaches its page.** Each page is rendered from a
  single `model.json`. Other models' names, photos, and links never appear in it.
- **Only that model's files are published.** The build copies only the media a
  model references into `dist/<slug>/media/`. The files of other models, and
  unused files in `media/`, are never copied.
- **No index of models.** The root `/` returns the same neutral "Page not found"
  page as any unknown URL. It contains no model names and no links, and the site
  has no listing or directory of profiles.
- **Shared code holds no content.** `/assets/` contains only the theme and the
  behaviour script.
- **Source and templates are never served.** `models/`, `scripts/`, and `package.json`
  are outside the published `dist/` folder.

The test suite (`npm test`) checks these guarantees on every change.

---

## Deploying

`dist/` is a plain static folder. Upload it to any static host, for example
Netlify, Cloudflare Pages, Vercel (static output), GitHub Pages, or an ordinary
web server. The build does not need to run on the host, so you can run
`npm run build` locally and upload the output.

- Serve `dist/` as the site root.
- Static hosts automatically use `404.html` for unknown URLs, which is the desired behaviour.
- Pages use relative URLs for shared assets (`/assets/...`) and absolute paths for each model's media (`/<slug>/media/...`), so the site must be served from the domain root.
- The page loads the Cormorant Garamond and Inter fonts from Google Fonts. Everything else is self-hosted.

Use `dist/` as the upload, not the repository. Models' `model.json` and source
files stay in your repository, and the published folder contains only the generated site.

---

## Privacy notes

- Slugs appear in the URL, so anyone who knows a slug can visit that page. The
  pages are indexable by default. To keep a profile out of search engines, set
  `"seo": { "noindex": true }` in its `model.json`. For a harder-to-find profile,
  use an unguessable slug (for example `sushmita-ghosh-x7k2qp`).
- Contact details in `model.json` are published on the page. Only add details
  the model wants public.
- Images and videos should only be used with the model's consent and the rights to publish them.
