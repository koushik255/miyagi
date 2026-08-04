import { Effect, Schema } from "effect";
import type { Hono } from "hono";
import { AssignmentRepository, importAssignmentRepositories, repositoryErrorMessage } from "../assignment-repository";
import { requireAuthSession } from "../auth";
import { Assignment, Course, CourseCalendarItem, CourseMembershipSuggestion } from "../course";
import { getAssignmentDashboard, getAssignmentRepositoryDashboard } from "../dashboard";
import { appError, decodeRequest, forbidden, requestBody, runJson, type AppError } from "../errors";

const Id = Schema.NonEmptyString;
const CourseInput = Schema.Struct({ name: Id });
const JoinCourseInput = Schema.Struct({ joinCode: Id });
const AssignmentInput = Schema.Struct({
  courseId: Id,
  name: Id,
  description: Schema.optional(Schema.String),
  dueDate: Schema.optional(Schema.String),
  repositoryMode: Schema.optional(Schema.Literal("github")),
});
const CalendarInput = Schema.Struct({
  assignmentId: Schema.optional(Schema.NullOr(Id)),
  title: Id,
  description: Schema.optional(Schema.String),
  dueAt: Id,
  kind: Schema.Literal("event", "deadline"),
});
const RepositoryInput = Schema.Struct({ assignmentId: Id, githubRepoUrl: Id });
const RepositoryImportInput = Schema.Struct({ repositoriesText: Id });
const DashboardPeriod = Schema.Literal("weekly", "monthly", "semester");

function repositoryFailure(fallback: string) {
  return Effect.mapError((error: AppError) => error.status < 500
    ? error
    : appError(error.status, repositoryErrorMessage(error, fallback), error));
}

export function registerAppRoutes(app: Hono) {
  app.post("/courses", (c) => runJson(c, Effect.gen(function* () {
    const session = yield* requireAuthSession(c, "professor");
    const body = yield* requestBody(c, CourseInput);
    return yield* Course.create(session.professorId!, body.name);
  })));
  app.post("/courses/join", (c) => runJson(c, Effect.gen(function* () {
    const session = yield* requireAuthSession(c, "student");
    const body = yield* requestBody(c, JoinCourseInput);
    return yield* Course.assignStudent(body.joinCode, session.userId);
  })));
  app.get("/courses/professor/:professorId", (c) => runJson(c, Effect.gen(function* () {
    const session = yield* requireAuthSession(c, "professor");
    if (c.req.param("professorId") !== session.professorId) return yield* forbidden("Cannot access another professor's courses");
    return yield* Course.listByProfessor(session.professorId!);
  })));
  app.get("/courses/user/:userId", (c) => runJson(c, Effect.gen(function* () {
    const session = yield* requireAuthSession(c, "student");
    if (c.req.param("userId") !== session.userId) return yield* forbidden("Cannot access another student's courses");
    return yield* Course.listByUser(session.userId);
  })));
  app.get("/courses/:courseId/members", (c) => runJson(c, Effect.gen(function* () {
    const session = yield* requireAuthSession(c);
    yield* Course.requireAccessible(c.req.param("courseId"), session);
    return yield* Course.listMembers(c.req.param("courseId"));
  })));

  app.get("/users/:userId/course-suggestions", (c) => runJson(c, Effect.gen(function* () {
    const session = yield* requireAuthSession(c, "student");
    if (c.req.param("userId") !== session.userId) return yield* forbidden("Cannot access another student's suggestions");
    return yield* CourseMembershipSuggestion.listPending(session.userId);
  })));
  app.post("/course-suggestions/:suggestionId/accept", (c) => runJson(c, Effect.gen(function* () {
    const session = yield* requireAuthSession(c, "student");
    return yield* CourseMembershipSuggestion.accept(c.req.param("suggestionId"), session.userId);
  })));
  app.post("/course-suggestions/:suggestionId/reject", (c) => runJson(c, Effect.gen(function* () {
    const session = yield* requireAuthSession(c, "student");
    return yield* CourseMembershipSuggestion.reject(c.req.param("suggestionId"), session.userId);
  })));

  app.get("/courses/:courseId/assignments", (c) => runJson(c, Effect.gen(function* () {
    const session = yield* requireAuthSession(c);
    yield* Course.requireAccessible(c.req.param("courseId"), session);
    return yield* Assignment.listByCourse(c.req.param("courseId"));
  })));
  app.post("/assignments", (c) => runJson(c, Effect.gen(function* () {
    const session = yield* requireAuthSession(c, "professor");
    const body = yield* requestBody(c, AssignmentInput);
    return yield* Assignment.create({ ...body, professorId: session.professorId! });
  })));
  app.get("/courses/:courseId/calendar-items", (c) => runJson(c, Effect.gen(function* () {
    const session = yield* requireAuthSession(c);
    yield* Course.requireAccessible(c.req.param("courseId"), session);
    return yield* CourseCalendarItem.listByCourse(c.req.param("courseId"));
  })));
  app.post("/courses/:courseId/calendar-items", (c) => runJson(c, Effect.gen(function* () {
    const session = yield* requireAuthSession(c, "professor");
    const body = yield* requestBody(c, CalendarInput);
    return yield* CourseCalendarItem.create({ ...body, courseId: c.req.param("courseId"), professorId: session.professorId! });
  })));
  app.delete("/courses/:courseId/calendar-items/:itemId", (c) => runJson(c, Effect.gen(function* () {
    const session = yield* requireAuthSession(c, "professor");
    return yield* CourseCalendarItem.remove(c.req.param("courseId"), c.req.param("itemId"), session.professorId!);
  })));

  app.get("/assignments/:assignmentId/repositories", (c) => runJson(c, Effect.gen(function* () {
    const session = yield* requireAuthSession(c);
    yield* Assignment.requireAccessible(c.req.param("assignmentId"), session);
    return yield* AssignmentRepository.listByAssignment(c.req.param("assignmentId"), session.role === "student" ? session.userId : undefined);
  })));
  app.post("/assignments/:assignmentId/import-repositories", (c) => runJson(c, Effect.gen(function* () {
    const session = yield* requireAuthSession(c, "professor");
    yield* Assignment.requireAccessible(c.req.param("assignmentId"), session);
    const body = yield* requestBody(c, RepositoryImportInput);
    return yield* importAssignmentRepositories({ ...body, professorId: session.professorId!, assignmentId: c.req.param("assignmentId") });
  }).pipe(repositoryFailure("Could not import repositories. Use one valid GitHub repository per line."))));
  app.get("/assignments/:assignmentId/dashboard", (c) => runJson(c, Effect.gen(function* () {
    const session = yield* requireAuthSession(c);
    yield* Assignment.requireAccessible(c.req.param("assignmentId"), session);
    const period = yield* decodeRequest(DashboardPeriod, c.req.query("period") ?? "semester");
    return yield* getAssignmentDashboard(c.req.param("assignmentId"), period, session.role === "student" ? session.userId : undefined);
  })));

  app.post("/assignment-repositories", (c) => runJson(c, Effect.gen(function* () {
    const session = yield* requireAuthSession(c, "professor");
    const body = yield* requestBody(c, RepositoryInput);
    yield* Assignment.requireAccessible(body.assignmentId, session);
    return yield* AssignmentRepository.create({ ...body, professorId: session.professorId! });
  }).pipe(repositoryFailure("Could not add repository. Check the GitHub URL and try again."))));
  app.delete("/assignment-repositories/:repositoryId", (c) => runJson(c, Effect.gen(function* () {
    const session = yield* requireAuthSession(c, "professor");
    return yield* AssignmentRepository.delete(c.req.param("repositoryId"), session.professorId!);
  })));
  app.get("/assignment-repositories/:repositoryId/dashboard", (c) => runJson(c, Effect.gen(function* () {
    const session = yield* requireAuthSession(c);
    const repositoryId = c.req.param("repositoryId");
    if (session.role === "student") yield* AssignmentRepository.requireVisibleToUser(repositoryId, session.userId);
    else yield* AssignmentRepository.requireOwnedByProfessor(repositoryId, session.professorId!);
    const period = yield* decodeRequest(DashboardPeriod, c.req.query("period") ?? "semester");
    return yield* getAssignmentRepositoryDashboard(repositoryId, period);
  }).pipe(repositoryFailure("Could not load repository activity. Try again shortly."))));
}
