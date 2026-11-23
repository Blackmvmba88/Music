#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const input = resolve(root, process.argv[2] || ".tmp-soundcloud.jsonl");
const output = resolve(root, process.argv[3] || ".tmp-soundcloud-api-tracks.json");

const lines = (await readFile(input, "utf8")).split("\n").map((line) => line.trim()).filter(Boolean);
const raw = lines.map((line, index) => {
  try { return JSON.parse(line); }
  catch (error) { throw new Error(`JSONL inválido en línea ${index + 1}: ${error.message}`); }
});

const tracks = raw.map((item) => {
  const id = item.id != null ? String(item.id) : null;
  const permalinkUrl = item.webpage_url || item.original_url || item.url || null;
  const durationSeconds = Number(item.duration) || 0;
  const createdAt = item.timestamp ? new Date(Number(item.timestamp) * 1000).toISOString() : null;
  return {
    id,
    urn: id ? `soundcloud:tracks:${id}` : null,
    title: item.title || "",
    durationSeconds,
    durationFormatted: durationSeconds
      ? `${Math.floor(durationSeconds / 60)}:${String(Math.floor(durationSeconds % 60)).padStart(2, "0")}`
      : null,
    permalinkUrl,
    genre: item.genre || null,
    createdAt,
    sharing: null,
    likesCount: Number(item.like_count ?? item.likes_count) || 0,
    playbackCount: Number(item.view_count ?? item.playback_count) || 0,
    description: item.description || null,
    artworkUrl: item.thumbnail || null,
    profileAvatarUrl: null,
    hasTrackArtwork: Boolean(item.thumbnail),
  };
}).filter((item) => item.id && item.title && item.permalinkUrl);

await writeFile(output, JSON.stringify({
  generatedAt: new Date().toISOString(),
  user: { username: "BlackMamba RECORDS", permalinkUrl: "https://soundcloud.com/iyari-c" },
  summary: { totalTracks: tracks.length },
  tracks,
}, null, 2) + "\n");

console.log(JSON.stringify({ totalTracks: tracks.length, output }, null, 2));
