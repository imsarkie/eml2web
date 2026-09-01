import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reflowBody } from '../src/reflow.js';

test('joins consecutive non-blank lines with a single space', () => {
  const html = 'This is a long sentence that got\nhard-wrapped by a mail\nclient mid-thought.';
  assert.equal(reflowBody(html), 'This is a long sentence that got hard-wrapped by a mail client mid-thought.');
});

test('keeps a blank line as a paragraph break', () => {
  const html = 'First paragraph,\nstill wrapping.\n\nSecond paragraph.';
  assert.equal(reflowBody(html), 'First paragraph, still wrapping.\n\nSecond paragraph.');
});

test('keeps a numbered list item on its own line, never merged with the line before or after it', () => {
  const html = 'Some intro text\nthat wraps.\n1. First item\nstill part of item one.\n2. Second item';
  assert.equal(
    reflowBody(html),
    'Some intro text that wraps.\n1. First item\nstill part of item one.\n2. Second item'
  );
});

test('keeps a "---" horizontal rule isolated from the text around it', () => {
  const html = 'Closing line of a section.\n------------------------------\nOpening line of the next.';
  assert.equal(
    reflowBody(html),
    'Closing line of a section.\n------------------------------\nOpening line of the next.'
  );
});

test('leaves HTML already inserted by formatBody (links, emphasis) untouched, only rejoining around it', () => {
  const html = 'Check out my story\n<a href="https://example.com/post">https://example.com/post</a>\nabout it.';
  assert.equal(
    reflowBody(html),
    'Check out my story <a href="https://example.com/post">https://example.com/post</a> about it.'
  );
});

test('collapses leading indentation on wrapped continuation lines', () => {
  const html = '1. <em>Pick a window seat.</em>\n    Choose the seat opposite the direction of travel.';
  assert.equal(reflowBody(html), '1. <em>Pick a window seat.</em>\nChoose the seat opposite the direction of travel.');
});

test('leaves a single-paragraph body with no line breaks untouched', () => {
  assert.equal(reflowBody('plain text body'), 'plain text body');
});

test('collapses multiple consecutive blank lines to a single paragraph break', () => {
  const html = 'First.\n\n\nSecond.';
  assert.equal(reflowBody(html), 'First.\n\nSecond.');
});
