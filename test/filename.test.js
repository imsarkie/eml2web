import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { slugify, buildBaseName, resolveFilename } from '../src/filename.js';

test('slugify lowercases, hyphenates, and strips unsafe punctuation', () => {
  assert.equal(slugify('Why I Still Use Unix'), 'why-i-still-use-unix');
  assert.equal(slugify('  Hello, World!! '), 'hello-world');
  assert.equal(slugify('a---b   c'), 'a-b-c');
  assert.equal(slugify('Café résumé'), 'cafe-resume');
});

test('slugify falls back to "untitled" for empty or unicode-only subjects', () => {
  assert.equal(slugify(''), 'untitled');
  assert.equal(slugify(undefined), 'untitled');
  assert.equal(slugify('日本語のテスト'), 'untitled');
  assert.equal(slugify('!!! ??? ---'), 'untitled');
});

test('slugify can never produce a path traversal sequence', () => {
  const slug = slugify('../../etc/passwd');
  assert.doesNotMatch(slug, /\.\./);
  assert.doesNotMatch(slug, /\//);
  assert.equal(slug, 'etc-passwd');
});

test('buildBaseName combines the date and slug', () => {
  const post = { date: 'Sun, 30 Aug 2026 09:00:00 -0700', subject: 'Why I still use Unix' };
  assert.equal(buildBaseName(post), '2026-08-30-why-i-still-use-unix');
});

test('buildBaseName falls back to today when the date header is missing or unparsable', () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(buildBaseName({ date: '', subject: 'X' }), `${today}-x`);
  assert.equal(buildBaseName({ date: 'not a date', subject: 'X' }), `${today}-x`);
});

test('resolveFilename avoids overwriting an existing published message', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eml2web-test-'));
  const post = { date: '2026-08-30', subject: 'Why I still use Unix' };

  const first = resolveFilename(post, dir);
  assert.equal(first, '2026-08-30-why-i-still-use-unix.html');
  fs.writeFileSync(path.join(dir, first), 'x');

  const second = resolveFilename(post, dir);
  assert.equal(second, '2026-08-30-why-i-still-use-unix-2.html');
  fs.writeFileSync(path.join(dir, second), 'x');

  const third = resolveFilename(post, dir);
  assert.equal(third, '2026-08-30-why-i-still-use-unix-3.html');
});

test('resolveFilename returns the base name untouched when there is no collision', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eml2web-test-'));
  const post = { date: '2026-01-01', subject: 'Unrelated post' };
  assert.equal(resolveFilename(post, dir), '2026-01-01-unrelated-post.html');
});
