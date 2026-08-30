import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBody } from '../src/inlineFormat.js';

test('converts *word* to <strong>', () => {
  assert.equal(formatBody('*Pick a window seat.*'), '<strong>Pick a window seat.</strong>');
});

test('converts _word_ to <em>', () => {
  assert.equal(formatBody('this is _important_ here'), 'this is <em>important</em> here');
});

test('a lone, unpaired "*" is left alone rather than matched against something far away', () => {
  assert.equal(formatBody('3 * 4 = 12'), '3 * 4 = 12');
});

test('a genuinely paired "_..._" is treated as italic even inside an identifier-looking word (known trade-off, same as Markdown)', () => {
  assert.equal(formatBody('snake_case_name'), 'snake<em>case</em>name');
});

test('emphasis does not cross a newline', () => {
  const input = '*start\nend*';
  assert.equal(formatBody(input), '*start\nend*');
});

test('linkifies a bare https URL', () => {
  assert.equal(
    formatBody('see https://example.com/path for more'),
    'see <a href="https://example.com/path">https://example.com/path</a> for more'
  );
});

test('linkifies a <bracket-wrapped> URL and drops the brackets', () => {
  assert.equal(
    formatBody('a story <https://example.com/x> about it'),
    'a story <a href="https://example.com/x">https://example.com/x</a> about it'
  );
});

test('trims trailing sentence punctuation off a bare URL instead of linking it', () => {
  assert.equal(
    formatBody('see https://example.com/page.'),
    'see <a href="https://example.com/page">https://example.com/page</a>.'
  );
});

test('preserves "&" inside a URL as a correctly escaped "&amp;" in both href and text', () => {
  const html = formatBody('https://example.com/x?a=1&b=2');
  assert.equal(html, '<a href="https://example.com/x?a=1&amp;b=2">https://example.com/x?a=1&amp;b=2</a>');
});

test('a URL containing underscores is never corrupted by the italic pass', () => {
  const html = formatBody('<https://example.com/a_b_c>');
  assert.equal(html, '<a href="https://example.com/a_b_c">https://example.com/a_b_c</a>');
});

test('a plain number in prose is not mistaken for a link placeholder', () => {
  assert.equal(formatBody('I have 42 apples and 7 oranges.'), 'I have 42 apples and 7 oranges.');
});

test('dangerous HTML stays escaped and inert even inside emphasis or near a link', () => {
  const html = formatBody('<script>alert(1)</script> *bold <script>* still safe');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /<strong>bold &lt;script&gt;<\/strong>/);
});

test('a bold span wrapping a link nests correctly', () => {
  assert.equal(
    formatBody('*see <https://example.com>*'),
    '<strong>see <a href="https://example.com">https://example.com</a></strong>'
  );
});

test('leaves plain text with no emphasis or links untouched (aside from escaping)', () => {
  assert.equal(formatBody('Just a normal sentence.'), 'Just a normal sentence.');
});
