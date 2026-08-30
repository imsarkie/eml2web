// Deterministic, collision-safe output filenames: YYYY-MM-DD-slug.html

import fs from 'node:fs';
import path from 'node:path';

export function slugify(subject) {
  if (!subject) return 'untitled';

  // Strip accents so e.g. "café" -> "cafe" instead of being dropped.
  const normalized = subject.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

  const slug = normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // Only [a-z0-9-] ever survives the replace above, so this can never
  // contain "/" or "..": path traversal is structurally impossible here.
  return slug || 'untitled';
}

function formatDate(dateInput) {
  const date = dateInput ? new Date(dateInput) : null;
  if (!date || Number.isNaN(date.getTime())) {
    // No usable Date header: fall back to today rather than failing.
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

export function buildBaseName(post) {
  return `${formatDate(post.date)}-${slugify(post.subject)}`;
}

// Finds the first unused "<base>.html", "<base>-2.html", "<base>-3.html", ...
// in `dir`, so an existing published message is never silently overwritten.
export function resolveFilename(post, dir) {
  const base = buildBaseName(post);
  let candidate = `${base}.html`;
  let n = 2;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${base}-${n}.html`;
    n += 1;
  }
  return candidate;
}
