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
.github/workflows/         ← GitHub Pages deployment
dist/                      ← generated output (git-ignored, do not edit)
```

---

## Editing the model's profile

Everything the visitor sees is set in `models/<slug>/model.json`. The file is
heavily commented by example in `models/_template/model.json`.

| Field | Purpose |
| --- | --- |
| `slug` | URL segment. Must equal the folder name. Lowercase letters, numbers, and hyphens only. |
| `name` | Shown in the hero, header, and page title. |
| `tagline` | Optional. Added after the name in the page title, for example "Name · Tagline". |
| `bio` | Array of paragraphs for the About section. |
| `stats` | Array of `{ "label", "value" }` shown as the measurements list. |
| `seo.description`, `seo.noindex` | Search-engine description, and `true` to keep the page out of search results (both optional). |
| `cover` | Hero slideshow: a list of `{ "file", "alt" }`. The first photo shows first; visitors swipe or tap the dots to move through the rest. One entry (or a single `{ "file", "alt" }` object) shows a still photo. |
| `photos` | Gallery entries: `{ "file", "title", "category", "year", "alt" }`. Each distinct `category` gets a filter button automatically. Tapping a photo opens it in the viewer, where it can be swiped to the next or previous one. |
| `videos` | Video entries: `{ "file", "poster", "title", "category", "description" }`. |
| `contact` | `email`, `phone`, `whatsapp` (phone numbers with at least 8 digits; the WhatsApp card links to `wa.me`), and optional `instagram`, `linkedin`, `tiktok`, `imdb`, `website` (full `https://` URLs). Empty values are hidden. Unused fields such as the old `location` and `representation` are ignored. |

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

## Deploying to GitHub Pages

The repository includes a workflow, `.github/workflows/pages.yml`, that tests,
builds, and publishes the site on every push to `main`. You can also run it by
hand from the **Actions** tab (**Deploy to GitHub Pages → Run workflow**).

One-time setup:

1. Go to the repository's **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Merge the branch into `main` (or run the workflow manually from the branch you want to publish).

The site is then available at `https://<your-user>.github.io/<repo-name>/`, for
example `https://sumit2nandiuk-creator.github.io/ModelPortfolio/sushmita-ghosh/`.

How the URLs work on Pages:

- GitHub Pages project sites live under `/<repo-name>/`. The workflow sets
  `SITE_BASE_PATH=/<repo-name>/` automatically, so every link, stylesheet, script,
  and image is prefixed correctly.
- Each model's page is still at its own address (`/<repo-name>/<slug>/`). Unknown
  addresses get the neutral 404 page.

**Custom domain (optional):** point the domain at Pages, then add a repository
variable under **Settings → Secrets and variables → Actions → Variables**:
`SITE_BASE_PATH` = `/`. Redeploy, and the site will work from the domain root.

**Other hosts:** `dist/` is a plain static folder, so it also works on Netlify,
Cloudflare Pages, or any web server. Build it locally with `npm run build` and
upload `dist/`. Build it with `SITE_BASE_PATH=/` unless the site is served from a
subfolder.

**Visibility:** GitHub Pages publishes only the generated `dist/` folder. Source
files (`models/`, `scripts/`, and the rest of the repository) are **not** part of
the published site. Anyone who can see the repository can still read them,
though. A public repository makes every model's `model.json` and media files
visible on GitHub. Keep the repository private if that is a concern (Pages on a
private repository needs a GitHub plan that supports it).

## Admin page and R2 media

The admin page at `/admin/` lets you edit a model's details and add or remove cover photos, portfolio photos and videos without touching the code. It is served with `noindex`, and every request needs the admin token. The site itself stays static on GitHub Pages. A small Cloudflare Worker (in `worker/`) does the privileged work: it holds the token and a GitHub token, saves `models/<slug>/model.json` through the GitHub API (which triggers a Pages deploy), and uploads files to an R2 bucket.

Photos and videos can live in either place:

- **In the repo** (`models/<slug>/media/`): the file is published with the site. Removing it from the profile removes it from the site on the next save.
- **In R2** (uploaded through the admin page): the file is served from the R2 public URL, so it does not count against the repo size. Removing it from the profile deletes the object from R2 after the save succeeds.

Hosted files are referenced in `model.json` by their full `https://` URL. Optional `width`/`height` on photos and covers, and `posterWidth`/`posterHeight` on videos, reserve layout space before the file loads.

### One-time setup

1. **Create the R2 bucket.** In the Cloudflare dashboard go to R2, create a bucket named `portfolio-media` (or change `bucket_name` in `worker/wrangler.toml`).
2. **Make it public.** Open the bucket's Settings, then Public access, and enable the `r2.dev` subdomain or attach a custom domain. Copy the public URL, for example `https://media.example.com`, into `R2_PUBLIC_BASE` in `worker/wrangler.toml` (no trailing slash).
3. **Create the GitHub token.** In GitHub, create a fine-grained personal access token that can read and write **Contents** on this repository only. Keep it private.
4. **Choose an admin token.** Any long random string. It is the password you type into the admin page.
5. **Deploy the Worker.** From the `worker/` folder:

   ```sh
   cd worker
   npx wrangler login
   npx wrangler secret put ADMIN_TOKEN    # the admin password
   npx wrangler secret put GITHUB_TOKEN   # the GitHub token from step 3
   npx wrangler deploy
   ```

   Secrets are stored by Cloudflare and are never written to the repo. Wrangler prints the Worker's address, for example `https://portfolio-admin.<your-subdomain>.workers.dev`.
6. **Point the admin page at the Worker.** Set `apiBase` in `site/admin/config.js` to that address (no trailing slash), commit, and wait for the Pages deploy.
7. **Open the admin.** Go to `https://sumit2nandiuk-creator.github.io/ModelPortfolio/admin/`, enter the admin token, and pick a profile.

`ADMIN_ORIGIN` in `worker/wrangler.toml` must match the origin the admin page is served from (`https://<user>.github.io`). Change it if you fork the repo.

### Notes

- A new profile needs at least one cover photo before its first save. Deleting a whole model is not supported in the admin; remove its folder by hand.
- Uploads are checked for size (25 MB for photos, 95 MB for videos) and file type. The build still checks that repo files exist.
- If two people edit the same profile, the second save is refused with a conflict message. Reload the profile and make the change again.
- Files uploaded but never saved stay in R2. Delete them in the R2 dashboard if you abandon an edit.
- Run `npm test` after changing the Worker or the build. The Worker tests use a fake GitHub and a fake R2 bucket, so they do not contact Cloudflare.

## Privacy notes

- Slugs appear in the URL, so anyone who knows a slug can visit that page. The
  pages are indexable by default. To keep a profile out of search engines, set
  `"seo": { "noindex": true }` in its `model.json`. For a harder-to-find profile,
  use an unguessable slug (for example `sushmita-ghosh-x7k2qp`).
- Contact details in `model.json` are published on the page. Only add details
  the model wants public.
- Images and videos should only be used with the model's consent and the rights to publish them.
- Photos and videos are protected against casual saving only. The site turns off the
  right-click and long-press menus and the download option on videos, and it keeps
  photos out of image search (`noimageindex`). The files themselves are still public:
  anyone can open a photo's address or use developer tools to save it. Only publish
  images that are fine to be seen by anyone who can open the site.
