#!/usr/bin/env node
// Local command: read an .eml file, write the rendered HTML to output/,
// and regenerate the tag-grouped index from output/posts.json.
// Usage: node src/cli.js ./path/to/message.eml

import fs from 'node:fs';
import path from 'node:path';
import { parseEmail } from './parser.js';
import { renderPost } from './renderer.js';
import { renderIndex } from './siteIndex.js';
import { resolveFilename } from './filename.js';
import { parseManifest, addManifestEntry, serializeManifest } from './manifest.js';

const OUTPUT_DIR = path.join(process.cwd(), 'output');
const POSTS_DIR = path.join(OUTPUT_DIR, 'posts');
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'posts.json');
const INDEX_PATH = path.join(OUTPUT_DIR, 'index.html');

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: node src/cli.js <path-to-email.eml>');
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath);
  const post = await parseEmail(raw);

  console.log('Parsed email:');
  console.log(`  Subject: ${post.subject || '(none)'}`);
  console.log(`  From: ${post.from || '(none)'}`);
  console.log(`  Date: ${post.date || '(none)'}`);
  if (post.tags.length) console.log(`  Tags: ${post.tags.join(', ')}`);
  console.log('');

  fs.mkdirSync(POSTS_DIR, { recursive: true });
  const filename = resolveFilename(post, POSTS_DIR);
  const html = renderPost(post);
  fs.writeFileSync(path.join(POSTS_DIR, filename), html);

  const existingManifestJson = fs.existsSync(MANIFEST_PATH) ? fs.readFileSync(MANIFEST_PATH, 'utf8') : '';
  const manifest = addManifestEntry(parseManifest(existingManifestJson), {
    filename,
    subject: post.subject,
    date: post.date,
    tags: post.tags
  });
  fs.writeFileSync(MANIFEST_PATH, serializeManifest(manifest));
  fs.writeFileSync(INDEX_PATH, renderIndex(manifest));

  console.log('Generated:');
  console.log(`  output/posts/${filename}`);
  console.log('  output/index.html (updated)');
}

main().catch((err) => {
  console.error('Failed to publish email:', err.message);
  process.exit(1);
});
