import type { Hono } from "hono";
import { unauthorized } from "../errors";
import { Professor } from "../professor";
import { User } from "../user";

export function registerUserRoutes(app: Hono) {
  app.post("/users", async (c) => {
    const body = await c.req.json<{ deviceHash: string; displayName?: string }>();
    return c.json(User.createOrGet(body.deviceHash, body.displayName));
  });

  app.patch("/users/:userId/github", async (c) => {
    const body = await c.req.json<{ githubUsername?: string }>();
    const user = User.findById(c.req.param("userId"));
    if (!user) throw new Error("User not found");
    return c.json(User.setGithubUsername(user.id, body.githubUsername));
  });

  app.post("/professors", async (c) => {
    const body = await c.req.json<{ deviceHash: string; displayName?: string; password?: string }>();
    return c.json(Professor.createOrGetByDevice(body.deviceHash, body.displayName, body.password ?? body.deviceHash));
  });

  app.post("/auth/student/login", async (c) => {
    const body = await c.req.json<{ username: string; password: string }>();
    const user = User.login(body.username, body.password);
    if (!user) unauthorized("Invalid student credentials");
    return c.json(user);
  });

  app.post("/auth/student/register", async (c) => {
    const body = await c.req.json<{ username: string; password: string; displayName?: string }>();
    return c.json(User.createOrGet(body.username, body.displayName, body.username));
  });

  app.post("/auth/professor/login", async (c) => {
    const body = await c.req.json<{ username: string; password: string }>();
    const professor = Professor.login(body.username, body.password);
    if (!professor) unauthorized("Invalid professor credentials");
    return c.json(professor);
  });

  app.post("/auth/professor/register", async (c) => {
    const body = await c.req.json<{ username: string; password: string; displayName?: string }>();
    return c.json(Professor.createOrGetByDevice(body.username, body.displayName, body.username));
  });
}
