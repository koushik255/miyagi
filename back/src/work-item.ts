import { and, asc, eq } from "drizzle-orm";
import { db, nowIso } from "./db";
import { badRequest, forbidden, notFound } from "./errors";
import { Group } from "./group";
import { groupWorkItemEvents, groupWorkItems, users } from "./schema";

export const WorkItemStatus = {
  Assigned: "assigned",
  InProgress: "in_progress",
  Completed: "completed",
} as const;

type WorkItemStatusValue = typeof WorkItemStatus[keyof typeof WorkItemStatus];
export type WorkItem = typeof groupWorkItems.$inferSelect;
export type WorkItemEvent = typeof groupWorkItemEvents.$inferSelect;
export type WorkItemEventSummary = WorkItemEvent & { actorDisplayName: string | null };
export type WorkItemWithEvents = WorkItem & { events: WorkItemEventSummary[] };

function normalizeTitle(title: string) {
  const normalized = title.trim();
  if (!normalized) badRequest("Work item title is required");
  return normalized;
}

function requireStatus(status: string): WorkItemStatusValue {
  if (status === WorkItemStatus.Assigned || status === WorkItemStatus.InProgress || status === WorkItemStatus.Completed) return status;
  badRequest("Invalid work item status");
}

function requireGroupMember(userId: string, groupId: string) {
  const member = Group.findMember(userId, groupId);
  if (!member) forbidden("Student must belong to the group");
  return member;
}

function recordEvent(input: { workItemId: string; groupId: string; actorUserId: string; action: string; fromStatus?: string | null; toStatus?: string | null; comment?: string | null }) {
  db.insert(groupWorkItemEvents).values({
    id: crypto.randomUUID(),
    workItemId: input.workItemId,
    groupId: input.groupId,
    actorUserId: input.actorUserId,
    action: input.action,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    comment: input.comment ?? null,
    occurredAt: nowIso(),
  }).run();
}

function listEventsForWorkItem(workItemId: string): WorkItemEventSummary[] {
  const events = db
    .select({
      id: groupWorkItemEvents.id,
      workItemId: groupWorkItemEvents.workItemId,
      groupId: groupWorkItemEvents.groupId,
      actorUserId: groupWorkItemEvents.actorUserId,
      action: groupWorkItemEvents.action,
      fromStatus: groupWorkItemEvents.fromStatus,
      toStatus: groupWorkItemEvents.toStatus,
      comment: groupWorkItemEvents.comment,
      occurredAt: groupWorkItemEvents.occurredAt,
      actorDisplayName: users.displayName,
    })
    .from(groupWorkItemEvents)
    .leftJoin(users, eq(groupWorkItemEvents.actorUserId, users.id))
    .where(eq(groupWorkItemEvents.workItemId, workItemId))
    .orderBy(asc(groupWorkItemEvents.occurredAt))
    .all();
  return events;
}

export const WorkItem = {
  create(input: { groupId: string; userId: string; title: string; description?: string; assignedUserId?: string | null }): WorkItem {
    const group = Group.findById(input.groupId);
    if (!group) notFound("Group not found");
    requireGroupMember(input.userId, group.id);
    if (input.assignedUserId) requireGroupMember(input.assignedUserId, group.id);

    const timestamp = nowIso();
    const workItem = db.insert(groupWorkItems).values({
      id: crypto.randomUUID(),
      groupId: group.id,
      assignmentId: group.assignmentId,
      title: normalizeTitle(input.title),
      description: input.description?.trim() ?? "",
      assignedUserId: input.assignedUserId ?? null,
      createdByUserId: input.userId,
      status: WorkItemStatus.Assigned,
      completionComment: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: null,
      completedAt: null,
    }).returning().get();
    recordEvent({ workItemId: workItem.id, groupId: workItem.groupId, actorUserId: input.userId, action: "created", toStatus: workItem.status });
    return workItem;
  },

  listByGroup(input: { groupId: string; userId?: string; professorId?: string }): WorkItemWithEvents[] {
    const group = Group.findById(input.groupId);
    if (!group) notFound("Group not found");
    if (input.professorId) {
      if (group.professorId !== input.professorId) forbidden("Group does not belong to professor");
    } else if (input.userId) {
      requireGroupMember(input.userId, group.id);
    } else {
      badRequest("userId or professorId is required");
    }
    return db.select().from(groupWorkItems).where(eq(groupWorkItems.groupId, group.id)).all()
      .map((workItem) => ({ ...workItem, events: listEventsForWorkItem(workItem.id) }));
  },

  findById(workItemId: string): WorkItem | undefined {
    return db.select().from(groupWorkItems).where(eq(groupWorkItems.id, workItemId)).get();
  },

  update(input: { workItemId: string; userId: string; title?: string; description?: string; assignedUserId?: string | null; status?: string; completionComment?: string | null }): WorkItem {
    const existing = this.findById(input.workItemId);
    if (!existing) notFound("Work item not found");
    requireGroupMember(input.userId, existing.groupId);

    const update: Partial<typeof groupWorkItems.$inferInsert> = { updatedAt: nowIso() };
    if (input.title !== undefined) update.title = normalizeTitle(input.title);
    if (input.description !== undefined) update.description = input.description.trim();
    if (input.assignedUserId !== undefined) {
      if (input.assignedUserId) requireGroupMember(input.assignedUserId, existing.groupId);
      update.assignedUserId = input.assignedUserId;
    }
    if (input.completionComment !== undefined) update.completionComment = input.completionComment?.trim() || null;
    if (input.status !== undefined) {
      const nextStatus = requireStatus(input.status);
      update.status = nextStatus;
      if (nextStatus === WorkItemStatus.InProgress && !existing.startedAt) update.startedAt = nowIso();
      if (nextStatus === WorkItemStatus.Completed) {
        update.completedAt = nowIso();
        if (input.completionComment !== undefined) update.completionComment = input.completionComment?.trim() || null;
      }
    }

    const updated = db.update(groupWorkItems).set(update).where(and(eq(groupWorkItems.id, existing.id), eq(groupWorkItems.groupId, existing.groupId))).returning().get();
    if (input.status !== undefined && input.status !== existing.status) {
      recordEvent({ workItemId: existing.id, groupId: existing.groupId, actorUserId: input.userId, action: "status_changed", fromStatus: existing.status, toStatus: updated.status, comment: updated.completionComment });
    } else if (input.assignedUserId !== undefined && input.assignedUserId !== existing.assignedUserId) {
      recordEvent({ workItemId: existing.id, groupId: existing.groupId, actorUserId: input.userId, action: "assigned", comment: updated.assignedUserId });
    } else {
      recordEvent({ workItemId: existing.id, groupId: existing.groupId, actorUserId: input.userId, action: "updated", comment: updated.completionComment });
    }
    return updated;
  },
};
