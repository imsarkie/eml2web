import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publishToGitHub, GitHubPublishError } from '../src/github.js';

function fakeResponse({ ok, status, json, text }) {
  return {
    ok,
    status,
    json: async () => json,
    text: async () => (text !== undefined ? text : JSON.stringify(json ?? {}))
  };
}

// Queue-based mock: responses.GET / responses.PUT are arrays consumed in
// call order for that method. Records every call for inspection.
function makeFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const method = options.method || 'GET';
    calls.push({ url, options, method });
    const queue = responses[method];
    if (!queue || queue.length === 0) {
      throw new Error(`no mock response queued for ${method} ${url}`);
    }
    return queue.shift();
  };
  return { calls, fetchImpl };
}

const basePublishArgs = {
  owner: 'octocat',
  repo: 'archive',
  branch: 'main',
  path: 'posts/2026-08-30-why-i-still-use-unix.html',
  content: '<html>hello</html>',
  commitMessage: 'Publish: Why I still use Unix',
  token: 'ghp_supersecrettoken1234'
};

test('successful create: no existing file, PUT succeeds, returns commit info', async () => {
  const { calls, fetchImpl } = makeFetch({
    GET: [fakeResponse({ ok: false, status: 404, text: 'Not Found' })],
    PUT: [
      fakeResponse({
        ok: true,
        status: 201,
        json: {
          content: { path: basePublishArgs.path, sha: 'file-sha', html_url: 'https://github.com/octocat/archive/blob/main/posts/x.html' },
          commit: { sha: 'commit-sha', html_url: 'https://github.com/octocat/archive/commit/commit-sha' }
        }
      })
    ]
  });

  const result = await publishToGitHub({ ...basePublishArgs, fetchImpl });

  assert.equal(result.path, basePublishArgs.path);
  assert.equal(result.sha, 'file-sha');
  assert.equal(result.commitSha, 'commit-sha');
  assert.equal(result.commitUrl, 'https://github.com/octocat/archive/commit/commit-sha');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[1].method, 'PUT');
});

test('authentication failure (401) produces a clear, actionable error', async () => {
  const { fetchImpl } = makeFetch({
    GET: [fakeResponse({ ok: false, status: 401, text: JSON.stringify({ message: 'Bad credentials' }) })]
  });

  await assert.rejects(
    publishToGitHub({ ...basePublishArgs, fetchImpl }),
    (err) => {
      assert.ok(err instanceof GitHubPublishError);
      assert.equal(err.code, 'AUTH_FAILED');
      assert.match(err.message, /authentication failed/i);
      assert.match(err.message, /GITHUB_TOKEN/);
      return true;
    }
  );
});

test('repository not found (404 on create) is reported distinctly from a missing file', async () => {
  const { fetchImpl } = makeFetch({
    GET: [fakeResponse({ ok: false, status: 404, text: 'Not Found' })], // file/repo not found on lookup
    PUT: [fakeResponse({ ok: false, status: 404, text: 'Not Found' })] // create also 404s: repo doesn't exist
  });

  await assert.rejects(
    publishToGitHub({ ...basePublishArgs, fetchImpl }),
    (err) => {
      assert.ok(err instanceof GitHubPublishError);
      assert.equal(err.code, 'NOT_FOUND');
      assert.match(err.message, /repository not found/i);
      return true;
    }
  );
});

test('refuses to overwrite an already-published file and never calls PUT', async () => {
  const { calls, fetchImpl } = makeFetch({
    GET: [fakeResponse({ ok: true, status: 200, json: { sha: 'existing-sha' } })]
  });

  await assert.rejects(
    publishToGitHub({ ...basePublishArgs, fetchImpl }),
    (err) => {
      assert.ok(err instanceof GitHubPublishError);
      assert.equal(err.code, 'ALREADY_PUBLISHED');
      assert.match(err.message, /already exists/i);
      assert.match(err.message, new RegExp(basePublishArgs.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      return true;
    }
  );

  assert.equal(calls.length, 1, 'PUT must never be called once the file is found to exist');
  assert.equal(calls[0].method, 'GET');
});

test('sends the requested branch in both the existence check and the create request', async () => {
  const { calls, fetchImpl } = makeFetch({
    GET: [fakeResponse({ ok: false, status: 404, text: 'Not Found' })],
    PUT: [fakeResponse({ ok: true, status: 201, json: { content: {}, commit: {} } })]
  });

  await publishToGitHub({ ...basePublishArgs, branch: 'gh-pages', fetchImpl });

  assert.match(calls[0].url, /ref=gh-pages/);
  const putBody = JSON.parse(calls[1].options.body);
  assert.equal(putBody.branch, 'gh-pages');
});

test('base64-encodes the file content correctly', async () => {
  const { calls, fetchImpl } = makeFetch({
    GET: [fakeResponse({ ok: false, status: 404, text: 'Not Found' })],
    PUT: [fakeResponse({ ok: true, status: 201, json: { content: {}, commit: {} } })]
  });

  const content = '<pre>Café &amp; résumé</pre>';
  await publishToGitHub({ ...basePublishArgs, content, fetchImpl });

  const putBody = JSON.parse(calls[1].options.body);
  assert.equal(Buffer.from(putBody.content, 'base64').toString('utf8'), content);
});

test('passes the exact commit message through to the create request', async () => {
  const { calls, fetchImpl } = makeFetch({
    GET: [fakeResponse({ ok: false, status: 404, text: 'Not Found' })],
    PUT: [fakeResponse({ ok: true, status: 201, json: { content: {}, commit: {} } })]
  });

  await publishToGitHub({ ...basePublishArgs, commitMessage: 'Publish: A very specific subject', fetchImpl });

  const putBody = JSON.parse(calls[1].options.body);
  assert.equal(putBody.message, 'Publish: A very specific subject');
});

test('network failure is wrapped into a clear GitHubPublishError, not an unhandled rejection', async () => {
  const fetchImpl = async () => {
    throw new TypeError('fetch failed');
  };

  await assert.rejects(
    publishToGitHub({ ...basePublishArgs, fetchImpl }),
    (err) => {
      assert.ok(err instanceof GitHubPublishError);
      assert.equal(err.code, 'NETWORK_ERROR');
      assert.match(err.message, /network error/i);
      return true;
    }
  );
});

test('never leaks the token into a thrown error message, even if the API response echoes it', async () => {
  const token = basePublishArgs.token;
  const { fetchImpl } = makeFetch({
    GET: [
      fakeResponse({
        ok: false,
        status: 403,
        text: JSON.stringify({ message: `Forbidden for token ${token}` })
      })
    ]
  });

  await assert.rejects(
    publishToGitHub({ ...basePublishArgs, fetchImpl }),
    (err) => {
      assert.ok(err instanceof GitHubPublishError);
      assert.equal(err.code, 'FORBIDDEN');
      assert.doesNotMatch(err.message, new RegExp(token));
      return true;
    }
  );
});

test('rejects up front when required config is missing, without making any request', async () => {
  const { calls, fetchImpl } = makeFetch({});

  await assert.rejects(publishToGitHub({ ...basePublishArgs, token: '', fetchImpl }), (err) => {
    assert.ok(err instanceof GitHubPublishError);
    assert.equal(err.code, 'AUTH_FAILED');
    return true;
  });
  assert.equal(calls.length, 0);

  await assert.rejects(publishToGitHub({ ...basePublishArgs, owner: '', fetchImpl }), (err) => {
    assert.ok(err instanceof GitHubPublishError);
    assert.equal(err.code, 'CONFIG_ERROR');
    return true;
  });
  assert.equal(calls.length, 0);
});
