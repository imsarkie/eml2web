// Turns a normalized post object into the final HTML page.
// Knows nothing about MIME parsing or where the file gets published.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from './html.js';
import { formatBody } from './inlineFormat.js';
import { reflowBody } from './reflow.js';

// Computed lazily, not at module load: import.meta.url isn't a usable
// file:// URL in the Cloudflare Worker runtime, and that environment
// never reaches this path anyway (it always passes `template` in below).
function defaultTemplatePath() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.join(__dirname, '..', 'templates', 'post.html');
}

export { escapeHtml };

function metaLine(label, value, className) {
  if (!value) return '';
  const classAttr = className ? ` class="${className}"` : '';
  return `  <div${classAttr}>${escapeHtml(label)}: ${escapeHtml(value)}</div>`;
}

// `template` lets a caller supply the template text directly instead of
// reading it from disk - the Cloudflare Worker adapter has no filesystem,
// so it bundles templates/post.html as a text import and passes it in.
export function renderPost(post, { template } = {}) {
  const templateText = template ?? fs.readFileSync(defaultTemplatePath(), 'utf8');

  const meta = [
    metaLine('From', post.from, 'meta-highlight'),
    metaLine('To', post.to),
    metaLine('Subject', post.subject, 'meta-highlight'),
    metaLine('Tags', Array.isArray(post.tags) && post.tags.length ? post.tags.join(', ') : ''),
    metaLine('Date', post.date),
    metaLine('Message-ID', post.messageId),
    metaLine('In-Reply-To', post.inReplyTo),
    metaLine('References', post.references)
  ]
    .filter(Boolean)
    .join('\n');

  const title = post.subject || '(no subject)';

  // Use function replacers, not string replacers: escaped content can
  // contain "$" sequences that String.replace would otherwise interpret
  // as replacement patterns (e.g. "$&") and silently corrupt the output.
  return templateText
    .replace('{{TITLE}}', () => escapeHtml(title))
    .replace('{{META}}', () => meta)
    .replace('{{BODY}}', () => reflowBody(formatBody(post.body)));
}
