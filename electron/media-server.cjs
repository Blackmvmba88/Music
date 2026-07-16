const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { extractTextKeywords, sanitizeKeywords } = require("./metadata-keywords.cjs");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};
const json = (res, status, body) => {
  res.writeHead(status, {
    "Content-Type": MIME[".json"],
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
};
const safeId = (value) => (/^[a-zA-Z0-9_-]+$/.test(value || "") ? value : null);
const sanitizeRatings = (value) => Object.fromEntries(Object.entries(value && typeof value === "object" ? value : {}).filter(([key, rating]) => key.length <= 500 && Number.isInteger(rating) && rating >= 1 && rating <= 5));
const readJsonBody = async (req) => { let raw = ""; for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) throw new Error("body_too_large"); } return JSON.parse(raw || "{}"); };
const atomicWrite = async (target, content) => { const temporary = `${target}.tmp-${process.pid}-${Date.now()}`; await fsp.writeFile(temporary, content); await fsp.rename(temporary, target); };
const imageDimensionsCache = new Map();
async function readImageDimensions(file) {
  if (imageDimensionsCache.has(file)) return imageDimensionsCache.get(file);
  const handle = await fsp.open(file, "r");
  try {
    const buffer = Buffer.alloc(131072);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const data = buffer.subarray(0, bytesRead);
    let size = null;
    if (data.length >= 24 && data.toString("ascii", 1, 4) === "PNG") size = { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
    else if (data[0] === 0xff && data[1] === 0xd8) {
      for (let offset = 2; offset + 9 < data.length;) {
        if (data[offset] !== 0xff) { offset += 1; continue; }
        const marker = data[offset + 1];
        const length = data.readUInt16BE(offset + 2);
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) { size = { width: data.readUInt16BE(offset + 7), height: data.readUInt16BE(offset + 5) }; break; }
        offset += Math.max(2, length + 2);
      }
    }
    imageDimensionsCache.set(file, size);
    return size;
  } finally { await handle.close(); }
}

async function persistTrackLyrics(root, runtimeCatalog, trackId, rawLyrics) {
  if (!root) throw new Error("usb_not_available");
  const lyrics = String(rawLyrics ?? "").trim();
  if (lyrics.length > 500_000) throw new Error("lyrics_too_large");
  const manifestPath = path.join(root, "library.json");
  const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
  const item = (manifest.tracks || []).find((track) => track.id === trackId);
  if (!item) throw new Error("track_not_found");
  const folder = path.resolve(root, item.folder);
  if (!folder.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error("invalid_track_folder");
  const lyricsName = path.basename(item.lyrics || "lyrics.txt");
  const lyricsPath = path.join(folder, lyricsName);
  const metadataPath = path.join(folder, "metadata.json");
  let metadata = { ...item };
  try { metadata = { ...metadata, ...JSON.parse(await fsp.readFile(metadataPath, "utf8")) }; } catch { /* El manifiesto permite reconstruir metadata. */ }
  const lyricKeywords = extractTextKeywords(lyrics);
  Object.assign(item, { lyrics: lyricsName, hasLyrics: Boolean(lyrics), lyricKeywords, lyricKeywordsSource: "auto", lyricsUpdatedAt: new Date().toISOString() });
  Object.assign(metadata, { lyrics: lyricsName, hasLyrics: Boolean(lyrics), lyricKeywords, lyricKeywordsSource: "auto", lyricsUpdatedAt: item.lyricsUpdatedAt });
  await atomicWrite(lyricsPath, lyrics ? `${lyrics}\n` : "");
  await atomicWrite(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const runtimeTrack = runtimeCatalog?.tracks.find((track) => track.id === trackId);
  if (runtimeTrack) Object.assign(runtimeTrack, { lyrics, hasLyrics: Boolean(lyrics), lyricKeywords, lyricKeywordsSource: "auto" });
  return { lyrics, hasLyrics: Boolean(lyrics), lyricKeywords, evidence: [lyricsPath, metadataPath, manifestPath] };
}

async function persistTrackKeywords(root, runtimeCatalog, trackId, rawKeywords) {
  if (!root) throw new Error("usb_not_available");
  const lyricKeywords = sanitizeKeywords(rawKeywords);
  const manifestPath = path.join(root, "library.json");
  const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
  const item = (manifest.tracks || []).find((track) => track.id === trackId);
  if (!item) throw new Error("track_not_found");
  const folder = path.resolve(root, item.folder);
  if (!folder.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error("invalid_track_folder");
  const metadataPath = path.join(folder, "metadata.json");
  let metadata = { ...item };
  try { metadata = { ...metadata, ...JSON.parse(await fsp.readFile(metadataPath, "utf8")) }; } catch {}
  const lyricKeywordsUpdatedAt = new Date().toISOString();
  Object.assign(item, { lyricKeywords, lyricKeywordsSource: "manual", lyricKeywordsUpdatedAt });
  Object.assign(metadata, { lyricKeywords, lyricKeywordsSource: "manual", lyricKeywordsUpdatedAt });
  await atomicWrite(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const runtimeTrack = runtimeCatalog?.tracks.find((track) => track.id === trackId);
  if (runtimeTrack) Object.assign(runtimeTrack, { lyricKeywords, lyricKeywordsSource: "manual" });
  return { lyricKeywords, evidence: [metadataPath, manifestPath] };
}

async function persistCoverMetadata(root, imageFile, rawPrompt, rawKeywords) {
  if (!root) throw new Error("usb_not_available");
  const file = path.basename(String(imageFile || ""));
  const prompt = String(rawPrompt || "").trim().slice(0, 4000);
  const keywords = sanitizeKeywords(rawKeywords?.length ? rawKeywords : extractTextKeywords(prompt));
  const manifestPath = path.join(root, "00_COVER_INBOX", "images.json");
  const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
  const image = (manifest.images || []).find((item) => item.file === file);
  if (!image) throw new Error("image_not_found");
  Object.assign(image, { prompt, keywords, promptSource: "manual", metadataUpdatedAt: new Date().toISOString() });
  manifest.updatedAt = image.metadataUpdatedAt;
  await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { image: { ...image }, evidence: [manifestPath] };
}

async function persistTrackGenre(root, runtimeCatalog, trackId, rawGenres) {
  const allowed = new Set(["Reggae", "Rock", "Reggaeton", "Pop", "Clásica", "Electrónica", "Corrido", "Rap"]);
  const genres = [...new Set((Array.isArray(rawGenres) ? rawGenres : rawGenres ? [rawGenres] : []).map((value) => String(value).trim()).filter(Boolean))];
  if (genres.some((genre) => !allowed.has(genre))) throw new Error("invalid_genre");
  const genre = genres[0] || "";
  if (!root) throw new Error("usb_not_available");
  const manifestPath = path.join(root, "library.json");
  const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
  const item = (manifest.tracks || []).find((track) => track.id === trackId);
  if (!item) throw new Error("track_not_found");
  const folder = path.resolve(root, item.folder);
  if (!folder.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error("invalid_track_folder");
  const metadataPath = path.join(folder, "metadata.json");
  let metadata = { ...item };
  try { metadata = { ...metadata, ...JSON.parse(await fsp.readFile(metadataPath, "utf8")) }; } catch { /* El manifiesto permite reconstruir metadata. */ }
  Object.assign(item, { tag: genre, genre, genres, genreUpdatedAt: new Date().toISOString() });
  Object.assign(metadata, { tag: genre, genre, genres, genreUpdatedAt: item.genreUpdatedAt });
  await atomicWrite(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const runtimeTrack = runtimeCatalog?.tracks.find((track) => track.id === trackId);
  if (runtimeTrack) Object.assign(runtimeTrack, { tag: genre, genres });
  return { genre, genres, evidence: [metadataPath, manifestPath] };
}

async function findLibraryRoot() {
  const candidates = [
    process.env.BLACKMAMBA_LIBRARY_ROOT,
    "/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER",
  ].filter(Boolean);
  for (const root of candidates)
    try {
      await fsp.access(path.join(root, "library.json"));
      return root;
    } catch {}
  return null;
}

async function createCatalog(root, appRoot, origin) {
  const tracks = [];
  const localById = new Map();
  if (root) {
    const library = JSON.parse(
      await fsp.readFile(path.join(root, "library.json"), "utf8"),
    );
    for (const item of library.tracks || []) {
      const audioPath = path.join(root, item.folder, item.audio || "audio.mp3");
      localById.set(item.id, audioPath);
      const coverPath = path.join(root, item.folder, item.cover || "cover.jpg");
      const panoramicCoverPath = path.join(root, item.folder, item.panoramicCover || "panoramic-cover.jpg");
      const lyricsPath = path.join(
        root,
        item.folder,
        item.lyrics || "lyrics.txt",
      );
      let lyrics = "";
      try {
        lyrics = await fsp.readFile(lyricsPath, "utf8");
      } catch {}
      if (/^(LETRA|TRANSCRIPCI[ÓO]N) PENDIENTE/i.test(lyrics.trim())) lyrics = "";
      tracks.push({
        id: item.id,
        title: item.title,
        artist: item.artist || "Iyari Gomez",
        postAuthor: item.postAuthor || "Iyari Cancino Gomez",
        composer: item.composer || "Iyari Cancino Gomez",
        recordLabel: item.recordLabel || "BlackMamba RECORDS",
        pLine: item.pLine || "2025 BlackMamba RECORDS",
        file: `${origin}/api/media/${item.id}`,
        downloadUrl: `${origin}/api/download/${item.id}`,
        streamUrl: null,
        duration: `${Math.floor((item.durationSeconds || 0) / 60)}:${String(Math.floor((item.durationSeconds || 0) % 60)).padStart(2, "0")}`,
        tag: item.genre || item.tag || "",
        genres: Array.isArray(item.genres) ? item.genres : (item.genre || item.tag ? [item.genre || item.tag] : []),
        cover: fs.existsSync(coverPath)
          ? `${origin}/api/cover/${item.id}`
          : null,
        panoramicCover: fs.existsSync(panoramicCoverPath)
          ? `${origin}/api/panoramic-cover/${item.id}`
          : null,
        lyrics,
        hasLyrics: Boolean(lyrics.trim()),
        lyricKeywords: Array.isArray(item.lyricKeywords) && item.lyricKeywords.length ? item.lyricKeywords : extractTextKeywords(lyrics),
        lyricKeywordsSource: item.lyricKeywordsSource || "auto",
        localStatus: "available",
        localFormat: path.extname(audioPath).slice(1).toLowerCase(),
        source: "usb",
        availabilityStatus: "local",
        preferredSource: null,
        confidence: item.confidence ?? 0.8,
        evidence: [audioPath],
        warnings: item.warnings || [],
        fallbackReason: item.fallbackReason ?? null,
        ownership: item.ownership || null,
      });
    }
  }
  const auditPath = path.join(appRoot, "dist", "player", "source-audit.json");
  const remoteById = new Map();
  try {
    const audit = JSON.parse(await fsp.readFile(auditPath, "utf8"));
    for (const item of audit.records || [])
      if (item.localStatus === "recoverable") {
        remoteById.set(item.soundcloudId, item);
        const canStream = Boolean(process.env.SOUNDCLOUD_STREAM_API);
        const preferredSource = item.sunoCandidates?.length
          ? "suno"
          : "soundcloud";
        tracks.push({
          id: `sc-${item.soundcloudId}`,
          title: item.title,
          artist: "Iyari Gomez",
          file: "",
          streamUrl: canStream
            ? `${origin}/api/stream/${item.soundcloudId}`
            : null,
          sourceUrl: item.soundcloudUrl,
          duration: `${Math.floor(item.durationSeconds / 60)}:${String(item.durationSeconds % 60).padStart(2, "0")}`,
          tag: canStream
            ? "Stream SoundCloud"
            : preferredSource === "suno"
              ? "Recuperar WAV · Suno"
              : "Recuperar · SoundCloud",
          cover: null,
          panoramicCover: null,
          lyrics: "",
          hasLyrics: false,
          localStatus: "recoverable",
          localFormat: null,
          source: "soundcloud",
          availabilityStatus: canStream ? "stream" : "recoverable",
          preferredSource,
          preferredAction:
            preferredSource === "suno"
              ? "download_wav_from_suno"
              : "download_from_soundcloud",
          sunoCandidates: item.sunoCandidates || [],
          confidence: item.confidence,
          evidence: item.evidence,
          warnings: item.warnings,
          fallbackReason: item.fallbackReason,
        });
      }
  } catch {}
  return {
    tracks,
    localById,
    remoteById,
    confidence: root ? 0.98 : 0.65,
    evidence: root ? [`USB detectada: ${root}`] : [],
    warnings: root ? [] : ["USB no detectada"],
    fallbackReason: root
      ? null
      : "Se muestran metadatos y streaming remoto disponible",
  };
}

function streamFile(req, res, file, extraHeaders = {}) {
  if (!file || !fs.existsSync(file))
    return json(res, 404, { error: "media_not_found" });
  const stat = fs.statSync(file),
    range = req.headers.range;
  if (range) {
    const [a, b] = range.replace(/bytes=/, "").split("-");
    const start = Number(a),
      end = b ? Number(b) : stat.size - 1;
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      "Content-Type":
        MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      ...extraHeaders,
    });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": stat.size,
      "Accept-Ranges": "bytes",
      "Content-Type":
        MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      ...extraHeaders,
    });
    fs.createReadStream(file).pipe(res);
  }
}

async function startMediaServer(appRoot) {
  let catalog;
  const storageRoot = path.join(appRoot, ".bmmp-data");
  const ratingsPath = path.join(storageRoot, "ratings.json");
  const lyricJobs = new Map();
  const lyricQueue = [];
  let activeLyricJobs = 0;
  const maxConcurrentLyricJobs = 1;
  const drainLyricQueue = () => {
    while (activeLyricJobs < maxConcurrentLyricJobs && lyricQueue.length) {
      const queued = lyricQueue.shift();
      activeLyricJobs += 1;
      void launchLyricJob(queued);
    }
    lyricQueue.forEach((queued, index) => Object.assign(queued.job, { progress: 1, message: `En cola · turno ${index + 1}` }));
  };
  const launchLyricJob = async ({ trackId, root, job }) => {
    Object.assign(job, { status: "running", progress: 2, message: "Iniciando extracción" });
    const finish = () => { activeLyricJobs = Math.max(0, activeLyricJobs - 1); drainLyricQueue(); };
    try {
      const candidates = [
        path.join(appRoot, ".venv-transcribe312", "bin", "python"),
        path.join(appRoot, ".venv-transcribe", "bin", "python"),
        "python3",
      ];
      const python = candidates.find((candidate) => candidate === "python3" || fs.existsSync(candidate));
      const child = spawn(python, [path.join(appRoot, "scripts", "transcribe-one-track.py"), root, trackId], { cwd: "/tmp" });
      let buffer = "";
      let errors = "";
      child.stdout.on("data", (chunk) => {
        buffer += String(chunk);
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) try {
          const event = JSON.parse(line);
          if (typeof event.progress === "number") Object.assign(job, { progress: event.progress, message: event.message || job.message });
          if (event.lyrics) job.lyrics = event.lyrics;
        } catch { /* Las líneas de progreso no JSON se ignoran. */ }
      });
      child.stderr.on("data", (chunk) => { errors += String(chunk); });
      child.on("error", (error) => Object.assign(job, { status: "error", message: "No se pudo iniciar la extracción", error: error.message }));
      child.on("close", async (code) => {
        try {
          if (job.status === "error") return;
          if (code === 0 && job.lyrics) {
            const result = await persistTrackLyrics(root, catalog, trackId, job.lyrics);
            Object.assign(job, { status: "done", progress: 100, message: "Letra y palabras clave guardadas", lyricKeywords: result.lyricKeywords });
          } else Object.assign(job, { status: "error", message: "Extracción fallida", error: errors.trim() || "No se pudo extraer la letra" });
        } catch (error) {
          Object.assign(job, { status: "error", message: "No se pudo guardar la letra", error: error.message });
        } finally { finish(); }
      });
    } catch (error) {
      Object.assign(job, { status: "error", message: "No se pudo iniciar la extracción", error: error.message });
      finish();
    }
  };
  const startLyricJob = async (trackId) => {
    const existing = lyricJobs.get(trackId);
    if (existing && ["queued", "running"].includes(existing.status)) return existing;
    const root = await findLibraryRoot();
    if (!root) throw new Error("usb_not_available");
    const job = { progress: 1, message: "En cola", status: "queued" };
    lyricJobs.set(trackId, job);
    lyricQueue.push({ trackId, root, job });
    drainLyricQueue();
    return job;
  };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/api/profile/ratings" && req.method === "GET") {
      try {
        const stored = JSON.parse(await fsp.readFile(ratingsPath, "utf8"));
        return json(res, 200, { ratings: sanitizeRatings(stored.ratings), confidence: 1, evidence: [ratingsPath], warnings: [], fallbackReason: null });
      } catch (error) {
        return json(res, 200, { ratings: {}, confidence: error?.code === "ENOENT" ? 1 : 0.5, evidence: [], warnings: error?.code === "ENOENT" ? [] : ["No se pudieron leer las calificaciones"], fallbackReason: error?.code === "ENOENT" ? null : String(error.message || error) });
      }
    }
    if (url.pathname === "/api/profile/ratings" && req.method === "PUT") {
      try {
        const ratings = sanitizeRatings((await readJsonBody(req)).ratings);
        await fsp.mkdir(storageRoot, { recursive: true });
        const temporary = `${ratingsPath}.tmp`;
        await fsp.writeFile(temporary, `${JSON.stringify({ ratings, updatedAt: new Date().toISOString() }, null, 2)}\n`);
        await fsp.rename(temporary, ratingsPath);
        return json(res, 200, { ratings, confidence: 1, evidence: [ratingsPath], warnings: [], fallbackReason: null });
      } catch (error) {
        return json(res, 400, { error: "ratings_not_saved", confidence: 0, evidence: [], warnings: ["No se pudieron guardar las calificaciones"], fallbackReason: String(error.message || error) });
      }
    }
    if (url.pathname === "/player/library.json") return json(res, 200, catalog);
    const canonicalLyrics = url.pathname.match(/^\/api\/tracks\/([a-zA-Z0-9_-]+)\/lyrics$/);
    if (canonicalLyrics && req.method === "PUT") {
      try {
        const result = await persistTrackLyrics(await findLibraryRoot(), catalog, canonicalLyrics[1], (await readJsonBody(req)).lyrics);
        return json(res, 200, { ok: true, confidence: 1, ...result, warnings: [], fallbackReason: null });
      } catch (error) {
        const status = error.message === "track_not_found" ? 404 : 400;
        return json(res, status, { ok: false, confidence: 1, evidence: [], warnings: ["No se pudo guardar la letra en la biblioteca canónica"], fallbackReason: error.message || String(error) });
      }
    }
    const canonicalKeywords = url.pathname.match(/^\/api\/tracks\/([a-zA-Z0-9_-]+)\/keywords$/);
    if (canonicalKeywords && req.method === "PUT") {
      try {
        const result = await persistTrackKeywords(await findLibraryRoot(), catalog, canonicalKeywords[1], (await readJsonBody(req)).keywords);
        return json(res, 200, { ok: true, confidence: 1, ...result, warnings: [], fallbackReason: null });
      } catch (error) {
        return json(res, error.message === "track_not_found" ? 404 : 400, { ok: false, confidence: 1, evidence: [], warnings: ["No se pudieron guardar las palabras clave"], fallbackReason: error.message || String(error) });
      }
    }
    const canonicalGenre = url.pathname.match(/^\/api\/tracks\/([a-zA-Z0-9_-]+)\/genre$/);
    if (canonicalGenre && req.method === "PUT") {
      try {
        const body = await readJsonBody(req);
        const result = await persistTrackGenre(await findLibraryRoot(), catalog, canonicalGenre[1], body.genres ?? body.genre);
        return json(res, 200, { ok: true, confidence: 1, ...result, warnings: [], fallbackReason: null });
      } catch (error) {
        return json(res, error.message === "track_not_found" ? 404 : 400, { ok: false, confidence: 1, evidence: [], warnings: ["No se pudo guardar el género"], fallbackReason: error.message || String(error) });
      }
    }
    if (url.pathname === "/api/cover-inbox") {
      const root = await findLibraryRoot();
      if (!root) return json(res, 503, { error: "usb_not_available" });
      try {
        const manifest = JSON.parse(await fsp.readFile(path.join(root, "00_COVER_INBOX", "images.json"), "utf8"));
        const sourceImages = manifest.images || [];
        const images = [];
        for (let offset = 0; offset < sourceImages.length; offset += 24) {
          const batch = await Promise.all(sourceImages.slice(offset, offset + 24).map(async (item) => {
            let dimensions = null;
            try { dimensions = await readImageDimensions(path.join(root, "00_COVER_INBOX", path.basename(item.file))); } catch { /* Formato no indexable; se conserva en Otros. */ }
            return { ...item, ...dimensions, url: `${origin}/api/cover-inbox/${item.file}` };
          }));
          images.push(...batch);
        }
        return json(res, 200, { ...manifest, images });
      } catch { return json(res, 404, { error: "cover_inbox_not_found" }); }
    }
    const inboxMetadata = url.pathname.match(/^\/api\/cover-inbox\/([a-zA-Z0-9_.-]+)\/metadata$/);
    if (inboxMetadata && req.method === "PUT") {
      try {
        const body = await readJsonBody(req);
        const result = await persistCoverMetadata(await findLibraryRoot(), inboxMetadata[1], body.prompt, body.keywords);
        return json(res, 200, { ok: true, confidence: 1, ...result, warnings: [], fallbackReason: null });
      } catch (error) {
        return json(res, error.message === "image_not_found" ? 404 : 400, { ok: false, confidence: 1, evidence: [], warnings: ["No se pudo guardar la metadata de la imagen"], fallbackReason: error.message || String(error) });
      }
    }
    const inboxImage = url.pathname.match(/^\/api\/cover-inbox\/([a-zA-Z0-9_.-]+)$/);
    if (inboxImage) {
      const root = await findLibraryRoot();
      return streamFile(req, res, root && path.join(root, "00_COVER_INBOX", path.basename(inboxImage[1])));
    }
    if (url.pathname === "/api/assign-cover" && req.method === "POST") {
      const root = await findLibraryRoot();
      if (!root) return json(res, 503, { error: "usb_not_available" });
      let raw = "";
      for await (const chunk of req) raw += chunk;
      try {
        const body = JSON.parse(raw);
        const imageFile = path.basename(String(body.imageFile || ""));
        const trackId = safeId(String(body.trackId || ""));
        const track = catalog.tracks.find((item) => item.id === trackId);
        const audio = catalog.localById.get(trackId);
        if (!track || !audio || !imageFile) return json(res, 404, { error: "assignment_target_not_found" });
        const source = path.join(root, "00_COVER_INBOX", imageFile);
        const kind = body.kind === "panoramic" ? "panoramic" : "square";
        const target = path.join(path.dirname(audio), kind === "panoramic" ? "panoramic-cover.jpg" : "cover.jpg");
        await fsp.copyFile(source, target);
        const url = `${origin}/api/${kind === "panoramic" ? "panoramic-cover" : "cover"}/${trackId}?v=${Date.now()}`;
        if (kind === "panoramic") track.panoramicCover = url; else track.cover = url;
        return json(res, 200, { ok: true, trackId, kind, cover: track.cover, panoramicCover: track.panoramicCover });
      } catch (error) { return json(res, 400, { error: "invalid_assignment", detail: error.message }); }
    }
    if (url.pathname === "/api/delete-cover-assets" && req.method === "POST") {
      const root = await findLibraryRoot();
      if (!root) return json(res, 503, { error: "usb_not_available" });
      let raw = "";
      for await (const chunk of req) raw += chunk;
      try {
        const body = JSON.parse(raw);
        const requested = new Set((Array.isArray(body.files) ? body.files : []).map((file) => path.basename(String(file))));
        const manifestPath = path.join(root, "00_COVER_INBOX", "images.json");
        const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
        const removable = (manifest.images || []).filter((item) => requested.has(item.file) && !item.matchedTrackId);
        for (const item of removable) await fsp.rm(path.join(root, "00_COVER_INBOX", item.file), { force: true });
        manifest.images = (manifest.images || []).filter((item) => !removable.some((removed) => removed.file === item.file));
        manifest.unique = manifest.images.length;
        manifest.updatedAt = new Date().toISOString();
        await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        return json(res, 200, { deleted: removable.length, protected: requested.size - removable.length });
      } catch (error) { return json(res, 400, { error: "invalid_delete_request", detail: error.message }); }
    }
    const lyricRoute = url.pathname.match(/^\/api\/lyrics\/([a-zA-Z0-9_-]+)$/);
    if (lyricRoute && req.method === "POST") {
      try { const job = await startLyricJob(lyricRoute[1]); return json(res, ["queued", "running"].includes(job.status) ? 202 : 200, job); }
      catch (error) { return json(res, 400, { error: error.message || "lyric_job_failed" }); }
    }
    if (lyricRoute && req.method === "GET") {
      const job = lyricJobs.get(lyricRoute[1]);
      return job ? json(res, 200, job) : json(res, 404, { error: "lyric_job_not_found" });
    }
    const media = url.pathname.match(/^\/api\/(media|cover|panoramic-cover)\/([^/]+)$/);
    if (media) {
      const id = safeId(media[2]);
      const audio = catalog.localById.get(id);
      const file = media[1] === "cover" && audio ? path.join(path.dirname(audio), "cover.jpg") : media[1] === "panoramic-cover" && audio ? path.join(path.dirname(audio), "panoramic-cover.jpg") : audio;
      return streamFile(req, res, file);
    }
    const download = url.pathname.match(/^\/api\/download\/([^/]+)$/);
    if (download) {
      const id = safeId(download[1]);
      const audio = catalog.localById.get(id);
      const track = catalog.tracks.find((item) => item.id === id);
      if (!audio || !track)
        return json(res, 404, { error: "download_not_available" });
      const extension = path.extname(audio).toLowerCase() || ".mp3";
      const filename = `${track.title}${extension}`;
      return streamFile(req, res, audio, {
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "X-Content-Type-Options": "nosniff",
      });
    }
    const remote = url.pathname.match(/^\/api\/stream\/([^/]+)$/);
    if (remote) {
      const id = safeId(remote[1]),
        base = process.env.SOUNDCLOUD_STREAM_API;
      if (!base)
        return json(res, 503, {
          error: "soundcloud_stream_backend_not_configured",
        });
      const upstream = await fetch(
        `${base.replace(/\/$/, "")}/tracks/${id}/stream`,
        { headers: { range: req.headers.range || "" } },
      );
      res.writeHead(upstream.status, Object.fromEntries(upstream.headers));
      if (!upstream.body) return res.end();
      const reader = upstream.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      return res.end();
    }
    let filePath = path.join(
      appRoot,
      "dist",
      url.pathname === "/" ? "index.html" : url.pathname,
    );
    if (!filePath.startsWith(path.join(appRoot, "dist")))
      return json(res, 403, { error: "forbidden" });
    try {
      const data = await fsp.readFile(filePath);
      res.writeHead(200, {
        "Content-Type":
          MIME[path.extname(filePath)] || "application/octet-stream",
      });
      res.end(data);
    } catch {
      try {
        const data = await fsp.readFile(
          path.join(appRoot, "dist", "index.html"),
        );
        res.writeHead(200, { "Content-Type": MIME[".html"] });
        res.end(data);
      } catch {
        json(res, 404, { error: "not_found" });
      }
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port,
    origin = `http://127.0.0.1:${port}`;
  catalog = await createCatalog(await findLibraryRoot(), appRoot, origin);
  return {
    server,
    origin,
    summary: {
      tracks: catalog.tracks.length,
      usb: catalog.localById.size,
      remote: catalog.remoteById.size,
      confidence: catalog.confidence,
      warnings: catalog.warnings,
    },
  };
}
module.exports = { startMediaServer, findLibraryRoot, persistTrackLyrics, persistTrackKeywords, persistCoverMetadata, persistTrackGenre, readImageDimensions };
