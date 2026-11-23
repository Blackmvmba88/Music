import { useEffect, useState, useRef, useMemo } from "react";
import type { Recording, ResolveResult } from "../lyrics/resolver";
import { parseVTT, activeCueIndex } from "../lyrics/vtt";
import type { LyricSegment } from "../lyrics/vtt";

interface SyncLyricsViewerProps {
  trackId: string;
  currentTime: number;
  theme: { accent: string; glow: string };
  fallbackLyrics?: string;
  /** Optional authorized-provider resolution when a local VTT is missing. */
  recording?: Recording;
  lyricsResolver?: { resolve(recording: Recording): Promise<ResolveResult> };
}

export function SyncLyricsViewer({ trackId, currentTime, theme, fallbackLyrics, recording, lyricsResolver }: SyncLyricsViewerProps) {
  const [segments, setSegments] = useState<LyricSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerLyrics, setProviderLyrics] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setSegments([]);
    setProviderLyrics("");

    async function loadLyrics() {
      let timed: LyricSegment[] = [];
      let plain = "";
      try {
        // Prefer the existing local synchronized asset; external adapters are optional.
        const response = await fetch(`/lyrics/${encodeURIComponent(trackId)}.vtt`);
        if (response.ok) timed = parseVTT(await response.text());
      } catch {
        // Missing VTT is non-fatal; providers can still supply verified lyrics.
      }
      if (timed.length === 0 && recording && lyricsResolver) {
        try {
          const result = await lyricsResolver.resolve(recording);
          if (result.status === "found") {
            const lines = result.candidate.timedLines ?? [];
            timed = lines.filter(line =>
              Number.isFinite(line.start) && Number.isFinite(line.end) &&
              line.start >= 0 && line.end > line.start && Boolean(line.text.trim())
            );
            plain = result.candidate.text;
          }
        } catch {
          // A provider failure must never interrupt player rendering.
        }
      }
      if (!active) return;
      setSegments(timed);
      setProviderLyrics(plain);
      setLoading(false);
    }
    void loadLyrics();
    return () => { active = false; };
  }, [trackId, recording, lyricsResolver]);

  // Find active segment
  const activeIndex = useMemo(() => activeCueIndex(segments, currentTime), [segments, currentTime]);

  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      activeRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeIndex]);

  if (loading) {
    return <div className="sync-lyrics-loading">Cargando letras sincronizadas...</div>;
  }

  if (segments.length === 0) {
    const lyricsText = fallbackLyrics?.trim() || providerLyrics.trim();
    if (lyricsText) {
      return (
        <div className="sync-lyrics-fallback">
          {lyricsText.split('\\n').map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      );
    }
    return <div className="sync-lyrics-empty">No hay letras sincronizadas (VTT) disponibles para esta canción. Utiliza "npm run library:lyrics" para generarlas.</div>;
  }

  return (
    <div 
      className="sync-lyrics-container" 
      ref={containerRef}
      style={{ '--lyric-accent': theme.accent, '--lyric-glow': theme.glow } as React.CSSProperties}
    >
      {segments.map((seg, index) => {
        const isActive = index === activeIndex;
        return (
          <div
            key={index}
            ref={isActive ? activeRef : null}
            className={`sync-lyric-line ${isActive ? 'active' : ''}`}
          >
            {seg.text}
          </div>
        );
      })}
    </div>
  );
}
