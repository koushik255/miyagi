import { and, eq } from "drizzle-orm";
import { forbidden, notFound } from "./errors";
import { db } from "./db";
import { assignments, courseMembers, courses, groups } from "./schema";

export function requireCourseOwnedByProfessor(courseId: string, professorId: string) {
  const course = db.select().from(courses).where(eq(courses.id, courseId)).get();
  if (!course) notFound("Course not found");
  if (course.professorId !== professorId) forbidden("Course does not belong to professor");
  return course;
}

export function requireAssignmentOwnedByProfessor(assignmentId: string, professorId: string) {
  const assignment = db.select().from(assignments).where(eq(assignments.id, assignmentId)).get();
  if (!assignment) notFound("Assignment not found");
  if (assignment.professorId !== professorId) forbidden("Assignment does not belong to professor");
  return assignment;
}

export function requireGroupOwnedByProfessor(groupId: string, professorId: string) {
  const group = db.select().from(groups).where(eq(groups.id, groupId)).get();
  if (!group) notFound("Group not found");
  if (group.professorId !== professorId) forbidden("Group does not belong to professor");
  return group;
}

export function requireCourseMember(userId: string, courseId: string) {
  const member = db
    .select()
    .from(courseMembers)
    .where(and(eq(courseMembers.userId, userId), eq(courseMembers.courseId, courseId)))
    .get();
  if (!member) forbidden("Student must join the course before joining this group");
  return member;
}
