// Tags are a subject-line convention: "#word" anywhere in the subject.
// Extracted for the index page, then stripped from the subject everywhere
// else (title, page header, filename slug) so they don't clutter the text.

const TAG_PATTERN = /#([a-zA-Z0-9][a-zA-Z0-9_-]*)/g;

export function extractTags(subject) {
  const raw = subject || '';
  const tags = [];
  const seen = new Set();

  for (const match of raw.matchAll(TAG_PATTERN)) {
    const tag = match[1].toLowerCase();
    if (!seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }

  const cleanSubject = raw.replace(TAG_PATTERN, '').replace(/\s+/g, ' ').trim();

  return { subject: cleanSubject, tags };
}
