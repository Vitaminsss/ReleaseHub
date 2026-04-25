/** @param {number} sec */
export function formatRemainingSec(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  if (s <= 0) return '已过期';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (d > 0) return `${d} 天 ${h} 小时 ${m} 分`;
  if (h > 0) return `${h} 小时 ${m} 分 ${r} 秒`;
  if (m > 0) return `${m} 分 ${r} 秒`;
  return `${r} 秒`;
}
