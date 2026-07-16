import { useEffect, useRef, useMemo } from 'react';

const COLOR_MAP: Record<string, { base: string; beat: string }> = {
  orange: { base: '#ff8800', beat: '#ff0000' },
  purple: { base: '#8a2be2', beat: '#00ff00' },
  blue:   { base: '#0088ff', beat: '#ffffff' },
};

export function AudioVisualizer({
  active,
  color,
  reduced = false,
  type = 'bar',
  analyser,
  barCount = 36,
}: {
  active: boolean;
  color: string;
  reduced?: boolean;
  type?: 'bar' | 'sine';
  analyser?: AnalyserNode;
  barCount?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { BAR_PHASES, BAR_SPEEDS, BAR_BASE } = useMemo(() => {
    return {
      BAR_PHASES: Array.from({ length: barCount }, () => Math.random() * Math.PI * 2),
      BAR_SPEEDS: Array.from({ length: barCount }, () => 0.025 + Math.random() * 0.04),
      BAR_BASE:   Array.from({ length: barCount }, () => 0.1 + Math.random() * 0.2),
    };
  }, [barCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    let rafId = 0;

    const freqData = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const timeData = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    let currentColor = color;
    let lastBeatTime = 0;
    let isBeatActive = false;
    // Historial básico para detectar picos
    let bassEnergyHistory: number[] = [];

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

      // Obtener colores basados en el mapa o fallback
      const mapping = COLOR_MAP[color] || { base: color, beat: '#ffffff' };

      // Beat detection logic
      if (analyser && active && freqData) {
        analyser.getByteFrequencyData(freqData);
        
        let bassSum = 0;
        const BASS_BINS = 10;
        for (let i = 0; i < BASS_BINS; i++) {
          bassSum += freqData[i];
        }
        const currentBass = bassSum / BASS_BINS;
        
        bassEnergyHistory.push(currentBass);
        if (bassEnergyHistory.length > 30) bassEnergyHistory.shift();

        const avgBass = bassEnergyHistory.reduce((a, b) => a + b, 0) / bassEnergyHistory.length;
        
        // Si hay un pico abrupto que supera el promedio en un 30% y es fuerte
        if (currentBass > avgBass * 1.3 && currentBass > 180 && performance.now() - lastBeatTime > 350) {
          lastBeatTime = performance.now();
        }
      }

      // Calcular la atenuación (fade) del beat. De 1 (beat recién ocurrido) a 0 (desvanecido)
      const timeSinceBeat = performance.now() - lastBeatTime;
      // Fades out over 800ms
      const beatIntensity = Math.max(0, 1 - timeSinceBeat / 800);

      // Utility to interpolate HEX colors (simple lerp)
      const lerpColor = (baseHex: string, beatHex: string, amount: number) => {
        const ah = parseInt(baseHex.replace('#', ''), 16),
              ar = ah >> 16, ag = (ah >> 8) & 0xff, ab = ah & 0xff,
              bh = parseInt(beatHex.replace('#', ''), 16),
              br = bh >> 16, bg = (bh >> 8) & 0xff, bb = bh & 0xff,
              rr = ar + amount * (br - ar),
              rg = ag + amount * (bg - ag),
              rb = ab + amount * (bb - ab);
        return '#' + (1 << 24 | rr << 16 | rg << 8 | rb).toString(16).slice(1);
      };
      
      currentColor = lerpColor(mapping.base, mapping.beat, beatIntensity);

      if (type === 'sine') {
        // --- Winamp Sinusoidal Mode ---
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = 2.2;
        ctx.shadowBlur = active ? 6 : 0;
        ctx.shadowColor = currentColor;
        ctx.globalAlpha = active ? 0.95 : 0.25;

        ctx.beginPath();
        const midY = h / 2;
        
        if (analyser && active && timeData) {
          analyser.getByteTimeDomainData(timeData);
          const sliceWidth = w / timeData.length;
          let x = 0;
          for (let i = 0; i < timeData.length; i++) {
            const v = timeData[i] / 128.0;
            const y = midY + (v - 1) * (h * 0.45);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            x += sliceWidth;
          }
        } else {
          const amplitude = active ? h * 0.45 : 3;
          for (let x = 0; x < w; x++) {
            const t = x * 0.05 - frame * 0.12;
            const y = midY + Math.sin(t) * Math.cos(x * 0.01 + frame * 0.02) * amplitude;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset
      } else {
        // --- Spotify Spectrum Bar Mode ---
        const gap  = 2;
        const barW = Math.max(2, (w - (barCount - 1) * gap) / barCount);

        for (let i = 0; i < barCount; i++) {
          let energy = 0.04;
          
          if (analyser && active && freqData) {
            // Mapeamos 36 barras a las frecuencias audibles reales
            const binIndex = Math.floor(i * 1.5);
            const data = freqData[binIndex] / 255;
            energy = Math.max(0.04, data * 0.95);
          } else {
            const t    = frame * BAR_SPEEDS[i] + BAR_PHASES[i];
            const wave = Math.abs(Math.sin(t)) * (0.48 + Math.sin(frame * 0.008 + i * 0.28) * 0.26);
            energy = active
              ? Math.max(0.07, BAR_BASE[i] + wave * 0.7)
              : Math.max(0.04, BAR_BASE[i] * 0.2 + Math.sin(t * 0.25) * 0.03);
          }

          const barH = Math.max(2, energy * h);
          const x    = i * (barW + gap);
          const y    = h - barH;

          // Gradient: accent color at top → transparent at bottom
          const grad = ctx.createLinearGradient(x, y, x, h);
          grad.addColorStop(0,   currentColor);
          grad.addColorStop(0.6, `${currentColor}88`);
          grad.addColorStop(1,   `${currentColor}18`);

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

      frame += reduced ? 0.35 : 1;
      if (!document.hidden) rafId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(rafId);
  }, [active, color, reduced, type, analyser]);

  return (
    <canvas
      className={`audio-visualizer type-${type}`}
      ref={canvasRef}
      aria-label="Visualizador de espectro de audio"
      aria-hidden="true"
    />
  );
}
