import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  collection: vi.fn((...parts: unknown[]) => parts),
  doc: vi.fn((...parts: unknown[]) => parts),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock("firebase/firestore", () => firestore);
vi.mock("../auth/firebase", () => ({ db: { name: "test-db" } }));

import {
  fetchUserRatings,
  fetchUserReviews,
  saveUserRating,
  saveUserReview,
  syncLocalDataToFirestore,
} from "../storage/sync";

const snapshot = (records: Array<{ id: string; data: Record<string, unknown> }>) => ({
  forEach(callback: (entry: { id: string; data: () => Record<string, unknown> }) => void) {
    records.forEach((record) => callback({ id: record.id, data: () => record.data }));
  },
});

describe("private Firebase sync", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads only valid ratings and reviews", async () => {
    firestore.getDocs
      .mockResolvedValueOnce(
        snapshot([
          { id: "song-1", data: { rating: 5 } },
          { id: "bad-type", data: { rating: "5" } },
          { id: "bad-low", data: { rating: 0 } },
          { id: "bad-high", data: { rating: 6 } },
          { id: "bad-float", data: { rating: 4.5 } },
          { id: "bad-nan", data: { rating: Number.NaN } },
        ]),
      )
      .mockResolvedValueOnce(snapshot([{ id: "song-1", data: { status: "belongs" } }, { id: "bad", data: { status: 4 } }]))
    expect(await fetchUserRatings("user-1")).toEqual({ "song-1": 5 });
    expect(await fetchUserReviews("user-1")).toEqual({ "song-1": "belongs" });
    expect(firestore.collection).toHaveBeenCalledWith(expect.anything(), "users", "user-1", "ratings");
  });

  it("returns safe empty data when Firestore is unavailable", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    firestore.getDocs.mockRejectedValue(new Error("offline"));
    expect(await fetchUserRatings("user-1")).toEqual({});
    expect(await fetchUserReviews("user-1")).toEqual({});
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });

  it("saves individual ratings and reviews", async () => {
    firestore.setDoc.mockResolvedValue(undefined);
    await saveUserRating("user-1", "song-1", 4);
    await saveUserReview("user-1", "song-1", "later");
    expect(firestore.setDoc).toHaveBeenCalledTimes(2);
    expect(firestore.setDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ rating: 4, updatedAt: expect.any(String) }));
    expect(firestore.setDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "later", updatedAt: expect.any(String) }));

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await saveUserRating("user-1", "song-invalid", 4.5);
    await saveUserRating("user-1", "song-invalid", 0);
    expect(firestore.setDoc).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });

  it("synchronizes every local decision and tolerates write failures", async () => {
    firestore.setDoc.mockResolvedValue(undefined);
    await syncLocalDataToFirestore("user-1", { one: 5, two: 3 }, { one: "belongs" });
    expect(firestore.setDoc).toHaveBeenCalledTimes(3);

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    firestore.setDoc.mockRejectedValue(new Error("offline"));
    await expect(saveUserRating("user-1", "one", 5)).resolves.toBeUndefined();
    await expect(saveUserReview("user-1", "one", "later")).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
