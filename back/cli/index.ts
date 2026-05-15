#!/usr/bin/env bun

import { Command } from "commander";
import { eq } from "drizzle-orm";
import { db, initDatabase } from "../src/db";
import { Group, Professor, User } from "../src/class";
import { groupMembers, groups, professors, users } from "../src/schema";
import { readSessionAsync, updateSession } from "./session";

initDatabase();

const program = new Command();

program
  .name("miyagi")
  .description("Local demo/testing CLI for the Miyagi backend")
  .version("0.1.0");

function print(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

const user = program.command("user").description("Create/select demo users");

user
  .command("create")
  .description("Create or get a user by device hash")
  .requiredOption("-d, --device <deviceHash>", "Device hash / stable local id")
  .option("-n, --name <displayName>", "Display name", "Anonymous")
  .action((opts) => {
    const created = User.createOrGet(opts.device, opts.name);
    print(created);
  });

user
  .command("use")
  .description("Select the active user for later commands")
  .requiredOption("-i, --id <userId>", "User id")
  .action(async (opts) => {
    const selected = User.findById(opts.id);
    if (!selected) throw new Error(`No user found for id ${opts.id}`);

    await updateSession({ studentId: selected.id });
    console.log(`Active user: ${selected.displayName} (${selected.id})`);
  });

user.command("current").description("Show active user").action(async () => {
  const session = await readSessionAsync();
  if (!session.studentId) return console.log("No active user selected");
  print(User.findById(session.studentId));
});

const professor = program.command("professor").description("Create/select professors");

professor
  .command("create")
  .description("Create/get a professor by device hash")
  .requiredOption("-d, --device <deviceHash>", "Device hash / stable local id")
  .option("-n, --name <displayName>", "Display name", "Professor")
  .action((opts) => {
    const created = Professor.createOrGetByDevice(opts.device, opts.name);
    print(created);
  });

professor
  .command("use")
  .description("Select the active professor for later commands")
  .requiredOption("-i, --id <professorId>", "Professor id")
  .action(async (opts) => {
    const selected = Professor.findById(opts.id);
    if (!selected) throw new Error(`No professor found for id ${opts.id}`);

    await updateSession({ professorId: selected.id });
    console.log(`Active professor: ${selected.id}`);
  });

professor.command("current").description("Show active professor").action(async () => {
  const session = await readSessionAsync();
  if (!session.professorId) return console.log("No active professor selected");
  print(Professor.findById(session.professorId));
});

const group = program.command("group").description("Create groups and add students");

group
  .command("create")
  .description("Create a group using the active professor, or pass --professor-id")
  .requiredOption("-n, --name <name>", "Group name")
  .option("-p, --professor-id <professorId>", "Professor id")
  .action(async (opts) => {
    const session = await readSessionAsync();
    const professorId = opts.professorId ?? session.professorId;
    if (!professorId) throw new Error("No professor selected. Run `professor use` or pass --professor-id.");

    const created = Group.create(professorId, opts.name);
    print(created);
    console.log(`\nJoin code: ${created.joinCode}`);
  });

group
  .command("join")
  .description("Add a user/student to a group by join code")
  .requiredOption("-c, --code <joinCode>", "Group join code")
  .option("-u, --user-id <userId>", "User id; defaults to active user")
  .action(async (opts) => {
    const session = await readSessionAsync();
    const userId = opts.userId ?? session.studentId;
    if (!userId) throw new Error("No user selected. Run `user use` or pass --user-id.");

    print(Group.assignStudent(opts.code, userId));
  });

group
  .command("members")
  .description("List students/members in a group")
  .requiredOption("-g, --group-id <groupId>", "Group id")
  .action((opts) => {
    const members = db
      .select({
        memberId: groupMembers.id,
        userId: users.id,
        displayName: users.displayName,
        role: groupMembers.role,
        joinedAt: groupMembers.joinedAt,
      })
      .from(groupMembers)
      .innerJoin(users, eq(groupMembers.userId, users.id))
      .where(eq(groupMembers.groupId, opts.groupId))
      .all();

    print(members);
  });

const list = program.command("list").description("Debug/list database rows");

list.command("users").action(() => print(db.select().from(users).all()));
list.command("professors").action(() => print(db.select().from(professors).all()));
list.command("groups").action(() => print(db.select().from(groups).all()));
list.command("members").action(() => print(db.select().from(groupMembers).all()));

program
  .command("demo")
  .description("Create a professor, group, and a few students")
  .action(() => {
    const prof = Professor.createOrGetByDevice("demo-professor-device", "Dr. Smith");
    const createdGroup = Group.create(prof.id, `Demo Class ${new Date().toLocaleTimeString()}`);

    const students = [
      User.createOrGet("demo-alice-device", "Alice"),
      User.createOrGet("demo-bob-device", "Bob"),
      User.createOrGet("demo-charlie-device", "Charlie"),
    ];

    const members = students.map((student) => Group.assignStudent(createdGroup.joinCode, student.id));

    print({ professor: prof, group: createdGroup, students, members });
  });

program.parse();
