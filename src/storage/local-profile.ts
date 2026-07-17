export interface SessionRecord {
  id: string;
  levelId: string;
  levelTitle: string;
  score: number;
  accuracy: number;
  completedAt: string;
  taskScores: number[];
}
export interface LocalProfile {
  email: string;
  displayName: string;
  roles: ["creator", "player"];
  sessions: SessionRecord[];
  ratings: Record<string, number>;
}
function parseRatings(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value).filter(
    ([trackId, rating]) =>
      trackId.length > 0 &&
      Number.isInteger(rating) &&
      Number(rating) >= 1 &&
      Number(rating) <= 5,
  );
  return Object.fromEntries(entries);
}
const KEY = "pulso.profile.v1";
const DEFAULT: LocalProfile = {
  email: "neocyber1@gmail.com",
  displayName: "NeoCyber",
  roles: ["creator", "player"],
  sessions: [],
  ratings: {},
};
export function loadProfile(): LocalProfile {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(KEY) || "null",
    ) as Partial<LocalProfile> | null;
    let ratings = parseRatings(parsed?.ratings);
    if (Object.keys(ratings).length === 0) {
      const oldRatings = localStorage.getItem("blackmamba-vitrine-ratings");
      if (oldRatings) {
        try {
          ratings = parseRatings(JSON.parse(oldRatings));
        } catch {
          // ignore invalid JSON
        }
      }
    }
    return parsed && Array.isArray(parsed.sessions)
      ? {
          ...DEFAULT,
          ...parsed,
          roles: ["creator", "player"],
          sessions: parsed.sessions,
          ratings,
        }
      : { ...DEFAULT, ratings };
  } catch {
    return DEFAULT;
  }
}
export function saveSession(session: SessionRecord) {
  const profile = loadProfile();
  if (profile.sessions.some((item) => item.id === session.id)) return profile;
  const next = {
    ...profile,
    sessions: [session, ...profile.sessions].slice(0, 100),
  };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
export function saveRatings(ratings: Record<string, number>) {
  const profile = loadProfile();
  const next = { ...profile, ratings };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
