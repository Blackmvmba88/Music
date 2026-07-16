import { describe, expect, it } from "vitest";
import { extractTextKeywords, keywordMatch, sanitizeKeywords } from "../storage/keyword-metadata";

describe("keyword metadata", () => {
  it("extracts repeated meaningful words from lyrics", () => {
    expect(extractTextKeywords("Noche fuego, noche ciudad. Fuego lento y ciudad", 3)).toEqual(["ciudad", "fuego", "noche"]);
  });
  it("normalizes accents and removes duplicates", () => {
    expect(sanitizeKeywords("eléctrica, Electrica, corazón")).toEqual(["electrica", "corazon"]);
  });
  it("ranks image metadata by shared lyric concepts", () => {
    expect(keywordMatch(["noche", "ciudad", "fuego"], ["portrait", "fire", "night"]).matches).toEqual(["night", "fire"]);
  });
});
