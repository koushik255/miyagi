import app from "../src/index";

const JSON_HEADERS = { "content-type": "application/json" };

type ProfessorResponse = { id: string; pageSlug: string; user: { displayName: string } };
type CourseResponse = { id: string; name: string; joinCode: string };
type AssignmentResponse = { id: string; name: string };
type UserResponse = { id: string; deviceHash: string; displayName: string; email?: string | null; githubUsername?: string | null };
type GroupImportResponse = { importedGroups: number; groups: Array<{ group: { id: string; name: string; githubRepoUrl: string | null }; importedMembers: Array<{ userId: string; githubUsername: string | null }> }> };

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await app.request(path, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}

const professorInput = {
  username: "koushik",
  password: "password123",
  displayName: "Koushik Test Professor",
};

const students = [
  { username: "khed3455@example.com", password: "password123", displayName: "Khed Student", github: "koushik255" },
  { username: "partner@example.com", password: "password123", displayName: "Partner Student", github: "partnergit" },
  { username: "noah.patel@example.com", password: "password123", displayName: "Noah Patel", github: "noahpatel" },
  { username: "mia.chen@example.com", password: "password123", displayName: "Mia Chen", github: "miachen" },
  { username: "solo.student@example.com", password: "password123", displayName: "Solo Student", github: "sologit" },
];

const professor = await post<ProfessorResponse>("/auth/professor/register", professorInput);
const course = await post<CourseResponse>("/courses", { professorId: professor.id, name: "Miyagi Testing 101" });
const assignment = await post<AssignmentResponse>("/assignments", {
  professorId: professor.id,
  courseId: course.id,
  name: "GitHub Group Project",
  description: "Seeded assignment for testing group CSV onboarding.",
});

const createdStudents: UserResponse[] = [];
for (const studentInput of students) {
  const user = await post<UserResponse>("/auth/student/register", studentInput);
  await post("/courses/join", { userId: user.id, joinCode: course.joinCode });
  createdStudents.push(user);
}

const groupCsv = [
  "|Team Alpha|{khed3455@example.com:koushik255}{partner@example.com:partnergit}|https://github.com/koushik255/testingtesting.git|",
  "|Team Beta|{noah.patel@example.com:noahpatel}{mia.chen@example.com:miachen}|https://github.com/example-org/team-beta|",
  "|Solo Team|{solo.student@example.com:sologit}|https://github.com/example-org/solo-team|",
].join("\n");

const importResult = await post<GroupImportResponse>(`/assignments/${assignment.id}/import-groups`, {
  professorId: professor.id,
  csv: groupCsv,
});

console.log("Seeded Miyagi testing course");
console.log("");
console.log("Professor login");
console.log(`  username: ${professorInput.username}`);
console.log(`  password: ${professorInput.password}`);
console.log(`  page: /professor-pages/${professor.pageSlug}`);
console.log("");
console.log("Course");
console.log(`  name: ${course.name}`);
console.log(`  join code: ${course.joinCode}`);
console.log(`  assignment: ${assignment.name}`);
console.log("");
console.log("Student logins");
for (const student of students) {
  console.log(`  ${student.username} / ${student.password} / GitHub ${student.github}`);
}
console.log("");
console.log("Imported groups");
for (const entry of importResult.groups) {
  console.log(`  ${entry.group.name}: ${entry.group.githubRepoUrl}`);
}
console.log("");
console.log(`Reset and reseed with: cd back && bun run ${process.env.DB_PATH?.includes("test-session") ? "setup:test-session" : "setup:test-course"}`);
