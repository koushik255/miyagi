import type { Context } from "hono";
import { Data, Effect, ParseResult, Schema } from "effect";

export type AppStatus = 400 | 401 | 403 | 404 | 409 | 500 | 502;

export class AppError extends Data.TaggedError("AppError")<{
  readonly status: AppStatus;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const appError = (status: AppStatus, message: string, cause?: unknown) => new AppError({ status, message, cause });
export const badRequest = (message: string) => Effect.fail(appError(400, message));
export const unauthorized = (message: string) => Effect.fail(appError(401, message));
export const forbidden = (message: string) => Effect.fail(appError(403, message));
export const notFound = (message: string) => Effect.fail(appError(404, message));
export const conflict = (message: string) => Effect.fail(appError(409, message));

export function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function trySync<A>(operation: () => A, fallback = "Database operation failed"): Effect.Effect<A, AppError> {
  return Effect.try({
    try: operation,
    catch: (cause) => cause instanceof AppError ? cause : appError(500, messageOf(cause) || fallback, cause),
  });
}

export function tryPromise<A>(operation: (signal: AbortSignal) => Promise<A>, fallback = "Request failed"): Effect.Effect<A, AppError> {
  return Effect.tryPromise({
    try: operation,
    catch: (cause) => cause instanceof AppError ? cause : appError(502, messageOf(cause) || fallback, cause),
  });
}

export function decodeRequest<A, I>(schema: Schema.Schema<A, I, never>, input: unknown): Effect.Effect<A, AppError> {
  return Schema.decodeUnknown(schema)(input).pipe(
    Effect.mapError((error) => appError(400, ParseResult.TreeFormatter.formatErrorSync(error), error)),
  );
}

export function requestBody<A, I>(c: Context, schema: Schema.Schema<A, I, never>): Effect.Effect<A, AppError> {
  return Effect.tryPromise({
    try: () => c.req.json(),
    catch: (cause) => appError(400, "Request body must be valid JSON", cause),
  }).pipe(Effect.flatMap((body) => decodeRequest(schema, body)));
}

export function runJson<A>(c: Context, program: Effect.Effect<A, AppError>): Promise<Response> {
  return Effect.runPromise(Effect.match(program, {
    onFailure: (error) => c.json({ error: error.message }, error.status),
    onSuccess: (value) => c.json(value as never),
  }));
}

export function runResponse(c: Context, program: Effect.Effect<Response, AppError>): Promise<Response> {
  return Effect.runPromise(Effect.match(program, {
    onFailure: (error) => c.json({ error: error.message }, error.status),
    onSuccess: (response) => response,
  }));
}
