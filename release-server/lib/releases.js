const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');
const { readAppMeta } = require('./meta-notes');

function getApps() {
  if (!fs.existsSync(CONFIG.RELEASES_DIR)) return [];
  return fs
    .readdirSync(CONFIG.RELEASES_DIR)
    .filter(f => fs.statSync(path.join(CONFIG.RELEASES_DIR, f)).isDirectory());
}

/** 应用 releases 目录内最近活动时间（目录、latest.json、各版本子目录的 mtime 取最大），用于列表排序 */
function getAppLastActivityMs(appName) {
  const dir = path.join(CONFIG.RELEASES_DIR, appName);
  let max = 0;
  try {
    max = Math.max(max, fs.statSync(dir).mtimeMs);
  } catch {
    return 0;
  }
  const latestPath = path.join(dir, 'latest.json');
  try {
    if (fs.existsSync(latestPath)) max = Math.max(max, fs.statSync(latestPath).mtimeMs);
  } catch {}
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return max;
  }
  for (const ent of entries) {
    if (ent === 'latest.json') continue;
    const p = path.join(dir, ent);
    try {
      const st = fs.statSync(p);
      if (st.isDirectory()) max = Math.max(max, st.mtimeMs);
    } catch {}
  }
  return max;
}

function semverSort(a, b) {
  const p = s => s.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const [am, an, ap] = p(a);
  const [bm, bn, bp] = p(b);
  return bm !== am ? bm - am : bn !== an ? bn - an : bp - ap;
}

function getVersions(appName) {
  const dir = path.join(CONFIG.RELEASES_DIR, appName);
  if (!fs.existsSync(dir)) return [];
  const meta = readAppMeta(appName);
  const subdirs = fs.readdirSync(dir).filter(f => {
    try {
      return fs.statSync(path.join(dir, f)).isDirectory();
    } catch {
      return false;
    }
  });
  if (meta.repoType === 'tauri') {
    return subdirs.filter(f => f.startsWith('v')).sort(semverSort);
  }
  return subdirs.sort((a, b) => {
    try {
      const ma = fs.statSync(path.join(dir, a)).mtimeMs;
      const mb = fs.statSync(path.join(dir, b)).mtimeMs;
      return mb - ma;
    } catch {
      return b.localeCompare(a, undefined, { numeric: true });
    }
  });
}

function fileUrl(appName, version, filename) {
  return `${CONFIG.BASE_URL}/${appName}/${version}/${filename}`;
}

function getFiles(appName, version) {
  const dir = path.join(CONFIG.RELEASES_DIR, appName, version);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map(f => {
    const st = fs.statSync(path.join(dir, f));
    return { name: f, size: st.size, url: fileUrl(appName, version, f), updatedAt: st.mtime };
  });
}

function resolveReleaseFile(app, version, filename) {
  try {
    const base = path.resolve(path.join(CONFIG.RELEASES_DIR, app, version));
    const root = path.resolve(CONFIG.RELEASES_DIR);
    if (!base.startsWith(root + path.sep) && base !== root) return null;
    const fp = path.resolve(base, filename);
    if (!fp.startsWith(base + path.sep)) return null;
    return fp;
  } catch {
    return null;
  }
}

function readLatest(app) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(CONFIG.RELEASES_DIR, app, 'latest.json'), 'utf-8'));
    if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
    return data;
  } catch {
    return null;
  }
}

function writeLatest(app, data) {
  fs.writeFileSync(path.join(CONFIG.RELEASES_DIR, app, 'latest.json'), JSON.stringify(data, null, 2), 'utf-8');
}

function readSig(app, ver, filename) {
  try {
    return fs.readFileSync(path.join(CONFIG.RELEASES_DIR, app, ver, filename), 'utf-8').trim();
  } catch {
    return null;
  }
}

function detectPlatform(filename) {
  const f = filename.toLowerCase();
  if (f.endsWith('.msi') || f.endsWith('.exe'))
    return f.includes('x64') || f.includes('x86_64') ? 'windows-x86_64' : 'windows-i686';
  if (f.endsWith('.appimage.tar.gz') || f.endsWith('.appimage'))
    return f.includes('aarch64') ? 'linux-aarch64' : 'linux-x86_64';
  if (f.endsWith('.app.tar.gz') || f.endsWith('.dmg'))
    return f.includes('aarch64') || f.includes('arm64') ? 'darwin-aarch64' : 'darwin-x86_64';
  return null;
}

function isValidVersion(v) {
  return /^v\d+\.\d+(\.\d+)?(-[\w.]+)?$/.test(v);
}

/** general：目录名即版本标识，不强制 v 前缀 */
const GENERAL_VER_MAX_LEN = 120;
function isValidGeneralVersionForUpload(version) {
  const v = String(version || '');
  if (!v || v.length > GENERAL_VER_MAX_LEN) return false;
  if (v.includes('..') || /[/\\]/.test(v)) return false;
  return /^[a-zA-Z0-9._-]+$/.test(v);
}

function isSemVer2CoreWithVPrefix(v) {
  return /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v);
}

/** latest.json 内 version 与磁盘目录对齐（Tauri 多为 v*；general 任意合法目录名） */
function resolveDiskDirForLogicalVersion(app, logicalVersion) {
  const lv = String(logicalVersion || '').trim();
  if (!lv) return null;
  const normalized = lv.replace(/^v/, '');
  for (const d of getVersions(app)) {
    if (d === lv || d.replace(/^v/, '') === normalized) return d;
  }
  const meta = readAppMeta(app);
  if (meta.repoType === 'tauri') {
    const cand = lv.startsWith('v') ? lv : `v${lv}`;
    const p = path.join(CONFIG.RELEASES_DIR, app, cand);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return cand;
  }
  return null;
}

function resolvePublishedVersionDir(app) {
  const latest = readLatest(app);
  if (!latest?.version) return null;
  return resolveDiskDirForLogicalVersion(app, latest.version);
}

/** @deprecated 请用 resolvePublishedVersionDir */
function versionToVdir(version) {
  const v = String(version || '').replace(/^v/, '');
  return v ? `v${v}` : null;
}

/** Tauri：仅安装包/镜像本体，排除 .sig 及无法识别的杂文件 */
function isTauriPrimaryArtifactFilename(filename) {
  const n = String(filename || '');
  if (!n || n.toLowerCase().endsWith('.sig')) return false;
  if (detectPlatform(n)) return true;
  const low = n.toLowerCase();
  return (
    low.endsWith('.exe') ||
    low.endsWith('.msi') ||
    low.endsWith('.dmg') ||
    low.endsWith('.appimage') ||
    low.endsWith('.appimage.tar.gz') ||
    low.endsWith('.app.tar.gz')
  );
}

/** 当前已发布主下载 URL：按磁盘 + 当前 BASE_URL 生成，不依赖 latest 内旧 url */
function getLatestPrimaryDownloadUrl(app, platform = null) {
  const latest = readLatest(app);
  if (!latest) return null;
  const meta = readAppMeta(app);
  const vdir = resolvePublishedVersionDir(app);
  if (!vdir) return null;

  if (meta.repoType === 'tauri') {
    const order = ['windows-x86_64', 'darwin-aarch64', 'darwin-x86_64', 'linux-x86_64', 'linux-aarch64'];
    const want = platform && order.includes(platform) ? platform : null;
    const tryOrder = want ? [want, ...order.filter(p => p !== want)] : order;
    const files = getFiles(app, vdir).filter(f => isTauriPrimaryArtifactFilename(f.name));
    for (const plat of tryOrder) {
      for (const f of files) {
        if (detectPlatform(f.name) === plat) return fileUrl(app, vdir, f.name);
      }
    }
    const first = files[0];
    return first ? fileUrl(app, vdir, first.name) : null;
  }

  const files = getFiles(app, vdir).filter(f => f.name !== '.gitkeep' && !f.name.endsWith('.sig'));
  const first = files[0];
  return first ? fileUrl(app, vdir, first.name) : null;
}

function buildPlatformsFromDisk(app, vdir) {
  const platforms = {};
  const files = getFiles(app, vdir);
  files.forEach(f => {
    if (f.name.endsWith('.sig')) return;
    const plat = detectPlatform(f.name);
    if (!plat) return;
    const sig = readSig(app, vdir, `${f.name}.sig`);
    platforms[plat] = { url: f.url, signature: sig || '(未找到 .sig 文件)' };
  });
  return platforms;
}

function buildFilesFromDisk(app, vdir) {
  return getFiles(app, vdir)
    .filter(f => f.name !== '.gitkeep')
    .map(f => ({ name: f.name, url: f.url, size: f.size }));
}

/** 合并刷新：仅更新磁盘上能匹配到的条目的 url（及 Tauri 的 signature），保留手工平台/文件项 */
function rebuildLatestUrlsMerge(app) {
  const latest = readLatest(app);
  if (!latest || typeof latest !== 'object') return null;
  const meta = readAppMeta(app);
  const vdir = resolvePublishedVersionDir(app);
  if (!vdir) return null;

  if (meta.repoType === 'tauri') {
    const fromDisk = buildPlatformsFromDisk(app, vdir);
    const prev =
      latest.platforms && typeof latest.platforms === 'object' && !Array.isArray(latest.platforms)
        ? { ...latest.platforms }
        : {};
    const merged = { ...prev };
    for (const [plat, diskEntry] of Object.entries(fromDisk)) {
      const old = merged[plat];
      const oldObj = old && typeof old === 'object' && !Array.isArray(old) ? { ...old } : {};
      const hasRealSig = diskEntry.signature && diskEntry.signature !== '(未找到 .sig 文件)';
      merged[plat] = {
        ...oldObj,
        url: diskEntry.url,
        signature: hasRealSig ? diskEntry.signature : oldObj.signature ?? diskEntry.signature,
      };
    }
    return { ...latest, platforms: merged };
  }

  const diskFiles = buildFilesFromDisk(app, vdir);
  const prevList = Array.isArray(latest.files) ? latest.files : [];
  const diskByName = new Map(diskFiles.map(f => [f.name, f]));
  const mergedList = [];
  const seenDisk = new Set();
  for (const f of prevList) {
    const d = diskByName.get(f.name);
    if (d) {
      mergedList.push({ ...f, url: d.url, size: d.size });
      seenDisk.add(f.name);
    } else mergedList.push(f);
  }
  for (const df of diskFiles) {
    if (!seenDisk.has(df.name)) mergedList.push(df);
  }
  return { ...latest, files: mergedList };
}

/** 完全按磁盘重建 platforms/files（危险：会丢掉磁盘上无法识别的手工条目） */
function rebuildLatestUrlsReplace(app) {
  const latest = readLatest(app);
  if (!latest || typeof latest !== 'object') return null;
  const meta = readAppMeta(app);
  const vdir = resolvePublishedVersionDir(app);
  if (!vdir) return null;

  if (meta.repoType === 'tauri') {
    return { ...latest, platforms: buildPlatformsFromDisk(app, vdir) };
  }
  return { ...latest, files: buildFilesFromDisk(app, vdir) };
}

/**
 * @param {'merge'|'replace'} mode merge 默认；replace 整表替换为磁盘扫描结果
 */
function rebuildLatestUrls(app, mode = 'merge') {
  return mode === 'replace' ? rebuildLatestUrlsReplace(app) : rebuildLatestUrlsMerge(app);
}

/**
 * PATCH 已发布元数据：仅覆盖请求体中出现的字段，且与 repo 类型一致
 */
function patchLatest(app, body) {
  const latest = readLatest(app);
  if (!latest || typeof latest !== 'object') return { error: '尚未发布任何版本', status: 404 };
  const meta = readAppMeta(app);
  const next = { ...latest };

  if (body.pub_date !== undefined) {
    if (body.pub_date !== null && typeof body.pub_date !== 'string')
      return { error: 'pub_date 必须为字符串或 null', status: 400 };
    if (body.pub_date === null || body.pub_date === '') delete next.pub_date;
    else next.pub_date = body.pub_date;
  }
  if (body.notes !== undefined) {
    if (typeof body.notes !== 'string') return { error: 'notes 必须为字符串', status: 400 };
    next.notes = body.notes;
  }

  if (meta.repoType === 'tauri') {
    if (body.platforms !== undefined) {
      if (!body.platforms || typeof body.platforms !== 'object' || Array.isArray(body.platforms))
        return { error: 'platforms 必须为对象', status: 400 };
      next.platforms = body.platforms;
    }
  } else {
    if (body.files !== undefined) {
      if (!Array.isArray(body.files)) return { error: 'files 必须为数组', status: 400 };
      next.files = body.files;
    }
  }

  writeLatest(app, next);
  return { latest: next };
}

function previewReleasePayload(app, version) {
  const meta = readAppMeta(app);
  const files = getFiles(app, version);
  const ver = version.replace(/^v/, '');
  const { readDrafts } = require('./meta-notes');
  const notes = readDrafts(app)[version] || '';

  if (meta.repoType === 'tauri') {
    const platforms = {};
    files.forEach(f => {
      if (f.name.endsWith('.sig')) return;
      const plat = detectPlatform(f.name);
      if (!plat) return;
      const sig = readSig(app, version, `${f.name}.sig`);
      platforms[plat] = { url: f.url, signature: sig || '(未找到 .sig 文件)' };
    });
    return { version: ver, notes, pub_date: new Date().toISOString(), platforms };
  }
  const fileList = files.filter(f => f.name !== '.gitkeep').map(f => ({ name: f.name, url: f.url, size: f.size }));
  return { version: ver, notes, pub_date: new Date().toISOString(), files: fileList };
}

function publishFromBody(app, body) {
  const { version, notes, platforms, files, pub_date } = body;
  if (!version) return { error: '缺少 version 字段', status: 400 };
  const meta = readAppMeta(app);
  let data;
  if (meta.repoType === 'tauri') {
    if (!platforms) return { error: '缺少 platforms 字段', status: 400 };
    const vdir = resolveDiskDirForLogicalVersion(app, version);
    if (!vdir) return { error: '找不到对应版本目录', status: 400 };
    const fromDisk = buildPlatformsFromDisk(app, vdir);
    const prev = platforms && typeof platforms === 'object' && !Array.isArray(platforms) ? { ...platforms } : {};
    const merged = { ...prev };
    for (const [plat, diskEntry] of Object.entries(fromDisk)) {
      const old = merged[plat];
      const oldObj = old && typeof old === 'object' && !Array.isArray(old) ? { ...old } : {};
      const hasRealSig = diskEntry.signature && diskEntry.signature !== '(未找到 .sig 文件)';
      merged[plat] = {
        ...oldObj,
        url: diskEntry.url,
        signature: hasRealSig ? diskEntry.signature : oldObj.signature ?? diskEntry.signature,
      };
    }
    data = {
      version: version.replace(/^v/, ''),
      notes: notes || '',
      pub_date: pub_date || new Date().toISOString(),
      platforms: merged,
    };
  } else {
    const vdir = resolveDiskDirForLogicalVersion(app, version);
    if (!vdir) return { error: '找不到对应版本目录', status: 400 };
    const fl =
      files ||
      getFiles(app, vdir)
        .filter(f => f.name !== '.gitkeep')
        .map(f => ({ name: f.name, url: f.url, size: f.size }));
    data = {
      version: version.replace(/^v/, ''),
      notes: notes || '',
      pub_date: pub_date || new Date().toISOString(),
      files: fl,
    };
  }
  writeLatest(app, data);
  return { latest: data };
}

/** 对外公开：从 latest 推断下载信息（兼容旧 latest.json 形状） */
function getPublicDownloadInfo(app) {
  const latest = readLatest(app);
  if (!latest) return null;
  const meta = readAppMeta(app);
  const version = latest.version;
  const out = {
    version,
    pub_date: latest.pub_date || null,
    notes: latest.notes || '',
    repoType: meta.repoType || 'general',
  };
  const rt = meta.repoType || 'general';

  if (latest.platforms && typeof latest.platforms === 'object') {
    out.platforms = {};
    for (const [plat, v] of Object.entries(latest.platforms)) {
      if (v && typeof v === 'object' && v.url) out.platforms[plat] = { url: v.url, hasSignature: !!(v.signature && v.signature !== '(未找到 .sig 文件)') };
      else if (typeof v === 'string') out.platforms[plat] = { url: v };
    }
  }
  if (latest.files && Array.isArray(latest.files)) {
    out.files = latest.files.map(f => ({ name: f.name, url: f.url, size: f.size }));
  }

  const fresh = getLatestPrimaryDownloadUrl(app);
  if (fresh) {
    out.primaryDownloadUrl = fresh;
  } else if (rt === 'tauri' && out.platforms) {
    out.primaryDownloadUrl = pickPrimaryTauriUrl(latest.platforms);
  } else if (rt === 'general' && out.files?.length) {
    const first = latest.files.find(f => f.name && !String(f.name).endsWith('.sig'));
    out.primaryDownloadUrl = first?.url || null;
  } else {
    out.primaryDownloadUrl = pickPrimaryTauriUrl(latest.platforms) || (Array.isArray(latest.files) ? latest.files.find(f => f.name && !String(f.name).endsWith('.sig'))?.url : null) || null;
  }
  return out;
}

function urlLooksLikeSigArtifact(url) {
  if (!url) return true;
  const s = String(url).trim();
  try {
    const u = new URL(s);
    return u.pathname.toLowerCase().endsWith('.sig');
  } catch {
    return s.toLowerCase().split('?')[0].endsWith('.sig');
  }
}

function pickPrimaryTauriUrl(platforms) {
  if (!platforms || typeof platforms !== 'object') return null;
  const order = ['windows-x86_64', 'darwin-aarch64', 'darwin-x86_64', 'linux-x86_64', 'linux-aarch64'];
  for (const k of order) {
    const v = platforms[k];
    if (v && typeof v === 'object' && v.url && !urlLooksLikeSigArtifact(v.url)) return v.url;
  }
  const first = Object.values(platforms).find(
    v => v && typeof v === 'object' && v.url && !urlLooksLikeSigArtifact(v.url),
  );
  return first?.url || null;
}

function getTauriPlatformUrl(latest, platform) {
  if (!latest?.platforms || typeof latest.platforms !== 'object') return null;
  const v = latest.platforms[platform];
  if (v && typeof v === 'object') {
    const u = v.url || null;
    return u && !urlLooksLikeSigArtifact(u) ? u : null;
  }
  if (typeof v === 'string') return urlLooksLikeSigArtifact(v) ? null : v;
  return null;
}

module.exports = {
  getApps,
  getAppLastActivityMs,
  semverSort,
  getVersions,
  fileUrl,
  getFiles,
  resolveReleaseFile,
  readLatest,
  writeLatest,
  readSig,
  detectPlatform,
  isValidVersion,
  isValidGeneralVersionForUpload,
  isSemVer2CoreWithVPrefix,
  versionToVdir,
  resolveDiskDirForLogicalVersion,
  resolvePublishedVersionDir,
  getLatestPrimaryDownloadUrl,
  isTauriPrimaryArtifactFilename,
  rebuildLatestUrls,
  rebuildLatestUrlsMerge,
  rebuildLatestUrlsReplace,
  patchLatest,
  previewReleasePayload,
  publishFromBody,
  getPublicDownloadInfo,
  getTauriPlatformUrl,
  pickPrimaryTauriUrl,
};
