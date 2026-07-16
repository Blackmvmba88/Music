/* global console */
const DEFAULT = { email: "a", displayName: "b", roles: ["creator", "player"], sessions: [], ratings: {} };
const KEY = "pulso.profile.v1";

const localStorage = {
  data: {},
  getItem(k) { return this.data[k] || null; },
  setItem(k, v) { this.data[k] = v; }
};

function loadProfile() {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(KEY) || "null",
    );
    let ratings = parsed?.ratings || {};
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

function saveRatings(ratings) {
  const profile = loadProfile();
  const next = { ...profile, ratings };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

saveRatings({ "test": 5 });
console.log(localStorage.getItem(KEY));
console.log(loadProfile());
