import { confirm, input, password as passwordPrompt, select } from "@inquirer/prompts";
import { eq } from "drizzle-orm";
import { Professor, User } from "../src/class";
import { db } from "../src/db";
import { professors, users } from "../src/schema";
import { readLoginEnv } from "./env-login";
import { updateSession } from "./session";

export type ActiveProfessor = { id: string; userId: string; displayName: string };
export type ActiveUser = { id: string; displayName: string };

export async function pause() {
  await confirm({ message: "Continue?", default: true });
}

export function findProfessorWithUser(professorId: string): ActiveProfessor | undefined {
  return db
    .select({ id: professors.id, userId: professors.userId, displayName: users.displayName })
    .from(professors)
    .innerJoin(users, eq(professors.userId, users.id))
    .where(eq(professors.id, professorId))
    .get();
}

export async function professorLoginFlow(): Promise<ActiveProfessor> {
  let printedEnvLoginWarning = false;
  const envLogin = await readLoginEnv("./cli/prof.env");
  if (envLogin) {
    const professor = Professor.login(envLogin.username, envLogin.password);
    const active = professor ? findProfessorWithUser(professor.id) : undefined;

    if (active) {
      console.clear();
      const useEnvLogin = await confirm({
        message: `Logging in with prof.env as ${active.displayName}. Is this you? Press Enter for yes.`,
        default: true,
      });

      if (useEnvLogin) {
        await updateSession({ professorId: active.id });
        return active;
      }
    } else {
      console.clear();
      console.log("prof.env credentials did not work. Continuing with normal login.\n");
      printedEnvLoginWarning = true;
    }
  }

  if (!printedEnvLoginWarning) console.clear();
  console.log("Miyagi Professor Login\n");

  const action = await select({
    message: "What do you want to do?",
    choices: [
      { name: "Login", value: "login" },
      { name: "Create professor", value: "create" },
    ],
  });

  const deviceHash = await input({ message: "Professor username/device key:", default: "professor-local" });
  const password = await passwordPrompt({ message: "Password:" });

  if (action === "login") {
    const professor = Professor.login(deviceHash, password);
    if (!professor) throw new Error("Invalid professor username or password");

    await updateSession({ professorId: professor.id });
    const active = findProfessorWithUser(professor.id);
    if (!active) throw new Error("Could not load professor after login");
    return active;
  }

  const displayName = await input({ message: "Display name:", default: "Dr. Smith" });
  const professor = Professor.createOrGetByDevice(deviceHash, displayName, password);
  await updateSession({ professorId: professor.id });

  const active = findProfessorWithUser(professor.id);
  if (!active) throw new Error("Could not load professor after creating it");
  return active;
}

export const createProfessorFlow = professorLoginFlow;

export async function createStudentFlow(): Promise<ActiveUser> {
  console.clear();
  console.log("Create/select student\n");

  const student = await askForStudent("Spencer");
  await updateSession({ studentId: student.id });
  return student;
}

export async function askForStudent(defaultName: string): Promise<ActiveUser> {
  const displayName = await input({ message: "Student name:", default: defaultName });
  const deviceHash = await input({
    message: "Student device/name key:",
    default: displayName.toLowerCase().replaceAll(" ", "-"),
  });

  const user = User.createOrGet(deviceHash, displayName);
  return { id: user.id, displayName: user.displayName };
}
