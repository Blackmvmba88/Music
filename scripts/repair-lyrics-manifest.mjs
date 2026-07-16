import { copyFile, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.env.BLACKMAMBA_LIBRARY_ROOT || "/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER";
const manifestPath = join(root, "library.json");
const apply = process.argv.includes("--apply");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const changes = [];

for (const track of manifest.tracks || []) {
  const lyricsName = track.lyrics || "lyrics.txt";
  let lyrics = "";
  try { lyrics = (await readFile(join(root, track.folder, lyricsName), "utf8")).trim(); } catch { /* El archivo ausente cuenta como letra pendiente. */ }
  const hasLyrics = Boolean(lyrics) && !/^(LETRA|TRANSCRIPCI[ÓO]N) PENDIENTE/i.test(lyrics);
  if (Boolean(track.hasLyrics) === hasLyrics) continue;
  changes.push({ id: track.id, title: track.title, before: Boolean(track.hasLyrics), after: hasLyrics });
  track.hasLyrics = hasLyrics;
  if (hasLyrics) {
    const metadataPath = join(root, track.folder, "metadata.json");
    try {
      const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
      metadata.hasLyrics = true;
      metadata.lyrics = lyricsName;
      if (apply) {
        const temporary = `${metadataPath}.tmp`;
        await writeFile(temporary, `${JSON.stringify(metadata, null, 2)}\n`);
        await rename(temporary, metadataPath);
      }
    } catch { /* Un metadata ausente no impide reparar el manifiesto. */ }
  }
}

if (apply && changes.length) {
  const backup = `${manifestPath}.before-lyrics-repair-${Date.now()}.json`;
  await copyFile(manifestPath, backup);
  const temporary = `${manifestPath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(temporary, manifestPath);
  console.log(JSON.stringify({ applied: true, changed: changes.length, backup, changes, confidence: 1, evidence: [manifestPath, backup], warnings: [], fallbackReason: null }, null, 2));
} else {
  console.log(JSON.stringify({ applied: false, changed: changes.length, changes, confidence: 1, evidence: [manifestPath], warnings: apply ? [] : ["Vista previa; usa --apply para escribir"], fallbackReason: null }, null, 2));
}
