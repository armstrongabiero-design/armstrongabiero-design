/** Safety score colour bands: 80–100 green, 60–79 amber, 0–59 red. */

export function safetyScoreBand(score) {
  const n = Number(score);
  if (Number.isNaN(n)) return 'unknown';
  if (n >= 80) return 'good';
  if (n >= 60) return 'attention';
  return 'critical';
}

export function safetyScoreTextClass(score) {
  const band = safetyScoreBand(score);
  if (band === 'good') return 'text-green-700 font-semibold';
  if (band === 'attention') return 'text-amber-600 font-semibold';
  if (band === 'critical') return 'text-red-600 font-semibold';
  return 'text-slate-600';
}

export function safetyScoreBadgeClass(score) {
  const band = safetyScoreBand(score);
  if (band === 'good') return 'status-badge active';
  if (band === 'attention') return 'status-badge maintenance';
  if (band === 'critical') return 'status-badge inactive';
  return 'status-badge';
}

export function safetyScoreBarClass(score) {
  const band = safetyScoreBand(score);
  if (band === 'good') return 'bg-green-500';
  if (band === 'attention') return 'bg-amber-500';
  if (band === 'critical') return 'bg-red-500';
  return 'bg-slate-400';
}

export function safetyScoreLabel(score) {
  const band = safetyScoreBand(score);
  if (band === 'good') return 'Good / Excellent';
  if (band === 'attention') return 'Requires Attention';
  if (band === 'critical') return 'Poor / Critical';
  return '—';
}
