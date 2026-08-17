import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).trim().split("\n").filter((file) => file && existsSync(file));
const forbidden = [
  /^AGENTS\.md$/,
  /^CLAUDE\.md$/,
  /^resources\//,
  /^submission\//,
  /(^|\/)\.superpowers\//,
  /(^|\/)superpowers\//,
  /^docs\/(plans|specs|brainstorming|verification)\//,
];
const violations = tracked.filter((file) => forbidden.some((pattern) => pattern.test(file)));
if (violations.length) {
  console.error(`Private/internal artifacts are tracked:\n${violations.join("\n")}`);
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, trackedFilesChecked: tracked.length, forbiddenArtifacts: 0 }, null, 2));
