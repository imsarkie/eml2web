// Turns a normalized post object into the final HTML page.
// Knows nothing about MIME parsing or where the file gets published.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'post.html');

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

function metaLine(label, value) {
  if (!value) return '';
  return `  <div>${escapeHtml(label)}: ${escapeHtml(value)}</div>`;
}

export function renderPost(post) {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  const meta = [
    metaLine('From', post.from),
    metaLine('To', post.to),
    metaLine('Subject', post.subject),
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
  return template
    .replace('{{TITLE}}', () => escapeHtml(title))
    .replace('{{META}}', () => meta)
    .replace('{{BODY}}', () => escapeHtml(post.body));
}
