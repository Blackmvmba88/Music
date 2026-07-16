const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
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
const readJsonBody = async (req) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
};
const sanitizeRatings = (value) => {
  const ratings = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return ratings;
  for (const [key, rating] of Object.entries(value)) {
    const numeric = Number(rating);
    if (key && Number.isInteger(numeric) && numeric >= 1 && numeric <= 5)
      ratings[key] = numeric;
  }
  return ratings;
};
const atomicWrite = async (target, content) => {
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fsp.writeFile(temporary, content);
  await fsp.rename(temporary, target);
};
const imageDimensionsCache = new Map();
async function readImageDimensions(file) {
  if (imageDimensionsCache.has(file)) return imageDimensionsCache.get(file);
  const handle = await fsp.open(file, "r");
  try {
    const buffer = Buffer.alloc(131072);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const data = buffer.subarray(0, bytesRead);
    let size = null;
    if (data.length >= 24 && data.toString("ascii", 1, 4) === "PNG")
      size = { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
    else if (data[0] === 0xff && data[1] === 0xd8) {
      for (let offset = 2; offset + 9 < data.length;) {
        if (data[offset] !== 0xff) { offset += 1; continue; }
        const marker = data[offset + 1];
        const length = data.readUInt16BE(offset + 2);
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
          size = { width: data.readUInt16BE(offset + 7), height: data.readUInt16BE(offset + 5) };
          break;
        }
        offset += Math.max(2, length + 2);
      }
    }
    imageDimensionsCache.set(file, size);
    return size;
  } finally { await handle.close(); }
}
async function canonicalTrack(root, trackId) {
  if (!root) throw new Error("usb_not_available");
  const manifestPath = path.join(root, "library.json");
  const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
  const item = (manifest.tracks || []).find((track) => track.id === trackId);
  if (!item) throw new Error("track_not_found");
  const folder = path.resolve(root, item.folder);
  if (!folder.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error("invalid_track_folder");
  const metadataPath = path.join(folder, "metadata.json");
  let metadata = { ...item };
  try { metadata = { ...metadata, ...JSON.parse(await fsp.readFile(metadataPath, "utf8")) }; } catch {}
  return { manifestPath, manifest, item, folder, metadataPath, metadata };
}
async function persistTrackLyrics(root, runtimeCatalog, trackId, rawLyrics) {
  const lyrics = String(rawLyrics ?? "").trim();
  if (lyrics.length > 500_000) throw new Error("lyrics_too_large");
  const state = await canonicalTrack(root, trackId);
  const lyricsName = path.basename(state.item.lyrics || "lyrics.txt");
  const lyricsPath = path.join(state.folder, lyricsName);
  const lyricKeywords = extractTextKeywords(lyrics);
  const lyricsUpdatedAt = new Date().toISOString();
  Object.assign(state.item, { lyrics: lyricsName, hasLyrics: Boolean(lyrics), lyricKeywords, lyricKeywordsSource: "auto", lyricsUpdatedAt });
  Object.assign(state.metadata, { lyrics: lyricsName, hasLyrics: Boolean(lyrics), lyricKeywords, lyricKeywordsSource: "auto", lyricsUpdatedAt });
  await atomicWrite(lyricsPath, lyrics ? `${lyrics}\n` : "");
  await atomicWrite(state.metadataPath, `${JSON.stringify(state.metadata, null, 2)}\n`);
  await atomicWrite(state.manifestPath, `${JSON.stringify(state.manifest, null, 2)}\n`);
  const runtimeTrack = runtimeCatalog?.tracks.find((track) => track.id === trackId);
  if (runtimeTrack) Object.assign(runtimeTrack, { lyrics, hasLyrics: Boolean(lyrics), lyricKeywords, lyricKeywordsSource: "auto" });
  return { lyrics, hasLyrics: Boolean(lyrics), lyricKeywords, evidence: [lyricsPath, state.metadataPath, state.manifestPath] };
}
async function persistTrackKeywords(root, runtimeCatalog, trackId, rawKeywords) {
  const state = await canonicalTrack(root, trackId);
  const lyricKeywords = sanitizeKeywords(rawKeywords);
  const lyricKeywordsUpdatedAt = new Date().toISOString();
  Object.assign(state.item, { lyricKeywords, lyricKeywordsSource: "manual", lyricKeywordsUpdatedAt });
  Object.assign(state.metadata, { lyricKeywords, lyricKeywordsSource: "manual", lyricKeywordsUpdatedAt });
  await atomicWrite(state.metadataPath, `${JSON.stringify(state.metadata, null, 2)}\n`);
  await atomicWrite(state.manifestPath, `${JSON.stringify(state.manifest, null, 2)}\n`);
  const runtimeTrack = runtimeCatalog?.tracks.find((track) => track.id === trackId);
  if (runtimeTrack) Object.assign(runtimeTrack, { lyricKeywords, lyricKeywordsSource: "manual" });
  return { lyricKeywords, evidence: [state.metadataPath, state.manifestPath] };
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
  const state = await canonicalTrack(root, trackId);
  const genre = genres[0] || "";
  const genreUpdatedAt = new Date().toISOString();
  Object.assign(state.item, { tag: genre, genre, genres, genreUpdatedAt });
  Object.assign(state.metadata, { tag: genre, genre, genres, genreUpdatedAt });
  await atomicWrite(state.metadataPath, `${JSON.stringify(state.metadata, null, 2)}\n`);
  await atomicWrite(state.manifestPath, `${JSON.stringify(state.manifest, null, 2)}\n`);
  const runtimeTrack = runtimeCatalog?.tracks.find((track) => track.id === trackId);
  if (runtimeTrack) Object.assign(runtimeTrack, { tag: genre, genres });
  return { genre, genres, evidence: [state.metadataPath, state.manifestPath] };
}
const safeId = (value) => (/^[a-zA-Z0-9_-]+$/.test(value || "") ? value : null);
const normalizeTitle = (value = "") =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const durationSeconds = (value) => {
  if (typeof value === "number") return value;
  const parts = String(value || "").split(":").map(Number);
  return parts.some(Number.isNaN)
    ? 0
    : parts.reduce((total, part) => total * 60 + part, 0);
};

const DEFERRED_TRACK_FIELDS = new Set([
  "lyrics",
  "description",
  "evidence",
  "warnings",
  "sunoCandidates",
]);
const splitCatalog = (catalog) => {
  const detailsById = new Map();
  const tracks = catalog.tracks.map((track) => {
    const summary = {};
    const details = {};
    for (const [key, value] of Object.entries(track)) {
      (DEFERRED_TRACK_FIELDS.has(key) ? details : summary)[key] = value;
    }
    detailsById.set(track.id, details);
    return summary;
  });
  return {
    publicCatalog: {
      tracks,
      confidence: catalog.confidence,
      evidence: catalog.evidence,
      warnings: catalog.warnings,
      fallbackReason: catalog.fallbackReason,
    },
    detailsById,
  };
};

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
        platforms: {
          local: { available: true, format: path.extname(audioPath).slice(1).toLowerCase() },
          suno: { available: false },
          soundcloud: { available: false },
        },
      });
    }
  }
  const bundledAuditPath = path.join(appRoot, "dist", "player", "source-audit.json");
  const auditPath = fs.existsSync(bundledAuditPath)
    ? bundledAuditPath
    : path.join(appRoot, "soundcloud-local-audit.json");
  const remoteById = new Map();
  try {
    const audit = JSON.parse(await fsp.readFile(auditPath, "utf8"));
    for (const item of audit.records || []) {
      remoteById.set(item.soundcloudId, item);
      const localMatch = tracks.find(
        (track) =>
          (item.localTrackId && track.id === item.localTrackId) ||
          (normalizeTitle(track.title) === normalizeTitle(item.title) &&
            Math.abs(durationSeconds(track.duration) - item.durationSeconds) <= 5),
      );
      if (localMatch) {
        localMatch.soundcloudUrl = item.soundcloudUrl;
        localMatch.soundcloudId = item.soundcloudId;
        localMatch.platforms = {
          ...(localMatch.platforms || {}),
          soundcloud: { available: true, url: item.soundcloudUrl },
        };
        localMatch.evidence = [
          ...(localMatch.evidence || []),
          item.soundcloudUrl,
        ];
        continue;
      }
      if (item.localStatus === "recoverable") {
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
          soundcloudUrl: item.soundcloudUrl,
          soundcloudId: item.soundcloudId,
          platforms: {
            local: { available: false },
            suno: { available: Boolean(item.sunoCandidates?.length) },
            soundcloud: { available: true, url: item.soundcloudUrl },
          },
        });
      }
    }
  } catch {}
  try {
    const enrichedPath = path.join(appRoot, "suno-library-enriched.json");
    const enriched = JSON.parse(await fsp.readFile(enrichedPath, "utf8"));
    const byTitle = new Map();
    for (const track of tracks) {
      const key = normalizeTitle(track.title);
      if (key) byTitle.set(key, [...(byTitle.get(key) || []), track]);
    }
    for (const item of enriched.tracks || []) {
      const seconds = Number(item.durationSeconds) || durationSeconds(item.duration);
      const matches = (byTitle.get(normalizeTitle(item.title)) || []).filter(
        (track) => !track.platforms?.suno?.available,
      );
      const existing = matches
        .map((track) => ({
          track,
          delta: Math.abs(durationSeconds(track.duration) - seconds),
        }))
        .filter(({ delta }) => delta <= 5)
        .sort((a, b) => a.delta - b.delta)[0]?.track;
      const sunoPlatform = {
        available: true,
        id: item.id,
        url: item.url,
        audioUrl: item.audioUrl,
        format: "mp3-stream",
      };
      if (existing) {
        existing.platforms = {
          ...(existing.platforms || {}),
          suno: sunoPlatform,
        };
        existing.sunoId = item.id;
        existing.sunoUrl = item.url;
        existing.cover ||= item.artworkLarge || item.artwork || null;
        if (!existing.hasLyrics && item.lyrics) {
          existing.lyrics = item.lyrics;
          existing.hasLyrics = true;
        }
        continue;
      }
      const track = {
        id: `suno-${item.id}`,
        title: item.title || "Untitled",
        artist: "Iyari Gomez",
        file: item.audioUrl || "",
        streamUrl: item.audioUrl || null,
        sourceUrl: item.url,
        duration: `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`,
        tag: "Sólo en Suno",
        cover: item.artworkLarge || item.artwork || null,
        panoramicCover: item.artworkLarge || null,
        lyrics: item.lyrics || "",
        hasLyrics: Boolean(item.lyrics),
        localStatus: "recoverable",
        localFormat: null,
        source: "suno",
        availabilityStatus: item.audioUrl ? "stream" : "recoverable",
        preferredSource: "suno",
        preferredAction: "download_wav_from_suno",
        sunoId: item.id,
        sunoUrl: item.url,
        confidence: item.confidence ?? 0.98,
        evidence: item.evidence || [item.url],
        warnings: item.warnings || [],
        fallbackReason: item.fallbackReason ?? null,
        platforms: {
          local: { available: false },
          suno: sunoPlatform,
          soundcloud: { available: false },
        },
      };
      tracks.push(track);
      const key = normalizeTitle(track.title);
      if (key) byTitle.set(key, [...(byTitle.get(key) || []), track]);
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

async function startMediaServer(appRoot, options = {}) {
  let catalog;
  let publicCatalog;
  let detailsById;
  const storageRoot = options.storageRoot || path.join(appRoot, ".bmmp-data");
  const ratingsPath = path.join(storageRoot, "ratings.json");
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/api/profile/ratings" && req.method === "GET") {
      try {
        const stored = JSON.parse(await fsp.readFile(ratingsPath, "utf8"));
        const ratings = sanitizeRatings(stored.ratings);
        return json(res, 200, {
          ratings,
          confidence: 1,
          evidence: [ratingsPath],
          warnings: [],
          fallbackReason: null,
        });
      } catch (error) {
        return json(res, 200, {
          ratings: {},
          confidence: error?.code === "ENOENT" ? 1 : 0.5,
          evidence: [],
          warnings: error?.code === "ENOENT" ? [] : ["No se pudo leer el archivo de calificaciones"],
          fallbackReason: error?.code === "ENOENT" ? null : String(error.message || error),
        });
      }
    }
    if (url.pathname === "/api/profile/ratings" && req.method === "PUT") {
      try {
        const body = await readJsonBody(req);
        const ratings = sanitizeRatings(body.ratings);
        await fsp.mkdir(storageRoot, { recursive: true });
        const temporaryPath = `${ratingsPath}.tmp`;
        await fsp.writeFile(temporaryPath, `${JSON.stringify({ ratings, updatedAt: new Date().toISOString() }, null, 2)}\n`);
        await fsp.rename(temporaryPath, ratingsPath);
        return json(res, 200, {
          ratings,
          confidence: 1,
          evidence: [ratingsPath],
          warnings: [],
          fallbackReason: null,
        });
      } catch (error) {
        return json(res, 400, {
          error: "ratings_not_saved",
          confidence: 0,
          evidence: [],
          warnings: ["No se pudieron guardar las calificaciones"],
          fallbackReason: String(error.message || error),
        });
      }
    }
    if (url.pathname === "/player/library.json") return json(res, 200, publicCatalog);
    const details = url.pathname.match(/^\/api\/tracks\/([^/]+)\/details$/);
    if (details) {
      const id = safeId(decodeURIComponent(details[1]));
      const body = id && detailsById.get(id);
      return body
        ? json(res, 200, body)
        : json(res, 404, { error: "track_details_not_found" });
    }
    const media = url.pathname.match(/^\/api\/(media|cover)\/([^/]+)$/);
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
    if (url.pathname === "/api/suno-library") {
      try {
        const enrichedPath = path.join(appRoot, "suno-library-enriched.json");
        const sunoPath = fs.existsSync(enrichedPath)
          ? enrichedPath
          : path.join(appRoot, "suno-library.json");
        const raw = JSON.parse(await fsp.readFile(sunoPath, "utf8"));
        const tracks = (raw.tracks || []).map((t) => ({
          id: t.id,
          title: t.title,
          duration: t.duration || (t.durationSeconds ? `${Math.floor(t.durationSeconds / 60)}:${String(Math.floor(t.durationSeconds % 60)).padStart(2, "0")}` : "0:00"),
          artwork: t.artworkLarge || t.artwork,
          url: t.url,
          audioUrl: t.audioUrl || null,
          version: t.model || t.version,
          page: t.page,
          lyricsStatus: t.lyricsStatus || "not_exposed",
          isPublic: t.isPublic ?? null,
        }));
        return json(res, 200, { tracks, total: tracks.length, account: raw.account, capturedAt: raw.capturedAt });
      } catch {
        return json(res, 404, { error: "suno_library_not_found" });
      }
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
  const preferredPort = Number(process.env.BLACKMAMBA_PLAYER_PORT) || 17892;
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      if (error.code !== "EADDRINUSE") return reject(error);
      server.off("error", onError);
      server.listen(0, "127.0.0.1", resolve);
    };
    server.once("error", onError);
    server.listen(preferredPort, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });
  const port = server.address().port,
    origin = `http://127.0.0.1:${port}`;
  catalog = await createCatalog(await findLibraryRoot(), appRoot, origin);
  ({ publicCatalog, detailsById } = splitCatalog(catalog));
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
module.exports = { startMediaServer, findLibraryRoot, splitCatalog, persistTrackLyrics, persistTrackKeywords, persistCoverMetadata, persistTrackGenre, readImageDimensions };
