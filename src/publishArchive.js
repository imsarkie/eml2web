// After a post is published to GitHub, keep posts.json, archive.html, and
// feed.xml in sync with it. Shared by cli-github.js and worker.js so the
// "read current manifest, append, regenerate archive + feed, upsert all"
// sequence only lives in one place. index.html (the Home page) and
// about.html are static and hand-edited - this never touches them.

import { getFileFromGitHub, upsertToGitHub } from './github.js';
import { parseManifest, addManifestEntry, serializeManifest } from './manifest.js';
import { renderArchive } from './archive.js';
import { renderFeed } from './feed.js';

const MANIFEST_PATH = 'posts.json';
const ARCHIVE_PATH = 'archive.html';
const FEED_PATH = 'feed.xml';

export async function updateArchive({ owner, repo, branch, token, fetchImpl, entry, archiveTemplate, siteUrl }) {
  const existingManifestFile = await getFileFromGitHub({
    owner,
    repo,
    branch,
    path: MANIFEST_PATH,
    token,
    fetchImpl
  });

  const manifest = addManifestEntry(parseManifest(existingManifestFile?.content), entry);

  await upsertToGitHub({
    owner,
    repo,
    branch,
    path: MANIFEST_PATH,
    content: serializeManifest(manifest),
    commitMessage: `Update posts.json: ${entry.filename}`,
    token,
    fetchImpl
  });

  await upsertToGitHub({
    owner,
    repo,
    branch,
    path: ARCHIVE_PATH,
    content: renderArchive(manifest, { template: archiveTemplate }),
    commitMessage: `Update archive.html: ${entry.filename}`,
    token,
    fetchImpl
  });

  await upsertToGitHub({
    owner,
    repo,
    branch,
    path: FEED_PATH,
    content: renderFeed(manifest, { siteUrl }),
    commitMessage: `Update feed.xml: ${entry.filename}`,
    token,
    fetchImpl
  });

  return manifest;
}
