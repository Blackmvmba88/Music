// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NowPlayingTicker } from "../app/NowPlayingTicker";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("updates from desktop playback, prioritizes Music Engine, and clears on pause", async () => {
  vi.useFakeTimers();
  const readSpotifyPlayback = vi.fn()
    .mockResolvedValueOnce({ title: "Dame tu Amor", playing: true })
    .mockResolvedValueOnce({ title: "Jayline", playing: true })
    .mockResolvedValueOnce({ title: "Jayline", playing: false });
  vi.stubGlobal("blackMambaDesktop", { readSpotifyPlayback });

  const { rerender } = render(<NowPlayingTicker enginePlatform="Music Engine" />);
  await act(async () => {});
  expect(screen.getByRole("status").textContent).toBe("Dame tu Amor · Spotify");

  rerender(<NowPlayingTicker engineTitle="Honey" engineArtist="Iyari Gomez" enginePlatform="SoundCloud" />);
  expect(screen.getByRole("status").textContent).toBe("Honey · Iyari Gomez · SoundCloud");

  rerender(<NowPlayingTicker enginePlatform="Music Engine" />);
  await act(() => vi.advanceTimersByTimeAsync(4000).then(() => undefined));
  expect(screen.getByRole("status").textContent).toBe("Jayline · Spotify");
  await act(() => vi.advanceTimersByTimeAsync(4000).then(() => undefined));
  expect(screen.getByRole("status").textContent).toBe("Esperando reproducción");
});
