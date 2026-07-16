import { useEffect, useState, type RefObject, type CSSProperties } from 'react';

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return "0:00";
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
};

export function PlaybackTimeline({
  audioRef,
  current,
}: {
  audioRef: RefObject<HTMLAudioElement | null>;
  current: number;
}) {
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };

    const handleDurationChange = () => {
      setDuration(audio.duration || 0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('durationchange', handleDurationChange);

    // Initial sync
    setTime(audio.currentTime);
    setDuration(audio.duration || 0);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', handleDurationChange);
    };
  }, [audioRef]);

  // Reset timeline when the active song index changes
  useEffect(() => {
    setTime(0);
    setDuration(0);
  }, [current]);

  return (
    <div className="timeline">
      <span>{formatTime(time)}</span>
      <input
        aria-label="Línea de tiempo de la canción"
        type="range"
        min="0"
        max={duration || 0}
        step="0.1"
        value={time}
        style={
          {
            "--progress": `${duration ? (time / duration) * 100 : 0}%`,
          } as CSSProperties
        }
        onChange={(e) => {
          const val = Number(e.target.value);
          if (audioRef.current) {
            audioRef.current.currentTime = val;
          }
          setTime(val);
        }}
      />
      <span>−{formatTime(Math.max(0, duration - time))}</span>
    </div>
  );
}
