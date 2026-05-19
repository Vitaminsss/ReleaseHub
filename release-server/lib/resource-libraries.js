const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CONFIG = require('./config');
const { normalizeRelativePath, resolveUnderRoot, encodeRelativePathForUrl } = require('./path-utils');
const { listDirectoryLevel, breadcrumbSegments, archiveBaseName } = require('./file-tree');

const LIB_NAME_RE = /^[a-zA-Z0-9_-]+$/;
const FILES_SUBDIR = 'files';
const INDEX_FILE = 'index.json';

function resourceLibrariesRoot() {
  return CONFIG.RESOURCE_LIBRARIES_DIR;
}

function isValidLibraryName(name) {
  return typeof name === 'string' && LIB_NAME_RE.test(name);
}

function libraryDir(name) {
  return path.join(resourceLibrariesRoot(), name);
}

function libraryFilesDir(name) {
  return path.join(libraryDir(name), FILES_SUBDIR);
}

function indexPath(name) {
  return path.join(libraryDir(name), INDEX_FILE);
}

function libraryExists(name) {
  return fs.existsSync(libraryDir(name)) && fs.statSync(libraryDir(name)).isDirectory();
}

function listLibraries() {
  const root = resourceLibrariesRoot();
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root)
    .filter(n => {
      try {
        return fs.statSync(path.join(root, n)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function defaultIndex(name) {
  return {
    name,
    items: [],
  };
}

function readIndexRaw(name) {
  try {
    const raw = fs.readFileSync(indexPath(name), 'utf-8');
    const o = JSON.parse(raw);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch {
    return null;
  }
}

function writeIndex(name, data) {
  fs.writeFileSync(indexPath(name), JSON.stringify(data, null, 2), 'utf-8');
}

function normalizeIndex(name, raw) {
  const base = defaultIndex(name);
  const o = { ...base, ...raw };
  o.name = name;
  if (!Array.isArray(o.items)) o.items = [];
  o.items = o.items
    .filter(it => it && typeof it === 'object')
    .map(it => ({
      id: String(it.id || ''),
      fileName: String(it.fileName || ''),
      displayName: it.displayName != null ? String(it.displayName) : '',
      description: it.description != null ? String(it.description) : '',
      version:
        it.version != null && String(it.version).trim()
          ? String(it.version).trim().slice(0, 80)
          : '',
      size: typeof it.size === 'number' && Number.isFinite(it.size) ? it.size : 0,
      updatedAt: it.updatedAt != null ? String(it.updatedAt) : new Date(0).toISOString(),
    }))
    .filter(it => it.id && it.fileName);
  if (o.displayName != null) o.displayName = String(o.displayName).trim() || undefined;
  if (o.description != null) {
    const d = String(o.description).trim();
    if (d) o.description = d;
    else delete o.description;
  }
  return o;
}

function readIndex(name) {
  const raw = readIndexRaw(name);
  if (!raw) return null;
  return normalizeIndex(name, raw);
}

function ensureLibraryFilesDir(name) {
  fs.mkdirSync(libraryFilesDir(name), { recursive: true });
}

function createLibrary(name, opts = {}) {
  if (!isValidLibraryName(name)) return { error: '资源库标识只能包含字母、数字、下划线和连字符', status: 400 };
  if (libraryExists(name)) return { error: '资源库已存在', status: 400 };
  fs.mkdirSync(libraryDir(name), { recursive: true });
  ensureLibraryFilesDir(name);
  const idx = defaultIndex(name);
  if (opts.displayName != null && String(opts.displayName).trim()) {
    idx.displayName = String(opts.displayName).trim();
  }
  if (opts.description != null && String(opts.description).trim()) {
    idx.description = String(opts.description).trim();
  }
  writeIndex(name, idx);
  return { success: true, index: idx };
}

function deleteLibrary(name) {
  if (!libraryExists(name)) return { error: '资源库不存在', status: 404 };
  fs.rmSync(libraryDir(name), { recursive: true, force: true });
  return { success: true };
}

function patchLibraryMeta(name, body = {}) {
  if (!libraryExists(name)) return { error: '资源库不存在', status: 404 };
  const idx = readIndex(name);
  if (!idx) return { error: '索引损坏或不存在', status: 500 };
  const next = { ...idx };
  if (body.displayName !== undefined) {
    const d = body.displayName == null ? '' : String(body.displayName).trim();
    if (d) next.displayName = d;
    else delete next.displayName;
  }
  if (body.description !== undefined) {
    let t = body.description == null ? '' : String(body.description);
    if (t.length > 6000) return { error: '资源库简介过长（最多 6000 字）', status: 400 };
    t = t.trim();
    if (t) next.description = t;
    else delete next.description;
  }
  writeIndex(name, next);
  return { success: true, index: next };
}

function renameLibrary(oldName, newName) {
  if (!isValidLibraryName(newName)) return { error: '目标标识只能包含字母、数字、下划线和连字符', status: 400 };
  if (oldName === newName) return { success: true, name: newName };
  if (!libraryExists(oldName)) return { error: '资源库不存在', status: 404 };
  if (libraryExists(newName)) return { error: '目标资源库已存在', status: 400 };
  const oldDir = libraryDir(oldName);
  const newDir = libraryDir(newName);
  try {
    fs.renameSync(oldDir, newDir);
  } catch (e) {
    return { error: e.message || '重命名失败', status: 500 };
  }
  const idx = readIndex(newName);
  if (idx) {
    idx.name = newName;
    writeIndex(newName, idx);
  }
  return { success: true, name: newName };
}

function resolveResourceFile(libraryName, relativePath) {
  const norm = normalizeRelativePath(relativePath);
  if (!norm) return null;
  return resolveUnderRoot(libraryFilesDir(libraryName), norm);
}

function itemDownloadUrl(libraryName, fileName) {
  const enc = encodeRelativePathForUrl(fileName);
  return `${CONFIG.BASE_URL}/r/${encodeURIComponent(libraryName)}/files/${enc}`;
}

function itemLandingUrl(libraryName, fileName) {
  const enc = encodeRelativePathForUrl(fileName);
  return `${CONFIG.BASE_URL}/rd/${encodeURIComponent(libraryName)}/${enc}`;
}

function libraryBrowseUrl(libraryName, dirPath = '') {
  const base = `${CONFIG.BASE_URL}/r/${encodeURIComponent(libraryName)}`;
  const p = dirPath ? normalizeRelativePath(dirPath) : '';
  if (!p) return base;
  return `${base}?path=${encodeURIComponent(p)}`;
}

function libraryArchiveUrl(libraryName, dirPath = '') {
  const base = `${CONFIG.BASE_URL}/r/${encodeURIComponent(libraryName)}/archive`;
  const p = dirPath ? normalizeRelativePath(dirPath) : '';
  if (!p) return base;
  return `${base}?path=${encodeURIComponent(p)}`;
}

/** @returns {string[]} relative paths of all files under files dir */
function listAllFilesRelative(libraryName) {
  const root = libraryFilesDir(libraryName);
  if (!fs.existsSync(root)) return [];
  const out = [];
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile()) {
        const rel = path.relative(root, full).split(path.sep).join('/');
        const norm = normalizeRelativePath(rel);
        if (norm) out.push(norm);
      }
    }
  }
  walk(root);
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function syncItemsWithDisk(name) {
  const idx = readIndex(name);
  if (!idx) return null;
  ensureLibraryFilesDir(name);
  const onDisk = listAllFilesRelative(name);
  const byFile = new Map(idx.items.map(it => [it.fileName, it]));
  const nextItems = [];
  for (const fileName of onDisk) {
    const fp = resolveResourceFile(name, fileName);
    if (!fp) continue;
    let st;
    try {
      st = fs.statSync(fp);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    const prev = byFile.get(fileName);
    if (prev) {
      nextItems.push({
        ...prev,
        size: st.size,
        updatedAt: st.mtime.toISOString(),
      });
    } else {
      nextItems.push({
        id: crypto.randomUUID(),
        fileName,
        displayName: '',
        description: '',
        version: '',
        size: st.size,
        updatedAt: st.mtime.toISOString(),
      });
    }
  }
  idx.items = nextItems;
  writeIndex(name, idx);
  return idx;
}

function registerUpload(name, originalname, size) {
  if (!libraryExists(name)) return { error: '资源库不存在', status: 404 };
  const fn = normalizeRelativePath(originalname);
  if (!fn) {
    return { error: '无效文件名', status: 400 };
  }
  const idx = readIndex(name);
  if (!idx) return { error: '索引损坏', status: 500 };
  const fp = resolveResourceFile(name, fn);
  if (!fp || !fs.existsSync(fp)) return { error: '上传文件未找到', status: 500 };
  let st;
  try {
    st = fs.statSync(fp);
  } catch {
    return { error: '无法读取文件', status: 500 };
  }
  const existing = idx.items.find(it => it.fileName === fn);
  const item = existing
    ? {
        ...existing,
        size: st.size,
        updatedAt: st.mtime.toISOString(),
      }
    : {
        id: crypto.randomUUID(),
        fileName: fn,
        displayName: '',
        description: '',
        version: '',
        size: st.size,
        updatedAt: st.mtime.toISOString(),
      };
  const others = idx.items.filter(it => it.fileName !== fn);
  idx.items = [...others, item].sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true }));
  writeIndex(name, idx);
  return { success: true, item };
}

/** 单次请求多文件：只读/写一次 index.json，避免连续写入竞态 */
function registerUploadBatch(name, multerFiles) {
  if (!libraryExists(name)) return { error: '资源库不存在', status: 404 };
  const list = Array.isArray(multerFiles) ? multerFiles : [];
  if (!list.length) return { uploaded: [] };
  const idx = readIndex(name);
  if (!idx) return { error: '索引损坏', status: 500 };
  const uploaded = [];
  for (const f of list) {
    const fn = normalizeRelativePath(f.originalname);
    if (!fn) {
      return { error: `无效文件路径：${f.originalname || '(空)'}`, status: 400 };
    }
    const fp = f.path || resolveResourceFile(name, fn);
    if (!fp || !fs.existsSync(fp)) {
      return { error: `上传文件未找到：${fn}`, status: 500 };
    }
    let st;
    try {
      st = fs.statSync(fp);
    } catch {
      return { error: `无法读取文件：${fn}`, status: 500 };
    }
    if (!st.isFile()) {
      return { error: `非文件：${fn}`, status: 400 };
    }
    const existing = idx.items.find(it => it.fileName === fn);
    const item = existing
      ? {
          ...existing,
          size: st.size,
          updatedAt: st.mtime.toISOString(),
        }
      : {
          id: crypto.randomUUID(),
          fileName: fn,
          displayName: '',
          description: '',
          version: '',
          size: st.size,
          updatedAt: st.mtime.toISOString(),
        };
    idx.items = idx.items.filter(it => it.fileName !== fn);
    idx.items.push(item);
    uploaded.push(item);
  }
  idx.items.sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true }));
  writeIndex(name, idx);
  return { uploaded };
}

function patchItem(name, itemId, body = {}) {
  if (!libraryExists(name)) return { error: '资源库不存在', status: 404 };
  const idx = readIndex(name);
  if (!idx) return { error: '索引损坏', status: 500 };
  const id = String(itemId || '');
  const i = idx.items.findIndex(it => it.id === id);
  if (i < 0) return { error: '资源项不存在', status: 404 };
  const it = { ...idx.items[i] };
  if (body.displayName !== undefined) {
    it.displayName = body.displayName == null ? '' : String(body.displayName).trim();
  }
  if (body.description !== undefined) {
    let t = body.description == null ? '' : String(body.description);
    if (t.length > 6000) return { error: '简介过长（最多 6000 字）', status: 400 };
    it.description = t.trim();
  }
  if (body.version !== undefined) {
    const v = body.version == null ? '' : String(body.version).trim();
    if (v.length > 80) return { error: '版本号过长（最多 80 字符）', status: 400 };
    it.version = v;
  }
  idx.items[i] = it;
  writeIndex(name, idx);
  return { success: true, item: it, index: idx };
}

function deleteItem(name, itemId) {
  if (!libraryExists(name)) return { error: '资源库不存在', status: 404 };
  const idx = readIndex(name);
  if (!idx) return { error: '索引损坏', status: 500 };
  const id = String(itemId || '');
  const it = idx.items.find(x => x.id === id);
  if (!it) return { error: '资源项不存在', status: 404 };
  const fp = resolveResourceFile(name, it.fileName);
  if (fp && fs.existsSync(fp)) {
    try {
      fs.unlinkSync(fp);
    } catch {}
  }
  idx.items = idx.items.filter(x => x.id !== id);
  writeIndex(name, idx);
  return { success: true, index: idx };
}

function displayLabelFromIndex(idx, fallbackName) {
  const n = idx.displayName && String(idx.displayName).trim() ? String(idx.displayName).trim() : null;
  return n || fallbackName;
}

function entriesFromIndex(idx) {
  return idx.items.map(it => ({
    relativePath: it.fileName,
    fileName: it.fileName,
    ...it,
  }));
}

function toPublicPayload(name, opts = {}) {
  const idx = readIndex(name);
  if (!idx) return null;
  const label = displayLabelFromIndex(idx, name);
  const entries = entriesFromIndex(idx);
  const currentPath = opts.path != null ? String(opts.path) : '';
  const normPath = currentPath ? normalizeRelativePath(currentPath) : '';
  const listing = listDirectoryLevel(entries, normPath || '');
  const crumbs = breadcrumbSegments(normPath || '');
  return {
    name,
    displayName: idx.displayName || null,
    displayLabel: label,
    description: idx.description || '',
    path: normPath || '',
    breadcrumbs: crumbs,
    browseUrl: libraryBrowseUrl(name, normPath || ''),
    archiveUrl: libraryArchiveUrl(name, normPath || ''),
    folders: listing.folders.map(f => ({
      ...f,
      browseUrl: libraryBrowseUrl(name, f.path),
      archiveUrl: libraryArchiveUrl(name, f.path),
    })),
    files: listing.files.map(it => ({
      id: it.id,
      fileName: it.relativePath,
      displayName: it.displayName || '',
      description: it.description || '',
      version: it.version || '',
      size: it.size,
      updatedAt: it.updatedAt,
      downloadUrl: itemDownloadUrl(name, it.relativePath),
      landingUrl: itemLandingUrl(name, it.relativePath),
    })),
    items: entries.map(it => ({
      id: it.id,
      fileName: it.fileName,
      displayName: it.displayName || '',
      description: it.description || '',
      version: it.version || '',
      size: it.size,
      updatedAt: it.updatedAt,
      downloadUrl: itemDownloadUrl(name, it.fileName),
    })),
  };
}

function toAdminDetail(name) {
  const idx = readIndex(name);
  if (!idx) return null;
  const label = displayLabelFromIndex(idx, name);
  const items = [...idx.items].sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true }));
  return {
    name,
    displayName: idx.displayName || null,
    displayLabel: label,
    description: idx.description || '',
    itemCount: items.length,
    items: items.map(it => ({
      ...it,
      downloadUrl: itemDownloadUrl(name, it.fileName),
      landingHref: itemLandingUrl(name, it.fileName),
    })),
  };
}

function toListSummary(name) {
  const idx = readIndex(name);
  if (!idx) {
    return { name, displayName: null, displayLabel: name, itemCount: 0 };
  }
  return {
    name,
    displayName: idx.displayName || null,
    displayLabel: displayLabelFromIndex(idx, name),
    itemCount: idx.items.length,
  };
}

module.exports = {
  resourceLibrariesRoot,
  isValidLibraryName,
  libraryExists,
  listLibraries,
  createLibrary,
  deleteLibrary,
  patchLibraryMeta,
  renameLibrary,
  readIndex,
  syncItemsWithDisk,
  registerUpload,
  registerUploadBatch,
  patchItem,
  deleteItem,
  resolveResourceFile,
  itemDownloadUrl,
  itemLandingUrl,
  libraryBrowseUrl,
  libraryArchiveUrl,
  listAllFilesRelative,
  entriesFromIndex,
  toPublicPayload,
  toAdminDetail,
  toListSummary,
  libraryFilesDir,
  ensureLibraryFilesDir,
  archiveBaseName,
};
