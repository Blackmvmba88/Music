import { describe, expect, it } from "vitest";
// @ts-expect-error La política se comparte con scripts Node ESM sin archivo de declaración.
import { partitionOneToOneMatches } from "../../scripts/soundcloud-match-policy.mjs";

describe("SoundCloud one-to-one match policy", () => {
  it("blocks every duplicate when no canonical SoundCloud ID exists", () => {
    const records = [
      { localTrackId: "local-1", soundcloudId: "remote-a", identity: "exact_title", confidence: 0.98, warnings: [] },
      { localTrackId: "local-1", soundcloudId: "remote-b", identity: "exact_title", confidence: 0.98, warnings: [] },
    ];
    const result = partitionOneToOneMatches(records);
    expect(result.matches).toHaveLength(0);
    expect(result.blocked).toHaveLength(2);
    expect(result.blocked.every((item: { autoApplyBlocked: string; confidence: number }) => item.autoApplyBlocked === "multiple_soundcloud_posts" && item.confidence === 0.79)).toBe(true);
  });

  it("preserves one existing canonical ID and blocks the alternatives", () => {
    const canonical = { localTrackId: "local-1", soundcloudId: "remote-a", identity: "soundcloud_id", confidence: 0.995 };
    const alternative = { localTrackId: "local-1", soundcloudId: "remote-b", identity: "exact_title", confidence: 0.98 };
    const result = partitionOneToOneMatches([canonical, alternative]);
    expect(result.matches).toEqual([canonical]);
    expect(result.blocked.map((item: { soundcloudId: string }) => item.soundcloudId)).toEqual(["remote-b"]);
  });
});
