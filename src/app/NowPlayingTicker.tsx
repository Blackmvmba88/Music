import { useEffect, useState } from "react";
import "./now-playing-ticker.css";

type Props = {
  engineTitle?: string;
  engineArtist?: string;
  enginePlatform: "SoundCloud" | "Music Engine";
};

export function NowPlayingTicker({ engineTitle, engineArtist, enginePlatform }: Props) {
  const [spotifyTitle, setSpotifyTitle] = useState<string | null>(null);

  useEffect(() => {
    const read = window.blackMambaDesktop?.readSpotifyPlayback;
    if (!read) return;
    let stopped = false;
    let timer: number;
    async function poll() {
      const result = await read?.().catch(() => null);
      if (stopped) return;
      setSpotifyTitle(result?.playing ? result.title : null);
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
    : spotifyTitle;
  const platform = engineTitle ? enginePlatform : "Spotify";
  const message = title ? `${title} · ${platform}` : "Esperando reproducción";

  return (
    <div className="now-playing-ticker">
      <span className="now-playing-ticker__label">En reproducción</span>
      <div className="now-playing-ticker__viewport" role="status" aria-atomic="true" title={message}>
        <span key={message} className={title ? "now-playing-ticker__scroll" : undefined}>
          {message}
        </span>
      </div>
    </div>
  );
}
