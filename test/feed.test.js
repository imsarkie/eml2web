import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderFeed } from '../src/feed.js';

test('builds an item per post with an absolute link and guid under siteUrl', () => {
  const manifest = [
    { filename: '2026-08-30-a.html', subject: 'Post A', date: 'Sun, 30 Aug 2026 09:00:00 -0700', tags: [] }
  ];
  const xml = renderFeed(manifest, { siteUrl: 'https://example.test' });

  assert.match(xml, /<link>https:\/\/example\.test\/posts\/2026-08-30-a\.html<\/link>/);
  assert.match(
    xml,
    /<guid isPermaLink="true">https:\/\/example\.test\/posts\/2026-08-30-a\.html<\/guid>/
  );
  assert.match(xml, /<pubDate>Sun, 30 Aug 2026 09:00:00 -0700<\/pubDate>/);
});

test('newest post (by filename date prefix) comes first, matching archive.html ordering', () => {
  const manifest = [
    { filename: '2026-01-01-old.html', subject: 'Old post', date: '2026-01-01', tags: [] },
    { filename: '2026-08-30-new.html', subject: 'New post', date: '2026-08-30', tags: [] }
  ];
  const xml = renderFeed(manifest);
  assert.ok(xml.indexOf('New post') < xml.indexOf('Old post'));
});

test('emits a <category> per tag', () => {
  const manifest = [
    { filename: '2026-08-30-a.html', subject: 'Post A', date: '2026-08-30', tags: ['unix', 'philosophy'] }
  ];
  const xml = renderFeed(manifest);
  assert.match(xml, /<category>unix<\/category>/);
  assert.match(xml, /<category>philosophy<\/category>/);
});

test('a post with no date omits <pubDate> instead of emitting an empty tag', () => {
  const manifest = [{ filename: '2026-08-30-a.html', subject: 'Post A', date: '', tags: [] }];
  const xml = renderFeed(manifest);
  assert.doesNotMatch(xml, /<pubDate>/);
});

test('escapes dangerous subject and tag content', () => {
  const manifest = [
    {
      filename: '2026-08-30-a.html',
      subject: '<script>alert(1)</script>',
      date: '2026-08-30',
      tags: ['<script>xss</script>']
    }
  ];
  const xml = renderFeed(manifest);
  assert.doesNotMatch(xml, /<script>/);
  assert.match(xml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('produces a valid, item-less channel when there are no posts yet', () => {
  const xml = renderFeed([], { siteUrl: 'https://example.test' });
  assert.match(xml, /<rss version="2\.0"/);
  assert.match(xml, /<link>https:\/\/example\.test<\/link>/);
  assert.doesNotMatch(xml, /<item>/);
});

test('caps the feed at the 20 newest posts', () => {
  const manifest = Array.from({ length: 25 }, (_, i) => {
    const n = String(i).padStart(2, '0');
    return { filename: `2026-01-${n}-post.html`, subject: `Post ${n}`, date: '', tags: [] };
  });
  const xml = renderFeed(manifest);
  const itemCount = (xml.match(/<item>/g) || []).length;
  assert.equal(itemCount, 20);
  assert.match(xml, /Post 24/);
  assert.doesNotMatch(xml, /Post 04/);
});
