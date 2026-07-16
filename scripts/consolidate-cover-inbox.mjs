#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, relative } from 'node:path';

const usb = '/Volumes/ADATA SC740';
const library = join(usb, '01_MEDIA_AUDIO/BLACKMAMBA_PLAYER');
const inbox = join(library, '00_COVER_INBOX');
const manifestPath = join(inbox, 'images.json');
const sources = ['/Users/blackmambarecords/Downloads', join(usb, 'Downloads')];
const extensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const ignored = new Set(['.Spotlight-V100', '.Trashes', '.fseventsd', 'node_modules']);

const digest = (file) => new Promise((resolveDigest, reject) => {
  const hash = createHash('sha256');
  createReadStream(file).on('data', (chunk) => hash.update(chunk)).on('end', () => resolveDigest(hash.digest('hex'))).on('error', reject);
});
async function walk(root, current = root, found = []) {
  let entries = [];
  try { entries = await readdir(current, { withFileTypes: true }); } catch { return found; }
  for (const entry of entries) {
    if (entry.name.startsWith('._') || ignored.has(entry.name)) continue;
    const file = join(current, entry.name);
    if (entry.isDirectory()) await walk(root, file, found);
    else if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) found.push({ file, root });
  }
  return found;
}

await mkdir(inbox, { recursive: true });
let previous = { images: [] };
try { previous = JSON.parse(await readFile(manifestPath, 'utf8')); } catch { previous = { images: [] }; }
const byHash = new Map((previous.images || []).map((item) => [item.sha256, item]));
const inventory = [];
for (const source of sources) inventory.push(...await walk(source));
let added = 0;
for (const { file, root } of inventory) {
  const sha256 = await digest(file);
  const origin = { path: file, root, relativePath: relative(root, file) };
  if (byHash.has(sha256)) {
    const item = byHash.get(sha256);
    item.origins ||= [];
    if (!item.origins.some((entry) => entry.path === file)) item.origins.push(origin);
    continue;
  }
  const suffix = extname(file).toLowerCase() === '.jpeg' ? '.jpg' : extname(file).toLowerCase();
  const targetName = `${sha256.slice(0, 16)}${suffix}`;
  const target = join(inbox, targetName);
  await copyFile(file, target);
  if (await digest(target) !== sha256) throw new Error(`Falló la copia verificada: ${file}`);
  byHash.set(sha256, { id: sha256.slice(0, 16), file: targetName, sha256, bytes: (await stat(target)).size, originalName: basename(file), origins: [origin], matchedTrackId: null, confidence: 1, evidence: ['SHA-256 verificado después de copiar'], warnings: ['Portada disponible sin asignar'], fallbackReason: null });
  added += 1;
}
const images = [...byHash.values()].sort((a, b) => a.originalName.localeCompare(b.originalName));
await writeFile(manifestPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), inbox, scanned: inventory.length, unique: images.length, added, confidence: 1, evidence: ['Downloads local y USB recorridos recursivamente', 'Imágenes deduplicadas por SHA-256'], warnings: ['Los archivos originales permanecen en su ubicación'], fallbackReason: null, images }, null, 2)}\n`);
console.log(JSON.stringify({ scanned: inventory.length, unique: images.length, added, inbox, originalsDeleted: 0 }, null, 2));
