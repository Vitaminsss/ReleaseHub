/** @param {{ fileName: string, size?: number, [key: string]: unknown }[]} items */
export function listDirectoryLevel(items, currentPath = '') {
  const base = currentPath ? normalizeRel(currentPath) : '';
  const prefix = base ? `${base}/` : '';
  const folderSet = new Map();
  const files = [];
  for (const it of items) {
    const rel = normalizeRel(it.fileName);
    if (!rel) continue;
    if (base && rel !== base && !rel.startsWith(prefix)) continue;
    const rest = base ? rel.slice(prefix.length) : rel;
    if (!rest) continue;
    const slash = rest.indexOf('/');
    if (slash === -1) {
      files.push({ ...it, name: rest, relativePath: rel });
    } else {
      const folderName = rest.slice(0, slash);
      const folderPath = base ? `${base}/${folderName}` : folderName;
      if (!folderSet.has(folderPath)) folderSet.set(folderPath, { name: folderName, path: folderPath });
    }
  }
  return {
    folders: [...folderSet.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    files: files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
  };
}

export function breadcrumbSegments(currentPath) {
  const base = currentPath ? normalizeRel(currentPath) : '';
  if (!base) return [{ label: '根目录', path: '' }];
  const parts = base.split('/');
  const segs = [{ label: '根目录', path: '' }];
  let acc = '';
  for (const p of parts) {
    acc = acc ? `${acc}/${p}` : p;
    segs.push({ label: p, path: acc });
  }
  return segs;
}

function normalizeRel(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter(seg => seg && seg !== '.' && seg !== '..')
    .join('/');
}

export function encodePathForUrl(relativePath) {
  const norm = normalizeRel(relativePath);
  if (!norm) return '';
  return norm.split('/').map(p => encodeURIComponent(p)).join('/');
}
