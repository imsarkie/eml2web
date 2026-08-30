# eml2web

A very small publishing pipeline: an email becomes an HTML page.

```text
email -> parser -> normalized post -> renderer -> HTML -> GitHub -> GitHub Pages
```

Inspired by old-school plain-text email archives like [yarchive.net](https://yarchive.net/comp/bsd.html):
metadata, a horizontal rule, and the message body in a `<pre>` block. Nothing else.

## Philosophy

- The email *is* the document. There's no separate authoring step.
- GitHub is storage and version history. There's no database.
- GitHub Pages is the web server. There's no backend.
- HTML is the output format. There's no Markdown, no templating engine, no frontend framework, no JavaScript on the published pages.
- Parsing is minimal: extract headers and the plain-text body, escape it, wrap it. That's the whole job.

This is not a blogging platform, a CMS, or a general-purpose archive. It is intentionally boring.

## How the local `.eml` -> HTML flow works

```text
input: an .eml file
  1. parser.js    - parses raw MIME with postal-mime, extracts headers + plain-text body
     tags.js       - pulls "#word" tags out of the subject (see "Tags and the index page")
  2. (normalized post object: from, to, subject, tags, date, messageId, inReplyTo, references, body)
  3. filename.js   - builds a deterministic "YYYY-MM-DD-slug.html" name
  4. renderer.js   - HTML-escapes every field and fills in templates/post.html
  5a. cli.js        - writes the result to output/posts/ and regenerates output/index.html
  5b. cli-github.js - commits the result to posts/ in a GitHub repo (create-only), then
                      updates posts.json and index.html there too
```

Each stage is a plain function with no knowledge of the others:
- `parser.js` doesn't know HTML exists.
- `renderer.js` doesn't know where files get written or what GitHub is.
- `github.js` doesn't know what MIME is.

That separation is what lets the same core (`parser` -> `renderer` -> `filename` -> `github`)
run unchanged from a future Cloudflare Worker instead of the CLI.

## Install

```bash
npm install
```

## Run the local publisher

```bash
node src/cli.js ./test/fixtures/sample.eml
# or
npm run publish -- ./test/fixtures/sample.eml
```

Output appears in `output/`:

```text
output/
  posts/2026-08-30-why-i-still-use-unix.html   - the rendered post
  posts.json                                    - manifest: [{ filename, subject, date, tags }, ...]
  index.html                                    - regenerated from posts.json on every publish
```

Re-running against the same email never overwrites an existing post file - it
appends `-2`, `-3`, etc. to the filename instead. `posts.json` and `index.html` are
always regenerated in full from the current manifest, so they never go stale.

## GitHub publishing

`src/cli-github.js` renders an `.eml` the same way the local command does, then
commits the HTML straight to a GitHub repo via the [Contents
API](https://docs.github.com/en/rest/repos/contents), so GitHub Pages can serve it.

Configure it with environment variables:

```text
GITHUB_TOKEN=      # required - a token with Contents: write on the target repo
GITHUB_OWNER=      # required - e.g. "octocat"
GITHUB_REPO=       # required - e.g. "archive"
GITHUB_BRANCH=main # optional - defaults to "main"
```

Copy `.env.example` to `.env` and fill it in, or export the variables directly.
There's no dotenv dependency here - if you're on Node 20+ you can load a `.env` file
with the built-in flag instead:

```bash
node --env-file=.env src/cli-github.js ./test/fixtures/sample.eml
```

Otherwise, export the variables inline:

```bash
GITHUB_TOKEN=ghp_xxx GITHUB_OWNER=octocat GITHUB_REPO=archive \
  npm run publish:github -- ./test/fixtures/sample.eml
```

This commits to `posts/<date>-<slug>.html` in the target repo, with a commit message
like `Publish: Why I still use Unix`, then updates `posts.json` and `index.html` at
the repo root to include it (see "Tags and the index page" below).

**Publishing is create-only.** Before writing, it checks whether the target path
already exists on the branch; if it does, it refuses to overwrite it and exits
non-zero instead. This is different from the local CLI's `-2`/`-3` filename
collision behavior - a remote publication should be deterministic, not
auto-renamed. Re-running the same command against an already-published email fails
loudly rather than silently duplicating or clobbering it.

Use a [fine-grained personal access
token](https://github.com/settings/personal-access-tokens/new) restricted to the one
target repository, with only the "Contents" permission set to Read and write. Never
commit a token to the repo; `.env` is gitignored.

GitHub publishing is intentionally its own adapter (`src/cli-github.js` +
`src/github.js`), separate from Cloudflare Email Routing. That phase isn't built
yet - see "Future: Cloudflare architecture" below.

## Tags and the index page

Put `#word` anywhere in an email's subject to tag it, e.g.:

```text
Subject: Why I still use Unix #unix #philosophy
```

`src/tags.js` pulls those out (lowercased, deduped) and strips them from the
subject everywhere else - the post's title, its own page, and the filename slug
all show the clean "Why I still use Unix", not the raw subject with hashtags in
it. The tags themselves are shown on the post's own page (a `Tags:` meta line)
and drive the site root.

`index.html` at the repo root groups every post by tag, alphabetically, newest
post first within each tag (`src/siteIndex.js`); an untagged post lands in an
"Uncategorized" section at the end, rather than being dropped from the index.
It's regenerated in full on every publish - not hand-maintained - from
`posts.json`, a flat array of `{ filename, subject, date, tags }` per post
(`src/manifest.js`). That file is plain data, not a database: no queries, no
server, just something `index.html` gets rebuilt from. `posts/` itself holds
only the emailed posts' own HTML - the manifest and index live at the repo root,
next to `style.css`.

## Run the tests

```bash
npm test
```

Uses Node's built-in test runner (`node --test`) - no extra test framework
dependency. `src/github.js` is tested by injecting a fake `fetchImpl` (see
`test/github.test.js`), so the suite never talks to a real GitHub repo.

## Security model

All email-derived content is HTML-escaped before it reaches the page: subject, from,
to, date, Message-ID, In-Reply-To, References, and the body. The email's HTML MIME
part is never read into the output - only the plain-text part is used, and it is
rendered as inert text inside a `<pre>` block, never as markup. There is no
JavaScript on published pages, so there is nothing on the page that can execute
attacker-controlled content.

Filenames are derived only from a whitelisted `[a-z0-9-]` character set (see
`src/filename.js`), so a hostile subject line cannot produce a path-traversal or
unexpected file location.

GitHub credentials are read from environment variables only (`GITHUB_TOKEN`, see
`src/config.js`) and are never hard-coded or logged. Use a fine-grained token scoped
to only the target repo's Contents: write permission. `src/github.js` redacts the
token from any error message it constructs, even if a mocked or malformed API
response were to echo it back.

## What is intentionally not implemented

No database, no CMS, no admin dashboard, no user accounts, no frontend framework,
no Markdown parsing, no rich-text/WYSIWYG editing, no comments, no search, no
analytics, no attachment publishing, no HTML email rendering, and no thread/reply
UI (yet - see below). Two exceptions: `src/allowlist.js` on the email-triggered
path (a single-address, fail-closed sender check, not a general authentication
system), and tags/the index page (a subject-line convention plus a flat JSON
manifest, not a database or CMS - see "Tags and the index page").

If a fixture email has attachments, they are silently ignored; only the plain-text
body is published.

## Threading (not built yet, but not thrown away)

`Message-ID`, `In-Reply-To`, and `References` are parsed, preserved, and rendered
on every page precisely so that a future phase can derive reply threads from the
published HTML files themselves (or from git history) without needing a database.
No thread navigation exists yet.

GitHub publishing today refuses to overwrite by *filename* only. It does not yet
check whether an email with the same `Message-ID` was already published under a
different filename (e.g. because the subject was edited between sends) - see the
`TODO(idempotency)` comment at the top of `src/github.js`. Solving that properly
means looking posts up by `Message-ID` before computing a path, still without a
database - that's future work for the email-ingestion adapter, not this phase.

## Email-triggered publishing (Cloudflare)

Sending an email publishes a post, with no CLI involved:

```text
you email publish@blog.<yourdomain>
  -> Cloudflare Email Routing (a rule on that subdomain's DNS zone)
  -> Cloudflare Worker (src/worker.js)
  -> isAllowedSender()  - drops anything not from you, fails closed
  -> parser.js / renderer.js / filename.js (unchanged)
  -> github.js  (GitHub Contents API: publishToGitHub, create-only)
  -> commit
  -> publishIndex.js (updateSiteIndex: posts.json + index.html, create-or-update)
  -> GitHub Pages serves both
```

`src/worker.js` is a thin adapter: it reads config from Cloudflare's `env` bindings
instead of `process.env`, bundles `templates/post.html` and `templates/index.html`
as text imports (Workers have no filesystem, so `renderPost`/`renderIndex` accept
the template as an optional override - see `src/renderer.js` / `src/siteIndex.js`),
and calls the exact same `parseEmail` / `renderPost` / `buildBaseName` /
`publishToGitHub` / `updateSiteIndex` functions the CLI uses.

**Only mail whose sender exactly matches `ALLOWED_SENDER` gets published; anything
else is silently dropped** (see `src/allowlist.js`). This fails closed: if
`ALLOWED_SENDER` isn't configured at all, nothing publishes - it does not fall back
to "allow everyone." Without this, the routing address would be an open publish
endpoint for anyone who discovered it.

### Setup

You don't need to move your whole domain to Cloudflare - only the subdomain you
want to receive mail on:

1. **In Cloudflare**: add your publishing subdomain (e.g. `blog.yourdomain.tld`) as
   its own zone. Cloudflare gives you two nameservers for it.
2. **At your registrar** (wherever `yourdomain.tld`'s DNS lives): add an NS
   delegation record for that subdomain pointing at the two Cloudflare nameservers.
   This delegates only the subdomain - the rest of your domain is untouched.
3. Wait for Cloudflare to detect the delegation and activate the zone.
4. In that zone: **Email → Email Routing** → enable it → create a routing rule for
   one specific address (e.g. `publish@blog.yourdomain.tld`) that sends matching
   mail to a **Worker**, not to an inbox.
5. Deploy the Worker:
   ```bash
   npm install -g wrangler   # or use `npx wrangler`
   wrangler login
   wrangler secret put GITHUB_TOKEN      # the same fine-grained token as above
   wrangler secret put ALLOWED_SENDER    # the one address allowed to publish
   wrangler deploy
   ```
   `GITHUB_OWNER` / `GITHUB_REPO` / `GITHUB_BRANCH` / `POSTS_DIR` are already set in
   `wrangler.toml` under `[vars]` - edit them there if they differ, since they're not
   secret. `GITHUB_TOKEN` and `ALLOWED_SENDER` are deliberately kept out of that file
   (which is committed to a public repo) and set as Worker secrets instead.
6. In the Email Routing rule from step 4, point it at the deployed `eml2web` Worker.

From then on: emailing `publish@blog.yourdomain.tld` from your allowed address
publishes it, automatically. Emailing any other address - including an unrelated
mailbox on a different provider that happens to share your name - does nothing;
Cloudflare Email Routing only intercepts mail for zones it actually controls.

Not yet exercised by any test (it needs a live Cloudflare account to run at all);
`src/allowlist.js` and the rest of the shared pipeline are covered by the regular
test suite.

## Project layout

```text
src/
  parser.js       - raw email -> normalized post object (uses postal-mime, tags.js)
  tags.js         - extractTags(): pulls "#word" tags out of a subject
  renderer.js     - normalized post -> escaped HTML (uses templates/post.html or an injected template)
  siteIndex.js    - manifest -> the tag-grouped index.html (uses templates/index.html)
  manifest.js     - parse/append/serialize posts.json
  publishIndex.js - shared "update posts.json + index.html on GitHub" step
  filename.js     - normalized post -> collision-safe "YYYY-MM-DD-slug.html"
  github.js       - publishToGitHub (create-only) / upsertToGitHub (create-or-update)
  allowlist.js    - isAllowedSender(): fail-closed sender check for the Worker
  config.js       - reads GitHub settings from environment variables (CLI only)
  cli.js          - local command: .eml in, output/{posts/,posts.json,index.html} out
  cli-github.js   - GitHub command: .eml in, committed to the repo via github.js
  worker.js       - Cloudflare Email Worker adapter (see "Email-triggered publishing")
templates/
  post.html       - the per-post page template; edit this directly, it's plain HTML
  index.html      - the site-root template; {{SECTIONS}} is filled in by siteIndex.js
style.css         - the entire stylesheet for published pages
test/
  fixtures/*.eml
  parser.test.js, renderer.test.js, filename.test.js, github.test.js, allowlist.test.js,
  tags.test.js, manifest.test.js, siteIndex.test.js
output/           - where the local CLI writes generated pages (gitignored)
.env.example      - GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO / GITHUB_BRANCH
wrangler.toml     - Worker deployment config ([vars], text-import rule for the templates)
```
