import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseManifest, addManifestEntry, serializeManifest } from '../src/manifest.js';

test('parseManifest returns an empty array for missing/empty input', () => {
  assert.deepEqual(parseManifest(''), []);
  assert.deepEqual(parseManifest(undefined), []);
  assert.deepEqual(parseManifest(null), []);
});

test('parseManifest returns an empty array for malformed JSON instead of throwing', () => {
  assert.deepEqual(parseManifest('{not valid json'), []);
});

test('parseManifest returns an empty array if the JSON is not an array', () => {
  assert.deepEqual(parseManifest('{"oops": true}'), []);
});

test('parseManifest parses a valid manifest', () => {
  const json = JSON.stringify([{ filename: 'a.html', subject: 'A', date: '2026-01-01', tags: ['x'] }]);
  assert.deepEqual(parseManifest(json), [{ filename: 'a.html', subject: 'A', date: '2026-01-01', tags: ['x'] }]);
});

test('addManifestEntry appends without mutating the original array', () => {
  const original = [{ filename: 'a.html' }];
  const updated = addManifestEntry(original, { filename: 'b.html' });
  assert.equal(original.length, 1);
  assert.deepEqual(updated, [{ filename: 'a.html' }, { filename: 'b.html' }]);
});

test('serializeManifest round-trips through parseManifest', () => {
  const manifest = [{ filename: 'a.html', subject: 'A <script>', date: '2026-01-01', tags: ['unix', 'os'] }];
  const json = serializeManifest(manifest);
  assert.deepEqual(parseManifest(json), manifest);
});
