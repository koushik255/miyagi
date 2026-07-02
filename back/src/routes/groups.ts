import type { Hono } from "hono";
import { badRequest, forbidden, notFound } from "../errors";
import { getGroupDashboard } from "../dashboard";
import type { DashboardPeriod } from "../dashboard-time";
import { addGithubCollaborator, createGithubRepository, getGithubRepository, getGroupGithubActivity, getGroupGithubRepositoryAccess, syncGroupGithubMirror } from "../github";
import { parseGithubRepoUrl } from "../github-url";
import { Group } from "../group";
import { Professor } from "../professor";
import { getGroupDiff, getGroupHistory } from "../history";
import { User } from "../user";


function normalizeRepositoryName(value: string) {
  const name = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
  return name || `miyagi-${crypto.randomUUID().slice(0, 8)}`;
}

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

  app.patch("/groups/:groupId/github/student", async (c) => {
    const body = await c.req.json<{ userId: string; githubRepoUrl: string }>();
    const group = Group.findById(c.req.param("groupId"));
    if (!group) notFound("Group not found");
    const user = User.findById(body.userId);
    if (!user) notFound("User not found");
    if (Professor.findByUserId(user.id)) forbidden("Professor accounts cannot select student repositories");
    const githubAccount = User.githubConnection(body.userId);
    if (!githubAccount) forbidden("Student must connect GitHub before selecting a repository");
    const parsed = parseGithubRepoUrl(body.githubRepoUrl);
    if (!parsed) badRequest("GitHub repository URL is required");
    let repository;
    try {
      repository = await getGithubRepository(parsed.owner, parsed.repo, githubAccount.accessToken);
    } catch {
      forbidden("GitHub repository is not accessible with this student account");
    }
    return c.json(Group.connectStudentGithubRepository({
      groupId: group.id,
      userId: body.userId,
      githubRepoUrl: repository.htmlUrl,
    }));
  });

  app.post("/groups/:groupId/github/student/create", async (c) => {
    const body = await c.req.json<{ userId: string; name?: string; private?: boolean }>();
    const group = Group.findById(c.req.param("groupId"));
    if (!group) notFound("Group not found");
    const user = User.findById(body.userId);
    if (!user) notFound("User not found");
    if (Professor.findByUserId(user.id)) forbidden("Professor accounts cannot create student repositories");
    if (!Group.findMember(user.id, group.id)) forbidden("Student must belong to the group before creating a repository");
    const githubAccount = User.githubConnection(user.id);
    if (!githubAccount) forbidden("Student must connect GitHub before creating a repository");

    const repository = await createGithubRepository(githubAccount.accessToken, {
      name: normalizeRepositoryName(body.name ?? group.name),
      private: body.private ?? true,
      description: `Miyagi repository for ${group.name}`,
    });

    const invited: string[] = [];
    const skipped: Array<{ userId: string; displayName: string; reason: string }> = [];
    for (const member of Group.listMembers(group.id)) {
      if (member.userId === user.id) continue;
      if (!member.githubUsername) {
        skipped.push({ userId: member.userId, displayName: member.displayName, reason: "missing_github_username" });
        continue;
      }
      try {
        await addGithubCollaborator(githubAccount.accessToken, repository.owner, repository.name, member.githubUsername);
        invited.push(member.githubUsername);
      } catch {
        skipped.push({ userId: member.userId, displayName: member.displayName, reason: "invite_failed" });
      }
    }

    const updatedGroup = Group.connectStudentGithubRepository({
      groupId: group.id,
      userId: user.id,
      githubRepoUrl: repository.htmlUrl,
    });
    return c.json({ group: updatedGroup, invited, skipped });
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

  app.get("/groups/:groupId/github/access", async (c) => c.json(await getGroupGithubRepositoryAccess(c.req.param("groupId"))));

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
