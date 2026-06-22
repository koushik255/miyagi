import { badRequest } from "./errors";

export type GitHubRepositorySlug = { owner: string; repo: string };

export function parseGithubRepoUrl(url?: string): GitHubRepositorySlug | undefined {
  if (!url) return undefined;
  const match = url.trim().match(/github\.com[:/]([^/]+)\/([^/.#?]+)(?:\.git)?/i);
  if (!match) badRequest(`Invalid GitHub URL: ${url}`);
  return { owner: match[1], repo: match[2] };
}
