/**
 * 人类可读的字节数（与顶栏、设置页保持一致）
 * @param {number|null|undefined} n
 * @returns {string}
 */
export function formatBytes(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const v = Number(n);
  if (v < 1024) return `${v} B`;
  if (v < 1048576) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1073741824) return `${(v / 1048576).toFixed(1)} MB`;
  return `${(v / 1073741824).toFixed(2)} GB`;
}
