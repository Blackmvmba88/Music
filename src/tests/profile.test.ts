import { beforeEach, describe, expect, it } from "vitest";
import { loadProfile, saveSession, saveRatings } from "../storage/local-profile";
const session = {
  id: "session-1",
  levelId: "core",
  levelTitle: "Blancas, negras y corcheas",
  score: 4373,
  accuracy: 84,
  completedAt: "2026-07-12T21:00:00.000Z",
  taskScores: [430, 440],
};
describe("local profile", () => {
  beforeEach(() => localStorage.clear());
  it("starts with the configured creator/player identity", () => {
    const profile = loadProfile();
    expect(profile.email).toBe("neocyber1@gmail.com");
    expect(profile.roles).toEqual(["creator", "player"]);
    expect(profile.sessions).toEqual([]);
    expect(profile.ratings).toEqual({});
  });
  it("stores a session once", () => {
    saveSession(session);
    saveSession(session);
    expect(loadProfile().sessions).toEqual([session]);
  });
  it("stores and loads ratings", () => {
    const ratings = { "track-1": 5, "track-2": 3 };
    saveRatings(ratings);
    expect(loadProfile().ratings).toEqual(ratings);
  });
  it("keeps only integer ratings from 1 to 5", () => {
    localStorage.setItem(
      "pulso.profile.v1",
      JSON.stringify({ ratings: { ok: 5, low: 0, high: 6, float: 4.5, nan: Number.NaN } }),
    );
    expect(loadProfile().ratings).toEqual({ ok: 5 });
  });
  it("filters legacy ratings during migration", () => {
    localStorage.setItem(
      "blackmamba-vitrine-ratings",
      JSON.stringify({ oldOk: 4, oldBad: -1, oldFloat: 3.2 }),
    );
    expect(loadProfile().ratings).toEqual({ oldOk: 4 });
  });
  it("recovers from corrupt data", () => {
    localStorage.setItem("pulso.profile.v1", "{");
    expect(loadProfile().sessions).toEqual([]);
    expect(loadProfile().ratings).toEqual({});
  });
});
