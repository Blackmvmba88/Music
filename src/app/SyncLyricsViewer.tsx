import { useEffect, useState, useRef, useMemo } from "react";

type LyricSegment = {
  start: number;
  end: number;
  text: string;
};

const parseVTT = (vttText: string): LyricSegment[] => {
  const lines = vttText.split(/\r?\n/);
  const segments: LyricSegment[] = [];
  let currentStart = -1;
  let currentEnd = -1;
  let textLines: string[] = [];

  const timeRegex = /(?:(\d{2,3}):)?(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(?:(\d{2,3}):)?(\d{2}):(\d{2})\.(\d{3})/;

  for (const line of lines) {
    if (line.trim() === "WEBVTT" || line.trim() === "") {
      if (textLines.length > 0 && currentStart !== -1) {
        segments.push({ start: currentStart, end: currentEnd, text: textLines.join("\n") });
        textLines = [];
        currentStart = -1;
        currentEnd = -1;
      }
      continue;
    }

    const match = line.match(timeRegex);
    if (match) {
      if (textLines.length > 0 && currentStart !== -1) {
        segments.push({ start: currentStart, end: currentEnd, text: textLines.join("\n") });
        textLines = [];
      }
      const sh = parseInt(match[1] || "0", 10);
      const sm = parseInt(match[2], 10);
      const ss = parseInt(match[3], 10);
      const sms = parseInt(match[4], 10);
      currentStart = sh * 3600 + sm * 60 + ss + sms / 1000;

      const eh = parseInt(match[5] || "0", 10);
      const em = parseInt(match[6], 10);
      const es = parseInt(match[7], 10);
      const ems = parseInt(match[8], 10);
      currentEnd = eh * 3600 + em * 60 + es + ems / 1000;
    } else {
      if (currentStart !== -1) {
        textLines.push(line);
      }
    }
  }
  
  if (textLines.length > 0 && currentStart !== -1) {
    segments.push({ start: currentStart, end: currentEnd, text: textLines.join("\n") });
  }
  
  return segments;
};

interface SyncLyricsViewerProps {
  trackId: string;
  currentTime: number;
  theme: { accent: string; glow: string };
  fallbackLyrics?: string;
}

export function SyncLyricsViewer({ trackId, currentTime, theme, fallbackLyrics }: SyncLyricsViewerProps) {
  const [segments, setSegments] = useState<LyricSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    
    // Fetch the VTT file for this track
    fetch(`/lyrics/${trackId}.vtt`)
      .then(res => {
        if (!res.ok) throw new Error("No VTT found");
        return res.text();
      })
      .then(text => {
        if (!active) return;
        setSegments(parseVTT(text));
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setSegments([]);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [trackId]);

  // Find active segment
  const activeIndex = useMemo(() => {
    if (segments.length === 0) return -1;
    // Highlight the segment if we are currently within its time range, 
    // or if we are past it but haven't reached the next one yet.
    for (let i = segments.length - 1; i >= 0; i--) {
      if (currentTime >= segments[i].start) {
        // If we are way past the end, maybe clear it?
        // Usually karaoke leaves the last line highlighted until the next, or clears if silence is long.
        // Let's clear if we are 2 seconds past the end.
        if (currentTime > segments[i].end + 2) return -1;
        return i;
      }
    }
    return -1;
  }, [segments, currentTime]);

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
    if (fallbackLyrics) {
      return (
        <div className="sync-lyrics-fallback">
          {fallbackLyrics.split('\n').map((line, i) => (
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
