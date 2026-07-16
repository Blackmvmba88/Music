import { useEffect, useRef, type RefObject } from 'react';

const BAR_COUNT = 36;
// Pre-generate stable random parameters so bars don't change on re-render
const BAR_PHASES = Array.from({ length: BAR_COUNT }, () => Math.random() * Math.PI * 2);
const BAR_SPEEDS = Array.from({ length: BAR_COUNT }, () => 0.025 + Math.random() * 0.04);
const BAR_BASE   = Array.from({ length: BAR_COUNT }, () => 0.1 + Math.random() * 0.2);
const AUDIO_ANALYSERS = new WeakMap<HTMLMediaElement, { context: AudioContext; analyser: AnalyserNode }>();

export function AudioVisualizer({
  active,
  color,
  reduced = false,
  type = 'bar',
  audioRef,
}: {
  active: boolean;
  color: string;
  reduced?: boolean;
  type?: 'bar' | 'sine';
  audioRef?: RefObject<HTMLAudioElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    let rafId = 0;
    let analyser: AnalyserNode | null = null;
    let frequencyData: Uint8Array<ArrayBuffer> | null = null;
    let audioContext: AudioContext | null = null;
    const media = audioRef?.current;
    if (media) {
      try {
        let graph = AUDIO_ANALYSERS.get(media);
        if (!graph) {
          const context = new AudioContext();
          const source = context.createMediaElementSource(media);
          const node = context.createAnalyser();
          node.fftSize = 256;
          node.smoothingTimeConstant = 0.58;
          source.connect(node);
          node.connect(context.destination);
          graph = { context, analyser: node };
          AUDIO_ANALYSERS.set(media, graph);
        }
        analyser = graph.analyser;
        audioContext = graph.context;
        frequencyData = new Uint8Array(analyser.frequencyBinCount);
        if (active && graph.context.state === 'suspended') void graph.context.resume();
      } catch {
        analyser = null;
      }
    }
    const resumeAudioGraph = () => {
      if (audioContext?.state === 'suspended') void audioContext.resume();
    };
    window.addEventListener('pointerdown', resumeAudioGraph, { passive: true });
    window.addEventListener('keydown', resumeAudioGraph);

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      if (!w || !h) { rafId = requestAnimationFrame(draw); return; }

      const cw = Math.round(w * dpr);
      const ch = Math.round(h * dpr);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (type === 'sine') {
        // --- Segmented vertical channel meter (no lateral snake motion) ---
        ctx.fillStyle = '#020402';
        ctx.fillRect(0, 0, w, h);
        const channelWidth = 13;
        const cellY = 6;
        const rows = Math.max(1, Math.floor((h - 6) / cellY));
        const columns = Math.max(1, Math.floor((w - 6) / channelWidth));
        const speed = frame * (reduced ? 0.055 : 0.16);
        if (active && analyser && frequencyData) analyser.getByteFrequencyData(frequencyData);

        for (let column = 0; column < columns; column++) {
          const x = 6 + column * channelWidth;
          const phase = column * 1.17;
          const fastPulse = Math.abs(Math.sin(speed + phase));
          const transient = Math.pow(Math.abs(Math.sin(speed * 1.83 + phase * 2.31)), 3);
          const pulse = fastPulse * 0.58 + transient * 0.42;
          const bin = frequencyData
            ? Math.min(frequencyData.length - 1, Math.floor((column / columns) * frequencyData.length * 0.72))
            : 0;
          const audioEnergy = frequencyData ? frequencyData[bin] / 255 : 0;
          const reactiveLevel = Math.min(1, Math.pow(audioEnergy, 0.68) * 1.24);
          const level = active
            ? analyser && frequencyData
              ? 0.035 + reactiveLevel * 0.95
              : 0.08 + pulse * 0.9
            : 0.045;
          const litRows = Math.max(1, Math.round(level * rows));

          for (let row = 0; row < rows; row++) {
            const y = h - 4 - row * cellY;
            const on = row < litRows;
            const peak = active && row === litRows;
            ctx.beginPath();
            ctx.roundRect(x, y - 2, 7, 3.2, 1.2);
            ctx.fillStyle = color;
            ctx.globalAlpha = on ? (0.44 + (row / rows) * 0.54) : peak ? 0.28 : 0.045;
            ctx.shadowColor = color;
            ctx.shadowBlur = on && active ? 3.5 : 0;
            ctx.fill();
          }
        }
        ctx.shadowBlur = 0;
      } else {
        // --- Spotify Spectrum Bar Mode ---
        const gap  = 2;
        const barW = Math.max(2, (w - (BAR_COUNT - 1) * gap) / BAR_COUNT);

        for (let i = 0; i < BAR_COUNT; i++) {
          const t    = frame * BAR_SPEEDS[i] + BAR_PHASES[i];
          const wave = Math.abs(Math.sin(t)) *
            (0.48 + Math.sin(frame * 0.008 + i * 0.28) * 0.26);
          const energy = active
            ? Math.max(0.07, BAR_BASE[i] + wave * 0.7)
            : Math.max(0.04, BAR_BASE[i] * 0.2 + Math.sin(t * 0.25) * 0.03);

          const barH = Math.max(2, energy * h);
          const x    = i * (barW + gap);
          const y    = h - barH;

          // Gradient: accent color at top → transparent at bottom
          const grad = ctx.createLinearGradient(x, y, x, h);
          grad.addColorStop(0,   color);
          grad.addColorStop(0.6, `${color}88`);
          grad.addColorStop(1,   `${color}18`);

          ctx.globalAlpha = active ? 0.88 : 0.24;
          ctx.fillStyle   = grad;
          ctx.beginPath();
          ctx.rect(x, y, barW, barH);
          ctx.fill();

          // White peak dot on tall bars (every other bar, not in reduced mode)
          if (active && !reduced && energy > 0.5 && i % 2 === 0) {
            ctx.globalAlpha = Math.min(0.92, (energy - 0.5) * 2.6);
            ctx.fillStyle   = '#ffffff';
            ctx.beginPath();
            ctx.arc(x + barW / 2, y + 1.2, 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      frame += reduced ? 0.6 : 1;
      if (!document.hidden) rafId = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('pointerdown', resumeAudioGraph);
      window.removeEventListener('keydown', resumeAudioGraph);
    };
  }, [active, audioRef, color, reduced, type]);

  return (
    <canvas
      className={`audio-visualizer type-${type}`}
      ref={canvasRef}
      aria-label="Visualizador de espectro de audio"
      aria-hidden="true"
    />
  );
}
