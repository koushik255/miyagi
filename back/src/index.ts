import { Hono } from "hono";
import { cors } from "hono/cors";
import { eq } from "drizzle-orm";
import { Assignment, Course, Group, initDatabase, Professor, Project, User, db } from "./class";
import { handleGitHttp } from "./git-http";
import { GIT_HTTP_BASE_URL } from "./group";
import { getGroupHistory } from "./history";
import { groups } from "./schema";
import { listWorkspaceFiles, readWorkspaceFile } from "./workspace";

initDatabase();
Group.installWorkspaceHooksForAllGroups();

const app = new Hono();

app.use("*", cors());
app.onError((error, c) => c.json({ error: error.message || "Request failed" }, 400));
app.get("/", (c) => c.text("Backend is running"));
app.get("/config", (c) => c.json({
  gitHttpBaseUrl: GIT_HTTP_BASE_URL,
  mode: GIT_HTTP_BASE_URL.includes("localhost") || GIT_HTTP_BASE_URL.includes("127.0.0.1") ? "local" : "tunnel",
}));

app.all("/git/*", handleGitHttp);

app.post("/users", async (c) => {
  const body = await c.req.json<{ deviceHash: string; displayName?: string }>();
  const user = User.createOrGet(body.deviceHash, body.displayName);
  return c.json(user);
});

app.post("/professors", async (c) => {
  const body = await c.req.json<{ deviceHash: string; displayName?: string; password?: string }>();
  const professor = Professor.createOrGetByDevice(body.deviceHash, body.displayName, body.password);
  return c.json(professor);
});

app.post("/auth/student/login", async (c) => {
  const body = await c.req.json<{ username: string; password: string }>();
  const user = User.login(body.username, body.password);
  if (!user) return c.json({ error: "Invalid student credentials" }, 401);
  return c.json(user);
});

app.post("/auth/student/register", async (c) => {
  const body = await c.req.json<{ username: string; password: string; displayName?: string }>();
  const user = User.createOrGet(body.username, body.displayName, body.password);
  return c.json(user);
});

app.post("/auth/professor/login", async (c) => {
  const body = await c.req.json<{ username: string; password: string }>();
  const professor = Professor.login(body.username, body.password);
  if (!professor) return c.json({ error: "Invalid professor credentials" }, 401);
  return c.json(professor);
});

app.post("/auth/professor/register", async (c) => {
  const body = await c.req.json<{ username: string; password: string; displayName?: string }>();
  const professor = Professor.createOrGetByDevice(body.username, body.displayName, body.password);
  return c.json(professor);
});

app.post("/courses", async (c) => {
  const body = await c.req.json<{ professorId: string; name: string }>();
  const course = Course.create(body.professorId, body.name);
  return c.json(course);
});

app.post("/courses/join", async (c) => {
  const body = await c.req.json<{ joinCode: string; userId: string }>();
  const member = Course.assignStudent(body.joinCode, body.userId);
  return c.json(member);
});

app.get("/courses/professor/:professorId", (c) => c.json(Course.listByProfessor(c.req.param("professorId"))));
app.get("/courses/user/:userId", (c) => c.json(Course.listByUser(c.req.param("userId"))));
app.get("/courses/:courseId/members", (c) => c.json(Course.listMembers(c.req.param("courseId"))));
app.get("/courses/:courseId/assignments", (c) => c.json(Assignment.listByCourse(c.req.param("courseId"))));
app.get("/courses/:courseId/groups", (c) => c.json(Group.listByCourse(c.req.param("courseId"))));
app.get("/assignments/:assignmentId/groups", (c) => c.json(Group.listByAssignment(c.req.param("assignmentId"))));
app.get("/groups/user/:userId", (c) => c.json(Group.listByUser(c.req.param("userId"))));

app.get("/groups/:groupId", (c) => {
  const group = db.select().from(groups).where(eq(groups.id, c.req.param("groupId"))).get();
  if (!group) return c.json({ error: "Group not found" }, 404);
  return c.json(Group.withCurrentCloneUrl(group));
});

app.get("/groups/:groupId/members", (c) => c.json(Group.listMembers(c.req.param("groupId"))));

app.get("/groups/:groupId/files", (c) => {
  const group = db.select().from(groups).where(eq(groups.id, c.req.param("groupId"))).get();
  if (!group) return c.json({ error: "Group not found" }, 404);
  if (!group.workspacePath) return c.json([]);
  return c.json(listWorkspaceFiles(group.workspacePath));
});

app.get("/groups/:groupId/files/content", (c) => {
  const group = db.select().from(groups).where(eq(groups.id, c.req.param("groupId"))).get();
  if (!group) return c.json({ error: "Group not found" }, 404);
  if (!group.workspacePath) return c.json({ error: "No workspace path" }, 404);

  const filePath = c.req.query("path");
  if (!filePath) return c.json({ error: "Missing path query" }, 400);

  try {
    return c.json(readWorkspaceFile(group.workspacePath, filePath));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Could not read file" }, 400);
  }
});

app.get("/groups/:groupId/history", (c) => {
  const group = db.select().from(groups).where(eq(groups.id, c.req.param("groupId"))).get();
  if (!group) return c.json({ error: "Group not found" }, 404);
  if (!group.repoPath) return c.json([]);

  try {
    return c.json(getGroupHistory(group));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Could not read history" }, 500);
  }
});

app.post("/assignments", async (c) => {
  const body = await c.req.json<{
    professorId: string;
    courseId: string;
    name: string;
    description?: string;
    dueDate?: string;
  }>();
  const assignment = Assignment.create(body);
  return c.json(assignment);
});

app.post("/groups", async (c) => {
  const body = await c.req.json<{ professorId: string; name: string; assignmentId: string }>();
  const group = Group.create(body.professorId, body.name, body.assignmentId);
  return c.json(group);
});

app.post("/groups/join", async (c) => {
  const body = await c.req.json<{ joinCode: string; userId: string }>();
  const member = Group.assignStudent(body.joinCode, body.userId);
  return c.json(member);
});

app.post("/groups/:groupId/members", async (c) => {
  const body = await c.req.json<{ professorId: string; userId: string }>();
  const member = Group.assignCourseStudent(c.req.param("groupId"), body.userId, body.professorId);
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
