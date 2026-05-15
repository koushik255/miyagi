import { Hono } from "hono";
import { Group, initDatabase, Professor, Project, User } from "./class";
import { handleGitHttp } from "./git-http";

initDatabase();

const app = new Hono();

app.get("/", (c) => c.text("Backend is running"));

app.all("/git/*", handleGitHttp);

app.post("/users", async (c) => {
  const body = await c.req.json<{ deviceHash: string; displayName?: string }>();
  const user = User.createOrGet(body.deviceHash, body.displayName);
  return c.json(user);
});

app.post("/professors", async (c) => {
  const body = await c.req.json<{ deviceHash: string; displayName?: string }>();
  const professor = Professor.createOrGetByDevice(body.deviceHash, body.displayName);
  return c.json(professor);
});

app.post("/groups", async (c) => {
  const body = await c.req.json<{ professorId: string; name: string }>();
  const group = Group.create(body.professorId, body.name);
  return c.json(group);
});

app.post("/groups/join", async (c) => {
  const body = await c.req.json<{ joinCode: string; userId: string }>();
  const member = Group.assignStudent(body.joinCode, body.userId);
  return c.json(member);
});

app.post("/projects", async (c) => {
  const body = await c.req.json<{
    groupId: string;
    assignedByProfessorId: string;
    name: string;
    description?: string;
    assignedStudentId?: string;
    rootPathHint?: string;
    dueDate?: string;
  }>();

  const project = Project.assign(body);
  return c.json(project);
});

export default app;
