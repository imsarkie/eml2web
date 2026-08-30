// Environment-derived config. No credentials ever live in source.

export const config = {
  github: {
    token: process.env.GITHUB_TOKEN || '',
    owner: process.env.GITHUB_OWNER || '',
    repo: process.env.GITHUB_REPO || '',
    branch: process.env.GITHUB_BRANCH || 'main',
    // Path inside the repo that published posts are committed under.
    postsDir: 'posts'
  }
};
