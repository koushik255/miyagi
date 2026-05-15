#!/usr/bin/env bun

import { select } from "@inquirer/prompts";
import { initDatabase } from "../src/db";
import { professorConsole } from "./prof";
import { studentConsole } from "./student";

initDatabase();

async function main() {
  if (Bun.argv.includes("-student") || Bun.argv.includes("--student")) {
    await studentConsole();
    return;
  }

  if (Bun.argv.includes("-professor") || Bun.argv.includes("--professor")) {
    await professorConsole();
    return;
  }

  while (true) {
    console.clear();
    console.log("Miyagi Console\n");

    const mode = await select({
      message: "Who are you using the console as?",
      choices: [
        { name: "Professor", value: "professor" },
        { name: "Student", value: "student" },
        { name: "Exit", value: "exit" },
      ],
    });

    if (mode === "professor") await professorConsole();
    if (mode === "student") await studentConsole();
    if (mode === "exit") break;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
