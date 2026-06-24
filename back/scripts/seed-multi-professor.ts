import app from "../src/index";

const JSON_HEADERS = { "content-type": "application/json" };

async function post(path: string, body: unknown) {
  const response = await app.request(path, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
  return response.json();
}

const professors = [
  { username: "prof-smith", password: "password123", displayName: "Professor Smith", course: "Intro to Software" },
  { username: "prof-lee", password: "password123", displayName: "Professor Lee", course: "Web Systems" },
];

for (const professorInput of professors) {
  const professor = await post("/auth/professor/register", professorInput) as { id: string; pageSlug: string };
  const course = await post("/courses", { professorId: professor.id, name: professorInput.course }) as { id: string; joinCode: string };
  await post(`/courses/${course.id}/import-students`, {
    professorId: professor.id,
    csv: [
      "name,username,email,password",
      `${professorInput.displayName} Student One,${professorInput.username}-student-1,${professorInput.username}-student-1@example.edu,password123`,
      `${professorInput.displayName} Student Two,${professorInput.username}-student-2,${professorInput.username}-student-2@example.edu,password123`,
    ].join("\n"),
  });
  console.log(`${professorInput.displayName}: /professor-pages/${professor.pageSlug} course ${course.joinCode}`);
}
