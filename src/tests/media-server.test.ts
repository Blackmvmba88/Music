import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { persistTrackLyrics, persistTrackKeywords, persistCoverMetadata, persistTrackGenre, readImageDimensions } = require("../../electron/media-server.cjs") as {
  persistTrackLyrics: (
    root: string,
    catalog: { tracks: Array<Record<string, unknown>> },
    trackId: string,
    lyrics: string,
  ) => Promise<{ hasLyrics: boolean; evidence: string[] }>;
  persistTrackGenre: (root: string, catalog: { tracks: Array<Record<string, unknown>> }, trackId: string, genres: string | string[]) => Promise<{ genre: string; genres: string[] }>;
  persistTrackKeywords: (root: string, catalog: { tracks: Array<Record<string, unknown>> }, trackId: string, keywords: string[]) => Promise<{ lyricKeywords: string[] }>;
  persistCoverMetadata: (root: string, imageFile: string, prompt: string, keywords: string[]) => Promise<{ image: Record<string, unknown> }>;
  readImageDimensions: (file: string) => Promise<{ width: number; height: number } | null>;
};

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("canonical lyrics persistence", () => {
  it("writes lyrics, metadata and manifest atomically", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmmp-lyrics-"));
    temporaryRoots.push(root);
    const folder = join(root, "song--one");
    await mkdir(folder);
    const track = { id: "track-one", folder: "song--one", title: "Song", lyrics: "lyrics.txt" };
    await writeFile(join(root, "library.json"), JSON.stringify({ tracks: [track] }));
    await writeFile(join(folder, "metadata.json"), JSON.stringify(track));
    const runtime = { tracks: [{ id: "track-one", lyrics: "", hasLyrics: false }] };

    const result = await persistTrackLyrics(root, runtime, "track-one", "Linea uno\nLinea dos");

    expect(result.hasLyrics).toBe(true);
    expect(await readFile(join(folder, "lyrics.txt"), "utf8")).toBe("Linea uno\nLinea dos\n");
    expect(JSON.parse(await readFile(join(folder, "metadata.json"), "utf8"))).toMatchObject({ hasLyrics: true, lyrics: "lyrics.txt" });
    expect(JSON.parse(await readFile(join(root, "library.json"), "utf8")).tracks[0]).toMatchObject({ hasLyrics: true, lyrics: "lyrics.txt" });
    expect(runtime.tracks[0]).toMatchObject({ hasLyrics: true, lyrics: "Linea uno\nLinea dos" });
  });

  it("rejects unknown tracks without creating files", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmmp-lyrics-"));
    temporaryRoots.push(root);
    await writeFile(join(root, "library.json"), JSON.stringify({ tracks: [] }));
    await expect(persistTrackLyrics(root, { tracks: [] }, "missing", "text")).rejects.toThrow("track_not_found");
  });

  it("persists editable lyric keywords in metadata, manifest and runtime", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmmp-keywords-"));
    temporaryRoots.push(root);
    const folder = join(root, "song--keywords");
    await mkdir(folder);
    const track = { id: "track-keywords", folder: "song--keywords", title: "Song" };
    await writeFile(join(root, "library.json"), JSON.stringify({ tracks: [track] }));
    await writeFile(join(folder, "metadata.json"), JSON.stringify(track));
    const runtime = { tracks: [{ id: "track-keywords" }] };
    await expect(persistTrackKeywords(root, runtime, "track-keywords", ["Noche", "Ciudad", "noche"])).resolves.toMatchObject({ lyricKeywords: ["noche", "ciudad"] });
    expect(JSON.parse(await readFile(join(root, "library.json"), "utf8")).tracks[0]).toMatchObject({ lyricKeywords: ["noche", "ciudad"], lyricKeywordsSource: "manual" });
    expect(runtime.tracks[0]).toMatchObject({ lyricKeywords: ["noche", "ciudad"] });
  });

  it("persists an image prompt and derives searchable keywords", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmmp-cover-meta-"));
    temporaryRoots.push(root);
    const inbox = join(root, "00_COVER_INBOX");
    await mkdir(inbox);
    await writeFile(join(inbox, "images.json"), JSON.stringify({ images: [{ file: "cover.jpg", originalName: "cover.jpg" }] }));
    const result = await persistCoverMetadata(root, "cover.jpg", "Retrato nocturno con luces de neón en la ciudad", []);
    expect(result.image).toMatchObject({ prompt: "Retrato nocturno con luces de neón en la ciudad" });
    expect((result.image.keywords as string[])).toEqual(expect.arrayContaining(["retrato", "nocturno", "luces", "neon", "ciudad"]));
  });

  it("persists an allowed genre in metadata, manifest and runtime", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmmp-genre-"));
    temporaryRoots.push(root);
    const folder = join(root, "song--one");
    await mkdir(folder);
    const track = { id: "track-one", folder: "song--one", title: "Song" };
    await writeFile(join(root, "library.json"), JSON.stringify({ tracks: [track] }));
    await writeFile(join(folder, "metadata.json"), JSON.stringify(track));
    const runtime = { tracks: [{ id: "track-one", tag: "" }] };
    await expect(persistTrackGenre(root, runtime, "track-one", "Reggae")).resolves.toMatchObject({ genre: "Reggae" });
    expect(JSON.parse(await readFile(join(root, "library.json"), "utf8")).tracks[0]).toMatchObject({ genre: "Reggae", tag: "Reggae" });
    expect(runtime.tracks[0]).toMatchObject({ tag: "Reggae" });
  });

  it("rejects genres outside the controlled list", async () => {
    await expect(persistTrackGenre("/tmp", { tracks: [] }, "track-one", "Otro")).rejects.toThrow("invalid_genre");
  });

  it("persists multiple genres without losing the primary compatibility field", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmmp-genres-"));
    temporaryRoots.push(root);
    const folder = join(root, "song--multi");
    await mkdir(folder);
    const track = { id: "track-multi", folder: "song--multi", title: "Song" };
    await writeFile(join(root, "library.json"), JSON.stringify({ tracks: [track] }));
    await writeFile(join(folder, "metadata.json"), JSON.stringify(track));
    const runtime = { tracks: [{ id: "track-multi", tag: "" }] };
    await expect(persistTrackGenre(root, runtime, "track-multi", ["Rock", "Rap", "Electrónica"])).resolves.toMatchObject({ genre: "Rock", genres: ["Rock", "Rap", "Electrónica"] });
    expect(JSON.parse(await readFile(join(root, "library.json"), "utf8")).tracks[0]).toMatchObject({ genre: "Rock", tag: "Rock", genres: ["Rock", "Rap", "Electrónica"] });
    expect(runtime.tracks[0]).toMatchObject({ tag: "Rock", genres: ["Rock", "Rap", "Electrónica"] });
  });

  it("accepts the added Corrido and Rap genres", async () => {
    for (const genre of ["Corrido", "Rap"]) {
      const root = await mkdtemp(join(tmpdir(), "bmmp-genre-"));
      temporaryRoots.push(root);
      const folder = join(root, "song--one");
      await mkdir(folder);
      const track = { id: "track-one", folder: "song--one", title: "Song" };
      await writeFile(join(root, "library.json"), JSON.stringify({ tracks: [track] }));
      await writeFile(join(folder, "metadata.json"), JSON.stringify(track));
      await expect(persistTrackGenre(root, { tracks: [{ id: "track-one" }] }, "track-one", genre)).resolves.toMatchObject({ genre });
    }
  });

  it("reads PNG dimensions without decoding the full image", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmmp-image-"));
    temporaryRoots.push(root);
    const image = join(root, "panoramic.png");
    const header = Buffer.alloc(24);
    header.write("\x89PNG\r\n\x1a\n", 0, "binary");
    header.writeUInt32BE(1920, 16);
    header.writeUInt32BE(1080, 20);
    await writeFile(image, header);
    await expect(readImageDimensions(image)).resolves.toEqual({ width: 1920, height: 1080 });
  });
});
