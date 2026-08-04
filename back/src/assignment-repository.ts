import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { assignmentRepositories, assignments, db, nowIso, users } from "./db";
import { AppError, badRequest, forbidden, notFound, trySync } from "./errors";
import { getGithubRepository, parseGithubRepoUrl, readGithubCommitCache } from "./github";
import { Professor } from "./professor";

export type AssignmentRepository = typeof assignmentRepositories.$inferSelect;
export type NewAssignmentRepository = typeof assignmentRepositories.$inferInsert;

const normalizeGithubUsername = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

function requireAssignmentOwnedByProfessor(assignmentId: string, professorId: string) {
  return Effect.gen(function* () {
    const assignment = yield* trySync(() => db.select().from(assignments).where(eq(assignments.id, assignmentId)).get());
    if (!assignment) return yield* notFound("Assignment not found");
    if (assignment.professorId !== professorId) return yield* forbidden("Assignment does not belong to professor");
    return assignment;
  });
}

function repositoryMatchesGithubUsername(repository: AssignmentRepository, githubUsername: string) {
  const normalized = normalizeGithubUsername(githubUsername);
  if (!normalized || !repository.repoPath) return Effect.succeed(false);
  return readGithubCommitCache(repository.repoPath).pipe(Effect.map((cache) => Object.values(cache).some(
    (entry) => normalizeGithubUsername(entry.githubUsername) === normalized,
  )));
}

export const AssignmentRepository = {
  create(input: { professorId: string; assignmentId: string; githubRepoUrl: string }) {
    return Effect.gen(function* () {
      const assignment = yield* requireAssignmentOwnedByProfessor(input.assignmentId, input.professorId);
      const parsed = yield* parseGithubRepoUrl(input.githubRepoUrl);
      const githubAccount = yield* Professor.githubConnection(input.professorId);
      const repo = yield* getGithubRepository(parsed.owner, parsed.repo, githubAccount?.accessToken);
      if (repo.private) {
        return yield* badRequest("Miyagi only supports public repositories. Ask the student to make this repository public before adding it.");
      }

      const timestamp = nowIso();
      const repository: NewAssignmentRepository = {
        id: crypto.randomUUID(),
        courseId: assignment.courseId,
        assignmentId: assignment.id,
        professorId: input.professorId,
        name: repo.fullName || `${parsed.owner}/${parsed.repo}`,
        repoPath: null,
        cloneUrl: repo.htmlUrl,
        repositoryProvider: "github",
        githubRepoUrl: repo.htmlUrl,
        githubOwner: parsed.owner,
        githubRepo: parsed.repo,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      return yield* trySync(() => db.insert(assignmentRepositories).values(repository).onConflictDoUpdate({
        target: [assignmentRepositories.assignmentId, assignmentRepositories.githubRepoUrl],
        set: { name: repository.name, updatedAt: timestamp },
      }).returning().get(), "Could not import repository");
    });
  },

  findById(repositoryId: string) {
    return trySync(() => db.select().from(assignmentRepositories).where(eq(assignmentRepositories.id, repositoryId)).get());
  },

  requireById(repositoryId: string) {
    return Effect.gen(function* () {
      const repository = yield* AssignmentRepository.findById(repositoryId);
      return repository ?? (yield* notFound("Repository not found"));
    });
  },

  requireOwnedByProfessor(repositoryId: string, professorId: string) {
    return Effect.gen(function* () {
      const repository = yield* AssignmentRepository.requireById(repositoryId);
      if (repository.professorId !== professorId) return yield* forbidden("Repository does not belong to professor");
      return repository;
    });
  },

  requireVisibleToUser(repositoryId: string, userId: string) {
    return Effect.gen(function* () {
      const repository = yield* AssignmentRepository.requireById(repositoryId);
      const user = yield* trySync(() => db.select().from(users).where(eq(users.id, userId)).get());
      if (!user?.githubUsername || !(yield* repositoryMatchesGithubUsername(repository, user.githubUsername))) {
        return yield* forbidden("Repository is not assigned to this student");
      }
      return repository;
    });
  },

  listByAssignment(assignmentId: string, userId?: string) {
    return Effect.gen(function* () {
      const repositories = yield* trySync(() => db.select().from(assignmentRepositories)
        .where(eq(assignmentRepositories.assignmentId, assignmentId)).all());
      if (!userId) return repositories;
      const user = yield* trySync(() => db.select().from(users).where(eq(users.id, userId)).get());
      if (!user?.githubUsername) return [];
      const matches = yield* Effect.forEach(repositories, (repository) => repositoryMatchesGithubUsername(repository, user.githubUsername!)
        .pipe(Effect.map((matchesUser) => ({ repository, matchesUser }))));
      return matches.filter(({ matchesUser }) => matchesUser).map(({ repository }) => repository);
    });
  },

  listByUser(userId: string) {
    return Effect.gen(function* () {
      const user = yield* trySync(() => db.select().from(users).where(eq(users.id, userId)).get());
      if (!user?.githubUsername) return [];
      const repositories = yield* trySync(() => db.select().from(assignmentRepositories).all());
      const matches = yield* Effect.forEach(repositories, (repository) => repositoryMatchesGithubUsername(repository, user.githubUsername!)
        .pipe(Effect.map((matchesUser) => ({ repository, matchesUser }))));
      return matches.filter(({ matchesUser }) => matchesUser).map(({ repository }) => ({
        ...repository,
        role: "repository",
        joinedAt: repository.updatedAt,
      }));
    });
  },

  listObservedUsersByCourse(courseId: string) {
    return Effect.gen(function* () {
      const repositories = yield* trySync(() => db.select().from(assignmentRepositories)
        .where(eq(assignmentRepositories.courseId, courseId)).all());
      if (repositories.length === 0) return [];
      const allUsers = yield* trySync(() => db.select().from(users).all());
      const observed = yield* Effect.forEach(allUsers.filter((user) => user.githubUsername), (user) => Effect.gen(function* () {
        for (const repository of repositories) {
          if (yield* repositoryMatchesGithubUsername(repository, user.githubUsername!)) return { user, repository };
        }
        return undefined;
      }));
      return observed.filter((value): value is NonNullable<typeof value> => Boolean(value));
    });
  },

  updateRepoPath(repositoryId: string, repoPath: string) {
    return Effect.gen(function* () {
      const repository = yield* AssignmentRepository.requireById(repositoryId);
      return yield* trySync(() => db.update(assignmentRepositories)
        .set({ repoPath, cloneUrl: repository.githubRepoUrl, updatedAt: nowIso() })
        .where(eq(assignmentRepositories.id, repositoryId)).returning().get(), "Could not update repository mirror");
    });
  },

  delete(repositoryId: string, professorId: string) {
    return Effect.gen(function* () {
      yield* AssignmentRepository.requireOwnedByProfessor(repositoryId, professorId);
      yield* trySync(() => db.delete(assignmentRepositories)
        .where(and(eq(assignmentRepositories.id, repositoryId), eq(assignmentRepositories.professorId, professorId))).run());
      return { ok: true } as const;
    });
  },
};

export function importAssignmentRepositories(input: { professorId: string; assignmentId: string; repositoriesText: string }) {
  return Effect.gen(function* () {
    const lines = input.repositoriesText.split(/\r?\n/)
      .map((line, index) => ({ value: line.trim().replace(/,$/, "").trim(), lineNumber: index + 1 }))
      .filter(({ value }) => value.length > 0);
    if (lines.length === 0) return yield* badRequest("Add at least one GitHub repository");
    const repositoryUrls: string[] = [];
    for (const { value, lineNumber } of lines) {
      if (!/^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/?$/i.test(value)) {
        return yield* badRequest(`Line ${lineNumber} must be a complete GitHub repository URL`);
      }
      repositoryUrls.push(value);
    }
    const repositories = yield* Effect.forEach(repositoryUrls, (githubRepoUrl) => AssignmentRepository.create({
      professorId: input.professorId,
      assignmentId: input.assignmentId,
      githubRepoUrl,
    }), { concurrency: 1 });
    return { importedRepositories: repositories.length, repositories };
  });
}

export function repositoryErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (error instanceof AppError && error.status < 500) return error.message;
  if (lower.includes("rate limit")) return "GitHub rate limit reached. Try again later or connect a GitHub account for higher limits.";
  if (lower.includes("not found") || lower.includes("github api failed: 404")) return "Repository not found. Check that the GitHub URL is correct and that the repository is public or accessible.";
  if (lower.includes("bad credentials") || lower.includes("github api failed: 401")) return "GitHub authentication failed. Reconnect GitHub or check the configured GitHub token.";
  if (lower.includes("github api failed: 403")) return "GitHub denied access. The repository may be private, inaccessible, or the app may be rate limited.";
  if (lower.includes("authentication failed") || lower.includes("permission denied") || lower.includes("not appear to be a git repository")) return "Could not access the repository. Make sure it is public and the GitHub URL is correct.";
  if (lower.includes("network") || lower.includes("timeout") || lower.includes("failed to fetch")) return "Could not reach GitHub. Check your network connection and try again.";
  return fallback;
}
