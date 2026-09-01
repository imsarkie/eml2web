// Renders feed.xml: an RSS 2.0 feed built from posts.json, the same
// manifest archive.html is built from. Regenerated on every publish (see
// publishArchive.js) so subscribers get notified without polling anything
// beyond this one file.

import { escapeHtml } from './html.js';

const DEFAULT_SITE_URL = 'https://blog.imsarkie.in';
const MAX_ITEMS = 20;

function renderItem(post, siteUrl) {
  const link = `${siteUrl}/posts/${post.filename}`;
  const pubDate = post.date ? `\n      <pubDate>${escapeHtml(post.date)}</pubDate>` : '';
  const categories = (Array.isArray(post.tags) ? post.tags : [])
    .map((tag) => `\n      <category>${escapeHtml(tag)}</category>`)
    .join('');

  return `    <item>
      <title>${escapeHtml(post.subject || post.filename)}</title>
      <link>${escapeHtml(link)}</link>
      <guid isPermaLink="true">${escapeHtml(link)}</guid>${pubDate}${categories}
    </item>`;
}

// `siteUrl` lets a caller override the absolute base the feed's links are
// built from (the Worker passes env.SITE_URL); `now` lets tests pin
// lastBuildDate instead of asserting against the real clock.
export function renderFeed(manifest, { siteUrl = DEFAULT_SITE_URL, now = new Date() } = {}) {
  // Same ordering as archive.html: filenames are "YYYY-MM-DD-slug.html", so
  // sorting the strings descending already puts the newest post first.
  const sorted = [...manifest].sort((a, b) => (a.filename < b.filename ? 1 : -1)).slice(0, MAX_ITEMS);
  const items = sorted.map((post) => renderItem(post, siteUrl)).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>eml2web</title>
    <link>${escapeHtml(siteUrl)}</link>
    <description>Published via email.</description>
    <atom:link href="${escapeHtml(siteUrl)}/feed.xml" rel="self" type="application/rss+xml" />
    <language>en</language>
    <lastBuildDate>${now.toUTCString()}</lastBuildDate>
    <generator>eml2web</generator>
${items}
  </channel>
</rss>
`;
}
