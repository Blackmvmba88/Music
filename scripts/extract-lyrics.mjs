import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const libraryPath = path.join(root, 'suno-library.json');
const playerDir = path.join(root, 'public', 'player');
const lyricsDir = path.join(root, 'public', 'lyrics');

const args = process.argv.slice(2);
const trackIdArg = args[0];

if (!fs.existsSync(lyricsDir)) {
  fs.mkdirSync(lyricsDir, { recursive: true });
}

const allFiles = fs.readdirSync(playerDir).filter(f => f.endsWith('.mp3'));
console.log(`Found ${allFiles.length} MP3 files in public/player.`);

let tracksToProcess = [];

if (trackIdArg) {
  const mp3Name = trackIdArg.endsWith('.mp3') ? trackIdArg : `${trackIdArg}.mp3`;
  if (!allFiles.includes(mp3Name)) {
    console.error(`Track ${mp3Name} not found in public/player.`);
    process.exit(1);
  }
  tracksToProcess.push(mp3Name.replace('.mp3', ''));
} else {
  // Find tracks that don't have lyrics yet, limit to 5 per batch
  tracksToProcess = allFiles
    .map(f => f.replace('.mp3', ''))
    .filter(id => {
      const vttPath = path.join(lyricsDir, `${id}.vtt`);
      return !fs.existsSync(vttPath);
    })
    .slice(0, 20); // Limit to 20 to avoid running too long by default
}

if (tracksToProcess.length === 0) {
  console.log("No tracks to process (or no matching MP3s found without lyrics).");
  process.exit(0);
}

console.log(`Processing ${tracksToProcess.length} tracks...`);

for (const trackId of tracksToProcess) {
  const mp3Path = path.join(playerDir, `${trackId}.mp3`);
  
  console.log(`\n=== Transcribing [${trackId}] ===`);
  try {
    // We use the tiny model by default for speed. Can be changed to 'base' or 'small'.
    // Whisper outputs to lyricsDir.
    const command = `"${path.join(root, '.venv', 'bin', 'whisper')}" "${mp3Path}" --model tiny --output_dir "${lyricsDir}" --output_format vtt`;
    console.log(`Running: ${command}`);
    
    execSync(command, { stdio: 'inherit' });
    console.log(`✔ Finished ${trackId}`);
  } catch (err) {
    console.error(`✖ Error processing ${trackId}:`, err.message);
  }
}

console.log("\nDone!");
