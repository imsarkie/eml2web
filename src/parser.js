// Turns a raw RFC822/MIME email into the small "normalized post" object
// used by the rest of the pipeline. Knows nothing about HTML, files, or Git.

import PostalMime from 'postal-mime';
import { extractTags } from './tags.js';

const NO_TEXT_BODY_MESSAGE = '(no plain-text body available)';

function formatAddress(addr) {
  if (!addr) return '';
  if (addr.group) {
    return addr.group.map(formatAddress).filter(Boolean).join(', ');
  }
  if (!addr.address) return '';
  return addr.name ? `${addr.name} <${addr.address}>` : addr.address;
}

function formatAddressList(list) {
  if (!Array.isArray(list)) return '';
  return list.map(formatAddress).filter(Boolean).join(', ');
}

// Just the sender's display name, with no "<address>" - for the archive
// index's "(Author)" listing (src/archive.js), not the post page itself
// (which shows the full `from` address in its meta block).
function authorName(addr) {
  if (!addr) return '';
  if (addr.group) {
    return addr.group.map(authorName).filter(Boolean).join(', ');
  }
  return addr.name || addr.address || '';
}

// postal-mime normalizes `date` to ISO 8601. Prefer the raw Date header
// for display, since old-school archives read better with the original
// "Sun, 30 Aug 2026 10:00:00 -0700" style formatting.
function getRawHeader(email, key) {
  const found = (email.headers || []).find((h) => h.key === key.toLowerCase());
  return found ? found.value : '';
}

export async function parseEmail(raw) {
  const email = await PostalMime.parse(raw);

  const text = typeof email.text === 'string' ? email.text : '';
  const body = text.trim().length > 0 ? text : NO_TEXT_BODY_MESSAGE;
  const { subject, tags } = extractTags(email.subject || '');

  return {
    from: formatAddress(email.from),
    author: authorName(email.from),
    to: formatAddressList(email.to),
    subject,
    tags,
    date: getRawHeader(email, 'date') || email.date || '',
    messageId: email.messageId || '',
    inReplyTo: email.inReplyTo || '',
    references: email.references || '',
    body
  };
}
