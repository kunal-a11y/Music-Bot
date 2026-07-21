function duration(seconds) {
  if (!Number.isFinite(seconds)) return 'LIVE';
  if (seconds <= 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function progress(elapsed, total, size = 18) {
  if (!total) return '▬'.repeat(size);
  const position = Math.min(size - 1, Math.floor((elapsed / total) * size));
  return Array.from({ length: size }, (_, i) => (i === position ? '🔘' : '▬')).join('');
}

function truncate(text, length = 80) {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

module.exports = { duration, progress, truncate };
