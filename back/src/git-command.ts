const decoder = new TextDecoder();

export function runGit(args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.success) return decoder.decode(result.stdout).trim();
  const stderr = decoder.decode(result.stderr).trim();
  throw new Error(stderr || `git ${args.join(" ")} failed`);
}

export function runGitDir(repoPath: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "--git-dir", repoPath, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.success) return decoder.decode(result.stdout);
  const stderr = decoder.decode(result.stderr).trim();
  throw new Error(stderr || `git ${args.join(" ")} failed`);
}
