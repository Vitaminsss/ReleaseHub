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

function semverSort(a, b) {
  const p = s => s.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const [am, an, ap] = p(a);
  const [bm, bn, bp] = p(b);
  return bm !== am ? bm - am : bn !== an ? bn - an : bp - ap;
}

function getVersions(appName) {
  const dir = path.join(CONFIG.RELEASES_DIR, appName);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(f => fs.statSync(path.join(dir, f)).isDirectory() && f.startsWith('v'))
    .sort(semverSort);
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

/** general 类型：版本目录须 v 前缀 + 安全 slug（字母数字 ._-），禁止路径穿越 */
const GENERAL_VER_MAX_LEN = 120;
function isValidGeneralVersionForUpload(version) {
  const v = String(version || '');
  if (!v.startsWith('v')) return false;
  const slug = v.slice(1);
  if (!slug || slug.length > GENERAL_VER_MAX_LEN) return false;
  if (slug.includes('..') || /[/\\]/.test(v)) return false;
  return /^[a-zA-Z0-9._-]+$/.test(slug);
}

function isSemVer2CoreWithVPrefix(v) {
  return /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v);
}

/** 将已发布 version 字段转为版本目录名 vX.Y.Z */
function versionToVdir(version) {
  const v = String(version || '').replace(/^v/, '');
  return v ? `v${v}` : null;
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
  const vdir = versionToVdir(latest.version);
  if (!vdir || !fs.existsSync(path.join(CONFIG.RELEASES_DIR, app, vdir))) return null;

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
  const vdir = versionToVdir(latest.version);
  if (!vdir || !fs.existsSync(path.join(CONFIG.RELEASES_DIR, app, vdir))) return null;

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
    data = {
      version: version.replace(/^v/, ''),
      notes: notes || '',
      pub_date: pub_date || new Date().toISOString(),
      platforms,
    };
  } else {
    const vdir = version.startsWith('v') ? version : `v${version}`;
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

  if (rt === 'tauri' && out.platforms) {
    out.primaryDownloadUrl = pickPrimaryTauriUrl(latest.platforms);
  } else if (rt === 'general' && out.files?.length) {
    const first = latest.files.find(f => f.name && !String(f.name).endsWith('.sig'));
    out.primaryDownloadUrl = first?.url || null;
  } else {
    out.primaryDownloadUrl = pickPrimaryTauriUrl(latest.platforms) || (Array.isArray(latest.files) ? latest.files.find(f => f.name && !String(f.name).endsWith('.sig'))?.url : null) || null;
  }
  return out;
}

function pickPrimaryTauriUrl(platforms) {
  if (!platforms || typeof platforms !== 'object') return null;
  const order = ['windows-x86_64', 'darwin-aarch64', 'darwin-x86_64', 'linux-x86_64', 'linux-aarch64'];
  for (const k of order) {
    const v = platforms[k];
    if (v && typeof v === 'object' && v.url) return v.url;
  }
  const first = Object.values(platforms).find(v => v && typeof v === 'object' && v.url);
  return first?.url || null;
}

function getTauriPlatformUrl(latest, platform) {
  if (!latest?.platforms || typeof latest.platforms !== 'object') return null;
  const v = latest.platforms[platform];
  if (v && typeof v === 'object') return v.url || null;
  if (typeof v === 'string') return v;
  return null;
}

module.exports = {
  getApps,
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
