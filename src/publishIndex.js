// After a post is published to GitHub, keep posts.json and index.html in
// sync with it. Shared by cli-github.js and worker.js so the "read
// current manifest, append, regenerate index, upsert both" sequence only
// lives in one place.

import { getFileFromGitHub, upsertToGitHub } from './github.js';
import { parseManifest, addManifestEntry, serializeManifest } from './manifest.js';
import { renderIndex } from './siteIndex.js';

const MANIFEST_PATH = 'posts.json';
const INDEX_PATH = 'index.html';

export async function updateSiteIndex({ owner, repo, branch, token, fetchImpl, entry, indexTemplate }) {
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
    path: INDEX_PATH,
    content: renderIndex(manifest, { template: indexTemplate }),
    commitMessage: `Update index.html: ${entry.filename}`,
    token,
    fetchImpl
  });

  return manifest;
}
