import { eq } from "drizzle-orm";
import { Assignment } from "./assignment";
import { Course } from "./course";
import { db } from "./db";
import { Group } from "./group";
import { courses } from "./schema";
import { User } from "./user";

export function parseCsv(csv: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const next = csv[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(field.trim());
      field = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);

  const headers = rows.shift()?.map((header) => header.trim().toLowerCase()) ?? [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])));
}

export function importCourseStudents(input: { professorId: string; courseId: string; csv: string }) {
  const course = db.select().from(courses).where(eq(courses.id, input.courseId)).get();
  if (!course) throw new Error("Course not found");
  if (course.professorId !== input.professorId) throw new Error("Course does not belong to professor");

  const rows = parseCsv(input.csv);
  const students = rows.map((row) => {
    const email = row.email;
    const name = row.name || row.display_name || email;
    const studentId = row.student_id || row.studentid || row.id || undefined;
    if (!email) throw new Error("Student CSV requires an email column");
    const user = User.createOrUpdateStudent({ studentId, name, email });
    Course.assignStudentByCourseId(input.courseId, user.id);
    return user;
  });

  return { importedStudents: students.length, students };
}

export function importAssignmentGroups(input: { professorId: string; assignmentId: string; csv: string }) {
  const assignment = Assignment.findById(input.assignmentId);
  if (!assignment) throw new Error("Assignment not found");
  if (assignment.professorId !== input.professorId) throw new Error("Assignment does not belong to professor");

  const rows = parseCsv(input.csv);
  const importedGroups = rows.map((row) => {
    const groupName = row.group || row.name;
    const members = row.members;
    const githubUrl = row.github_url || row.github || row.repo || row.repository;
    if (!groupName) throw new Error("Group CSV requires a group column");
    if (!members) throw new Error("Group CSV requires a members column");
    if (assignment.repositoryMode === "github" && !githubUrl) throw new Error(`GitHub assignment group ${groupName} requires github_url`);

    const group = Group.findOrCreateForAssignment({
      professorId: input.professorId,
      assignmentId: input.assignmentId,
      name: groupName,
      githubRepoUrl: githubUrl || undefined,
    });

    const importedMembers = members.split(",").map((member) => {
      const [rawEmail, rawGithub] = member.split(":").map((part) => part.trim());
      if (!rawEmail) throw new Error(`Invalid member entry in ${groupName}`);
      const user = User.findByEmailOrStudentId(rawEmail);
      if (!user) throw new Error(`Student not found for ${rawEmail}`);
      Course.assignStudentByCourseId(assignment.courseId, user.id);
      return Group.assignCourseStudent(group.id, user.id, input.professorId, rawGithub || undefined);
    });

    return { group, importedMembers };
  });

  return { importedGroups: importedGroups.length, groups: importedGroups };
}
