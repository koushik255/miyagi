import { Course } from "./course";
import { parseCsv } from "./csv";
import { badRequest, notFound } from "./errors";
import { Group } from "./group";
import { requireAssignmentOwnedByProfessor, requireCourseOwnedByProfessor } from "./guards";
import { User } from "./user";


type ImportedStudent = ReturnType<typeof User.toPublicUser> & {
  temporaryPassword?: string;
}

function normalizeLookup(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
}

function randomFourDigits(): string {
  return String(Math.floor(Math.random() * 10_000)).padStart(4, "0");
}

function generatedCredentialForName(name: string, fallback: string): string {
  const base = (name.trim() || fallback)
    .replace(/[^a-zA-Z0-9]+/g, "")
    .slice(0, 24) || "Student";

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `${base}${randomFourDigits()}`;
    if (!User.findByDeviceHash(candidate)) return candidate;
  }

  return `${base}${randomFourDigits()}`;
}

function findExistingImportedStudent(input: { studentId?: string; username?: string; email?: string }) {
  const username = normalizeLookup(input.username);
  const email = input.email?.trim() || (username ? `${username}@example.edu` : undefined);
  return (username ? User.findByDeviceHash(username) : undefined)
    ?? (email ? User.findByEmail(email) : undefined)
    ?? (input.studentId ? User.findByStudentId(input.studentId) : undefined);
}

function toImportedStudent(user: ReturnType<typeof User.createOrUpdateStudent>, temporaryPassword?: string): ImportedStudent {
  return {
    ...User.toPublicUser(user),
    ...(temporaryPassword ? { temporaryPassword } : {}),
  };
}

export function importCourseStudents(input: { professorId: string; courseId: string; csv: string }) {
  requireCourseOwnedByProfessor(input.courseId, input.professorId);

  const rows = parseCsv(input.csv);
  const students = rows.map((row) => {
    const name = row.name || row.display_name || "";
    const username = row.username || row.user || row.login || undefined;
    const email = row.email || undefined;
    const studentId = row.student_id || row.studentid || row.id || undefined;
    if (!name) badRequest("Student CSV requires a name column");
    if (!username && !email) badRequest("Student CSV requires a username or email column");

    const existingStudent = findExistingImportedStudent({ studentId, username, email });
    const generatedCredential = existingStudent ? undefined : generatedCredentialForName(name, username ?? email ?? studentId ?? name);
    const nextUsername = existingStudent?.deviceHash ?? generatedCredential!;
    const temporaryPassword = existingStudent ? undefined : nextUsername;
    const user = User.createOrUpdateStudent({
      studentId,
      name,
      email,
      username: nextUsername,
      password: undefined,
      temporaryPassword,
    });
    Course.assignStudentByCourseId(input.courseId, user.id);
    return toImportedStudent(user, temporaryPassword);
  });

  return { importedStudents: students.length, students };
}


type AssignmentGroupMemberImport = {
  lookup: string;
  githubUsername?: string;
}

type AssignmentGroupImportRow = {
  groupName?: string;
  members: AssignmentGroupMemberImport[];
  githubUrl?: string;
}

function groupNameForRow(explicitName: string | undefined, githubUrl: string | undefined, rowIndex: number): string {
  const name = explicitName?.trim();
  if (name) return name;

  const repoName = githubUrl?.trim().match(/github\.com[:/][^/]+\/([^/.#?]+)(?:\.git)?/i)?.[1];
  return repoName || `Group ${rowIndex + 1}`;
}

function parseAssignmentGroupMembers(value: string, rowLabel: string): AssignmentGroupMemberImport[] {
  const members = value.trim();
  if (!members) badRequest(`Group CSV row ${rowLabel} requires members`);

  if (members.includes("{")) {
    const parsed: AssignmentGroupMemberImport[] = [];
    const consumed: string[] = [];
    const memberPattern = /\{([^:{}]+):([^{}:]+)\}/g;
    let match: RegExpExecArray | null;

    while ((match = memberPattern.exec(members)) !== null) {
      consumed.push(match[0]);
      parsed.push({ lookup: match[1].trim(), githubUsername: match[2].trim() || undefined });
    }

    const remainder = consumed.reduce((remaining, entry) => remaining.replace(entry, ""), members).replace(/[,\s]/g, "");
    if (parsed.length === 0 || remainder) badRequest(`Invalid member entries in group CSV row ${rowLabel}`);
    return parsed;
  }

  return members.split(",").map((member) => {
    const [rawLookup, rawGithub] = member.split(":").map((part) => part.trim());
    if (!rawLookup) badRequest(`Invalid member entry in group CSV row ${rowLabel}`);
    return { lookup: rawLookup, githubUsername: rawGithub || undefined };
  });
}

function parsePipedAssignmentGroupRows(csv: string): AssignmentGroupImportRow[] {
  return csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line, index) => {
      const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
      if (cells.length < 2) badRequest(`Invalid group CSV row ${index + 1}`);

      const [groupName, members, githubUrl] = cells.length >= 3
        ? [cells[0], cells[1], cells[2]]
        : [undefined, cells[0], cells[1]];
      return {
        groupName,
        members: parseAssignmentGroupMembers(members, String(index + 1)),
        githubUrl,
      };
    });
}

function parseAssignmentGroupRows(csv: string): AssignmentGroupImportRow[] {
  if (csv.split(/\r?\n/).some((line) => line.trim().startsWith("|"))) return parsePipedAssignmentGroupRows(csv);

  const rows = parseCsv(csv);

  return rows.map((row, index) => {
    const groupName = row.group || row.name || undefined;
    const members = row.members || row.students || "";
    const githubUrl = row.github_url || row.github || row.repo || row.repository || undefined;
    return {
      groupName,
      members: parseAssignmentGroupMembers(members, groupName || String(index + 1)),
      githubUrl,
    };
  });
}

export function importAssignmentGroups(input: { professorId: string; assignmentId: string; csv: string }) {
  const assignment = requireAssignmentOwnedByProfessor(input.assignmentId, input.professorId);

  const rows = parseAssignmentGroupRows(input.csv);
  const importedGroups = rows.map((row, index) => {
    const githubUrl = row.githubUrl;
    const groupName = groupNameForRow(row.groupName, githubUrl, index);
    if (assignment.repositoryMode === "github" && !githubUrl) badRequest(`GitHub assignment group ${groupName} requires github_url`);

    const group = Group.findOrCreateForAssignment({
      professorId: input.professorId,
      assignmentId: input.assignmentId,
      name: groupName,
      githubRepoUrl: githubUrl || undefined,
    });

    const importedMembers = row.members.map((member) => {
      const user = User.findByEmailOrStudentId(member.lookup);
      if (!user) notFound(`Student not found for ${member.lookup}`);
      if (member.githubUsername) User.setGithubUsername(user.id, member.githubUsername);
      Course.assignStudentByCourseId(assignment.courseId, user.id);
      return Group.assignCourseStudent(group.id, user.id, input.professorId, member.githubUsername);
    });

    return { group, importedMembers };
  });

  return { importedGroups: importedGroups.length, groups: importedGroups };
}

export { parseCsv };
