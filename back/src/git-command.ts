const decoder = new TextDecoder();

const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
  GCM_INTERACTIVE: "never",
};

const GIT_BASE_ARGS = [
  "-c",
  "credential.helper=",
  "-c",
  "core.askPass=",
];

function gitError(args: string[], stderr: string): Error {
  const message = stderr || `git ${args.join(" ")} failed`;
  if (
    message.includes("could not read Username")
    || message.includes("Authentication failed")
    || message.includes("Repository not found")
    || message.includes("terminal prompts disabled")
  ) {
    return new Error(`${message}\nGitHub authentication is required or the repository is not accessible. Set GITHUB_TOKEN or use a public repository; the server will not prompt for credentials.`);
  }
  return new Error(message);
}

export function runGit(args: string[]): string {
  const gitArgs = [...GIT_BASE_ARGS, ...args];
  const result = Bun.spawnSync(["git", ...gitArgs], { stdout: "pipe", stderr: "pipe", stdin: "ignore", env: GIT_ENV });
  if (result.success) return decoder.decode(result.stdout).trim();
  const stderr = decoder.decode(result.stderr).trim();
  throw gitError(args, stderr);
}

export function runGitDir(repoPath: string, args: string[]): string {
  const gitArgs = [...GIT_BASE_ARGS, "--git-dir", repoPath, ...args];
  const result = Bun.spawnSync(["git", ...gitArgs], { stdout: "pipe", stderr: "pipe", stdin: "ignore", env: GIT_ENV });
  if (result.success) return decoder.decode(result.stdout);
  const stderr = decoder.decode(result.stderr).trim();
  throw gitError(["--git-dir", repoPath, ...args], stderr);
}
