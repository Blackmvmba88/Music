import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source =
  process.env.SUNO_ENRICHED_CATALOG ||
  "/Users/blackmambarecords/Documents/Music 2/suno-library-enriched.json";
const target = resolve(root, "suno-library-enriched.json");
const raw = JSON.parse(await readFile(source, "utf8"));
const tracks = raw.tracks || [];
const uniqueIds = new Set(tracks.map((track) => track.id));

if (!tracks.length) throw new Error("El catálogo Suno está vacío");
if (uniqueIds.size !== tracks.length) {
  throw new Error(`UUID duplicados: ${tracks.length - uniqueIds.size}`);
}
if (raw.status !== "complete" || raw.summary?.retry) {
  throw new Error("El enriquecimiento Suno no está completo");
}

const temporary = `${target}.tmp`;
await writeFile(temporary, `${JSON.stringify(raw, null, 2)}\n`);
await rename(temporary, target);
console.log(
  JSON.stringify({
    imported: tracks.length,
    withLyrics: raw.summary?.withLyrics || 0,
    withLargeArtwork: raw.summary?.withLargeArtwork || 0,
    source,
    target,
  }),
);
