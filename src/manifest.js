// posts.json: a flat array of { filename, subject, date, tags } entries,
// one per published post. Not a database - just a plain file the index
// page gets generated from, git-versioned alongside the HTML it describes.

export function parseManifest(json) {
  if (!json) return [];
  try {
    const data = JSON.parse(json);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function addManifestEntry(manifest, entry) {
  return [...manifest, entry];
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
