import { useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { GridFour } from "@phosphor-icons/react/GridFour";
import { ListBullets } from "@phosphor-icons/react/ListBullets";
import { SidebarSimple } from "@phosphor-icons/react/SidebarSimple";
import { SlidersHorizontal } from "@phosphor-icons/react/SlidersHorizontal";
import { Play } from "@phosphor-icons/react/Play";
import { Pause } from "@phosphor-icons/react/Pause";
import { Stop } from "@phosphor-icons/react/Stop";
import { SkipBack } from "@phosphor-icons/react/SkipBack";
import { SkipForward } from "@phosphor-icons/react/SkipForward";
import { Shuffle } from "@phosphor-icons/react/Shuffle";
import { DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { CornersOut } from "@phosphor-icons/react/CornersOut";
import { GearSix } from "@phosphor-icons/react/GearSix";
import { WaveSine } from "@phosphor-icons/react/WaveSine";
import { Gauge } from "@phosphor-icons/react/Gauge";
import { Power } from "@phosphor-icons/react/Power";
import { ImageSquare } from "@phosphor-icons/react/ImageSquare";
import { Trash } from "@phosphor-icons/react/Trash";
import { PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { FileVideo } from "@phosphor-icons/react/FileVideo";
import { AudioVisualizer } from "./AudioVisualizer";
import { PlaybackTimeline } from "./PlaybackTimeline";
import { loadCatalog } from "../api/catalog";
import { signInWithPopup, signOut, onAuthStateChanged, type User } from "firebase/auth";
import { auth, googleProvider, githubProvider } from "../auth/firebase";
import { fetchUserRatings, fetchUserReviews, saveUserRating, saveUserReview, syncLocalDataToFirestore } from "../storage/sync";

type Track = {
  id?: string;
  title: string;
  artist: string;
  file: string;
  downloadUrl?: string;
  streamUrl?: string | null;
  sourceUrl?: string | null;
  duration: string;
  tag: string;
  genres?: string[];
  hashtags?: string[];
  permalink?: string;
  description?: string;
  subtitle?: string;
  privacy?: "public" | "private" | "followers";
  containsMusic?: boolean;
  postAuthor?: string;
  isrc?: string;
  composer?: string;
  releaseTitle?: string;
  purchaseMode?: "link" | "artist_store";
  purchaseUrl?: string;
  purchaseTitle?: string;
  albumTitle?: string;
  recordLabel?: string;
  releaseDate?: string;
  barcode?: string;
  iswc?: string;
  pLine?: string;
  explicit?: boolean;
  license?: "all_rights_reserved" | "creative_commons";
  cover?: string | null;
  panoramicCover?: string | null;
  lyrics?: string;
  hasLyrics?: boolean;
  lyricKeywords?: string[];
  lyricKeywordsSource?: "auto" | "manual";
  warnings?: string[];
  localStatus?: "available" | "recoverable";
  localFormat?: "mp3" | "wav" | null;
  source?: "usb" | "soundcloud" | "suno";
  availabilityStatus?: "local" | "stream" | "recoverable" | "locate";
  preferredSource?: "suno" | "soundcloud" | null;
  preferredAction?: string;
  rating?: number;
  sunoCandidates?: Array<{
    id: string;
    title: string;
    duration: string;
    url: string;
    page?: number;
  }>;
  visualTheme?: VisualTheme;
  ownership?: { status?: ReviewStatus } | null;
  soundcloudUrl?: string | null;
  soundcloudId?: string | null;
};
type ReviewStatus = "belongs" | "reject" | "later";
type LayoutMode = "combined" | "grid" | "review" | "focus" | "winamp";
type MotionMode = "full" | "reduced" | "off";
type AppFont = "dm-sans" | "oswald" | "mono" | "system";
type CoverAsset = { id?: string; file: string; url: string; originalName: string; width?: number; height?: number; prompt?: string; keywords?: string[]; origins?: Array<{ path: string }> };
type CoverKind = "square" | "panoramic" | "other";
type LyricProgress = { progress: number; message: string; status: "queued" | "running" | "done" | "error"; error?: string };
type SortMode = "catalog" | "rating-desc" | "rating-asc" | "title-asc" | "title-desc" | "plays-desc" | "plays-asc" | "genre-asc" | "genre-desc";
type SourceFilter = "all" | "local" | "recoverable" | "missing-cover" | "missing-lyrics";
type PlaybackHistoryEntry = {
  trackKey: string;
  title: string;
  artist: string;
  playedAt: number;
};
type Playlist = { id: string; name: string; trackKeys: string[] };
type VisualPreset = "sunset" | "dawn" | "violet" | "ember";
type VisualTheme = {
  preset: VisualPreset;
  accentA: string;
  accentB: string;
  accentC: string;
  glow: string;
  panelGlow: string;
  discGlow: string;
  buttonGlow: string;
  speed: number;
};
const CATALOG_IDENTITY = {
  artist: "Iyari Gomez",
  postAuthor: "Iyari Cancino Gomez",
  composer: "Iyari Cancino Gomez",
  recordLabel: "BlackMamba RECORDS",
  pLine: "2025 BlackMamba RECORDS",
} as const;
const GENRES = ["Reggae", "Rock", "Reggaeton", "Pop", "Clásica", "Electrónica", "Corrido", "Rap"] as const;
const GENRE_COLORS: Record<(typeof GENRES)[number], string> = {
  Reggae: "#44e06f",
  Rock: "#ff3b45",
  Reggaeton: "#ff8a2b",
  Pop: "#ff58c8",
  Clásica: "#f4d35e",
  Electrónica: "#29d9ff",
  Corrido: "#a97bff",
  Rap: "#f4f4f5",
};
const trackGenres = (item: Pick<Track, "genres" | "tag">) => {
  const selected = item.genres?.length ? item.genres : String(item.tag || "").split(",").map((value) => value.trim());
  return GENRES.filter((genre) => selected.includes(genre));
};
const VISUAL_PRESETS: Record<VisualPreset, VisualTheme> = {
  sunset: {
    preset: "sunset",
    accentA: "#ff7a2f",
    accentB: "#ff4f8f",
    accentC: "#7f5bff",
    glow: "#ffb07c",
    panelGlow: "#ffb36a",
    discGlow: "#d65327",
    buttonGlow: "#ff6a2a",
    speed: 7.5,
  },
  dawn: {
    preset: "dawn",
    accentA: "#ffb36a",
    accentB: "#ff6f91",
    accentC: "#8f92ff",
    glow: "#ffd9ad",
    panelGlow: "#ffc888",
    discGlow: "#ea7b3b",
    buttonGlow: "#ff8a4b",
    speed: 6.5,
  },
  violet: {
    preset: "violet",
    accentA: "#7c6bff",
    accentB: "#d46bff",
    accentC: "#ff7ca8",
    glow: "#c7b7ff",
    panelGlow: "#b48cff",
    discGlow: "#8f6bff",
    buttonGlow: "#9b66ff",
    speed: 5.5,
  },
  ember: {
    preset: "ember",
    accentA: "#ff6a2a",
    accentB: "#ff9341",
    accentC: "#ff4f4f",
    glow: "#ffbb8a",
    panelGlow: "#ff9341",
    discGlow: "#ff4d2e",
    buttonGlow: "#ff4f4f",
    speed: 4.5,
  },
};
const themes = [
  {
    accent: "#cbff38",
    accent2: "#50e3c2",
    surface: "#151d16",
    glow: "#8dff36",
  },
  {
    accent: "#ff4fd8",
    accent2: "#8b5cff",
    surface: "#211327",
    glow: "#ff48e1",
  },
  {
    accent: "#ff7a36",
    accent2: "#ffd447",
    surface: "#241710",
    glow: "#ff9e3d",
  },
  {
    accent: "#35b8ff",
    accent2: "#6f72ff",
    surface: "#101a2b",
    glow: "#3fc8ff",
  },
  {
    accent: "#ff405e",
    accent2: "#ff8b6b",
    surface: "#251116",
    glow: "#ff506d",
  },
  {
    accent: "#b86cff",
    accent2: "#4de8ff",
    surface: "#191329",
    glow: "#bd72ff",
  },
  {
    accent: "#f7ef5a",
    accent2: "#6cff84",
    surface: "#20210f",
    glow: "#f7ef5a",
  },
  {
    accent: "#ff9bcf",
    accent2: "#75d5ff",
    surface: "#241827",
    glow: "#ff9bcf",
  },
];
const hashtagOptions = [
  "#reggae",
  "#dub",
  "#dancehall",
  "#rap",
  "#hiphop",
  "#cumbia",
  "#edm",
  "#electronic",
  "#electronica",
  "#electro",
  "#idm",
  "#industrial",
  "#ebm",
  "#psytrance",
  "#goatrance",
  "#trance",
  "#progressivetrance",
  "#upliftingtrance",
  "#hardtrance",
  "#techno",
  "#minimaltechno",
  "#melodictechno",
  "#acidtechno",
  "#hardtechno",
  "#house",
  "#deephouse",
  "#techhouse",
  "#progressivehouse",
  "#electrohouse",
  "#futurehouse",
  "#basshouse",
  "#tropicalhouse",
  "#afrohouse",
  "#discohouse",
  "#drumandbass",
  "#jungle",
  "#dubstep",
  "#brostep",
  "#riddim",
  "#trap",
  "#futurebass",
  "#breakbeat",
  "#ukgarage",
  "#hardstyle",
  "#hardcore",
  "#gabber",
  "#ambient",
  "#downtempo",
  "#triphop",
  "#synthwave",
  "#retrowave",
  "#vaporwave",
  "#chillwave",
  "#rock",
  "#metal",
  "#pop",
  "#cinematic",
  "#experimental",
  "#instrumental",
  "#vocal",
  "#acoustic",
  "#live",
];

const initialTracks: Track[] = [
  {
    title: "Mundo Entero",
    artist: CATALOG_IDENTITY.artist,
    file: "/music/mundo-entero.mp3",
    duration: "3:20",
    tag: "Single",
  },
  {
    title: "Ganja Love",
    artist: CATALOG_IDENTITY.artist,
    file: "/music/ganja-love.mp3",
    duration: "2:57",
    tag: "Original",
  },
  {
    title: "Raquel HF",
    artist: CATALOG_IDENTITY.artist,
    file: "/music/raquel-hf.mp3",
    duration: "3:15",
    tag: "Studio",
  },
  {
    title: "Fancy Boy (Flight Mode)",
    artist: CATALOG_IDENTITY.artist,
    file: "/music/fancy-boy.mp3",
    duration: "3:20",
    tag: "Studio",
  },
  {
    title: "Studio Selection 12",
    artist: CATALOG_IDENTITY.artist,
    file: "/music/studio-selection-12.mp3",
    duration: "4:04",
    tag: "Session",
  },
];

import { loadProfile, saveRatings } from "../storage/local-profile";
import { mergeTrackMetadata } from "../storage/track-metadata";
import { extractTextKeywords, keywordMatch, sanitizeKeywords } from "../storage/keyword-metadata";

const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();

export function App() {
  const audio = useRef<HTMLAudioElement>(null);
  const playbackIntent = useRef(false);
  const consecutivePlaybackErrors = useRef(0);
  const trackRows = useRef(new Map<string, HTMLDivElement>());
  const themeReady = useRef(false);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(
    () => localStorage.getItem("blackmamba-shuffle") === "true",
  );
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [volume, setVolume] = useState(() => {
    if (localStorage.getItem("blackmamba-volume-100-migrated") !== "true") {
      localStorage.setItem("blackmamba-volume-100-migrated", "true");
      return 1;
    }
    const stored = localStorage.getItem("blackmamba-volume");
    const saved = stored === null ? Number.NaN : Number(stored);
    return Number.isFinite(saved) && saved >= 0 && saved <= 1 ? saved : 1;
  });
  const [tracks, setTracks] = useState<Track[]>(initialTracks);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loading, setLoading] = useState(true);
  const [reviewFilter, setReviewFilter] = useState<
    "all" | "pending" | ReviewStatus
  >("all");
  const [sortMode, setSortMode] = useState<SortMode>("catalog");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [openLyrics, setOpenLyrics] = useState<string | null>(null);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [trackSaveStatus, setTrackSaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const [trackSaveMessage, setTrackSaveMessage] = useState("");
  const [renamingTrack, setRenamingTrack] = useState<Track | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [editDraft, setEditDraft] = useState<Partial<Track>>({});
  const [themeIndex, setThemeIndex] = useState(1);
  const [layout, setLayout] = useState<LayoutMode>("combined");
  const [motion, setMotion] = useState<MotionMode>("full");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appFont, setAppFont] = useState<AppFont>(() =>
    (localStorage.getItem("blackmamba-ui-font") as AppFont) || "dm-sans",
  );
  const [titleFont, setTitleFont] = useState<AppFont>(() =>
    (localStorage.getItem("blackmamba-title-font") as AppFont) || "oswald",
  );
  const [titleFontSize, setTitleFontSize] = useState(() => {
    const stored = Number(localStorage.getItem("blackmamba-title-font-size"));
    return Number.isFinite(stored) && stored >= 12 && stored <= 32 ? stored : 17;
  });
  const [ledColor, setLedColor] = useState(
    () => localStorage.getItem("blackmamba-led-color") || "#32f5ff",
  );
  const [showImages, setShowImages] = useState(false);
  const [showWebMp3, setShowWebMp3] = useState(false);
  const [showLyricsStudio, setShowLyricsStudio] = useState(false);
  const [lyricsStudioQuery, setLyricsStudioQuery] = useState("");
  const [lyricsStudioTrack, setLyricsStudioTrack] = useState<string | null>(null);
  const [lyricsStudioDraft, setLyricsStudioDraft] = useState("");
  const [lyricsKeywordsDraft, setLyricsKeywordsDraft] = useState("");
  const [lyricsStudioStatus, setLyricsStudioStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [coverAssets, setCoverAssets] = useState<CoverAsset[]>([]);
  const [selectedCover, setSelectedCover] = useState<string | null>(null);
  const [coverTarget, setCoverTarget] = useState("");
  const [coverMessage, setCoverMessage] = useState("");
  const [coverSearch, setCoverSearch] = useState("");
  const [coverPromptDraft, setCoverPromptDraft] = useState("");
  const [coverKeywordsDraft, setCoverKeywordsDraft] = useState("");
  const [imageMetadataStatus, setImageMetadataStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [editingImages, setEditingImages] = useState(false);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(() => new Set());
  const [lyricProgress, setLyricProgress] = useState<Record<string, LyricProgress>>({});
  const [downloadingTrack, setDownloadingTrack] = useState<Record<string, number>>({});
  const [videoExtractStatus, setVideoExtractStatus] = useState<"idle" | "working" | "success" | "error">("idle");
  const [videoExtractMessage, setVideoExtractMessage] = useState("");
  const [visibleCount, setVisibleCount] = useState(60);
  const [reviews, setReviews] = useState<Record<string, ReviewStatus>>(() => {
    try {
      return JSON.parse(
        localStorage.getItem("blackmamba-vitrine-reviews") ?? "{}",
      );
    } catch {
      return {};
    }
  });
  const [ratings, setRatings] = useState<Record<string, number>>(() => loadProfile().ratings);
  const [ratingsReady, setRatingsReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [playbackHistory, setPlaybackHistory] = useState<
    PlaybackHistoryEntry[]
  >(() => {
    try {
      return JSON.parse(
        localStorage.getItem("blackmamba-playback-history") ?? "[]",
      );
    } catch {
      return [];
    }
  });
  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
    try { return JSON.parse(localStorage.getItem("blackmamba-playlists") ?? "[]"); } catch { return []; }
  });
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [playlistEditing, setPlaylistEditing] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const trackKey = (item: Track) => item.id ?? item.file;

  const extractVideoMp3 = async () => {
    const desktop = window.blackMambaDesktop;
    if (!desktop?.extractVideoMp3 || videoExtractStatus === "working") return;
    setVideoExtractStatus("working");
    setVideoExtractMessage("Extrayendo audio del video…");
    const result = await desktop.extractVideoMp3();
    if (result.canceled) {
      setVideoExtractStatus("idle");
      setVideoExtractMessage("");
      return;
    }
    if (result.ok) {
      setVideoExtractStatus("success");
      setVideoExtractMessage("MP3 listo en Descargas / Web-a-MP3");
    } else {
      setVideoExtractStatus("error");
      setVideoExtractMessage(result.fallbackReason || result.warnings?.[0] || "No se pudo extraer el MP3");
    }
  };

  useEffect(() => {
    localStorage.setItem("blackmamba-ui-font", appFont);
    localStorage.setItem("blackmamba-title-font", titleFont);
    localStorage.setItem("blackmamba-title-font-size", String(titleFontSize));
    localStorage.setItem("blackmamba-led-color", ledColor);
  }, [appFont, titleFont, titleFontSize, ledColor]);

  useEffect(() => {
    localStorage.setItem("blackmamba-shuffle", String(shuffle));
  }, [shuffle]);

  useEffect(() => {
    fetch("/api/cover-inbox", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("cover inbox unavailable")))
      .then((payload) => setCoverAssets(Array.isArray(payload.images) ? payload.images : []))
      .catch(() => setCoverAssets([]));
  }, []);

  useEffect(() => {
    fetch("/api/profile/ratings", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("ratings unavailable")))
      .then((payload) => setRatings((local) => ({ ...(payload.ratings ?? {}), ...local })))
      .catch(() => undefined)
      .finally(() => setRatingsReady(true));
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Sync local to Cloud
        let localRatings = {};
        try {
          const stored = localStorage.getItem("blackmamba-vitrine-ratings");
          localRatings = stored ? JSON.parse(stored) : {};
        } catch {
          localRatings = {};
        }
        if (!Object.keys(localRatings).length) {
          localRatings = loadProfile().ratings;
        }

        let localReviews = {};
        try {
          const stored = localStorage.getItem("blackmamba-vitrine-reviews");
          localReviews = stored ? JSON.parse(stored) : {};
        } catch {
          localReviews = {};
        }

        await syncLocalDataToFirestore(currentUser.uid, localRatings, localReviews);

        // Load final merged state
        const mergedRatings = await fetchUserRatings(currentUser.uid);
        const mergedReviews = await fetchUserReviews(currentUser.uid);

        setRatings(mergedRatings);
        setReviews(mergedReviews as Record<string, ReviewStatus>);
      }
    });
    return () => unsubscribe();
  }, []);

  const assignSelectedCover = async () => {
    if (!selectedCover || !coverTarget) return;
    const selectedAsset = coverAssets.find((asset) => asset.file === selectedCover);
    const ratio = selectedAsset?.width && selectedAsset.height ? selectedAsset.width / selectedAsset.height : 1;
    const kind: CoverKind = ratio >= 1.35 ? "panoramic" : "square";
    setCoverMessage("Asignando portada…");
    const response = await fetch("/api/assign-cover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageFile: selectedCover, trackId: coverTarget, kind }) });
    if (!response.ok) { setCoverMessage("No se pudo asignar la portada"); return; }
    const result = await response.json();
    setTracks((items) => items.map((item) => trackKey(item) === coverTarget ? { ...item, cover: result.cover ?? item.cover, panoramicCover: result.panoramicCover ?? item.panoramicCover } : item));
    setCoverMessage(kind === "panoramic" ? "Portada panorámica asignada" : "Portada cuadrada asignada");
  };
  const selectedCoverAsset = coverAssets.find((asset) => asset.file === selectedCover) ?? null;
  const coverTargetTrack = tracks.find((item) => trackKey(item) === coverTarget) ?? null;
  const targetLyricKeywords = useMemo(
    () => coverTargetTrack?.lyricKeywords?.length ? coverTargetTrack.lyricKeywords : extractTextKeywords(coverTargetTrack?.lyrics ?? ""),
    [coverTargetTrack],
  );
  useEffect(() => {
    setCoverPromptDraft(selectedCoverAsset?.prompt ?? "");
    setCoverKeywordsDraft((selectedCoverAsset?.keywords ?? []).join(", "));
    setImageMetadataStatus("idle");
  }, [selectedCoverAsset]);
  const saveCoverMetadata = async () => {
    if (!selectedCoverAsset) return;
    setImageMetadataStatus("saving");
    const keywords = sanitizeKeywords(coverKeywordsDraft || extractTextKeywords(coverPromptDraft));
    try {
      const response = await fetch(`/api/cover-inbox/${encodeURIComponent(selectedCoverAsset.file)}/metadata`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: coverPromptDraft, keywords }) });
      if (!response.ok) throw new Error("image_metadata_not_saved");
      setCoverAssets((assets) => assets.map((asset) => asset.file === selectedCoverAsset.file ? { ...asset, prompt: coverPromptDraft.trim(), keywords } : asset));
      setCoverKeywordsDraft(keywords.join(", "));
      setImageMetadataStatus("saved");
    } catch { setImageMetadataStatus("error"); }
  };
  const coverGroups = useMemo(() => {
    const groups: Record<CoverKind, CoverAsset[]> = { square: [], panoramic: [], other: [] };
    const queryKeywords = sanitizeKeywords(coverSearch);
    const candidates = coverAssets.filter((asset) => !queryKeywords.length || keywordMatch(queryKeywords, [...(asset.keywords ?? []), ...extractTextKeywords(asset.prompt ?? "")]).matches.length === queryKeywords.length);
    const ranked = [...candidates].sort((left, right) => {
      const leftScore = keywordMatch(targetLyricKeywords, [...(left.keywords ?? []), ...extractTextKeywords(left.prompt ?? "")]).score;
      const rightScore = keywordMatch(targetLyricKeywords, [...(right.keywords ?? []), ...extractTextKeywords(right.prompt ?? "")]).score;
      return rightScore - leftScore || left.originalName.localeCompare(right.originalName);
    });
    for (const asset of ranked) {
      if (!asset.width || !asset.height) groups.other.push(asset);
      else {
        const ratio = asset.width / asset.height;
        if (ratio >= 1.35) groups.panoramic.push(asset);
        else if (ratio >= 0.85 && ratio <= 1.15) groups.square.push(asset);
        else groups.other.push(asset);
      }
    }
    return groups;
  }, [coverAssets, coverSearch, targetLyricKeywords]);
  const openCurrentCoverLibrary = () => {
    if (!track) return;
    setCoverTarget(trackKey(track));
    setSelectedCover(null);
    setCoverMessage(`Elige una imagen para ${track.title}`);
    setShowImages(true);
    setShowWebMp3(false);
    setShowLyricsStudio(false);
    window.setTimeout(() => document.querySelector(".cover-library")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const deleteSelectedImages = async () => {
    if (!selectedImages.size) return;
    setCoverMessage(`Eliminando ${selectedImages.size} imagen(es)…`);
    const response = await fetch("/api/delete-cover-assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: [...selectedImages] }) });
    if (!response.ok) { setCoverMessage("No se pudieron eliminar las imágenes"); return; }
    const result = await response.json();
    setCoverAssets((assets) => assets.filter((asset) => !selectedImages.has(asset.file)));
    setSelectedImages(new Set());
    setSelectedCover(null);
    setCoverMessage(`${result.deleted} imagen(es) eliminadas de la bandeja`);
  };

  useEffect(() => {
    const compact = layout === "winamp";
    document.body.classList.toggle("winamp-compact", compact);
    void window.blackMambaDesktop?.setCompactMode(compact);
    return () => document.body.classList.remove("winamp-compact");
  }, [layout]);
  
  const playCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of playbackHistory) {
      counts[entry.trackKey] = (counts[entry.trackKey] || 0) + 1;
    }
    return counts;
  }, [playbackHistory]);

  const searchIndex = useMemo(() => {
    const index = new Map<string, string>();
    for (const item of tracks) {
      index.set(
        trackKey(item),
        normalizeSearch(
          `${item.title} ${item.artist} ${item.file} ${item.sourceUrl ?? ""} ${(item.hashtags ?? []).join(" ")} ${trackGenres(item).join(" ")} ${item.description ?? ""} ${item.albumTitle ?? ""} ${item.composer ?? ""} ${item.isrc ?? ""} ${item.lyrics ?? ""}`,
        ),
      );
    }
    return index;
  }, [tracks]);

  const trackIndexByKey = useMemo(
    () => new Map(tracks.map((item, index) => [trackKey(item), index])),
    [tracks],
  );
  const activePlaylist = playlists.find((item) => item.id === activePlaylistId) ?? null;
  const activePlaylistKeys = useMemo(() => new Set(activePlaylist?.trackKeys ?? []), [activePlaylist]);
  const playbackQueue = useMemo(
    () => activePlaylist ? tracks.filter((item) => activePlaylistKeys.has(trackKey(item))) : tracks,
    [activePlaylist, activePlaylistKeys, tracks],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeSearch(deferredQuery);
    const matchingTracks = tracks.filter((item) => {
      const matchesQuery = (searchIndex.get(trackKey(item)) ?? "").includes(
        normalizedQuery,
      );
      const status = reviews[trackKey(item)];
      const matchesSource = sourceFilter === "all"
        || (sourceFilter === "local" && item.localStatus === "available")
        || (sourceFilter === "recoverable" && item.localStatus === "recoverable")
        || (sourceFilter === "missing-cover" && !item.cover)
        || (sourceFilter === "missing-lyrics" && !item.hasLyrics);
      return (
        matchesQuery && matchesSource && (!activePlaylist || playlistEditing || activePlaylistKeys.has(trackKey(item))) &&
        (reviewFilter === "all" ||
          (reviewFilter === "pending" ? !status : status === reviewFilter))
      );
    });
    if (sortMode === "catalog") return matchingTracks;
    return matchingTracks
      .map((item, index) => ({ item, index }))
      .sort((left, right) => {
        if (sortMode === "title-asc" || sortMode === "title-desc") {
          const diff = left.item.title.localeCompare(right.item.title);
          if (diff === 0) return left.index - right.index;
          return sortMode === "title-asc" ? diff : -diff;
        }
        if (sortMode === "plays-asc" || sortMode === "plays-desc") {
          const leftPlays = playCounts[trackKey(left.item)] || 0;
          const rightPlays = playCounts[trackKey(right.item)] || 0;
          const diff = leftPlays - rightPlays;
          if (diff === 0) return left.index - right.index;
          return sortMode === "plays-asc" ? diff : -diff;
        }
        if (sortMode === "genre-asc" || sortMode === "genre-desc") {
          const diff = (left.item.tag || "").localeCompare(right.item.tag || "");
          if (diff === 0) return left.index - right.index;
          return sortMode === "genre-asc" ? diff : -diff;
        }
        const difference =
          (ratings[trackKey(left.item)] ?? 0) -
          (ratings[trackKey(right.item)] ?? 0);
        if (difference === 0) return left.index - right.index;
        return sortMode === "rating-desc" ? -difference : difference;
      })
      .map(({ item }) => item);
  }, [activePlaylist, activePlaylistKeys, deferredQuery, playlistEditing, sortMode, ratings, reviewFilter, reviews, sourceFilter, tracks, playCounts, searchIndex]);
  const track = tracks[current];
  const visibleTracks = useMemo(() => {
    const base = filtered.slice(0, visibleCount);
    if (!track) return base;
    const currentKey = trackKey(track);
    const currentMatch = filtered.find((item) => trackKey(item) === currentKey);
    return currentMatch && !base.some((item) => trackKey(item) === currentKey)
      ? [...base, currentMatch]
      : base;
  }, [filtered, track, visibleCount]);
  const visualTheme = track?.visualTheme;
  const theme = visualTheme
    ? {
        accent: visualTheme.accentA,
        accent2: visualTheme.accentB,
        surface: "#17101d",
        glow: visualTheme.glow,
      }
    : themes[themeIndex];
  const counts = useMemo(
    () =>
      tracks.reduce(
        (total, item) => {
          const status = reviews[trackKey(item)];
          total[status ?? "pending"] += 1;
          return total;
        },
        { belongs: 0, reject: 0, later: 0, pending: 0 },
      ),
    [reviews, tracks],
  );
  const sourceCounts = useMemo(() => tracks.reduce((total, item) => {
    if (item.localStatus === "available") total.local += 1;
    if (item.localStatus === "recoverable") total.recoverable += 1;
    if (!item.cover) total.missingCover += 1;
    if (!item.hasLyrics) total.missingLyrics += 1;
    return total;
  }, { local: 0, recoverable: 0, missingCover: 0, missingLyrics: 0 }), [tracks]);
  const lyricsStudioItems = useMemo(() => {
    const needle = normalizeSearch(lyricsStudioQuery);
    return tracks
      .filter((item) => !needle || normalizeSearch(`${item.title} ${item.artist}`).includes(needle))
      .sort((left, right) => Number(Boolean(left.hasLyrics)) - Number(Boolean(right.hasLyrics)) || left.title.localeCompare(right.title));
  }, [lyricsStudioQuery, tracks]);
  const selectedLyricsStudioTrack = tracks.find((item) => trackKey(item) === lyricsStudioTrack) ?? null;

  const openLyricsStudioTrack = (item: Track) => {
    setLyricsStudioTrack(trackKey(item));
    setLyricsStudioDraft(item.lyrics ?? "");
    setLyricsKeywordsDraft((item.lyricKeywords?.length ? item.lyricKeywords : extractTextKeywords(item.lyrics ?? "")).join(", "));
    setLyricsStudioStatus("idle");
  };

  const saveLyricsStudio = async () => {
    if (!selectedLyricsStudioTrack?.id || selectedLyricsStudioTrack.localStatus !== "available") {
      setLyricsStudioStatus("error");
      return;
    }
    setLyricsStudioStatus("saving");
    try {
      const response = await fetch(`/api/tracks/${encodeURIComponent(selectedLyricsStudioTrack.id)}/lyrics`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lyrics: lyricsStudioDraft }) });
      if (!response.ok) throw new Error("lyrics_not_saved");
      const keywords = sanitizeKeywords(lyricsKeywordsDraft || extractTextKeywords(lyricsStudioDraft));
      const keywordsResponse = await fetch(`/api/tracks/${encodeURIComponent(selectedLyricsStudioTrack.id)}/keywords`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keywords }) });
      if (!keywordsResponse.ok) throw new Error("keywords_not_saved");
      const key = trackKey(selectedLyricsStudioTrack);
      setTracks((items) => items.map((item) => trackKey(item) === key ? { ...item, lyrics: lyricsStudioDraft.trim(), hasLyrics: Boolean(lyricsStudioDraft.trim()), lyricKeywords: keywords, lyricKeywordsSource: "manual" } : item));
      let stored: Record<string, Partial<Track>> = {};
      try { stored = JSON.parse(localStorage.getItem("blackmamba-track-metadata") ?? "{}"); } catch { stored = {}; }
      localStorage.setItem("blackmamba-track-metadata", JSON.stringify({ ...stored, [key]: { ...(stored[key] ?? {}), lyrics: lyricsStudioDraft.trim(), hasLyrics: Boolean(lyricsStudioDraft.trim()), lyricKeywords: keywords, lyricKeywordsSource: "manual" } }));
      setLyricsKeywordsDraft(keywords.join(", "));
      setLyricsStudioStatus("saved");
    } catch {
      setLyricsStudioStatus("error");
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    loadCatalog<Track>(controller.signal)
      .then((library) => {
        if (Array.isArray(library.tracks) && library.tracks.length) {
          let savedMetadata: Record<string, Partial<Track>> = {};
          try {
            savedMetadata = JSON.parse(
              localStorage.getItem("blackmamba-track-metadata") ?? "{}",
            );
          } catch {
            savedMetadata = {};
          }
          setTracks(
            (library.tracks as Track[]).map((item) => ({
              ...mergeTrackMetadata(item, savedMetadata[trackKey(item)]),
              ...CATALOG_IDENTITY,
            })),
          );
          const featuredIndex = (library.tracks as Track[]).findIndex((item) =>
            item.title.toLowerCase().includes("ganja love"),
          );
          if (featuredIndex >= 0) setCurrent(featuredIndex);
          setReviews((currentReviews) => {
            const next = { ...currentReviews };
            for (const item of library.tracks as Track[])
              if (item.ownership?.status === "belongs" && !next[trackKey(item)])
                next[trackKey(item)] = "belongs";
            return next;
          });
          setRatings((currentRatings) => {
            const next = { ...currentRatings };
            for (const item of library.tracks as Track[])
              if (item.rating && !next[trackKey(item)])
                next[trackKey(item)] = item.rating;
            return next;
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
    localStorage.setItem("blackmamba-volume", String(volume));
  }, [volume]);
  useEffect(() => {
    localStorage.setItem("blackmamba-vitrine-reviews", JSON.stringify(reviews));
  }, [reviews]);
  useEffect(() => {
    localStorage.setItem(
      "blackmamba-playback-history",
      JSON.stringify(playbackHistory),
    );
  }, [playbackHistory]);
  useEffect(() => {
    localStorage.setItem("blackmamba-playlists", JSON.stringify(playlists));
  }, [playlists]);
  useEffect(() => {
    if (!ratingsReady) return;
    saveRatings(ratings);
    void fetch("/api/profile/ratings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ratings }) }).catch(() => undefined);
  }, [ratings, ratingsReady]);
  useEffect(() => {
    if (!themeReady.current) {
      themeReady.current = true;
      return;
    }
    setThemeIndex(
      (index) =>
        (index + 1 + Math.floor(Math.random() * (themes.length - 1))) %
        themes.length,
    );
  }, [current]);
  useEffect(() => {
    const timer = window.setInterval(
      () =>
        setThemeIndex(
          (index) =>
            (index + 1 + Math.floor(Math.random() * (themes.length - 1))) %
            themes.length,
        ),
      24000,
    );
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!audio.current) return;
    audio.current.load();
    if (playbackIntent.current) audio.current.play().catch(() => setPlaying(false));
  }, [current]);
  useEffect(() => {
    const selected = tracks[current];
    if (!selected) return;
    const index = filtered.findIndex(
      (item) => trackKey(item) === trackKey(selected),
    );
    if (index < 0) return;
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        trackRows.current
          .get(trackKey(selected))
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      ),
    );
    return () => cancelAnimationFrame(frame);
  }, [current, filtered, tracks]);

  const toggle = () => {
    if (!audio.current) return;
    if (audio.current.paused) {
      playbackIntent.current = true;
      recordPlayback(track);
      audio.current
        .play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    } else {
      playbackIntent.current = false;
      audio.current.pause();
      setPlaying(false);
    }
  };
  const playTrack = (selected: Track) => {
    if (
      (!selected.file && !selected.streamUrl) ||
      (selected.localStatus === "recoverable" && !selected.streamUrl)
    )
      return;
    const index = tracks.indexOf(selected);
    if (index < 0) return;
    if (index === current) {
      if (!playing) toggle();
      return;
    } else {
      playbackIntent.current = true;
      recordPlayback(selected);
      flushSync(() => {
        setCurrent(index);
        setPlaying(true);
      });
      audio.current?.load();
      audio.current?.play().catch(() => setPlaying(false));
    }
  };
  const move = (amount: number) =>
    setCurrent((index) => {
      if (!playbackQueue.length) return index;
      const selectedKey = tracks[index] ? trackKey(tracks[index]) : "";
      const queueIndex = Math.max(0, playbackQueue.findIndex((item) => trackKey(item) === selectedKey));
      let nextQueueIndex = (queueIndex + amount + playbackQueue.length) % playbackQueue.length;
      if (shuffle && amount > 0 && playbackQueue.length > 1) {
        while (nextQueueIndex === queueIndex) nextQueueIndex = Math.floor(Math.random() * playbackQueue.length);
      }
      return tracks.findIndex((item) => trackKey(item) === trackKey(playbackQueue[nextQueueIndex]));
    });
  const seek = (amount: number) => {
    if (!audio.current) return;
    const nextTime = Math.max(
      0,
      Math.min(audio.current.duration || 0, audio.current.currentTime + amount),
    );
    audio.current.currentTime = nextTime;
  };
  const stop = () => {
    if (!audio.current) return;
    playbackIntent.current = false;
    audio.current.pause();
    audio.current.currentTime = 0;
    setPlaying(false);
  };
  const handlePlaybackEnded = () => {
    playbackIntent.current = true;
    consecutivePlaybackErrors.current = 0;
    move(1);
  };
  const handlePlaybackError = () => {
    if (!playbackIntent.current || !playbackQueue.length) return;
    consecutivePlaybackErrors.current += 1;
    if (consecutivePlaybackErrors.current >= playbackQueue.length) {
      playbackIntent.current = false;
      setPlaying(false);
      return;
    }
    move(1);
  };
  const createPlaylist = () => {
    const name = newPlaylistName.trim();
    if (!name) return;
    const playlist = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, trackKeys: [] };
    setPlaylists((items) => [...items, playlist]);
    setActivePlaylistId(playlist.id);
    setPlaylistEditing(true);
    setNewPlaylistName("");
  };
  const toggleTrackInActivePlaylist = (item: Track) => {
    if (!activePlaylistId) return;
    const key = trackKey(item);
    setPlaylists((items) => items.map((list) => list.id !== activePlaylistId ? list : ({ ...list, trackKeys: list.trackKeys.includes(key) ? list.trackKeys.filter((value) => value !== key) : [...list.trackKeys, key] })));
  };
  const recordPlayback = (playedTrack: Track) => {
    setPlaybackHistory((history) =>
      [
        {
          trackKey: trackKey(playedTrack),
          title: playedTrack.title,
          artist: playedTrack.artist,
          playedAt: Date.now(),
        },
        ...history,
      ].slice(0, 100),
    );
  };
  const playFromHistory = (entry: PlaybackHistoryEntry) => {
    const item = tracks.find(
      (candidate) => trackKey(candidate) === entry.trackKey,
    );
    if (!item) return;
    setQuery("");
    setReviewFilter("all");
    playTrack(item);
  };
  const review = (item: Track, status: ReviewStatus) => {
    const key = trackKey(item);
    setReviews((currentReviews) => ({
      ...currentReviews,
      [key]: status,
    }));
    if (user) {
      void saveUserReview(user.uid, key, status);
    }
  };
  const rate = (item: Track, star: number) => {
    const key = trackKey(item);
    setRatings((currentRatings) => ({
      ...currentRatings,
      [key]: star,
    }));
    if (user) {
      void saveUserRating(user.uid, key, star);
    }
  };
  const toggleTrackGenre = async (item: Track, genre: (typeof GENRES)[number]) => {
    const key = trackKey(item);
    const previous = { tag: item.tag, genres: item.genres };
    const currentGenres = trackGenres(item);
    const genres = currentGenres.includes(genre) ? currentGenres.filter((value) => value !== genre) : [...currentGenres, genre];
    const primaryGenre = genres[0] ?? "";
    setTracks((items) => items.map((candidate) => trackKey(candidate) === key ? { ...candidate, tag: primaryGenre, genres } : candidate));
    let stored: Record<string, Partial<Track>> = {};
    try { stored = JSON.parse(localStorage.getItem("blackmamba-track-metadata") ?? "{}"); } catch { stored = {}; }
    localStorage.setItem("blackmamba-track-metadata", JSON.stringify({ ...stored, [key]: { ...(stored[key] ?? {}), tag: primaryGenre, genres } }));
    if (!item.id || item.localStatus !== "available") return;
    try {
      const response = await fetch(`/api/tracks/${encodeURIComponent(item.id)}/genre`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ genres }) });
      if (!response.ok) throw new Error("genre_not_saved");
    } catch {
      setTracks((items) => items.map((candidate) => trackKey(candidate) === key ? { ...candidate, ...previous, warnings: [...(candidate.warnings ?? []), "No se pudieron guardar los géneros en la USB"] } : candidate));
    }
  };
  const extractLyrics = async (item: Track) => {
    const id = item.id;
    const key = trackKey(item);
    if (!id || ["queued", "running"].includes(lyricProgress[key]?.status)) return;
    setLyricProgress((jobs) => ({ ...jobs, [key]: { progress: 1, message: "Iniciando", status: "running" } }));
    try {
      const started = await fetch(`/api/lyrics/${encodeURIComponent(id)}`, { method: "POST" });
      if (!started.ok && started.status !== 202) throw new Error("No se pudo iniciar la extracción");
      for (let attempt = 0; attempt < 900; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 650));
        const response = await fetch(`/api/lyrics/${encodeURIComponent(id)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("No se pudo consultar el progreso");
        const job = await response.json();
        setLyricProgress((jobs) => ({ ...jobs, [key]: job }));
        if (job.status === "error") throw new Error(job.error || "No se detectó una letra");
        if (job.status === "done") {
          const lyrics = String(job.lyrics || "").trim();
          const lyricKeywords = Array.isArray(job.lyricKeywords) ? job.lyricKeywords : extractTextKeywords(lyrics);
          setTracks((items) => items.map((candidate) => trackKey(candidate) === key ? { ...candidate, lyrics, hasLyrics: Boolean(lyrics), lyricKeywords, lyricKeywordsSource: "auto" } : candidate));
          let stored: Record<string, Partial<Track>> = {};
          try { stored = JSON.parse(localStorage.getItem("blackmamba-track-metadata") ?? "{}"); } catch { stored = {}; }
          localStorage.setItem("blackmamba-track-metadata", JSON.stringify({ ...stored, [key]: { ...(stored[key] ?? {}), lyrics, hasLyrics: Boolean(lyrics), lyricKeywords, lyricKeywordsSource: "auto" } }));
          setOpenLyrics(key);
          return;
        }
      }
      throw new Error("La extracción tardó demasiado; puedes reintentar");
    } catch (error) {
      setLyricProgress((jobs) => ({ ...jobs, [key]: { progress: jobs[key]?.progress ?? 0, message: error instanceof Error ? error.message : "Extracción fallida", status: "error", error: error instanceof Error ? error.message : "Extracción fallida" } }));
    }
  };
  const openTrackEditor = (item: Track) => {
    setTrackSaveStatus("idle");
    setTrackSaveMessage("");
    setEditingTrack(item);
    setEditDraft({
      title: item.title,
      artist: CATALOG_IDENTITY.artist,
      tag: item.tag,
      hashtags: item.hashtags ?? [],
      permalink: item.permalink ?? item.sourceUrl ?? "",
      description: item.description ?? "",
      subtitle: item.subtitle ?? "",
      privacy: item.privacy ?? "public",
      containsMusic: item.containsMusic ?? true,
      postAuthor: CATALOG_IDENTITY.postAuthor,
      isrc: item.isrc ?? "",
      composer: CATALOG_IDENTITY.composer,
      releaseTitle: item.releaseTitle ?? "",
      purchaseMode: item.purchaseMode ?? "link",
      purchaseUrl: item.purchaseUrl ?? "",
      purchaseTitle: item.purchaseTitle ?? "Comprar",
      albumTitle: item.albumTitle ?? "",
      recordLabel: CATALOG_IDENTITY.recordLabel,
      releaseDate: item.releaseDate ?? "",
      barcode: item.barcode ?? "",
      iswc: item.iswc ?? "",
      pLine: item.pLine ?? "",
      explicit: item.explicit ?? false,
      license: item.license ?? "all_rights_reserved",
      cover: item.cover ?? "",
      panoramicCover: item.panoramicCover ?? "",
      lyrics: item.lyrics ?? "",
      visualTheme: item.visualTheme ?? VISUAL_PRESETS.violet,
    });
  };
  const openRenameTrack = (item: Track) => {
    setRenamingTrack(item);
    setRenameDraft(item.title);
  };
  const saveTrackName = (target = renamingTrack) => {
    if (!target || !renameDraft.trim()) { setRenamingTrack(null); return; }
    const key = trackKey(target);
    const title = renameDraft.trim();
    setTracks((items) => items.map((item) => trackKey(item) === key ? { ...item, title } : item));
    let stored: Record<string, Partial<Track>> = {};
    try { stored = JSON.parse(localStorage.getItem("blackmamba-track-metadata") ?? "{}"); } catch { stored = {}; }
    localStorage.setItem("blackmamba-track-metadata", JSON.stringify({ ...stored, [key]: { ...(stored[key] ?? {}), title } }));
    setRenamingTrack(null);
  };
  const toggleHashtag = (hashtag: string) =>
    setEditDraft((draft) => ({
      ...draft,
      hashtags: (draft.hashtags ?? []).includes(hashtag)
        ? (draft.hashtags ?? []).filter((item) => item !== hashtag)
        : [...(draft.hashtags ?? []), hashtag],
    }));
  const applyVisualPreset = (preset: VisualPreset) =>
    setEditDraft((draft) => ({
      ...draft,
      visualTheme: { ...VISUAL_PRESETS[preset] },
    }));
  const updateVisualTheme = (
    field: keyof VisualTheme,
    value: string | number,
  ) =>
    setEditDraft((draft) => ({
      ...draft,
      visualTheme: {
        ...(draft.visualTheme ?? VISUAL_PRESETS.violet),
        [field]: value,
      },
    }));
  const saveTrackEditor = async () => {
    if (!editingTrack) return;
    const key = trackKey(editingTrack);
    const normalizedDraft = { ...editDraft, ...CATALOG_IDENTITY };
    if (editingTrack.id && editingTrack.localStatus === "available") {
      setTrackSaveStatus("saving");
      setTrackSaveMessage("Guardando letra en la USB…");
      try {
        const response = await fetch(`/api/tracks/${encodeURIComponent(editingTrack.id)}/lyrics`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lyrics: normalizedDraft.lyrics ?? "" }) });
        if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(detail.fallbackReason || "No se pudo guardar la letra"); }
      } catch (error) {
        setTrackSaveStatus("error");
        setTrackSaveMessage(error instanceof Error ? error.message : "No se pudo guardar la letra");
        return;
      }
    }
    setTracks((currentTracks) =>
      currentTracks.map((item) =>
        trackKey(item) === key
          ? {
              ...item,
              ...normalizedDraft,
              hasLyrics: Boolean(normalizedDraft.lyrics?.trim()),
            }
          : item,
      ),
    );
    let stored: Record<string, Partial<Track>> = {};
    try {
      stored = JSON.parse(
        localStorage.getItem("blackmamba-track-metadata") ?? "{}",
      );
    } catch {
      stored = {};
    }
    localStorage.setItem(
      "blackmamba-track-metadata",
      JSON.stringify({ ...stored, [key]: normalizedDraft }),
    );
    setTrackSaveStatus("idle");
    setEditingTrack(null);
  };
  const initials = (item: Track) =>
    item.title
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join("") || "BM";
  const availabilityLabel = (item: Track) => {
    const key = trackKey(item);
    if (downloadingTrack[key] !== undefined) {
      return `DOWNLOADING · ${downloadingTrack[key]}%`;
    }
    // USB tracks from the original library.json may lack localStatus
    if (item.localStatus === "available" || (!item.localStatus && item.file))
      return `LOCAL · ${(item.localFormat ?? "MP3").toUpperCase()}`;
    if (item.streamUrl) return "STREAM · SOUNDCLOUD";
    if (item.preferredSource === "suno") return "DOWNLOAD WAV · SUNO";
    if (item.preferredSource === "soundcloud" || item.soundcloudUrl)
      return "DOWNLOAD · SOUNDCLOUD";
    return "LOCALIZAR AUDIO";
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isPlayable = (item: Track) =>
    Boolean(item.file || item.streamUrl);
  const downloadTrack = (item: Track) => {
    const key = trackKey(item);
    // Local file available — trigger browser download
    if ((item.localStatus === "available" || (!item.localStatus && item.file)) && item.file) {
      const link = document.createElement("a");
      link.href = item.downloadUrl ?? item.file;
      link.download = `${item.title}.${item.localFormat ?? "mp3"}`;
      document.body.append(link);
      link.click();
      link.remove();
      return;
    }
    
    // Non-local track — trigger visual download animation
    if (downloadingTrack[key] === undefined) {
      let progress = 0;
      setDownloadingTrack((prev) => ({ ...prev, [key]: 0 }));
      
      const interval = window.setInterval(() => {
        progress += Math.floor(Math.random() * 15) + 5;
        if (progress >= 100) {
          progress = 100;
          window.clearInterval(interval);
          
          // Complete download: add local path simulation
          setTracks((currentTracks) =>
            currentTracks.map((t) =>
              trackKey(t) === key
                ? {
                    ...t,
                    localStatus: "available",
                    availabilityStatus: "local",
                    localFormat: "mp3",
                    file: `/player/${t.id || "downloaded"}.mp3`,
                  }
                : t
            )
          );
          setTimeout(() => {
            setDownloadingTrack((prev) => {
              const next = { ...prev };
              delete next[key];
              return next;
            });
          }, 1500);
        } else {
          setDownloadingTrack((prev) => ({ ...prev, [key]: progress }));
        }
      }, 300);
    }
  };
  const downloadLabel = (item: Track) => {
    const key = trackKey(item);
    if (downloadingTrack[key] !== undefined) {
      return `Cargando (${downloadingTrack[key]}%)`;
    }
    if (item.localStatus === "available" || (!item.localStatus && item.file))
      return "Descargar archivo";
    if (item.preferredSource === "suno") return "Download WAV en Suno";
    if (item.soundcloudUrl || item.preferredSource === "soundcloud")
      return "Download desde SoundCloud";
    return "Localizar audio";
  };
  const exportReviews = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      catalogSize: tracks.length,
      counts,
      decisions: tracks
        .filter((item) => reviews[trackKey(item)] || ratings[trackKey(item)])
        .map((item) => ({
          id: trackKey(item),
          title: item.title,
          status: reviews[trackKey(item)] ?? null,
          rating: ratings[trackKey(item)] ?? null,
        })),
    };
    const url = URL.createObjectURL(
      new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "blackmamba-review-decisions.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        (event.target.matches("input, textarea, select, button") ||
          event.target.isContentEditable)
      )
        return;
      if (event.code === "Space") {
        event.preventDefault();
        toggle();
      }
      if (event.code === "ArrowLeft") seek(-10);
      if (event.code === "ArrowRight") seek(10);
      if (event.code === "Escape") stop();
      if (/^[1-5]$/.test(event.key)) {
        rate(track, Number(event.key));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() =>
    window.blackMambaDesktop?.onTransport((action) => {
      if (action === "toggle") toggle();
      if (action === "previous") move(-1);
      if (action === "next") move(1);
      if (action === "stop") stop();
    }),
  );

  return (
    <main
      className={`dynamic-theme layout-${layout} motion-${motion}`}
      style={
        {
          "--acid": ledColor,
          "--accent-2": theme.accent2,
          "--theme-surface": theme.surface,
          "--theme-glow": theme.glow,
          "--theme-accent-c": visualTheme?.accentC ?? theme.accent2,
          "--theme-panel-glow": visualTheme?.panelGlow ?? theme.glow,
          "--theme-disc-glow": visualTheme?.discGlow ?? theme.glow,
          "--theme-button-glow": visualTheme?.buttonGlow ?? theme.accent,
          "--theme-speed": `${(visualTheme?.speed ?? 6) * 3}s`,
          "--app-font":
            appFont === "oswald"
              ? 'Oswald, sans-serif'
              : appFont === "mono"
                ? '"Courier New", monospace'
                : appFont === "system"
                  ? '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
                  : '"DM Sans", sans-serif',
          "--title-font":
            titleFont === "oswald"
              ? 'Oswald, sans-serif'
              : titleFont === "mono"
                ? '"Courier New", monospace'
                : titleFont === "system"
                  ? '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
                  : '"DM Sans", sans-serif',
          "--title-font-size": `${titleFontSize}px`,
        } as React.CSSProperties
      }
    >
      <nav>
        <a
          className="brand"
          href="#top"
          aria-label="BlackMamba Records, inicio"
        >
          <span>BM</span> BLACKMAMBA <i>RECORDS</i>
        </a>
        <div className="nav-links">
          <a href="#music">Música</a>
          <a href="#about">Nosotros</a>
        </div>
        <a className="pill" href="#music">
          Escuchar ahora
        </a>
      </nav>

      {layout === "focus" && (
        <section className="hero" id="top">
          <div className="signal" aria-hidden="true">
            {[
              18, 40, 67, 93, 58, 32, 76, 98, 54, 26, 62, 86, 44, 70, 24, 50,
            ].map((height, i) => (
              <b key={i} style={{ height: `${height}%` }} />
            ))}
          </div>
          <div className="eyebrow">SONIDO INDEPENDIENTE · MÉXICO</div>
          <h1>
            Donde el ritmo
            <br />
            muerde <em>fuerte.</em>
          </h1>
          <p className="lede">
            Música original de BlackMamba Records. Directo del estudio, sin
            intermediarios.
          </p>
          <button className="hero-play" onClick={toggle}>
            <span>{playing ? "Ⅱ" : "▶"}</span>
            {playing ? "Pausar selección" : "Escuchar selección"}
          </button>
          <div className="hero-track">
            <small>SONANDO AHORA</small>
            <strong>{track.title}</strong>
            <span>{track.artist}</span>
          </div>
        </section>
      )}

      <section className="catalog" id="music">
        <div className="library-command">
          <div>
            <span className="eyebrow">BLACKMAMBA LIBRARY</span>
            <strong>
              {filtered.length} por revisar <small>de {tracks.length}</small>
            </strong>
          </div>
          <div className="layout-switcher" aria-label="Vistas de biblioteca">
            <button
              className={layout === "combined" ? "active" : ""}
              onClick={() => setLayout("combined")}
            >
              <SidebarSimple size={17} />
              Combined
            </button>
            <button
              className={layout === "grid" ? "active" : ""}
              onClick={() => setLayout("grid")}
            >
              <GridFour size={17} />
              Grid
            </button>
            <button
              className={layout === "review" ? "active" : ""}
              onClick={() => setLayout("review")}
            >
              <ListBullets size={17} />
              Console
            </button>
            <button
              className={layout === "focus" ? "active" : ""}
              onClick={() => setLayout("focus")}
            >
              <SlidersHorizontal size={17} />
              Focus
            </button>
            <button
              className={layout === "winamp" ? "active" : ""}
              onClick={() => setLayout("winamp")}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17" aria-hidden="true" style={{ transform: 'scale(1.2)' }}>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z"/>
              </svg>
              Winamp Classic
            </button>
          </div>
          <label>
            Buscar canciones
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setReviewFilter("all");
                setVisibleCount(60);
              }}
              placeholder="Buscar canciones, artistas, letras…"
            />
          </label>
        </div>
        <div className="library-workspace">
          <aside className="library-sidebar">
            <div className="user-session-widget">
              {user ? (
                <div className="user-profile">
                  <img src={user.photoURL || "https://www.gravatar.com/avatar/?d=mp"} alt={user.displayName || "Usuario"} className="user-avatar" />
                  <div className="user-info">
                    <span className="user-name">{user.displayName || "Usuario"}</span>
                    <span className="user-email">{user.email}</span>
                  </div>
                  <button className="logout-btn" onClick={() => void signOut(auth)} title="Cerrar sesión">Salir</button>
                </div>
              ) : (
                <div className="auth-buttons">
                  <span className="auth-title">SINCRONIZAR BIBLIOTECA</span>
                  <div className="auth-row">
                    <button className="login-btn google" onClick={() => void signInWithPopup(auth, googleProvider)}>Google</button>
                    <button className="login-btn github" onClick={() => void signInWithPopup(auth, githubProvider)}>GitHub</button>
                  </div>
                </div>
              )}
            </div>
            <span className="eyebrow">BIBLIOTECA</span>
            <button onClick={() => setReviewFilter("all")}>
              Todas <b>{tracks.length}</b>
            </button>
            <button onClick={() => setReviewFilter("pending")}>
              Por revisar <b>{counts.pending}</b>
            </button>
            <button onClick={() => setReviewFilter("reject")}>
              Rechazadas <b>{counts.reject}</b>
            </button>
            <button onClick={() => setReviewFilter("later")}>
              Más tarde <b>{counts.later}</b>
            </button>
            <button className={showImages ? "active" : ""} onClick={() => { setShowImages((visible) => !visible); setShowWebMp3(false); setShowLyricsStudio(false); }}>
              <ImageSquare size={16} /> Imágenes <b>{coverAssets.length}</b>
            </button>
            <button className={showWebMp3 ? "active" : ""} onClick={() => { setShowWebMp3((visible) => !visible); setShowImages(false); setShowLyricsStudio(false); }}>
              <FileVideo size={16} /> Web:Mp3 <b>↗</b>
            </button>
            <button className={showLyricsStudio ? "active" : ""} onClick={() => { const next = !showLyricsStudio; setShowLyricsStudio(next); setShowImages(false); setShowWebMp3(false); if (next && !lyricsStudioTrack && track) openLyricsStudioTrack(track); }}>
              <PencilSimple size={16} /> Letras <b>{sourceCounts.missingLyrics}</b>
            </button>
            <span className="eyebrow side-label">LISTAS</span>
            <button className={!activePlaylist ? "active" : ""} onClick={() => { setActivePlaylistId(null); setPlaylistEditing(false); }}>Todas las canciones <b>{tracks.length}</b></button>
            {playlists.map((list) => <div className="playlist-row" key={list.id}>
              <button className={activePlaylistId === list.id ? "active" : ""} onClick={() => { setActivePlaylistId(list.id); setPlaylistEditing(false); }}><span>{list.name}</span><b>{list.trackKeys.length}</b></button>
              <button className="playlist-delete" aria-label={`Borrar lista ${list.name}`} onClick={() => { setPlaylists((items) => items.filter((item) => item.id !== list.id)); if (activePlaylistId === list.id) setActivePlaylistId(null); }}>×</button>
            </div>)}
            <form className="playlist-create" onSubmit={(event) => { event.preventDefault(); createPlaylist(); }}>
              <input value={newPlaylistName} onChange={(event) => setNewPlaylistName(event.target.value)} placeholder="Nueva lista…" aria-label="Nombre de lista nueva" />
              <button type="submit" disabled={!newPlaylistName.trim()}>+</button>
            </form>
            {activePlaylist && <button className={playlistEditing ? "active" : ""} onClick={() => setPlaylistEditing((value) => !value)}>{playlistEditing ? "Terminar de agregar" : "+ Agregar canciones"}</button>}
            <span className="eyebrow side-label">FILTROS</span>
            <button className={sourceFilter === "all" ? "active" : ""} onClick={() => setSourceFilter("all")}>Todas las fuentes</button>
            <button className={sourceFilter === "local" ? "active" : ""} onClick={() => setSourceFilter("local")}>Audio local <b>{sourceCounts.local}</b></button>
            <button className={sourceFilter === "recoverable" ? "active" : ""} onClick={() => setSourceFilter("recoverable")}>Por recuperar <b>{sourceCounts.recoverable}</b></button>
            <button className={sourceFilter === "missing-cover" ? "active warning" : ""} onClick={() => setSourceFilter("missing-cover")}>Sin portada <b>{sourceCounts.missingCover}</b></button>
            <button className={sourceFilter === "missing-lyrics" ? "active warning" : ""} onClick={() => setSourceFilter("missing-lyrics")}>Sin letra <b>{sourceCounts.missingLyrics}</b></button>
            <span className="eyebrow side-label">
              REPRODUCIDAS RECIENTEMENTE
            </span>
            <div className="playback-history">
              {playbackHistory.slice(0, 8).map((entry, historyIndex) => (
                <button
                  key={`${entry.trackKey}-${entry.playedAt}-${historyIndex}`}
                  onClick={() => playFromHistory(entry)}
                  title={new Date(entry.playedAt).toLocaleString()}
                >
                  <span>{entry.title}</span>
                  <small>
                    {new Date(entry.playedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </button>
              ))}
              {!playbackHistory.length && <p>Aún no hay reproducciones.</p>}
              {!!playbackHistory.length && (
                <button
                  className="clear-history"
                  onClick={() => setPlaybackHistory([])}
                >
                  Limpiar historial
                </button>
              )}
            </div>
          </aside>
          <div className={`catalog-main${showImages ? " show-images" : ""}${showWebMp3 ? " show-web-mp3" : ""}${showLyricsStudio ? " show-lyrics-studio" : ""}`}>
            {showLyricsStudio && (
              <section className="lyrics-studio" aria-label="Estudio de letras">
                <aside>
                  <header><span className="eyebrow">REVISIÓN HUMANA</span><strong>LETRAS</strong></header>
                  <input value={lyricsStudioQuery} onChange={(event) => setLyricsStudioQuery(event.target.value)} placeholder="Buscar canción…" aria-label="Buscar canción para editar letra" />
                  <div className="lyrics-studio-list">
                    {lyricsStudioItems.slice(0, 300).map((item) => <button key={trackKey(item)} className={lyricsStudioTrack === trackKey(item) ? "active" : ""} onClick={() => openLyricsStudioTrack(item)}><span>{item.title}</span><small>{item.hasLyrics ? "CON LETRA" : "PENDIENTE"}</small></button>)}
                  </div>
                </aside>
                <article>
                  {selectedLyricsStudioTrack ? <>
                    <header><div><span className="eyebrow">EDITANDO</span><h2>{selectedLyricsStudioTrack.title}</h2><p>{selectedLyricsStudioTrack.artist} · Puedes reproducir la canción abajo mientras corriges.</p></div><button onClick={() => playTrack(selectedLyricsStudioTrack)}><Play size={16} weight="fill" /> Reproducir</button></header>
                    <textarea value={lyricsStudioDraft} onChange={(event) => { setLyricsStudioDraft(event.target.value); setLyricsStudioStatus("idle"); }} placeholder="Escribe o corrige la letra aquí…" spellCheck="true" />
                    <section className="lyrics-keywords">
                      <div><span className="eyebrow">PALABRAS CLAVE PARA IMÁGENES</span><small>Separadas por comas; se usan para recomendar portadas.</small></div>
                      <input value={lyricsKeywordsDraft} onChange={(event) => { setLyricsKeywordsDraft(event.target.value); setLyricsStudioStatus("idle"); }} placeholder="noche, ciudad, fuego, libertad…" />
                      <button type="button" onClick={() => { setLyricsKeywordsDraft(extractTextKeywords(lyricsStudioDraft).join(", ")); setLyricsStudioStatus("idle"); }}>Generar desde letra</button>
                    </section>
                    <footer><span className={lyricsStudioStatus}>{lyricsStudioStatus === "saved" ? "Guardada en USB" : lyricsStudioStatus === "error" ? "No se pudo guardar" : `${lyricsStudioDraft.trim().split(/\s+/).filter(Boolean).length} palabras`}</span><button onClick={() => void saveLyricsStudio()} disabled={lyricsStudioStatus === "saving" || selectedLyricsStudioTrack.localStatus !== "available"}>{lyricsStudioStatus === "saving" ? "Guardando…" : "Guardar letra"}</button></footer>
                  </> : <div className="lyrics-studio-empty">Selecciona una canción.</div>}
                </article>
              </section>
            )}
            {showWebMp3 && (
              <section className="web-mp3-panel" aria-label="Web:Mp3, extractor local de audio">
                <div className="web-mp3-orbit" aria-hidden="true"><FileVideo size={52} weight="thin" /></div>
                <span className="eyebrow">BM / INGEST 01</span>
                <h2>VIDEO LOCAL<br /><em>A MP3</em></h2>
                <p>Selecciona un video de tu Mac. BlackMamba extrae el audio localmente y deja el MP3 listo en Descargas, sin modificar el archivo original.</p>
                <button className="web-mp3-upload" onClick={() => void extractVideoMp3()} disabled={!window.blackMambaDesktop || videoExtractStatus === "working"}>
                  <FileVideo size={22} weight="bold" />
                  <span>{videoExtractStatus === "working" ? "EXTRAYENDO AUDIO…" : "SELECCIONAR VIDEO"}</span>
                  <b>↗</b>
                </button>
                <div className={`web-mp3-result ${videoExtractStatus}`} role="status">
                  <span>{videoExtractStatus === "idle" ? "MP4 · MOV · MKV · WEBM · AVI · MÁX. 8 GB" : videoExtractMessage}</span>
                </div>
                <div className="web-mp3-facts">
                  <span><b>LOCAL</b> El archivo no sale del Mac</span>
                  <span><b>FFMPEG</b> Conversión MP3 en máxima calidad</span>
                  <span><b>SALIDA</b> Downloads / Web-a-MP3</span>
                </div>
              </section>
            )}
            {showImages && (
              <section className="cover-library" aria-label="Biblioteca de imágenes">
                <header>
                  <div><span className="eyebrow">BANDEJA DE PORTADAS</span><h3>{coverAssets.length} imágenes listas</h3><p>{editingImages ? "Modo edición: selecciona una o varias imágenes para eliminarlas de la bandeja." : "Elige una canción: las imágenes que coinciden con su letra aparecen primero."}</p></div>
                  <div className="cover-header-actions">
                    <button className={editingImages ? "editing" : ""} onClick={() => { setEditingImages((active) => !active); setSelectedImages(new Set()); setCoverMessage(""); }} aria-label={editingImages ? "Salir del modo edición" : "Editar imágenes"} title={editingImages ? "Salir del modo edición" : "Editar imágenes"}><GearSix size={17} weight="bold" /> {editingImages ? "Terminar" : "Editar"}</button>
                    {editingImages && <button className="delete-images" disabled={!selectedImages.size} onClick={deleteSelectedImages}><Trash size={17} weight="bold" /> Eliminar {selectedImages.size || ""}</button>}
                    <button onClick={() => setShowImages(false)}>Volver a canciones</button>
                  </div>
                </header>
                {!editingImages && <div className="cover-assignment">
                  <label>Canción destino<select value={coverTarget} onChange={(event) => setCoverTarget(event.target.value)}><option value="">Seleccionar canción…</option>{tracks.map((item) => <option key={trackKey(item)} value={trackKey(item)}>{item.title} — {item.artist}</option>)}</select></label>
                  <button disabled={!selectedCover || !coverTarget} onClick={assignSelectedCover}>Asignar portada</button>
                  <span>{coverMessage}</span>
                  <label className="cover-search">Buscar por prompt o palabra clave<input value={coverSearch} onChange={(event) => setCoverSearch(event.target.value)} placeholder="noche, humo, neón…" /></label>
                  {coverTargetTrack && <div className="target-keywords"><b>Letra:</b>{targetLyricKeywords.length ? targetLyricKeywords.map((keyword) => <i key={keyword}>{keyword}</i>) : <small>Abre Letras y genera palabras clave.</small>}</div>}
                </div>}
                {!editingImages && selectedCoverAsset && <section className="image-metadata-editor">
                  <img src={selectedCoverAsset.url} alt="" />
                  <label><span>Prompt de la imagen</span><textarea value={coverPromptDraft} onChange={(event) => { setCoverPromptDraft(event.target.value); setImageMetadataStatus("idle"); }} placeholder="Describe la escena, iluminación, personas, objetos, colores y ambiente…" /></label>
                  <label><span>Palabras clave</span><input value={coverKeywordsDraft} onChange={(event) => { setCoverKeywordsDraft(event.target.value); setImageMetadataStatus("idle"); }} placeholder="noche, ciudad, neón, retrato…" /></label>
                  <div><button type="button" onClick={() => setCoverKeywordsDraft(extractTextKeywords(coverPromptDraft).join(", "))}>Extraer del prompt</button><button type="button" onClick={() => void saveCoverMetadata()} disabled={imageMetadataStatus === "saving"}>{imageMetadataStatus === "saving" ? "Guardando…" : imageMetadataStatus === "saved" ? "Metadata guardada ✓" : "Guardar metadata"}</button>{imageMetadataStatus === "error" && <small>No se pudo guardar en la USB.</small>}</div>
                </section>}
                {(["square", "panoramic", "other"] as CoverKind[]).map((kind) => coverGroups[kind].length ? <section className={`cover-format-group ${kind}`} key={kind}><header><div><span className="eyebrow">{kind === "square" ? "FORMATO 1:1" : kind === "panoramic" ? "FORMATO PANORÁMICO" : "OTROS FORMATOS"}</span><h4>{kind === "square" ? "Portadas cuadradas" : kind === "panoramic" ? "Portadas horizontales" : "Imágenes por revisar"}</h4></div><b>{coverGroups[kind].length}</b></header><div className="cover-grid">{coverGroups[kind].map((asset) => { const match = keywordMatch(targetLyricKeywords, [...(asset.keywords ?? []), ...extractTextKeywords(asset.prompt ?? "")]); return <button key={asset.file} className={(editingImages ? selectedImages.has(asset.file) : selectedCover === asset.file) ? "selected" : ""} onClick={() => { if (editingImages) setSelectedImages((current) => { const next = new Set(current); if (next.has(asset.file)) next.delete(asset.file); else next.add(asset.file); return next; }); else setSelectedCover(asset.file); setCoverMessage(""); }} aria-pressed={editingImages ? selectedImages.has(asset.file) : selectedCover === asset.file} title={asset.prompt || asset.origins?.[0]?.path || asset.originalName}><img src={asset.url} alt={asset.prompt || asset.originalName} loading="lazy" />{editingImages && <i className="selection-check">✓</i>}{!editingImages && match.matches.length > 0 && <i className="match-badge">{match.matches.length} match</i>}<span>{asset.width && asset.height ? `${asset.width}×${asset.height} · ` : ""}{asset.keywords?.length ? asset.keywords.slice(0, 3).join(" · ") : asset.originalName}</span></button>; })}</div></section> : null)}
              </section>
            )}
            <div className="review-toolbar" aria-label="Filtros de revisión">
              <label className="rating-sort">
                <span>Ordenar</span>
                <select
                  value={sortMode}
                  onChange={(event) => {
                    setSortMode(event.target.value as SortMode);
                    setVisibleCount(60);
                  }}
                  aria-label="Ordenar canciones por calificación"
                >
                  <option value="catalog">Número de catálogo</option>
                  <option value="rating-desc">★★★★★ → ☆☆☆☆☆</option>
                  <option value="rating-asc">☆☆☆☆☆ → ★★★★★</option>
                  <option value="title-asc">Nombre (A-Z)</option>
                  <option value="title-desc">Nombre (Z-A)</option>
                  <option value="genre-asc">Género (A-Z)</option>
                  <option value="genre-desc">Género (Z-A)</option>
                  <option value="plays-desc">Más reproducidas</option>
                  <option value="plays-asc">Menos reproducidas</option>
                </select>
              </label>
              <button
                className={reviewFilter === "all" ? "selected" : ""}
                onClick={() => setReviewFilter("all")}
              >
                Todas <b>{tracks.length}</b>
              </button>
              <button
                className={reviewFilter === "pending" ? "selected" : ""}
                onClick={() => setReviewFilter("pending")}
              >
                Pendientes <b>{counts.pending}</b>
              </button>
              <button
                className={reviewFilter === "reject" ? "selected" : ""}
                onClick={() => setReviewFilter("reject")}
              >
                No pertenecen <b>{counts.reject}</b>
              </button>
              <button
                className={reviewFilter === "later" ? "selected" : ""}
                onClick={() => setReviewFilter("later")}
              >
                Después <b>{counts.later}</b>
              </button>
              <button
                className="export-reviews"
                onClick={exportReviews}
                disabled={!Object.keys(reviews).length}
              >
                Exportar decisiones
              </button>
            </div>
            <div className="track-list">
              {visibleTracks.map((item, visibleIndex) => (
                <div
                  ref={(node) => {
                    if (node) trackRows.current.set(trackKey(item), node);
                    else trackRows.current.delete(trackKey(item));
                  }}
                  className={`track-row ${item === track ? "active" : ""} ${item === track && playing ? "is-playing" : ""} review-${reviews[trackKey(item)] ?? "pending"}`}
                  key={trackKey(item)}
                  title={item.warnings?.join(" · ")}
                  data-recoverable={item.localStatus === "recoverable" ? "true" : undefined}
                  style={{ animation: `row-in 0.26s ease-out ${Math.min(visibleIndex * 10, 260)}ms both` }}
                >
                  <div className="track-main" onClick={() => playTrack(item)}>
                    <span
                      className="track-number"
                      aria-label={`Canción número ${tracks.indexOf(item) + 1}`}
                    >
                      {(trackIndexByKey.get(trackKey(item)) ?? -1) + 1}
                    </span>
                    <span
                      className="track-art"
                      aria-label={
                        item.cover
                          ? `Portada de ${item.title}`
                          : `Portada pendiente de ${item.title}`
                      }
                    >
                      {item.cover ? (
                        <img src={item.cover} alt="" />
                      ) : (
                        initials(item)
                      )}
                      <span className="art-play" aria-hidden="true">
                        {item.localStatus === "recoverable" ? (
                          "↪"
                        ) : item === track && playing ? (
                          <Pause size={15} weight="fill" />
                        ) : (
                          <Play size={15} weight="fill" />
                        )}
                      </span>
                    </span>
                    <span className="track-title">
                      {renamingTrack && trackKey(renamingTrack) === trackKey(item) ? (
                        <input autoFocus className="inline-title-edit" value={renameDraft} maxLength={180}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => setRenameDraft(event.target.value)}
                          onKeyDown={(event) => { if (event.key === "Enter") saveTrackName(item); if (event.key === "Escape") setRenamingTrack(null); }}
                          onBlur={() => saveTrackName(item)} />
                      ) : (
                        <span className="title-wrapper"><strong>{item.title}</strong><button className="inline-edit-btn" onClick={(event) => { event.stopPropagation(); openRenameTrack(item); }} aria-label={`Editar nombre de ${item.title}`} title="Editar nombre"><PencilSimple size={12} /></button></span>
                      )}
                      <small>{item.artist}</small>
                      <small className="track-duration">{item.duration}</small>
                      {!!item.hashtags?.length && (
                        <small className="track-hashtags">
                          {item.hashtags.join(" ")}
                        </small>
                      )}
                    </span>
                  </div>
                  <div
                    className="review-actions"
                    aria-label={`Revisar ${item.title}`}
                  >
                    <div className="ratings-and-genres">
                      <div className="star-rating" role="group" aria-label={`Calificación de ${item.title}`}>
                        {[1, 2, 3, 4, 5].map((star) => <button key={star} className={star <= (ratings[trackKey(item)] ?? 0) ? "filled" : ""} onClick={() => rate(item, star)} aria-label={`${star} ${star === 1 ? "estrella" : "estrellas"}`} aria-pressed={ratings[trackKey(item)] === star}>★</button>)}
                      </div>
                      <div className="genre-picker" role="group" aria-label={`Géneros de ${item.title}`}>
                        {GENRES.map((genre) => {
                          const selected = trackGenres(item).includes(genre);
                          return <button key={genre} style={{ "--genre-color": GENRE_COLORS[genre] } as CSSProperties} className={selected ? "selected" : ""} onClick={() => void toggleTrackGenre(item, genre)} aria-pressed={selected}>{genre}</button>;
                        })}
                      </div>
                    </div>
                    {activePlaylist && <button className={activePlaylistKeys.has(trackKey(item)) ? "playlist-toggle chosen" : "playlist-toggle"} onClick={() => toggleTrackInActivePlaylist(item)}>{activePlaylistKeys.has(trackKey(item)) ? "En lista ✓" : "+ Lista"}</button>}
                    <button
                      className={`lyrics-toggle ${item.hasLyrics ? "has-lyrics" : ""}`}
                      onClick={() => item.hasLyrics ? setOpenLyrics(openLyrics === trackKey(item) ? null : trackKey(item)) : void extractLyrics(item)}
                      aria-expanded={openLyrics === trackKey(item)}
                      aria-busy={["queued", "running"].includes(lyricProgress[trackKey(item)]?.status)}
                      aria-label={`Letra de ${item.title}`}
                    >
                      {["queued", "running"].includes(lyricProgress[trackKey(item)]?.status)
                        ? lyricProgress[trackKey(item)]?.status === "queued" ? "En cola" : `${Math.round(lyricProgress[trackKey(item)].progress)}%`
                        : lyricProgress[trackKey(item)]?.status === "error"
                          ? "Reintentar"
                          : item.hasLyrics ? "Letra ✓" : "Letra"}
                    </button>
                    <button
                      className={
                        reviews[trackKey(item)] === "reject" ? "chosen" : ""
                      }
                      onClick={() => review(item, "reject")}
                      aria-label="No pertenece"
                    >
                      ×
                    </button>
                    <button
                      className={
                        reviews[trackKey(item)] === "later" ? "chosen" : ""
                      }
                      onClick={() => review(item, "later")}
                      aria-label="Revisar después"
                    >
                      …
                    </button>
                  </div>
                  {openLyrics === trackKey(item) && (
                    <section
                      className="lyrics-panel"
                      aria-label={`Contenido de letra de ${item.title}`}
                    >
                      <span className="eyebrow">LETRA · {item.title}</span>
                      {item.hasLyrics ? (
                        <pre>{item.lyrics}</pre>
                      ) : (
                        <p>
                          Letra pendiente. Este espacio ya está reservado para
                          agregarla.
                        </p>
                      )}
                    </section>
                  )}
                </div>
              ))}
              {!filtered.length && (
                <p className="empty">No encontramos esa canción.</p>
              )}
            </div>
            {visibleCount < filtered.length && (
              <button
                className="load-more"
                onClick={() => setVisibleCount((count) => count + 60)}
              >
                Mostrar 60 más · {filtered.length - visibleCount} restantes
              </button>
            )}
          </div>
          <aside className="track-inspector">
            <div className="inspector-cover">
              {track.cover ? (
                <img src={track.cover} alt={`Portada de ${track.title}`} />
              ) : (
                <img
                  src="/ganja-love-cover.png"
                  alt="Portada editorial BlackMamba"
                />
              )}
            </div>
            <h3>{track.title}</h3>
            <p>{track.artist}</p>
            <div className="inspector-meta">
              <span>
                Duración <b>{track.duration}</b>
              </span>
              <span>
                Calificación <b>{ratings[trackKey(track)] ?? 0}/5</b>
              </span>
              <span>
                Estado{" "}
                <b>
                  {reviews[trackKey(track)] === "reject"
                    ? "No pertenece"
                    : reviews[trackKey(track)] === "later"
                      ? "Después"
                      : "Por revisar"}
                </b>
              </span>
              <span>
                Letra <b>{track.hasLyrics ? "Detectada" : "Pendiente"}</b>
              </span>
              <span>
                Audio <b>{availabilityLabel(track)}</b>
              </span>
            </div>
            <div className="inspector-actions">
              <button onClick={() => review(track, "reject")}>Rechazar</button>
              <button onClick={() => review(track, "later")}>Más tarde</button>
              <button onClick={() => openTrackEditor(track)}>Editar letra / info</button>
              <button
                className="download-track"
                onClick={() => downloadTrack(track)}
              >
                ↓ {downloadLabel(track)}
              </button>
              {(track.soundcloudUrl ?? track.sourceUrl) &&
                track.localStatus === "recoverable" && (
                  <a
                    className="soundcloud-link"
                    href={(track.soundcloudUrl ?? track.sourceUrl) || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Escuchar en SoundCloud"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" aria-hidden="true">
                      <path d="M1.175 12.225c-.015 0-.03.01-.03.025l-.525 3.375.525 3.3c0 .015.015.025.03.025s.03-.01.03-.025l.6-3.3-.6-3.375c0-.015-.015-.025-.03-.025zm1.35-.675c-.015 0-.03.01-.03.025L2 15.6l.495 3.225c0 .015.015.025.03.025s.03-.01.03-.025l.555-3.225-.555-3.025c0-.015-.015-.025-.03-.025zm1.38-.375c-.02 0-.037.013-.038.03L3.33 15.6l.537 3.188c.001.017.018.03.038.03.02 0 .037-.013.038-.03L4.5 15.6l-.557-3.395c-.001-.017-.018-.03-.038-.03zm1.395-.3c-.022 0-.04.016-.04.038L4.73 15.6l.53 3.337c0 .022.018.038.04.038.022 0 .04-.016.04-.038L5.89 15.6l-.55-3.687c0-.022-.018-.038-.04-.038zM12 6.15c-.57 0-1.125.09-1.65.255C10.088 3.93 8.013 2.1 5.55 2.1c-.69 0-1.343.15-1.95.435V15.75c0 .03.015.06.038.075l.012.003H15.75c1.242 0 2.25-1.008 2.25-2.25S16.992 11.325 15.75 11.325c-.21 0-.413.028-.607.08A5.85 5.85 0 0 0 12 6.15z"/>
                    </svg>
                    Escuchar en SoundCloud
                  </a>
                )}
            </div>
          </aside>
        </div>
      </section>

      <section className="about" id="about">
        <span className="eyebrow">BLACKMAMBA RECORDS</span>
        <h2>
          Hecho desde abajo.
          <br />
          <em>Hecho para sonar.</em>
        </h2>
        <p>
          Un espacio independiente para producir, cuidar y compartir música
          propia. Cada canción de este catálogo sale de sesiones reales de
          BlackMamba.
        </p>
      </section>
      <footer>
        <div className="brand">
          <span>BM</span> BLACKMAMBA <i>RECORDS</i>
        </div>
        <p>© 2026 BlackMamba Records</p>
      </footer>

      {editingTrack && (
        <div
          className="track-editor-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditingTrack(null);
          }}
        >
          <section
            className="track-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="track-editor-title"
          >
            <header>
              <div>
                <span className="eyebrow">FICHA DE CANCIÓN</span>
                <h2 id="track-editor-title">{editingTrack.title}</h2>
              </div>
              <button
                onClick={() => setEditingTrack(null)}
                aria-label="Cerrar editor"
              >
                ×
              </button>
            </header>
            <div className="track-editor-covers">
              <div className="edit-square">
                {editDraft.cover ? (
                  <img src={editDraft.cover} alt="Vista previa cuadrada" />
                ) : (
                  <span>PORTADA 1:1</span>
                )}
              </div>
              <div className="edit-wide">
                {editDraft.panoramicCover ? (
                  <img
                    src={editDraft.panoramicCover}
                    alt="Vista previa panorámica"
                  />
                ) : (
                  <span>PORTADA PANORÁMICA 16:9</span>
                )}
              </div>
            </div>
            <div className="hashtag-editor">
              <span>GÉNERO Y ESTILO · CLIC PARA ANCLAR</span>
              <div>
                {hashtagOptions.map((hashtag) => {
                  const anchored = (editDraft.hashtags ?? []).includes(hashtag);
                  return (
                    <button
                      key={hashtag}
                      className={anchored ? "anchored" : ""}
                      onClick={() => toggleHashtag(hashtag)}
                      aria-pressed={anchored}
                    >
                      {hashtag}
                    </button>
                  );
                })}
              </div>
            </div>
            <fieldset className="visual-theme-editor">
              <legend>ESTUDIO VISUAL · TEMA DE ESTA CANCIÓN</legend>
              <div
                className="visual-presets"
                role="group"
                aria-label="Presets visuales"
              >
                {(Object.keys(VISUAL_PRESETS) as VisualPreset[]).map(
                  (preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={
                        editDraft.visualTheme?.preset === preset ? "active" : ""
                      }
                      onClick={() => applyVisualPreset(preset)}
                    >
                      {preset}
                    </button>
                  ),
                )}
              </div>
              <div className="visual-color-grid">
                {(
                  [
                    ["accentA", "Principal"],
                    ["accentB", "Secundario"],
                    ["accentC", "Tercero"],
                    ["glow", "Brillo"],
                    ["panelGlow", "Panel"],
                    ["discGlow", "Portada"],
                    ["buttonGlow", "Botón"],
                  ] as Array<
                    [
                      (
                        | "accentA"
                        | "accentB"
                        | "accentC"
                        | "glow"
                        | "panelGlow"
                        | "discGlow"
                        | "buttonGlow"
                      ),
                      string,
                    ]
                  >
                ).map(([field, label]) => (
                  <label key={field}>
                    {label}
                    <input
                      type="color"
                      value={
                        editDraft.visualTheme?.[field] ??
                        VISUAL_PRESETS.violet[field]
                      }
                      onChange={(event) =>
                        updateVisualTheme(field, event.target.value)
                      }
                    />
                  </label>
                ))}
                <label className="visual-speed">
                  Ritmo visual
                  <input
                    type="range"
                    min="3"
                    max="12"
                    step="0.1"
                    value={editDraft.visualTheme?.speed ?? 5.5}
                    onChange={(event) =>
                      updateVisualTheme("speed", Number(event.target.value))
                    }
                  />
                  <span>
                    {(editDraft.visualTheme?.speed ?? 5.5).toFixed(1)}s
                  </span>
                </label>
              </div>
            </fieldset>
            <div className="track-editor-fields">
              <label>
                Título
                <input
                  value={editDraft.title ?? ""}
                  onChange={(event) =>
                    setEditDraft((draft) => ({
                      ...draft,
                      title: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Artista
                <input
                  value={editDraft.artist ?? ""}
                  readOnly
                  title="Identidad fija del catálogo"
                />
              </label>
              <label>
                Géneros
                <input
                  value={trackGenres(editDraft as Track).join(", ")}
                  readOnly
                  title="Se editan directamente desde los botones de colores"
                />
              </label>
              <label>
                URL portada 1:1
                <input
                  value={editDraft.cover ?? ""}
                  onChange={(event) =>
                    setEditDraft((draft) => ({
                      ...draft,
                      cover: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="wide-field">
                URL portada panorámica
                <input
                  value={editDraft.panoramicCover ?? ""}
                  onChange={(event) =>
                    setEditDraft((draft) => ({
                      ...draft,
                      panoramicCover: event.target.value,
                    }))
                  }
                />
              </label>
              <fieldset className="metadata-section wide-field">
                <legend>INFORMACIÓN BÁSICA · SOUNDCLOUD</legend>
                <label>
                  Enlace
                  <input
                    value={editDraft.permalink ?? ""}
                    onChange={(event) =>
                      setEditDraft((draft) => ({
                        ...draft,
                        permalink: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Subtítulo
                  <input
                    maxLength={140}
                    value={editDraft.subtitle ?? ""}
                    onChange={(event) =>
                      setEditDraft((draft) => ({
                        ...draft,
                        subtitle: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Privacidad
                  <select
                    value={editDraft.privacy ?? "public"}
                    onChange={(event) =>
                      setEditDraft((draft) => ({
                        ...draft,
                        privacy: event.target.value as Track["privacy"],
                      }))
                    }
                  >
                    <option value="public">Público</option>
                    <option value="private">Privado</option>
                    <option value="followers">Exclusiva para seguidores</option>
                  </select>
                </label>
                <label>
                  Contiene música
                  <select
                    value={editDraft.containsMusic ? "yes" : "no"}
                    onChange={(event) =>
                      setEditDraft((draft) => ({
                        ...draft,
                        containsMusic: event.target.value === "yes",
                      }))
                    }
                  >
                    <option value="yes">Sí</option>
                    <option value="no">No</option>
                  </select>
                </label>
                <label className="wide-field">
                  Descripción
                  <textarea
                    value={editDraft.description ?? ""}
                    onChange={(event) =>
                      setEditDraft((draft) => ({
                        ...draft,
                        description: event.target.value,
                      }))
                    }
                  />
                </label>
              </fieldset>
              <fieldset className="metadata-section wide-field">
                <legend>METADATOS EDITORIALES</legend>
                <label>
                  ISRC
                  <input
                    placeholder="USS1Z1001234"
                    value={editDraft.isrc ?? ""}
                    onChange={(event) =>
                      setEditDraft((draft) => ({
                        ...draft,
                        isrc: event.target.value.toUpperCase(),
                      }))
                    }
                  />
                </label>
                <label>
                  Compositor
                  <input
                    value={editDraft.composer ?? ""}
                    onChange={(event) =>
                      setEditDraft((draft) => ({
                        ...draft,
                        composer: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Autor del post
                  <input
                    value={editDraft.postAuthor ?? ""}
                    readOnly
                    title="Identidad fija del catálogo"
                  />
                </label>
                <label>
                  Título del lanzamiento
                  <input
                    value={editDraft.releaseTitle ?? ""}
                    onChange={(event) =>
                      setEditDraft((draft) => ({
                        ...draft,
                        releaseTitle: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Título del álbum
                  <input
                    value={editDraft.albumTitle ?? ""}
                    onChange={(event) =>
                      setEditDraft((draft) => ({
                        ...draft,
                        albumTitle: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Sello discográfico
                  <input
                    value={editDraft.recordLabel ?? ""}
                    readOnly
                    title="Identidad fija del catálogo"
                  />
                </label>
                <label>
                  Fecha de lanzamiento
                  <input
                    type="date"
                    value={editDraft.releaseDate ?? ""}
                    onChange={(event) =>
                      setEditDraft((draft) => ({
                        ...draft,
                        releaseDate: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Código de barras
                  <input
                    value={editDraft.barcode ?? ""}
                    onChange={(event) =>
                      setEditDraft((draft) => ({
                        ...draft,
                        barcode: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  ISWC
                  <input
                    placeholder="T-034.524.680-1"
                    value={editDraft.iswc ?? ""}
                    onChange={(event) =>
                      setEditDraft((draft) => ({
                        ...draft,
                        iswc: event.target.value.toUpperCase(),
                      }))
                    }
                  />
                </label>
                <label>
                  P Line
                  <input
                    placeholder="2026 BlackMamba Records"
                    value={editDraft.pLine ?? ""}
                    onChange={(event) =>
                      setEditDraft((draft) => ({
                        ...draft,
                        pLine: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Contenido explícito
                  <select
                    value={editDraft.explicit ? "yes" : "no"}
                    onChange={(event) =>
                      setEditDraft((draft) => ({
                        ...draft,
                        explicit: event.target.value === "yes",
                      }))
                    }
                  >
                    <option value="no">No</option>
                    <option value="yes">Sí</option>
                  </select>
                </label>
                <label>
                  Licencia
                  <select
                    value={editDraft.license ?? "all_rights_reserved"}
                    onChange={(event) =>
                      setEditDraft((draft) => ({
                        ...draft,
                        license: event.target.value as Track["license"],
                      }))
                    }
                  >
                    <option value="all_rights_reserved">
                      Todos los derechos reservados
                    </option>
                    <option value="creative_commons">Creative Commons</option>
                  </select>
                </label>
              </fieldset>
              <fieldset className="metadata-section wide-field">
                <legend>COMPRA Y ESCAPARATE</legend>
                <label>
                  Tipo
                  <select
                    value={editDraft.purchaseMode ?? "link"}
                    onChange={(event) =>
                      setEditDraft((draft) => ({
                        ...draft,
                        purchaseMode: event.target
                          .value as Track["purchaseMode"],
                      }))
                    }
                  >
                    <option value="link">Enlace de compra</option>
                    <option value="artist_store">Escaparate de artista</option>
                  </select>
                </label>
                <label>
                  Título del enlace
                  <input
                    value={editDraft.purchaseTitle ?? ""}
                    onChange={(event) =>
                      setEditDraft((draft) => ({
                        ...draft,
                        purchaseTitle: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="wide-field">
                  Enlace de compra
                  <input
                    value={editDraft.purchaseUrl ?? ""}
                    onChange={(event) =>
                      setEditDraft((draft) => ({
                        ...draft,
                        purchaseUrl: event.target.value,
                      }))
                    }
                  />
                </label>
              </fieldset>
              <label className="wide-field">
                Letra
                <textarea
                  value={editDraft.lyrics ?? ""}
                  onChange={(event) =>
                    setEditDraft((draft) => ({
                      ...draft,
                      lyrics: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <footer>
              <span className={trackSaveStatus === "error" ? "save-error" : ""}>{trackSaveMessage || "La letra se guarda en la USB; los demás cambios permanecen locales."}</span>
              <div>
                <button onClick={() => setEditingTrack(null)}>Cancelar</button>
                <button className="save-track" onClick={() => void saveTrackEditor()} disabled={trackSaveStatus === "saving"}>
                  {trackSaveStatus === "saving" ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}

      <div className={`player${playing ? " is-playing" : ""}`} aria-label="Reproductor de música">
        <button
          className="visual-settings-toggle"
          onClick={() => setSettingsOpen((open) => !open)}
          aria-label="Configuración visual"
          aria-expanded={settingsOpen}
          title="Configuración visual"
        >
          <GearSix size={16} weight="bold" />
        </button>
        {layout === "winamp" && (
          <button className="compact-exit" onClick={() => setLayout("combined")} aria-label="Salir de Winamp Classic" title="Volver a la biblioteca completa">
            <CornersOut size={15} weight="bold" />
          </button>
        )}
        <audio
          ref={audio}
          src={track.streamUrl || track.file}
          preload="metadata"
          onEnded={handlePlaybackEnded}
          onError={handlePlaybackError}
          onPlay={() => { consecutivePlaybackErrors.current = 0; setPlaying(true); }}
          onPause={() => setPlaying(false)}
        />
        <button className={`cover player-cover-picker${playing ? " cover-playing" : ""}`} onClick={openCurrentCoverLibrary} aria-label={`Elegir portada para ${track.title}`} title="Cambiar portada desde la biblioteca">
          {track.cover ? (
            <img src={track.cover} alt={`Portada de ${track.title}`} />
          ) : (
            initials(track)
          )}
        </button>
        <div className="now">
          <strong>{track.title}</strong>
          <small>{track.artist}</small>
          <div
            className="player-rating"
            role="group"
            aria-label={`Calificar mientras se reproduce ${track.title}`}
          >
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                className={
                  star <= (ratings[trackKey(track)] ?? 0) ? "filled" : ""
                }
                onClick={() => rate(track, star)}
                aria-label={`${star} ${star === 1 ? "estrella" : "estrellas"}`}
                aria-pressed={ratings[trackKey(track)] === star}
              >
                ★
              </button>
            ))}
          </div>
        </div>
        <AudioVisualizer
          active={playing && motion !== "off"}
          color={ledColor}
          reduced={motion === "reduced"}
          type={layout === "winamp" ? "sine" : "bar"}
          audioRef={audio}
        />
        <div className="transport">
          <div className="controls">
            <button
              className={`shuffle-control ${shuffle ? "active" : ""}`}
              onClick={() => setShuffle((enabled) => !enabled)}
              aria-label={
                shuffle
                  ? "Desactivar reproducción aleatoria"
                  : "Activar reproducción aleatoria"
              }
              aria-pressed={shuffle}
              title="Shuffle"
            >
              <Shuffle size={16} />
            </button>
            <button
              onClick={() => downloadTrack(track)}
              aria-label={downloadLabel(track)}
              title={downloadLabel(track)}
            >
              <DownloadSimple size={18} />
            </button>
            <button
              onClick={() => move(-1)}
              aria-label="Canción anterior"
              title="Canción anterior"
            >
              <SkipBack size={22} weight="bold" />
            </button>
            <button
              className={`video-to-mp3 ${videoExtractStatus === "working" ? "working" : ""}`}
              onClick={() => void extractVideoMp3()}
              disabled={!window.blackMambaDesktop || videoExtractStatus === "working"}
              aria-label="Extraer MP3 de un video"
              title="Video a MP3"
            >
              <FileVideo size={20} weight="bold" />
            </button>
            <button
              onClick={() => seek(-10)}
              aria-label="Retroceder 10 segundos"
              title="Retroceder 10 segundos"
            >
              −10
            </button>
            <button
              className="main-control"
              onClick={toggle}
              aria-label={playing ? "Pausar" : "Reproducir"}
              title={playing ? "Pausar" : "Reproducir"}
            >
              {playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
            </button>
            <button
              className="stop-control"
              onClick={stop}
              aria-label="Detener"
              title="Detener"
            >
              <Stop size={13} weight="fill" />
            </button>
            <button
              onClick={() => seek(10)}
              aria-label="Adelantar 10 segundos"
              title="Adelantar 10 segundos"
            >
              +10
            </button>
            <button
              onClick={() => move(1)}
              aria-label="Canción siguiente"
              title="Canción siguiente"
            >
              <SkipForward size={22} weight="bold" />
            </button>
          </div>
          {videoExtractMessage && (
            <div className={`video-extract-status ${videoExtractStatus}`} role="status">
              {videoExtractMessage}
              {videoExtractStatus !== "working" && <button onClick={() => { setVideoExtractStatus("idle"); setVideoExtractMessage(""); }} aria-label="Cerrar aviso">×</button>}
            </div>
          )}
          <PlaybackTimeline audioRef={audio} current={current} />
        </div>
        <label className="volume volume-knob-control">
          <span>VOL</span>
          <span
            className="knob-shell"
            style={{ "--knob-angle": `${-135 + volume * 270}deg` } as React.CSSProperties}
            onWheel={(event) => {
              event.preventDefault();
              const direction = event.deltaY < 0 ? 1 : -1;
              setVolume((currentVolume) =>
                Math.min(1, Math.max(0, Number((currentVolume + direction * 0.05).toFixed(2)))),
              );
            }}
            title="Gira con la rueda del mouse"
          >
            <span className="knob-indicator" />
            <input
              aria-label={`Volumen ${Math.round(volume * 100)}%`}
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
          </span>
          <output>{Math.round(volume * 100)}</output>
        </label>
        <div className="motion-mode" aria-label="Modo de movimiento">
          <button
            className={motion === "full" ? "active" : ""}
            onClick={() => setMotion("full")}
            aria-label="Movimiento completo"
            title="Movimiento completo"
          >
            <WaveSine size={15} weight="bold" />
          </button>
          <button
            className={motion === "reduced" ? "active" : ""}
            onClick={() => setMotion("reduced")}
            aria-label="Movimiento reducido"
            title="Movimiento reducido"
          >
            <Gauge size={15} weight="bold" />
          </button>
          <button
            className={motion === "off" ? "active" : ""}
            onClick={() => setMotion("off")}
            aria-label="Movimiento desactivado"
            title="Movimiento desactivado"
          >
            <Power size={15} weight="bold" />
          </button>
        </div>
        {settingsOpen && (
          <section className="visual-settings" aria-label="Configuración visual">
            <header>
              <strong>Configuración visual</strong>
              <button onClick={() => setSettingsOpen(false)} aria-label="Cerrar configuración">×</button>
            </header>
            <label>
              Tipografía de la aplicación
              <select value={appFont} onChange={(event) => setAppFont(event.target.value as AppFont)}>
                <option value="dm-sans">DM Sans</option>
                <option value="oswald">Oswald</option>
                <option value="mono">Terminal / Mono</option>
                <option value="system">Sistema</option>
              </select>
            </label>
            <label>
              Fuente de nombres y canciones
              <select value={titleFont} onChange={(event) => setTitleFont(event.target.value as AppFont)}>
                <option value="oswald">Oswald</option>
                <option value="dm-sans">DM Sans</option>
                <option value="mono">Terminal / Mono</option>
                <option value="system">Sistema</option>
              </select>
            </label>
            <label>
              Tamaño de nombres <output>{titleFontSize}px</output>
              <input
                className="font-size-control"
                type="range"
                min="12"
                max="32"
                step="1"
                value={titleFontSize}
                onChange={(event) => setTitleFontSize(Number(event.target.value))}
                aria-label="Tamaño de nombres de canciones"
              />
              <strong className="font-preview">BlackMamba · Nombre de canción</strong>
            </label>
            <label>
              Color de LEDs y acentos
              <span className="color-editor">
                <input type="color" value={ledColor} onChange={(event) => setLedColor(event.target.value)} aria-label="Elegir color LED" />
                <code>{ledColor.toUpperCase()}</code>
              </span>
            </label>
            <div className="color-presets" aria-label="Colores rápidos">
              {["#32f5ff", "#a855f7", "#ff3da8", "#ff5a4f", "#55f28c", "#f4f4f5"].map((color) => (
                <button key={color} style={{ backgroundColor: color }} onClick={() => setLedColor(color)} aria-label={`Usar color ${color}`} aria-pressed={ledColor === color} />
              ))}
            </div>
          </section>
        )}
      </div>
      <aside className="page-jump-controls" aria-label="Navegación vertical">
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Ir hasta arriba" title="Ir hasta arriba">
          <span aria-hidden="true">↑</span><small>Arriba</small>
        </button>
        <button type="button" onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" })} aria-label="Ir hasta abajo" title="Ir hasta abajo">
          <span aria-hidden="true">↓</span><small>Abajo</small>
        </button>
      </aside>
    </main>
  );
}
