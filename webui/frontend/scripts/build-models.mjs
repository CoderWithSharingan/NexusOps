// Generates the NexusOps .glb models procedurally so they can be rebuilt without a 3D editor.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { NodeIO } from "@gltf-transform/core";
import { KHRMeshQuantization } from "@gltf-transform/extensions";
import { dedup, prune, quantize, weld } from "@gltf-transform/functions";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDir = join(root, "public", "models");
const names = JSON.parse(await readFile(join(root, "src", "scene", "models.json"), "utf8"));

const ROLES = ["body", "accent", "glow"];

// GLTFExporter's binary path needs the browser FileReader, which Node lacks.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
};

function place(geometry, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  );
  const placed = (geometry.index ? geometry.toNonIndexed() : geometry.clone()).applyMatrix4(matrix);
  for (const name of Object.keys(placed.attributes)) {
    if (name !== "position" && name !== "normal") placed.deleteAttribute(name);
  }
  return placed;
}

function roundedRect(width, height, radius) {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

function extrude(shape, depth, bevel = 0.04, curveSegments = 10, bevelSegments = 3) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments, curveSegments,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function roundedBox(width, height, depth, radius = 0.05) {
  return extrude(
    roundedRect(width - radius * 2, height - radius * 2, Math.min(width, height) * 0.08), depth - radius * 2, radius, 3, 2,
  );
}

function nexusCore() {
  const faceted = new THREE.IcosahedronGeometry(1, 1);
  faceted.computeVertexNormals();
  const body = [place(faceted)];
  const accent = [
    place(new THREE.TorusGeometry(1.6, 0.035, 12, 96), { rotation: [Math.PI / 2, 0, 0] }),
    place(new THREE.TorusGeometry(1.85, 0.03, 12, 96), { rotation: [Math.PI / 2.6, 0.5, 0] }),
    place(new THREE.TorusGeometry(2.1, 0.025, 12, 96), { rotation: [Math.PI / 1.8, -0.6, 0.3] }),
  ];
  const glow = [place(new THREE.IcosahedronGeometry(0.55, 3))];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const radius = i % 2 ? 1.85 : 1.6;
    glow.push(place(new THREE.SphereGeometry(0.08, 16, 12), {
      position: [Math.cos(angle) * radius, Math.sin(angle) * 0.35, Math.sin(angle) * radius],
    }));
  }
  return { body, accent, glow };
}

function yamlDocument() {
  const width = 1.5;
  const height = 1.9;
  const fold = 0.42;
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -height / 2);
  shape.lineTo(width / 2, -height / 2);
  shape.lineTo(width / 2, height / 2 - fold);
  shape.lineTo(width / 2 - fold, height / 2);
  shape.lineTo(-width / 2, height / 2);
  shape.closePath();
  const corner = new THREE.Shape();
  corner.moveTo(width / 2 - fold, height / 2);
  corner.lineTo(width / 2 - fold, height / 2 - fold);
  corner.lineTo(width / 2, height / 2 - fold);
  corner.closePath();

  const body = [place(extrude(shape, 0.16, 0.05))];
  const accent = [
    place(extrude(corner, 0.08, 0.02), { position: [0, 0, 0.14] }),
    place(roundedBox(0.34, 0.12, 0.06, 0.02), { position: [-0.38, 0.62, 0.13] }),
  ];
  // Indented bars echo YAML's nesting levels.
  const lines = [[0, 0.95], [1, 0.72], [1, 0.55], [2, 0.42], [0, 0.85], [1, 0.62]];
  const glow = lines.map(([indent, length], index) => place(roundedBox(length, 0.09, 0.05, 0.02), {
    position: [-0.55 + indent * 0.18 + length / 2, 0.32 - index * 0.21, 0.13],
  }));
  return { body, accent, glow };
}

function shieldShape(scale = 1) {
  const s = (value) => value * scale;
  const shape = new THREE.Shape();
  shape.moveTo(0, s(1.05));
  shape.quadraticCurveTo(s(0.45), s(0.9), s(0.85), s(0.95));
  shape.lineTo(s(0.85), s(0.1));
  shape.quadraticCurveTo(s(0.8), s(-0.65), 0, s(-1.05));
  shape.quadraticCurveTo(s(-0.8), s(-0.65), s(-0.85), s(0.1));
  shape.lineTo(s(-0.85), s(0.95));
  shape.quadraticCurveTo(s(-0.45), s(0.9), 0, s(1.05));
  return shape;
}

function validateShield() {
  const frame = shieldShape(0.86);
  const hole = new THREE.Path(shieldShape(0.74).getPoints(24).reverse());
  frame.holes.push(hole);
  const check = new THREE.Shape();
  check.moveTo(-0.42, 0.02);
  check.lineTo(-0.12, -0.3);
  check.lineTo(0.45, 0.36);
  check.lineTo(0.33, 0.47);
  check.lineTo(-0.12, -0.06);
  check.lineTo(-0.3, 0.14);
  check.closePath();
  return {
    body: [place(extrude(shieldShape(), 0.3, 0.06))],
    accent: [place(extrude(frame, 0.06, 0.015), { position: [0, 0, 0.21] })],
    glow: [place(extrude(check, 0.1, 0.03), { position: [0, 0, 0.24] })],
  };
}

function terraformLayers() {
  const body = [];
  const accent = [];
  const glow = [];
  // Stacked tiers read as infrastructure layers built from code.
  const tiers = [[2.0, -0.7], [1.6, -0.05], [1.2, 0.6]];
  for (const [size, y] of tiers) {
    body.push(place(roundedBox(size, 0.26, size, 0.06), { position: [0, y, 0] }));
    glow.push(place(new THREE.TorusGeometry(size * 0.62, 0.018, 8, 4), {
      position: [0, y + 0.135, 0], rotation: [Math.PI / 2, 0, Math.PI / 4], scale: [1, 1, 1],
    }));
  }
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    accent.push(place(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 16), { position: [x * 0.62, -0.05, z * 0.62] }));
  }
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      glow.push(place(roundedBox(0.2, 0.14, 0.2, 0.03), { position: [i * 0.34, 0.8, j * 0.34] }));
    }
  }
  return { body, accent, glow };
}

function dockerContainers() {
  const body = [];
  const accent = [];
  const glow = [];
  const platform = new THREE.LatheGeometry(
    [[0, -0.12], [1.35, -0.12], [1.5, 0], [1.42, 0.1], [0, 0.1]].map(([x, y]) => new THREE.Vector2(x, y)), 48,
  );
  body.push(place(platform, { position: [0, -0.75, 0], scale: [1, 1, 0.62] }));
  glow.push(place(new THREE.TorusGeometry(1.46, 0.02, 8, 96), { position: [0, -0.75, 0], rotation: [Math.PI / 2, 0, 0], scale: [1, 0.62, 1] }));
  const slots = [[-0.66, -0.43], [0, -0.43], [0.66, -0.43], [-0.33, 0.03], [0.33, 0.03]];
  for (const [x, y] of slots) {
    body.push(place(roundedBox(0.62, 0.42, 0.9, 0.03), { position: [x, y, 0] }));
    for (let rib = 0; rib < 5; rib++) {
      const offset = -0.22 + rib * 0.11;
      for (const z of [-0.46, 0.46]) {
        accent.push(place(new THREE.BoxGeometry(0.035, 0.34, 0.03), { position: [x + offset, y, z] }));
      }
    }
  }
  glow.push(place(new THREE.SphereGeometry(0.07, 16, 12), { position: [0, 0.38, 0] }));
  return { body, accent, glow };
}

function ecrVault() {
  const profile = [[0, -0.75], [0.82, -0.75], [0.9, -0.67], [0.9, 0.67], [0.82, 0.75], [0, 0.75]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const body = [place(new THREE.LatheGeometry(profile, 48))];
  const accent = [-0.45, 0, 0.45].map((y) => place(new THREE.CylinderGeometry(1.0, 1.0, 0.06, 48), { position: [0, y, 0] }));
  const glow = [
    place(new THREE.TorusGeometry(0.38, 0.045, 12, 48), { position: [0, 0, 0.92] }),
    place(new THREE.SphereGeometry(0.11, 20, 16), { position: [0, 0, 0.92] }),
  ];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    glow.push(place(new THREE.SphereGeometry(0.05, 12, 8), { position: [Math.cos(angle) * 0.6, 0.78, Math.sin(angle) * 0.6] }));
  }
  return { body, accent, glow };
}

function kubernetesCluster() {
  const sides = 7;
  const plate = new THREE.Shape();
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 + Math.PI / 2;
    const point = [Math.cos(angle) * 1.3, Math.sin(angle) * 1.3];
    if (i === 0) plate.moveTo(...point);
    else plate.lineTo(...point);
  }
  plate.closePath();
  const body = [place(extrude(plate, 0.18, 0.06), { rotation: [-Math.PI / 2, 0, 0], position: [0, -0.3, 0] })];
  const accent = [];
  const glow = [place(new THREE.TorusGeometry(0.28, 0.06, 12, 48), { position: [0, -0.05, 0], rotation: [Math.PI / 2, 0, 0] })];
  // Pods arranged around a control-plane hub.
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2;
    const x = Math.cos(angle) * 0.9;
    const z = Math.sin(angle) * 0.9;
    accent.push(place(new THREE.CapsuleGeometry(0.13, 0.22, 6, 16), { position: [x, 0.08, z] }));
    const spoke = new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8);
    glow.push(place(spoke, { position: [x * 0.52, -0.05, z * 0.52], rotation: [0, -angle, Math.PI / 2] }));
  }
  return { body, accent, glow };
}

const BUILDERS = {
  "nexus-core": nexusCore,
  yaml: yamlDocument,
  validate: validateShield,
  terraform: terraformLayers,
  docker: dockerContainers,
  ecr: ecrVault,
  kubernetes: kubernetesCluster,
};

async function exportModel(name) {
  const parts = BUILDERS[name]();
  const group = new THREE.Group();
  group.name = name;
  const box = new THREE.Box3();
  for (const role of ROLES) {
    const geometry = mergeGeometries(parts[role]);
    if (!geometry) throw new Error(`Could not merge ${role} geometry for ${name}.`);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ name: role }));
    mesh.name = role;
    geometry.name = role;
    group.add(mesh);
    geometry.computeBoundingBox();
    box.union(geometry.boundingBox);
  }
  // Normalise every model to fit a 2-unit cube centred on the origin.
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const factor = 2 / Math.max(size.x, size.y, size.z);
  for (const mesh of group.children) {
    mesh.geometry.translate(-center.x, -center.y, -center.z).scale(factor, factor, factor);
  }
  const scene = new THREE.Scene();
  scene.add(group);
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true });

  const io = new NodeIO().registerExtensions([KHRMeshQuantization]);
  const document = await io.readBinary(new Uint8Array(glb));
  await document.transform(dedup(), weld(), quantize({ quantizeNormal: 8 }), prune());
  const output = await io.writeBinary(document);
  await writeFile(join(outputDir, `${name}.glb`), output);
  console.log(`${name}.glb  ${(output.byteLength / 1024).toFixed(1)} KB`);
}

await mkdir(outputDir, { recursive: true });
for (const name of names) {
  if (!BUILDERS[name]) throw new Error(`No builder for model '${name}'.`);
  await exportModel(name);
}
