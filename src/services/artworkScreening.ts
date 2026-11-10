export type ScreeningScore = {
  score: number;
  status: string;
  provider?: string;
  provider_name?: string;
  provider_label?: string;
  label_confidence?: number;
};

export function screeningScoreLabel(result: ScreeningScore): string {
  if (result.provider === 'truthscan' && result.provider_label && typeof result.label_confidence === 'number') {
    return `${result.provider_label} · ${(result.label_confidence * 100).toFixed(1)}% classification confidence`;
  }
  return `${result.status === 'clear' ? 'No AI flag triggered' : 'Potentially AI-generated imagery'} · ${(result.score * 100).toFixed(1)}% model score`;
}
