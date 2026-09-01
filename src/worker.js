// Cloudflare Email Worker adapter: the same parser/renderer/filename/github
// functions the CLI uses, wired to Cloudflare's `email()` handler instead
// of argv. Deployed with `wrangler deploy` once Email Routing is set up
// on the target zone (see README, "Email-triggered publishing").
//
// Config comes from `env` (wrangler.toml [vars] + `wrangler secret put`),
// not process.env - the Workers runtime has no process.env of its own.

// Bundled as raw text by the `[[rules]]` entry in wrangler.toml - there is
// no filesystem here, so templates/post.html and templates/archive.html
// can't be read with node:fs.
import templateHtml from '../templates/post.html';
import archiveTemplateHtml from '../templates/archive.html';

import { parseEmail } from './parser.js';
import { renderPost } from './renderer.js';
import { buildBaseName } from './filename.js';
import { publishToGitHub, GitHubPublishError } from './github.js';
import { updateArchive } from './publishArchive.js';
import { isAllowedSender } from './allowlist.js';

export default {
  async email(message, env) {
    // Fails closed: if ALLOWED_SENDER isn't configured, or the sender
    // doesn't match it, drop the message. Not calling forward()/reply()/
    // setReject() leaves the message undelivered - no bounce, no publish.
    if (!isAllowedSender(message.from, env.ALLOWED_SENDER)) {
      console.log(`Dropped email from unauthorized sender: ${message.from}`);
      return;
    }

    // PostalMime.parse() accepts the raw ReadableStream directly.
    const post = await parseEmail(message.raw);
    const html = renderPost(post, { template: templateHtml });
    const filename = `${buildBaseName(post)}.html`;
    const path = `${env.POSTS_DIR || 'posts'}/${filename}`;

    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    const branch = env.GITHUB_BRANCH || 'main';
    const token = env.GITHUB_TOKEN;

    try {
      const result = await publishToGitHub({
        owner,
        repo,
        branch,
        path,
        content: html,
        commitMessage: `Publish: ${post.subject || filename}`,
        token
      });
      console.log(`Published ${result.path} (commit ${result.commitSha})`);

      await updateArchive({
        owner,
        repo,
        branch,
        token,
        entry: {
          filename,
          subject: post.subject,
          date: post.date,
          tags: post.tags,
          author: post.author,
          size: new TextEncoder().encode(html).length
        },
        archiveTemplate: archiveTemplateHtml,
        siteUrl: env.SITE_URL
      });
      console.log('posts.json, archive.html, and feed.xml updated');
    } catch (err) {
      // GitHubPublishError messages are already safe to log (no token).
      console.error(err instanceof GitHubPublishError ? err.message : `Publish failed: ${err.message}`);
      throw err;
    }
  }
};
