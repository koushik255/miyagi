import { existsSync } from "node:fs";

const SESSION_PATH = new URL("./.session.json", import.meta.url).pathname;

export type CliSession = {
  professorId?: string;
  studentId?: string;
};

export async function readSessionAsync(): Promise<CliSession> {
  if (!existsSync(SESSION_PATH)) return {};
  return Bun.file(SESSION_PATH).json().catch(() => ({}));
}

export async function writeSession(session: CliSession) {
  await Bun.write(SESSION_PATH, `${JSON.stringify(session, null, 2)}\n`);
}

export async function updateSession(update: CliSession) {
  const current = await readSessionAsync();
  await writeSession({ ...current, ...update });
}
