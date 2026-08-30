import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderIndex } from '../src/siteIndex.js';

const baseTemplate = '<html><body>{{SECTIONS}}</body></html>';

test('groups posts under their tags, alphabetically, with links to posts/<filename>', () => {
  const manifest = [
    { filename: '2026-08-30-a.html', subject: 'Post A', date: '2026-08-30', tags: ['unix'] },
    { filename: '2026-08-29-b.html', subject: 'Post B', date: '2026-08-29', tags: ['linux'] }
  ];
  const html = renderIndex(manifest, { template: baseTemplate });

  assert.match(html, /<h2>linux<\/h2>/);
  assert.match(html, /<h2>unix<\/h2>/);
  assert.ok(html.indexOf('<h2>linux</h2>') < html.indexOf('<h2>unix</h2>'), 'tags should be alphabetical');
  assert.match(html, /<a href="posts\/2026-08-30-a\.html">Post A<\/a>/);
  assert.match(html, /<a href="posts\/2026-08-29-b\.html">Post B<\/a>/);
});

test('an untagged post goes under "Uncategorized", sorted after real tags', () => {
  const manifest = [
    { filename: '2026-08-30-a.html', subject: 'Post A', date: '2026-08-30', tags: [] },
    { filename: '2026-08-29-b.html', subject: 'Post B', date: '2026-08-29', tags: ['zzz-tag'] }
  ];
  const html = renderIndex(manifest, { template: baseTemplate });
  assert.ok(
    html.indexOf('<h2>zzz-tag</h2>') < html.indexOf('<h2>Uncategorized</h2>'),
    'Uncategorized should sort after real tags even alphabetically-later ones'
  );
});

test('a post with multiple tags appears in every one of its tag sections', () => {
  const manifest = [
    { filename: '2026-08-30-a.html', subject: 'Post A', date: '2026-08-30', tags: ['unix', 'philosophy'] }
  ];
  const html = renderIndex(manifest, { template: baseTemplate });
  const philosophySection = html.split('<h2>philosophy</h2>')[1].split('</section>')[0];
  const unixSection = html.split('<h2>unix</h2>')[1].split('</section>')[0];
  assert.match(philosophySection, /Post A/);
  assert.match(unixSection, /Post A/);
});

test('within a tag section, newest post (by filename date prefix) comes first', () => {
  const manifest = [
    { filename: '2026-01-01-old.html', subject: 'Old post', date: '2026-01-01', tags: ['unix'] },
    { filename: '2026-08-30-new.html', subject: 'New post', date: '2026-08-30', tags: ['unix'] }
  ];
  const html = renderIndex(manifest, { template: baseTemplate });
  const section = html.split('<h2>unix</h2>')[1].split('</section>')[0];
  assert.ok(section.indexOf('New post') < section.indexOf('Old post'));
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
  const html = renderIndex(manifest, { template: baseTemplate });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('shows a placeholder when there are no posts yet', () => {
  const html = renderIndex([], { template: baseTemplate });
  assert.match(html, /No posts yet\./);
});
