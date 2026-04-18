export interface CalibrationBand {
  range: string;
  count: number;
  correct: number;
  actual_accuracy: number;
}

export interface CalibrationEntry {
  confidence: number;
  predictedType: string;
  trueType: string;
}

function getBandRange(confidence: number): string {
  if (confidence >= 0.9) return '0.90-1.00';
  if (confidence >= 0.7) return '0.70-0.89';
  if (confidence >= 0.5) return '0.50-0.69';
  return '0.00-0.49';
}

const BAND_ORDER = ['0.90-1.00', '0.70-0.89', '0.50-0.69', '0.00-0.49'] as const;

/**
 * Group emails by confidence band and compute actual accuracy within each band.
 * "Correct" = predicted ticket_type matches ground truth ticket_type.
 */
export function computeCalibration(entries: CalibrationEntry[]): CalibrationBand[] {
  const counts: Record<string, number> = {};
  const corrects: Record<string, number> = {};

  for (const range of BAND_ORDER) {
    counts[range] = 0;
    corrects[range] = 0;
  }

  for (const entry of entries) {
    const range = getBandRange(entry.confidence);
    counts[range] = (counts[range] ?? 0) + 1;
    if (entry.predictedType === entry.trueType) {
      corrects[range] = (corrects[range] ?? 0) + 1;
    }
  }

  return BAND_ORDER.map((range) => {
    const count = counts[range] ?? 0;
    const correct = corrects[range] ?? 0;
    return {
      range,
      count,
      correct,
      actual_accuracy: count === 0 ? 0 : correct / count,
    };
  });
}
