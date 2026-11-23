import { useEffect, useId, useState, type ReactNode } from "react";
import "./now-playing-ticker.css";

export type SpotifyNowPlaying = {
  title: string;
  playing: boolean;
  trackId?: string;
  isrc?: string;
  artist?: string;
};

type Props = {
  engineTitle?: string;
  engineArtist?: string;
  enginePlatform: "SoundCloud" | "Music Engine";
  renderLyrics?: (spotify: SpotifyNowPlaying | null) => ReactNode;
};

export function NowPlayingTicker({ engineTitle, engineArtist, enginePlatform, renderLyrics }: Props) {
  const [spotify, setSpotify] = useState<SpotifyNowPlaying | null>(null);
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  useEffect(() => {
    const read = window.blackMambaDesktop?.readSpotifyPlayback;
    if (!read) return;
    let stopped = false;
    let timer: number;
    async function poll() {
      const result = await read?.().catch(() => null);
      if (stopped) return;
      setSpotify(result?.playing ? result : null);
      timer = window.setTimeout(poll, 4000);
    }
    void poll();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, []);

  const title = engineTitle
    ? [engineTitle, engineArtist].filter(Boolean).join(" · ")
    : spotify ? [spotify.title, spotify.artist].filter(Boolean).join(" · ") : null;
  const platform = engineTitle ? enginePlatform : "Spotify";
  const message = title ? `${title} · ${platform}` : "Esperando reproducción";
  const canExpand = Boolean(title && renderLyrics);
  const showLyrics = canExpand && expanded;
  const contents = (
    <>
      <span className="now-playing-ticker__label">En reproducción</span>
      <span className="now-playing-ticker__viewport" role="status" aria-atomic="true" title={message}>
        <span key={message} className={title ? "now-playing-ticker__scroll" : undefined}>{message}</span>
      </span>
    </>
  );

  return (
    <>
      {canExpand ? (
        <button type="button" className="now-playing-ticker now-playing-ticker--button"
          aria-expanded={showLyrics} aria-controls={showLyrics ? panelId : undefined}
          onClick={() => setExpanded((open) => !open)}>
          {contents}
          <span className="now-playing-ticker__action">{showLyrics ? "Ocultar letra" : "Ver letra"}</span>
        </button>
      ) : <div className="now-playing-ticker">{contents}</div>}
      {showLyrics && (
        <section id={panelId} className="now-playing-ticker__lyrics" aria-label={`Letra de ${title}`}>
          {renderLyrics?.(engineTitle ? null : spotify)}
        </section>
      )}
    </>
  );
}
