#!/usr/bin/env node
// GitHub-publishing command: read an .eml file, render it, and commit the
// HTML straight to a GitHub repo via the Contents API. Refuses to
// overwrite an already-published message.
//
// Usage:
//   GITHUB_TOKEN=... GITHUB_OWNER=... GITHUB_REPO=... \
//     node src/cli-github.js ./path/to/message.eml

import fs from 'node:fs';
import { parseEmail } from './parser.js';
import { renderPost } from './renderer.js';
import { buildBaseName } from './filename.js';
import { publishToGitHub, GitHubPublishError } from './github.js';
import { updateSiteIndex } from './publishIndex.js';
import { config } from './config.js';

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: node src/cli-github.js <path-to-email.eml>');
    process.exit(1);
  }

  const { token, owner, repo, branch, postsDir } = config.github;
  if (!token || !owner || !repo) {
    console.error(
      'Missing GitHub configuration. Set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO ' +
        '(GITHUB_BRANCH defaults to "main").'
    );
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath);
  const post = await parseEmail(raw);

  console.log('Parsed:');
  console.log(`  From: ${post.from || '(none)'}`);
  console.log(`  Subject: ${post.subject || '(none)'}`);
  console.log(`  Date: ${post.date || '(none)'}`);
  if (post.tags.length) console.log(`  Tags: ${post.tags.join(', ')}`);
  console.log('');

  const filename = `${buildBaseName(post)}.html`;
  const repoPath = `${postsDir}/${filename}`;
  const html = renderPost(post);

  console.log('Generated:');
  console.log(`  ${repoPath}`);
  console.log('');

  console.log('Publishing:');
  console.log(`  github.com/${owner}/${repo}`);
  console.log('');

  const result = await publishToGitHub({
    owner,
    repo,
    branch,
    path: repoPath,
    content: html,
    commitMessage: `Publish: ${post.subject || repoPath}`,
    token
  });

  console.log('Success:');
  console.log(`  commit: ${result.commitSha}`);
  console.log(`  path: ${result.path}`);
  console.log('');

  console.log('Updating index:');
  await updateSiteIndex({
    owner,
    repo,
    branch,
    token,
    entry: { filename, subject: post.subject, date: post.date, tags: post.tags }
  });
  console.log('  posts.json and index.html updated');
}

main().catch((err) => {
  if (err instanceof GitHubPublishError) {
    console.error(err.message);
  } else {
    console.error('Failed to publish to GitHub:', err.message);
  }
  process.exit(1);
});
