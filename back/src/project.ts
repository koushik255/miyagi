import { db, nowIso } from "./db";
import { projects } from "./schema";

export enum ProjectStatus {
  Assigned = "assigned",
  InProgress = "in_progress",
  Submitted = "submitted",
  Reviewed = "reviewed",
}

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export const Project = {
  assign(input: {
    groupId: string;
    assignedByProfessorId: string;
    name: string;
    description?: string;
    assignedStudentId?: string;
    rootPathHint?: string;
    dueDate?: string;
  }): Project {
    const timestamp = nowIso();
    const project: NewProject = {
      id: crypto.randomUUID(),
      groupId: input.groupId,
      assignedStudentId: input.assignedStudentId ?? null,
      assignedByProfessorId: input.assignedByProfessorId,
      name: input.name,
      description: input.description ?? "",
      rootPathHint: input.rootPathHint ?? null,
      dueDate: input.dueDate ?? null,
      status: ProjectStatus.Assigned,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    return db.insert(projects).values(project).returning().get();
  },
};
