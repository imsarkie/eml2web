#!/usr/bin/env node
// Local command: read an .eml file, write the rendered HTML to output/.
// Usage: node src/cli.js ./path/to/message.eml

import fs from 'node:fs';
import path from 'node:path';
import { parseEmail } from './parser.js';
import { renderPost } from './renderer.js';
import { resolveFilename } from './filename.js';

const OUTPUT_DIR = path.join(process.cwd(), 'output');

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
  console.log('');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const filename = resolveFilename(post, OUTPUT_DIR);
  const html = renderPost(post);
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), html);

  console.log('Generated:');
  console.log(`  output/${filename}`);
}

main().catch((err) => {
  console.error('Failed to publish email:', err.message);
  process.exit(1);
});
