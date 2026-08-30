import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEmail } from '../src/parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name));

test('parses a basic plain-text email', async () => {
  const post = await parseEmail(fixture('sample.eml'));
  assert.equal(post.subject, 'Why I still use Unix');
  assert.equal(post.from, 'Sarky <sarky@example.com>');
  assert.equal(post.to, 'unix-fans@example.com');
  assert.equal(post.messageId, '<sample-001@example.com>');
  assert.match(post.date, /2026/);
  assert.match(post.body, /I've been thinking about Unix lately/);
  assert.match(post.body, /> This is quoted text\./);
});

test('prefers the text part and ignores the html part of a multipart/alternative email', async () => {
  const post = await parseEmail(fixture('multipart.eml'));
  assert.match(post.body, /Agreed\. Plain text has aged well\./);
  assert.doesNotMatch(post.body, /<html>/);
  assert.doesNotMatch(post.body, /<script>/);
  assert.doesNotMatch(post.body, /<p>/);
  assert.doesNotMatch(post.body, /<ul>/);
});

test('extracts Message-ID / In-Reply-To / References for future threading', async () => {
  const post = await parseEmail(fixture('multipart.eml'));
  assert.equal(post.messageId, '<multipart-001@example.com>');
  assert.equal(post.inReplyTo, '<sample-001@example.com>');
  assert.equal(post.references, '<sample-001@example.com>');
});

test('extracts multiple To recipients', async () => {
  const post = await parseEmail(fixture('multipart.eml'));
  assert.match(post.to, /Sarky <sarky@example\.com>/);
  assert.match(post.to, /list@example\.com/);
});

test('handles missing optional headers gracefully instead of throwing', async () => {
  const post = await parseEmail(fixture('missing-headers.eml'));
  assert.equal(post.subject, '');
  assert.equal(post.to, '');
  assert.equal(post.messageId, '');
  assert.equal(post.inReplyTo, '');
  assert.equal(post.references, '');
  assert.match(post.from, /anon@example\.com/);
  assert.match(post.body, /Just a body\./);
});

test('preserves blank lines and paragraph breaks in the body', async () => {
  const post = await parseEmail(fixture('sample.eml'));
  assert.ok(post.body.includes('\n\n'), 'expected a blank line to survive parsing');
});

test('decodes an RFC 2047 encoded-word subject and preserves unicode body content', async () => {
  const post = await parseEmail(fixture('unicode.eml'));
  assert.match(post.subject, /日本語のテスト/);
  assert.match(post.subject, /🚀/);
  assert.match(post.from, /Café Tëst/);
  assert.match(post.body, /Café résumé/);
  assert.match(post.body, /日本語のテスト/);
  assert.match(post.body, /🚀/);
});

test('does not throw on dangerous content and keeps it as raw, unescaped text at this layer', async () => {
  // Escaping is the renderer's job (see renderer.test.js), not the parser's.
  const post = await parseEmail(fixture('dangerous.eml'));
  assert.match(post.subject, /<script>alert\("x"\)<\/script>/);
  assert.match(post.body, /<script>alert\("x"\)<\/script>/);
});

test('ignores the html mime part entirely, never exposing it on the post', async () => {
  const post = await parseEmail(fixture('multipart.eml'));
  assert.equal(Object.hasOwn(post, 'html'), false);
});
