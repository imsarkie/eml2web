import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPost, escapeHtml } from '../src/renderer.js';

function basePost(overrides = {}) {
  return {
    from: 'a@example.com',
    to: '',
    subject: 'Test subject',
    date: '',
    messageId: '',
    inReplyTo: '',
    references: '',
    body: 'hello',
    ...overrides
  };
}

test('escapeHtml escapes all five dangerous characters', () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  assert.equal(escapeHtml(`it's & <b>`), 'it&#39;s &amp; &lt;b&gt;');
});

test('escapeHtml handles null/undefined without throwing', () => {
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(null), '');
});

test('every escaped field appears nowhere as live markup in the rendered page', () => {
  const post = basePost({
    from: '<script>alert(1)</script>',
    to: '<img src=x onerror=alert(1)>',
    subject: '<script>alert("x")</script>',
    date: '<b>2026</b>',
    messageId: '<script>x</script>',
    inReplyTo: '<script>y</script>',
    references: '<script>z</script>',
    body: '<script>alert("body")</script>'
  });

  const html = renderPost(post);

  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img /);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/); // present, but inert as escaped text
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/); // subject, escaped
  assert.match(html, /<pre class="email-body">&lt;script&gt;alert\(&quot;body&quot;\)&lt;\/script&gt;<\/pre>/);
});

test('body is rendered inside a <pre class="email-body"> element', () => {
  const html = renderPost(basePost({ body: 'plain text body' }));
  assert.match(html, /<pre class="email-body">plain text body<\/pre>/);
});

test('keeps blank lines as paragraph breaks but reflows a hard-wrapped line into its neighbor', () => {
  // See src/reflow.js: a single line break with no blank line between is
  // treated as mail-client wrap, not an intentional break, and joined.
  const body = 'line one\n\n  indented line\nline three';
  const html = renderPost(basePost({ body }));
  const match = html.match(/<pre class="email-body">([\s\S]*?)<\/pre>/);
  assert.ok(match, 'expected a <pre class="email-body"> block');
  assert.equal(match[1], 'line one\n\nindented line line three');
});

test('omits meta lines for absent optional fields instead of printing them blank', () => {
  const html = renderPost(basePost({ to: '', messageId: '', inReplyTo: '', references: '' }));
  assert.doesNotMatch(html, /To:/);
  assert.doesNotMatch(html, /Message-ID:/);
  assert.doesNotMatch(html, /In-Reply-To:/);
  assert.doesNotMatch(html, /References:/);
  assert.match(html, /From: a@example\.com/);
});

test('includes meta lines when the optional fields are present', () => {
  const html = renderPost(basePost({ to: 'b@example.com', messageId: '<id@example.com>' }));
  assert.match(html, /To: b@example\.com/);
  assert.match(html, /Message-ID: &lt;id@example\.com&gt;/);
});

test('uses "(no subject)" as the title when subject is missing', () => {
  const html = renderPost(basePost({ subject: '' }));
  assert.match(html, /<title>\(no subject\)<\/title>/);
});

test('does not corrupt output when escaped content contains "$"-style replacement patterns', () => {
  const html = renderPost(basePost({ subject: '$& $$ $1 test', body: 'body $& text' }));
  assert.match(html, /<title>\$&amp; \$\$ \$1 test<\/title>/);
  assert.match(html, /<pre class="email-body">body \$&amp; text<\/pre>/);
});
