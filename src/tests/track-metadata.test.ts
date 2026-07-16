import { describe, expect, it } from "vitest";
import { mergeTrackMetadata } from "../storage/track-metadata";

describe("track metadata precedence", () => {
  it("keeps canonical USB lyrics over stale empty local metadata", () => {
    expect(mergeTrackMetadata({ lyrics: "Letra USB", hasLyrics: true }, { lyrics: "", hasLyrics: false }))
      .toMatchObject({ lyrics: "Letra USB", hasLyrics: true });
  });

  it("uses local lyrics only when the canonical catalog has none", () => {
    expect(mergeTrackMetadata({ lyrics: "", hasLyrics: false }, { lyrics: "Borrador local", hasLyrics: true }))
      .toMatchObject({ lyrics: "Borrador local", hasLyrics: true });
  });

  it("retains unrelated local edits", () => {
    expect(mergeTrackMetadata({ lyrics: "USB", title: "Original" }, { title: "Editado" }))
      .toMatchObject({ lyrics: "USB", title: "Editado", hasLyrics: true });
  });
});
