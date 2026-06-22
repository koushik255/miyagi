import { Course } from "./course";
import { parseCsv } from "./csv";
import { badRequest, notFound } from "./errors";
import { Group } from "./group";
import { requireAssignmentOwnedByProfessor, requireCourseOwnedByProfessor } from "./guards";
import { User } from "./user";

export function importCourseStudents(input: { professorId: string; courseId: string; csv: string }) {
  requireCourseOwnedByProfessor(input.courseId, input.professorId);

  const rows = parseCsv(input.csv);
  const students = rows.map((row) => {
    const name = row.name || row.display_name || "";
    const username = row.username || row.user || row.login || undefined;
    const email = row.email || undefined;
    const password = row.password || username || undefined;
    const studentId = row.student_id || row.studentid || row.id || undefined;
    if (!name) badRequest("Student CSV requires a name column");
    if (!username && !email) badRequest("Student CSV requires a username or email column");
    const user = User.createOrUpdateStudent({ studentId, name, email, username, password });
    Course.assignStudentByCourseId(input.courseId, user.id);
    return user;
  });

  return { importedStudents: students.length, students };
}

export function importAssignmentGroups(input: { professorId: string; assignmentId: string; csv: string }) {
  const assignment = requireAssignmentOwnedByProfessor(input.assignmentId, input.professorId);

  const rows = parseCsv(input.csv);
  const importedGroups = rows.map((row) => {
    const groupName = row.group || row.name;
    const members = row.members;
    const githubUrl = row.github_url || row.github || row.repo || row.repository;
    if (!groupName) badRequest("Group CSV requires a group column");
    if (!members) badRequest("Group CSV requires a members column");
    if (assignment.repositoryMode === "github" && !githubUrl) badRequest(`GitHub assignment group ${groupName} requires github_url`);

    const group = Group.findOrCreateForAssignment({
      professorId: input.professorId,
      assignmentId: input.assignmentId,
      name: groupName,
      githubRepoUrl: githubUrl || undefined,
    });

    const importedMembers = members.split(",").map((member) => {
      const [rawEmail, rawGithub] = member.split(":").map((part) => part.trim());
      if (!rawEmail) badRequest(`Invalid member entry in ${groupName}`);
      const user = User.findByEmailOrStudentId(rawEmail);
      if (!user) notFound(`Student not found for ${rawEmail}`);
      Course.assignStudentByCourseId(assignment.courseId, user.id);
      return Group.assignCourseStudent(group.id, user.id, input.professorId, rawGithub || undefined);
    });

    return { group, importedMembers };
  });

  return { importedGroups: importedGroups.length, groups: importedGroups };
}

export { parseCsv };
