'use strict';

const path = require('path');
const { normalizeRelativePath } = require('./path-utils');

/**
 * @typedef {{ relativePath: string, size?: number, [key: string]: unknown }} FileEntry
 */

/**
 * List direct children at `currentPath` (normalized, no trailing slash; '' = root).
 * @param {FileEntry[]} entries
 * @param {string} [currentPath]
 */
function listDirectoryLevel(entries, currentPath = '') {
  const base = currentPath ? normalizeRelativePath(currentPath) : '';
  if (currentPath && !base) {
    return { folders: [], files: [] };
  }
  const prefix = base ? `${base}/` : '';
  const folderSet = new Map();
  const files = [];

  for (const ent of entries) {
    const rel = normalizeRelativePath(ent.relativePath || ent.fileName);
    if (!rel) continue;
    if (base && rel !== base && !rel.startsWith(prefix)) continue;
    const rest = base ? rel.slice(prefix.length) : rel;
    if (!rest) continue;
    const slash = rest.indexOf('/');
    if (slash === -1) {
      files.push({
        name: rest,
        relativePath: rel,
        size: ent.size,
        ...ent,
      });
    } else {
      const folderName = rest.slice(0, slash);
      const folderPath = base ? `${base}/${folderName}` : folderName;
      if (!folderSet.has(folderPath)) {
        folderSet.set(folderPath, { name: folderName, path: folderPath });
      }
    }
  }

  const folders = [...folderSet.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { folders, files };
}

/**
 * All entries under a directory prefix (recursive).
 * @param {FileEntry[]} entries
 * @param {string} dirPath folder path, '' for entire library
 */
function collectUnderPrefix(entries, dirPath = '') {
  const base = dirPath ? normalizeRelativePath(dirPath) : '';
  const prefix = base ? `${base}/` : '';
  const out = [];
  for (const ent of entries) {
    const rel = normalizeRelativePath(ent.relativePath || ent.fileName);
    if (!rel) continue;
    if (!base) {
      out.push({ ...ent, relativePath: rel });
      continue;
    }
    if (rel === base || rel.startsWith(prefix)) {
      out.push({ ...ent, relativePath: rel });
    }
  }
  return out;
}

/**
 * Breadcrumb segments for UI.
 * @param {string} currentPath
 */
function breadcrumbSegments(currentPath) {
  const base = currentPath ? normalizeRelativePath(currentPath) : '';
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

/**
 * Zip archive base name from folder path.
 * @param {string} dirPath
 */
function archiveBaseName(dirPath) {
  const base = dirPath ? normalizeRelativePath(dirPath) : '';
  if (!base) return 'download';
  const parts = base.split('/');
  return parts[parts.length - 1] || 'download';
}

module.exports = {
  listDirectoryLevel,
  collectUnderPrefix,
  breadcrumbSegments,
  archiveBaseName,
};
