#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { sanitizeKeywords } = require("../electron/metadata-keywords.cjs");
const root = process.env.BLACKMAMBA_LIBRARY_ROOT || "/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER";
const apply = process.argv.includes("--apply");
const limitArgument = process.argv.find((value) => value.startsWith("--limit="));
const limit = limitArgument ? Math.max(1, Number(limitArgument.split("=")[1]) || 1) : Infinity;
const inbox = join(root, "00_COVER_INBOX");
const manifestPath = join(inbox, "images.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const pending = (manifest.images || []).filter((image) => !(image.prompt || image.keywords?.length)).slice(0, limit);
if (!apply) {
  console.log(JSON.stringify({ mode: "dry-run", images: manifest.images?.length || 0, pending: pending.length, note: "Use --apply para ejecutar Vision local" }, null, 2));
  process.exit(0);
}

const translations = { night: "noche", city: "ciudad", fire: "fuego", smoke: "humo", ocean: "mar", beach: "playa", car: "auto", woman: "mujer", man: "hombre", people: "personas", music: "musica", microphone: "microfono", stage: "escenario", lights: "luces", neon: "neon", sky: "cielo", moon: "luna", sun: "sol", tree: "arbol", forest: "bosque", flower: "flor", road: "camino", building: "edificio", dance: "baile", crowd: "multitud", guitar: "guitarra", water: "agua", portrait: "retrato", painting: "pintura", art: "arte" };
const script = join(dirname(fileURLToPath(import.meta.url)), "classify-image-keywords.swift");
const child = spawn("xcrun", ["swift", script], { stdio: ["pipe", "pipe", "inherit"] });
const byPath = new Map(pending.map((image) => [join(inbox, image.file), image]));
let buffer = "";
let completed = 0;
let classified = 0;
child.stdout.on("data", (chunk) => {
  buffer += String(chunk);
  const lines = buffer.split("\n"); buffer = lines.pop() || "";
  for (const line of lines) {
    try {
      const result = JSON.parse(line);
      const image = byPath.get(result.path);
      if (!image || !Array.isArray(result.labels)) continue;
      const labels = result.labels.map((entry) => String(entry.label).toLowerCase());
      const expanded = labels.flatMap((label) => { const words = label.split(/[_\s-]+/); return [...words, ...words.map((word) => translations[word]).filter(Boolean)]; });
      const keywords = sanitizeKeywords(expanded);
      Object.assign(image, { prompt: labels.join(", "), keywords, promptSource: "vision-local-auto", promptConfidence: result.labels[0]?.confidence || 0, metadataUpdatedAt: new Date().toISOString() });
      if (keywords.length) classified += 1;
    } catch { /* Una línea inválida del clasificador se omite sin detener el lote. */ }
    completed += 1;
    if (completed % 50 === 0 || completed === pending.length) process.stderr.write(`Vision local: ${completed}/${pending.length}\n`);
  }
});
for (const image of pending) child.stdin.write(`${join(inbox, image.file)}\n`);
child.stdin.end();
const exitCode = await new Promise((resolve) => child.on("close", resolve));
if (exitCode !== 0) throw new Error(`vision_classifier_failed_${exitCode}`);

const atomicJson = async (file, value) => { await mkdir(dirname(file), { recursive: true }); const temporary = `${file}.tmp-${process.pid}`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`); await rename(temporary, file); };
const stamp = new Date().toISOString().replaceAll(":", "-");
const backupPath = join(root, "backups", `cover-image-metadata-${stamp}.json`);
await atomicJson(backupPath, { createdAt: new Date().toISOString(), source: "vision-local-auto", originalManifest: JSON.parse(await readFile(manifestPath, "utf8")) });
manifest.updatedAt = new Date().toISOString();
await atomicJson(manifestPath, manifest);
console.log(JSON.stringify({ mode: "apply", attempted: pending.length, classified, backupPath }, null, 2));
