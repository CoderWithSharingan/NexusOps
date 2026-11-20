import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { KHRMeshQuantization } from "@gltf-transform/extensions";

const MAX_FILE_BYTES = 150 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024;
const MAX_TRIANGLES = 20000;
const REQUIRED_MESHES = ["accent", "body", "glow"];

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const names = JSON.parse(await readFile(join(root, "src", "scene", "models.json"), "utf8"));
const io = new NodeIO().registerExtensions([KHRMeshQuantization]);
const problems = [];
let total = 0;

for (const name of names) {
  const file = join(root, "public", "models", `${name}.glb`);
  let bytes;
  try {
    bytes = (await stat(file)).size;
  } catch {
    problems.push(`${name}.glb is missing. Run 'npm run build:models'.`);
    continue;
  }
  total += bytes;
  if (bytes > MAX_FILE_BYTES) problems.push(`${name}.glb is ${bytes} bytes (limit ${MAX_FILE_BYTES}).`);

  const document = await io.read(file);
  const meshNodes = document.getRoot().listNodes().filter((node) => node.getMesh());
  const meshNames = meshNodes.map((node) => node.getName()).sort();
  if (JSON.stringify(meshNames) !== JSON.stringify(REQUIRED_MESHES)) {
    problems.push(`${name}.glb meshes are [${meshNames}], expected [${REQUIRED_MESHES}].`);
  }
  let triangles = 0;
  for (const node of meshNodes) {
    for (const primitive of node.getMesh().listPrimitives()) {
      const indices = primitive.getIndices();
      triangles += (indices ? indices.getCount() : primitive.getAttribute("POSITION").getCount()) / 3;
    }
  }
  if (triangles > MAX_TRIANGLES) problems.push(`${name}.glb has ${triangles} triangles (limit ${MAX_TRIANGLES}).`);
  console.log(`${name}.glb  ${(bytes / 1024).toFixed(1)} KB  ${triangles} triangles`);
}

if (total > MAX_TOTAL_BYTES) problems.push(`Models total ${total} bytes (limit ${MAX_TOTAL_BYTES}).`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`All ${names.length} models OK (${(total / 1024).toFixed(1)} KB total).`);
