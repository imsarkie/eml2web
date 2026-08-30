// Renders the site root index.html: posts grouped by tag, tag from the
// "#word" convention parsed in tags.js. Reads templates/index.html the
// same way renderer.js reads templates/post.html - from disk locally, or
// from an injected `template` string in the Worker (no filesystem there).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from './renderer.js';

function defaultTemplatePath() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.join(__dirname, '..', 'templates', 'index.html');
}

const UNTAGGED_LABEL = 'Uncategorized';

function groupByTag(manifest) {
  const groups = new Map();
  for (const post of manifest) {
    const tags = Array.isArray(post.tags) && post.tags.length ? post.tags : [UNTAGGED_LABEL];
    for (const tag of tags) {
      if (!groups.has(tag)) groups.set(tag, []);
      groups.get(tag).push(post);
    }
  }
  return groups;
}

function renderSection(tagLabel, posts) {
  // Filenames are "YYYY-MM-DD-slug.html", so sorting the strings
  // descending already puts the newest post first - no date parsing needed.
  const sorted = [...posts].sort((a, b) => (a.filename < b.filename ? 1 : -1));
  const items = sorted
    .map(
      (post) =>
        `    <li><a href="posts/${escapeHtml(post.filename)}">${escapeHtml(post.subject || post.filename)}</a></li>`
    )
    .join('\n');
  return `<section>\n  <h2>${escapeHtml(tagLabel)}</h2>\n  <ul>\n${items}\n  </ul>\n</section>`;
}

export function renderIndex(manifest, { template } = {}) {
  const templateText = template ?? fs.readFileSync(defaultTemplatePath(), 'utf8');
  const groups = groupByTag(manifest);

  const tagNames = [...groups.keys()].sort((a, b) => {
    if (a === UNTAGGED_LABEL) return 1;
    if (b === UNTAGGED_LABEL) return -1;
    return a.localeCompare(b);
  });

  const sections = tagNames.length
    ? tagNames.map((tag) => renderSection(tag, groups.get(tag))).join('\n\n')
    : '<p>No posts yet.</p>';

  return templateText.replace('{{SECTIONS}}', () => sections);
}
