import { useEffect, useState } from "react";
import { loadTrackDetails } from "../api/catalog";
import { SyncLyricsViewer } from "./SyncLyricsViewer";

type Props = {
  trackId?: string;
  lyrics?: string;
  localTime?: number;
  theme: { accent: string; glow: string };
};

export function TickerLyrics({ trackId, lyrics, localTime, theme }: Props) {
  const [fetched, setFetched] = useState<string>();
  const [loading, setLoading] = useState(Boolean(trackId && lyrics === undefined));

  useEffect(() => {
    if (!trackId || lyrics !== undefined) return;
    const controller = new AbortController();
    void loadTrackDetails<{ lyrics?: string }>(trackId, controller.signal)
      .then((details) => {
        if (!controller.signal.aborted) setFetched(details.lyrics);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [trackId, lyrics]);

  if (loading && lyrics === undefined) return <p role="status">Cargando letra…</p>;
  const text = lyrics ?? fetched;
  return trackId
    ? <SyncLyricsViewer trackId={trackId} currentTime={localTime ?? -1} theme={theme} fallbackLyrics={text} />
    : <p>{text?.trim() || "No hay letra en el catálogo para esta pista."}</p>;
}
