export class AppError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "AppError";
  }
}

export function badRequest(message: string): never {
  throw new AppError(400, message);
}

export function unauthorized(message: string): never {
  throw new AppError(401, message);
}

export function forbidden(message: string): never {
  throw new AppError(403, message);
}

export function notFound(message: string): never {
  throw new AppError(404, message);
}

export function conflict(message: string): never {
  throw new AppError(409, message);
}
