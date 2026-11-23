import type { TapEvaluation } from '../domain/result';

/**
 * Distinguishes consistent expressive placement from unstable timing.
 * This is a diagnostic, not proof of artistic intent: the reference track,
 * latency calibration and repeated takes are needed to infer intent.
 */
export interface GrooveAnalysis {
  classification: 'on-beat' | 'consistent-offset' | 'unstable' | 'insufficient-data';
  matchedCount: number;
  medianOffsetMs: number | null;
  medianAbsoluteDeviationMs: number | null;
  meanAbsoluteResidualMs: number | null;
  confidence: number;
  evidence: string[];
  warnings: string[];
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * Uses only paired note attacks and resists outliers via median/MAD.
 * A stable signed offset is tagged consistent-offset, never automatically
 * rewarded or removed from the existing scoring system.
 */
export function analyzeGroove(
  evaluations: TapEvaluation[],
  options: { onBeatToleranceMs?: number; stabilityToleranceMs?: number; minimumMatches?: number } = {},
): GrooveAnalysis {
  const { onBeatToleranceMs = 35, stabilityToleranceMs = 25, minimumMatches = 4 } = options;
  if (![onBeatToleranceMs, stabilityToleranceMs, minimumMatches].every(Number.isFinite)
    || onBeatToleranceMs < 0 || stabilityToleranceMs < 0
    || !Number.isInteger(minimumMatches) || minimumMatches < 2) {
    throw new Error('Configuración de groove inválida');
  }

  const errors = evaluations
    .map(({ errorMs }) => errorMs)
    .filter((error): error is number => error !== undefined && Number.isFinite(error));
  const matchedCount = errors.length;
  const confidence = evaluations.length ? matchedCount / evaluations.length : 0;
  if (matchedCount < minimumMatches) {
    return {
      classification: 'insufficient-data',
      matchedCount,
      medianOffsetMs: null,
      medianAbsoluteDeviationMs: null,
      meanAbsoluteResidualMs: null,
      confidence,
      evidence: [`${matchedCount} ataques emparejados de ${evaluations.length}`],
      warnings: ['No hay suficientes ataques para determinar estabilidad temporal'],
    };
  }

  const offset = median(errors);
  const residuals = errors.map(error => Math.abs(error - offset));
  const mad = median(residuals);
  const meanAbsoluteResidualMs = residuals.reduce((sum, error) => sum + error, 0) / matchedCount;
  const stable = mad <= stabilityToleranceMs;
  const classification: GrooveAnalysis['classification'] = !stable
    ? 'unstable'
    : Math.abs(offset) <= onBeatToleranceMs
      ? 'on-beat'
      : 'consistent-offset';
  const evidence = [
    `${matchedCount} ataques emparejados de ${evaluations.length}`,
    `Desplazamiento mediano: ${offset.toFixed(1)} ms`,
    `Dispersión MAD: ${mad.toFixed(1)} ms`,
    `Residuo absoluto medio: ${meanAbsoluteResidualMs.toFixed(1)} ms`,
  ];
  const warnings = classification === 'consistent-offset'
    ? ['Desplazamiento consistente: podría ser expresivo, latencia o referencia desalineada; no se asume intención']
    : classification === 'unstable'
      ? ['Ataques temporalmente dispersos respecto a su desplazamiento mediano']
      : [];
  return { classification, matchedCount, medianOffsetMs: offset, medianAbsoluteDeviationMs: mad,
    meanAbsoluteResidualMs, confidence, evidence, warnings };
}
