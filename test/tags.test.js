import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractTags } from '../src/tags.js';

test('extracts a single trailing tag and strips it from the subject', () => {
  const { subject, tags } = extractTags('Why I still use Unix #unix');
  assert.equal(subject, 'Why I still use Unix');
  assert.deepEqual(tags, ['unix']);
});

test('extracts multiple tags anywhere in the subject', () => {
  const { subject, tags } = extractTags('#os Why I still use Unix #unix #philosophy');
  assert.equal(subject, 'Why I still use Unix');
  assert.deepEqual(tags, ['os', 'unix', 'philosophy']);
});

test('lowercases and dedupes tags', () => {
  const { tags } = extractTags('Post #Unix #unix #UNIX');
  assert.deepEqual(tags, ['unix']);
});

test('leaves the subject and tags empty for a subject with no tags', () => {
  const { subject, tags } = extractTags('Just a normal subject');
  assert.equal(subject, 'Just a normal subject');
  assert.deepEqual(tags, []);
});

test('collapses leftover whitespace after removing tags', () => {
  const { subject } = extractTags('Why I   #unix  still use Unix   #os  ');
  assert.equal(subject, 'Why I still use Unix');
});

test('handles missing/empty subject without throwing', () => {
  assert.deepEqual(extractTags(''), { subject: '', tags: [] });
  assert.deepEqual(extractTags(undefined), { subject: '', tags: [] });
});

test('only strips "#" sequences that look like tags, e.g. a "#" followed by a space is left alone', () => {
  const { subject, tags } = extractTags('C# tips and tricks #csharp');
  assert.deepEqual(tags, ['csharp']);
  assert.equal(subject, 'C# tips and tricks');
});
