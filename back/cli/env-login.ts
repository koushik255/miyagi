import { existsSync } from "node:fs";

export type EnvLogin = {
  username: string;
  password: string;
};

export async function readLoginEnv(path: string): Promise<EnvLogin | undefined> {
  if (!existsSync(path)) return undefined;

  const text = await Bun.file(path).text();
  const username = readValue(text, "username");
  const password = readValue(text, "password");

  if (!username || !password) return undefined;
  return { username, password };
}

function readValue(text: string, key: string): string | undefined {
  const line = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith(`${key}:`) || line.startsWith(`${key}=`));

  if (!line) return undefined;

  return line
    .slice(line.indexOf(line.includes(":") ? ":" : "=") + 1)
    .trim()
    .replace(/^['"]|['"]$/g, "");
}
