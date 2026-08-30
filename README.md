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
  2. (normalized post object: from, to, subject, date, messageId, inReplyTo, references, body)
  3. filename.js   - builds a deterministic "YYYY-MM-DD-slug.html" name
  4. renderer.js   - HTML-escapes every field and fills in templates/post.html
  5a. cli.js        - writes the result to output/ (local, collision-safe: -2, -3, ...)
  5b. cli-github.js - commits the result to a GitHub repo via github.js (create-only)
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

Output appears in `output/`, e.g. `output/2026-08-30-why-i-still-use-unix.html`.
Re-running against the same email never overwrites an existing file - it appends
`-2`, `-3`, etc. to the filename instead.

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
like `Publish: Why I still use Unix`.

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

No database, no CMS, no admin dashboard, no authentication, no user accounts, no
frontend framework, no Markdown parsing, no rich-text/WYSIWYG editing, no comments,
tags, or categories, no search, no analytics, no attachment publishing, no HTML
email rendering, and no thread/reply UI (yet - see below).

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

## Future: Cloudflare architecture

The eventual flow:

```text
publish@example.com
  -> Cloudflare Email Routing
  -> Cloudflare Worker (src/worker.js)
  -> parser.js / renderer.js / filename.js (unchanged)
  -> github.js  (src/github.js, GitHub Contents API)
  -> commit
  -> GitHub Pages serves it
```

`src/worker.js` and `wrangler.toml` already sketch this shape, but neither is
deployed - there's no Cloudflare account or domain wired up yet. When that phase
happens, the Worker should only need to read the raw MIME message and call the same
`parseEmail` / `renderPost` / `buildBaseName` / `publishToGitHub` functions the CLI
already uses.

## Project layout

```text
src/
  parser.js       - raw email -> normalized post object (uses postal-mime)
  renderer.js     - normalized post -> escaped HTML (uses templates/post.html)
  filename.js     - normalized post -> collision-safe "YYYY-MM-DD-slug.html"
  github.js       - publishToGitHub({ owner, repo, branch, path, content, commitMessage, token })
  config.js       - reads GitHub settings from environment variables
  cli.js          - local command: .eml in, output/*.html out
  cli-github.js   - GitHub command: .eml in, committed to the repo via github.js
  worker.js       - future Cloudflare Email Worker adapter (not deployed)
templates/
  post.html       - the entire page template; edit this directly, it's plain HTML
style.css         - the entire stylesheet for published pages
test/
  fixtures/*.eml
  parser.test.js, renderer.test.js, filename.test.js, github.test.js
output/           - where the local CLI writes generated pages (gitignored)
.env.example      - GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO / GITHUB_BRANCH
wrangler.toml     - placeholder for the future Worker deployment
```
