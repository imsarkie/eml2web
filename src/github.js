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
    'X-GitHub-Api-Version': '2022-11-28'
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

// Returns the file's sha if it already exists on `branch`, or null.
async function findExistingFile({ owner, repo, branch, path, token, fetchImpl }) {
  const url = `${API_ROOT}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const res = await request(fetchImpl, url, { headers: authHeaders(token) });

  if (res.status === 404) return null;
  if (!res.ok) throw await classifyErrorResponse(res, { token, owner, repo });

  const data = await res.json();
  return data.sha || null;
}

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
  if (!token) {
    throw new GitHubPublishError('GitHub publish failed: no token provided. Set GITHUB_TOKEN.', {
      code: 'AUTH_FAILED'
    });
  }
  if (!owner || !repo) {
    throw new GitHubPublishError(
      'GitHub publish failed: GITHUB_OWNER and GITHUB_REPO are required.',
      { code: 'CONFIG_ERROR' }
    );
  }

  // Publication is create-only: never silently overwrite an already
  // published message, and never fall back to the CLI's local -2/-3
  // filename-collision behavior for a remote publish.
  const existingSha = await findExistingFile({ owner, repo, branch, path, token, fetchImpl });
  if (existingSha) {
    throw new GitHubPublishError(
      `GitHub publish refused: "${path}" already exists on branch "${branch}". Refusing to overwrite a published message.`,
      { code: 'ALREADY_PUBLISHED' }
    );
  }

  const url = `${API_ROOT}/repos/${owner}/${repo}/contents/${path}`;
  const res = await request(fetchImpl, url, {
    method: 'PUT',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: commitMessage,
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch
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
