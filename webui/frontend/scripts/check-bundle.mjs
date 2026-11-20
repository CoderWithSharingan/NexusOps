// Fails the build if three.js leaks into the files the browser loads first (Lite mode must stay light).
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_ENTRY_BYTES = 600 * 1024;
const THREE_MARKERS = ["WebGLRenderer", "THREE.WebGL"];

const dist = join(dirname(dirname(fileURLToPath(import.meta.url))), "dist");
const html = await readFile(join(dist, "index.html"), "utf8");
const initial = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((match) => match[1]);
const problems = [];

if (!initial.length) problems.push("No entry script found in dist/index.html.");
for (const asset of initial) {
  const file = join(dist, asset);
  const code = await readFile(file, "utf8");
  const size = (await stat(file)).size;
  if (THREE_MARKERS.some((marker) => code.includes(marker))) problems.push(`${asset} contains three.js.`);
  if (size > MAX_ENTRY_BYTES) problems.push(`${asset} is ${size} bytes (limit ${MAX_ENTRY_BYTES}).`);
  console.log(`${asset}  ${(size / 1024).toFixed(1)} KB`);
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("Entry bundle OK: no three.js in the initial load.");
