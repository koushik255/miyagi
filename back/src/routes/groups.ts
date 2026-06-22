import type { Hono } from "hono";
import { badRequest, forbidden, notFound } from "../errors";
import { getGroupDashboard } from "../dashboard";
import type { DashboardPeriod } from "../dashboard-time";
import { getGroupGithubActivity, syncGroupGithubMirror } from "../github";
import { Group } from "../group";
import { getGroupDiff, getGroupHistory } from "../history";

export function registerGroupRoutes(app: Hono) {
  app.get("/groups/user/:userId", (c) => c.json(Group.listByUser(c.req.param("userId"))));

  app.get("/groups/:groupId", (c) => {
    const group = Group.findById(c.req.param("groupId"));
    if (!group) notFound("Group not found");
    return c.json(group);
  });

  app.get("/groups/:groupId/members", (c) => c.json(Group.listMembers(c.req.param("groupId"))));

  app.patch("/groups/:groupId/github", async (c) => {
    const body = await c.req.json<{ professorId: string; githubRepoUrl: string }>();
    const group = Group.findById(c.req.param("groupId"));
    if (!group) notFound("Group not found");
    if (group.professorId !== body.professorId) forbidden("Group does not belong to professor");
    const updated = Group.updateGithubRepository(group.id, body.githubRepoUrl);
    if (!updated) badRequest("Could not connect GitHub repository");
    return c.json(await syncGroupGithubMirror(updated.id));
  });

  app.post("/groups/:groupId/github/fetch", async (c) => {
    const group = Group.findById(c.req.param("groupId"));
    if (!group) notFound("Group not found");
    return c.json(await syncGroupGithubMirror(group.id));
  });

  app.get("/groups/:groupId/dashboard", async (c) => {
    const period = (c.req.query("period") as DashboardPeriod) || "semester";
    return c.json(await getGroupDashboard(c.req.param("groupId"), period));
  });

  app.get("/groups/:groupId/github/activity", async (c) => c.json(await getGroupGithubActivity(c.req.param("groupId"))));

  app.get("/groups/:groupId/history", (c) => {
    const group = Group.findById(c.req.param("groupId"));
    if (!group) notFound("Group not found");
    if (!group.repoPath) return c.json([]);
    return c.json(getGroupHistory(group));
  });

  app.get("/groups/:groupId/diff", (c) => {
    const group = Group.findById(c.req.param("groupId"));
    if (!group) notFound("Group not found");
    if (!group.repoPath) notFound("No repository path");
    return c.json(getGroupDiff(group, {
      base: c.req.query("base"),
      commit: c.req.query("commit"),
      head: c.req.query("head"),
    }));
  });

  app.post("/groups", async (c) => {
    const body = await c.req.json<{ professorId: string; name: string; assignmentId: string }>();
    return c.json(Group.create(body.professorId, body.name, body.assignmentId));
  });

  app.post("/groups/join", async (c) => {
    const body = await c.req.json<{ joinCode: string; userId: string }>();
    return c.json(Group.assignStudent(body.joinCode, body.userId));
  });

  app.post("/groups/:groupId/members", async (c) => {
    const body = await c.req.json<{ professorId: string; userId: string }>();
    return c.json(Group.assignCourseStudent(c.req.param("groupId"), body.userId, body.professorId));
  });
}
