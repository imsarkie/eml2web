// Publishes a single rendered HTML file to a GitHub repo via the Contents
// API. Deliberately knows nothing about email, MIME, or the CLI - it just
// writes one file and returns commit info, or throws a GitHubPublishError.
// This is the interface both the local CLI and the future Cloudflare
// Worker adapter call.
//
// TODO(idempotency): this only refuses to overwrite by *path*. Two emails
// with the same Message-ID but different subjects would compute different
// slugs and both publish happily. A future email-ingestion adapter should
// look up posts by Message-ID before computing a path, so a retried or
// duplicate delivery of the same email can't slip through under a
// different filename. No database for that yet - see README.

// Explicit import rather than relying on Node's global `Buffer`: this
// keeps the module portable to the Cloudflare Worker runtime, which
// polyfills `node:buffer` under the `nodejs_compat` flag but doesn't
// have Node's implicit globals.
import { Buffer } from 'node:buffer';

const API_ROOT = 'https://api.github.com';

export class GitHubPublishError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'GitHubPublishError';
    this.status = status;
    this.code = code;
  }
}

// Defends against a mock/response accidentally echoing the token back,
// and against any future code path that might build a message from raw
// response text. The token itself never appears in a thrown message.
function redact(text, token) {
  if (!token || !text) return text;
  return text.split(token).join('[REDACTED]');
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    // GitHub's API rejects requests with no User-Agent (403). Node's
    // fetch sets one automatically; the Cloudflare Workers runtime
    // doesn't, so this needs to be explicit for both to work the same.
    'User-Agent': 'eml2web'
  };
}

async function classifyErrorResponse(res, { token, owner, repo }) {
  const rawBody = await res.text().catch(() => '');
  const bodyText = redact(rawBody, token).slice(0, 500);
  const status = res.status;

  if (status === 401) {
    return new GitHubPublishError(
      'GitHub publish failed: authentication failed (401). Check GITHUB_TOKEN.',
      { status, code: 'AUTH_FAILED' }
    );
  }
  if (status === 403 && /rate limit/i.test(bodyText)) {
    return new GitHubPublishError(
      'GitHub publish failed: rate limited (403). Wait and retry.',
      { status, code: 'RATE_LIMITED' }
    );
  }
  if (status === 403) {
    return new GitHubPublishError(
      `GitHub publish failed: insufficient permissions (403). Check that GITHUB_TOKEN has Contents: write access to ${owner}/${repo}.`,
      { status, code: 'FORBIDDEN' }
    );
  }
  if (status === 404) {
    return new GitHubPublishError(
      `GitHub publish failed: repository not found (404). Check GITHUB_OWNER=${owner} and GITHUB_REPO=${repo}, and that the token can access it.`,
      { status, code: 'NOT_FOUND' }
    );
  }
  if (status === 409) {
    return new GitHubPublishError(
      'GitHub publish failed: conflict (409) writing to the branch. Retry.',
      { status, code: 'CONFLICT' }
    );
  }
  if (status === 429) {
    return new GitHubPublishError(
      'GitHub publish failed: rate limited (429). Wait and retry.',
      { status, code: 'RATE_LIMITED' }
    );
  }
  if (status >= 500) {
    return new GitHubPublishError(
      `GitHub publish failed: GitHub server error (${status}). Try again shortly.`,
      { status, code: 'SERVER_ERROR' }
    );
  }
  return new GitHubPublishError(
    `GitHub publish failed: unexpected response (${status}). ${bodyText}`,
    { status, code: 'CLIENT_ERROR' }
  );
}

async function request(fetchImpl, url, options) {
  try {
    return await fetchImpl(url, options);
  } catch (err) {
    throw new GitHubPublishError(
      `GitHub publish failed: network error (${err.message}). Check your internet connection.`,
      { code: 'NETWORK_ERROR' }
    );
  }
}

// Returns { sha, content } for a file that exists on `branch`, or null.
async function getFile({ owner, repo, branch, path, token, fetchImpl }) {
  const url = `${API_ROOT}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const res = await request(fetchImpl, url, { headers: authHeaders(token) });

  if (res.status === 404) return null;
  if (!res.ok) throw await classifyErrorResponse(res, { token, owner, repo });

  const data = await res.json();
  return {
    sha: data.sha || null,
    content: typeof data.content === 'string' ? Buffer.from(data.content, 'base64').toString('utf8') : ''
  };
}

// Public read helper: for callers (posts.json, index.html regeneration)
// that need the current content of a file before updating it.
export async function getFileFromGitHub({ owner, repo, branch = 'main', path, token, fetchImpl = fetch }) {
  validateConfig({ token, owner, repo });
  return getFile({ owner, repo, branch, path, token, fetchImpl });
}

// Returns the file's sha if it already exists on `branch`, or null.
async function findExistingFile(args) {
  const file = await getFile(args);
  return file ? file.sha : null;
}

function validateConfig({ token, owner, repo }) {
  if (!token) {
    throw new GitHubPublishError('GitHub publish failed: no token provided. Set GITHUB_TOKEN.', {
      code: 'AUTH_FAILED'
    });
  }
  if (!owner || !repo) {
    throw new GitHubPublishError('GitHub publish failed: GITHUB_OWNER and GITHUB_REPO are required.', {
      code: 'CONFIG_ERROR'
    });
  }
}

async function putFile({ owner, repo, branch, path, content, commitMessage, token, fetchImpl, sha }) {
  const url = `${API_ROOT}/repos/${owner}/${repo}/contents/${path}`;
  const res = await request(fetchImpl, url, {
    method: 'PUT',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: commitMessage,
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch,
      ...(sha ? { sha } : {})
    })
  });

  if (!res.ok) throw await classifyErrorResponse(res, { token, owner, repo });

  const data = await res.json();
  return {
    path: data.content?.path ?? path,
    sha: data.content?.sha ?? null,
    htmlUrl: data.content?.html_url ?? null,
    commitSha: data.commit?.sha ?? null,
    commitUrl: data.commit?.html_url ?? null
  };
}

// Create-only: refuses to touch a path that already exists. This is the
// right behavior for individual published posts - never silently
// overwrite one, and never fall back to the CLI's local -2/-3
// filename-collision behavior for a remote publish.
export async function publishToGitHub({
  owner,
  repo,
  branch = 'main',
  path,
  content,
  commitMessage,
  token,
  fetchImpl = fetch
}) {
  validateConfig({ token, owner, repo });

  const existingSha = await findExistingFile({ owner, repo, branch, path, token, fetchImpl });
  if (existingSha) {
    throw new GitHubPublishError(
      `GitHub publish refused: "${path}" already exists on branch "${branch}". Refusing to overwrite a published message.`,
      { code: 'ALREADY_PUBLISHED' }
    );
  }

  return putFile({ owner, repo, branch, path, content, commitMessage, token, fetchImpl });
}

// Create-or-update: for files that are meant to always reflect current
// state (posts.json, index.html), unlike a published post's own page.
export async function upsertToGitHub({
  owner,
  repo,
  branch = 'main',
  path,
  content,
  commitMessage,
  token,
  fetchImpl = fetch
}) {
  validateConfig({ token, owner, repo });

  const existingSha = await findExistingFile({ owner, repo, branch, path, token, fetchImpl });
  return putFile({ owner, repo, branch, path, content, commitMessage, token, fetchImpl, sha: existingSha });
}
