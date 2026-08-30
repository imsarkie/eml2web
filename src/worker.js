// Sketch of the future Cloudflare Email Worker adapter. Not deployed and
// not exercised by tests - Cloudflare Email Routing isn't configured yet.
// It exists to show that the Worker will be a thin adapter around the
// same parser/renderer/filename/github functions the CLI uses, per the
// README's "Future Cloudflare Architecture" section.

import { parseEmail } from './parser.js';
import { renderPost } from './renderer.js';
import { buildBaseName } from './filename.js';
import { publishToGitHub } from './github.js';
import { config } from './config.js';

export default {
  async email(message) {
    const raw = await new Response(message.raw).arrayBuffer();

    const post = await parseEmail(raw);
    const html = renderPost(post);
    const filename = `${buildBaseName(post)}.html`;

    await publishToGitHub({
      owner: config.github.owner,
      repo: config.github.repo,
      branch: config.github.branch,
      path: `${config.github.postsDir}/${filename}`,
      content: html,
      commitMessage: `Publish: ${post.subject || filename}`,
      token: config.github.token
    });
  }
};
