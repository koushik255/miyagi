import { beforeEach, describe, expect, test } from "bun:test";
import app from "./index";
import { sqlite } from "./db";

const JSON_HEADERS = { "content-type": "application/json" };

beforeEach(() => {
  for (const table of [
    "commit_activities",
    "pushed_commits",
    "file_nodes",
    "repositories",
    "projects",
    "group_members",
    "groups",
    "course_calendar_items",
    "assignments",
    "course_members",
    "courses",
    "professors",
    "users",
  ]) {
    sqlite.run(`DELETE FROM ${table}`);
  }
});

async function postJson<T>(path: string, body: unknown, expectedStatus = 200): Promise<T> {
  const response = await app.request(path, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
  expect(response.status).toBe(expectedStatus);
  return response.json() as Promise<T>;
}

async function patchJson<T>(path: string, body: unknown, expectedStatus = 200): Promise<T> {
  const response = await app.request(path, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(body) });
  expect(response.status).toBe(expectedStatus);
  return response.json() as Promise<T>;
}

type UserResponse = { id: string; deviceHash: string; password: string | null };
type ProfessorResponse = { id: string; userId: string };
type CourseResponse = { id: string; professorId: string; joinCode: string };
type AssignmentResponse = { id: string; courseId: string; professorId: string };
type GroupResponse = { id: string; courseId: string; assignmentId: string; professorId: string; joinCode: string; githubRepoUrl: string | null };
type MemberResponse = { id?: string; userId: string; groupId?: string; courseId?: string };
type ProjectResponse = { id: string; groupId: string; assignedStudentId: string | null };

describe("backend routes", () => {
  test("student password matches username for now", async () => {
    const user = await postJson<UserResponse>("/auth/student/register", { username: "ada", password: "ignored", displayName: "Ada" });
    expect(user.password).toBe("ada");

    const login = await postJson<UserResponse>("/auth/student/login", { username: "ada", password: "ada" });
    expect(login.id).toBe(user.id);

    await postJson<{ error: string }>("/auth/student/login", { username: "ada", password: "ignored" }, 401);
  });

  test("course, assignment, group, membership, and project routes share service boundaries", async () => {
    const professor = await postJson<ProfessorResponse>("/auth/professor/register", { username: "prof", password: "ignored", displayName: "Professor" });
    const course = await postJson<CourseResponse>("/courses", { professorId: professor.id, name: "CS 101" });
    const student = await postJson<UserResponse>("/auth/student/register", { username: "student", password: "ignored", displayName: "Student" });

    const courseMember = await postJson<MemberResponse>("/courses/join", { userId: student.id, joinCode: course.joinCode });
    expect(courseMember.courseId).toBe(course.id);

    const assignment = await postJson<AssignmentResponse>("/assignments", { professorId: professor.id, courseId: course.id, name: "Project 1" });
    const group = await postJson<GroupResponse>("/groups", { professorId: professor.id, assignmentId: assignment.id, name: "Team One" });
    const groupMember = await postJson<MemberResponse>("/groups/join", { userId: student.id, joinCode: group.joinCode });
    expect(groupMember.groupId).toBe(group.id);

    const groupsForAssignmentResponse = await app.request(`/assignments/${assignment.id}/groups`);
    expect(groupsForAssignmentResponse.status).toBe(200);
    const groupsForAssignment = await groupsForAssignmentResponse.json() as GroupResponse[];
    expect(groupsForAssignment.map((entry) => entry.id)).toContain(group.id);

    const groupsForUserResponse = await app.request(`/groups/user/${student.id}`);
    expect(groupsForUserResponse.status).toBe(200);
    const groupsForUser = await groupsForUserResponse.json() as Array<GroupResponse & { role: string }>;
    expect(groupsForUser[0]?.role).toBe("student");

    const project = await postJson<ProjectResponse>("/projects", {
      groupId: group.id,
      assignedByProfessorId: professor.id,
      assignedStudentId: student.id,
      name: "Implementation",
    });
    expect(project.assignedStudentId).toBe(student.id);
  });

  test("ownership and membership failures return route-level statuses", async () => {
    const owner = await postJson<ProfessorResponse>("/auth/professor/register", { username: "owner", password: "ignored" });
    const intruder = await postJson<ProfessorResponse>("/auth/professor/register", { username: "intruder", password: "ignored" });
    const course = await postJson<CourseResponse>("/courses", { professorId: owner.id, name: "CS 102" });
    const assignment = await postJson<AssignmentResponse>("/assignments", { professorId: owner.id, courseId: course.id, name: "Project 2" });
    const group = await postJson<GroupResponse>("/groups", { professorId: owner.id, assignmentId: assignment.id, name: "Team Two" });
    const outsider = await postJson<UserResponse>("/auth/student/register", { username: "outsider", password: "ignored" });

    await postJson<{ error: string }>("/assignments", { professorId: intruder.id, courseId: course.id, name: "Bad" }, 403);
    await postJson<{ error: string }>("/projects", { groupId: group.id, assignedByProfessorId: owner.id, assignedStudentId: outsider.id, name: "Bad" }, 403);
    await patchJson<{ error: string }>(`/groups/${group.id}/github`, { professorId: intruder.id, githubRepoUrl: "https://github.com/a/b" }, 403);
  });
});
