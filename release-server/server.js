require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const { MIN_PASSWORD_LENGTH, defaultAdminPasswordHash } = require('./lib/admin-password-defaults');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3721;

const CONFIG = {
  JWT_SECRET: process.env.JWT_SECRET || 'change-this-secret-in-production',
  ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH || defaultAdminPasswordHash(),
  RELEASES_DIR: process.env.RELEASES_DIR || path.join(__dirname, 'releases'),
  BASE_URL: process.env.BASE_URL || 'http://localhost:3721',
};

if (!fs.existsSync(CONFIG.RELEASES_DIR)) fs.mkdirSync(CONFIG.RELEASES_DIR, { recursive: true });

// ─── Meta ─────────────────────────────────────────────
const META_DIR = path.join(__dirname, '.meta');
function metaPath(n) { return path.join(META_DIR, `${n}.json`); }
function readAppMeta(n) {
  try { const o = JSON.parse(fs.readFileSync(metaPath(n), 'utf-8')); return (o && typeof o === 'object') ? o : { repoType: 'general' }; }
  catch { return { repoType: 'general' }; }
}
function writeAppMeta(n, d) {
  if (!fs.existsSync(META_DIR)) fs.mkdirSync(META_DIR, { recursive: true });
  fs.writeFileSync(metaPath(n), JSON.stringify(d, null, 2), 'utf-8');
}
function deleteAppMeta(n) { try { fs.unlinkSync(metaPath(n)); } catch {} }

// ─── Notes drafts ─────────────────────────────────────
const NOTES_DIR = path.join(__dirname, '.notes-cache');
function notesPath(n) { return path.join(NOTES_DIR, `${n}.json`); }
function readDrafts(n) {
  try { const o = JSON.parse(fs.readFileSync(notesPath(n), 'utf-8')); return (o && typeof o === 'object') ? o : {}; }
  catch { return {}; }
}
function writeDrafts(n, d) {
  if (!fs.existsSync(NOTES_DIR)) fs.mkdirSync(NOTES_DIR, { recursive: true });
  const p = notesPath(n);
  if (Object.keys(d).length === 0) { try { fs.unlinkSync(p); } catch {} return; }
  fs.writeFileSync(p, JSON.stringify(d, null, 2), 'utf-8');
}
function setDraft(app, ver, text) {
  const d = readDrafts(app);
  if (!text || !String(text).trim()) delete d[ver]; else d[ver] = String(text);
  writeDrafts(app, d);
}
function removeDraft(app, ver) { const d = readDrafts(app); delete d[ver]; writeDrafts(app, d); }
function deleteDraftFile(n) { try { fs.unlinkSync(notesPath(n)); } catch {} }

// ─── Middleware ────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Legacy /releases/ static serving (keep compatibility)
app.use('/releases', express.static(CONFIG.RELEASES_DIR));

// Short URL: /:appName/:version/:filename  →  serves from releases dir
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const parts = req.path.split('/').filter(Boolean);
  if (parts.length !== 3) return next();
  const [appName, version, filename] = parts;
  if (['api', 'releases', 'public'].includes(appName)) return next();
  if (!version.startsWith('v')) return next();
  const filePath = path.join(CONFIG.RELEASES_DIR, appName, version, filename);
  if (!fs.existsSync(filePath)) return next();
  res.sendFile(filePath);
});

app.use(express.static(path.join(__dirname, 'public')));

// ─── Auth ─────────────────────────────────────────────
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '未登录' });
  try { req.user = jwt.verify(token, CONFIG.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token 无效或已过期' }); }
}

// ─── Multer ────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(CONFIG.RELEASES_DIR, req.params.app, req.params.version);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

// ─── Helpers ──────────────────────────────────────────
function getApps() {
  if (!fs.existsSync(CONFIG.RELEASES_DIR)) return [];
  return fs.readdirSync(CONFIG.RELEASES_DIR).filter(f => fs.statSync(path.join(CONFIG.RELEASES_DIR, f)).isDirectory());
}

function semverSort(a, b) {
  const p = s => s.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const [am, an, ap] = p(a), [bm, bn, bp] = p(b);
  return bm !== am ? bm - am : bn !== an ? bn - an : bp - ap;
}

function getVersions(appName) {
  const dir = path.join(CONFIG.RELEASES_DIR, appName);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => fs.statSync(path.join(dir, f)).isDirectory() && f.startsWith('v'))
    .sort(semverSort);
}

// Short URL (no /releases/ segment)
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

function readLatest(app) {
  try { return JSON.parse(fs.readFileSync(path.join(CONFIG.RELEASES_DIR, app, 'latest.json'), 'utf-8')); }
  catch { return null; }
}
function writeLatest(app, data) {
  fs.writeFileSync(path.join(CONFIG.RELEASES_DIR, app, 'latest.json'), JSON.stringify(data, null, 2), 'utf-8');
}

function readSig(app, ver, filename) {
  try { return fs.readFileSync(path.join(CONFIG.RELEASES_DIR, app, ver, filename), 'utf-8').trim(); }
  catch { return null; }
}

function detectPlatform(filename) {
  const f = filename.toLowerCase();
  if (f.endsWith('.msi') || f.endsWith('.exe'))
    return (f.includes('x64') || f.includes('x86_64')) ? 'windows-x86_64' : 'windows-i686';
  if (f.endsWith('.appimage.tar.gz') || f.endsWith('.appimage'))
    return f.includes('aarch64') ? 'linux-aarch64' : 'linux-x86_64';
  if (f.endsWith('.app.tar.gz') || f.endsWith('.dmg'))
    return (f.includes('aarch64') || f.includes('arm64')) ? 'darwin-aarch64' : 'darwin-x86_64';
  return null;
}

// Version validation: must be v + digits.digits(.digits)(-prerelease)
function isValidVersion(v) {
  return /^v\d+\.\d+(\.\d+)?(-[\w.]+)?$/.test(v);
}

// SemVer 2.0.0 normal version: v + MAJOR.MINOR.PATCH, numeric identifiers without leading zeros (except 0)
function isSemVer2CoreWithVPrefix(v) {
  return /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v);
}

// ─── Routes ───────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  if (!await bcrypt.compare(req.body.password || '', CONFIG.ADMIN_PASSWORD_HASH))
    return res.status(401).json({ error: '密码错误' });
  res.json({ token: jwt.sign({ role: 'admin' }, CONFIG.JWT_SECRET, { expiresIn: '7d' }) });
});

app.get('/api/apps', auth, (req, res) => {
  res.json(getApps().map(n => {
    const latest = readLatest(n);
    const meta = readAppMeta(n);
    return { name: n, repoType: meta.repoType || 'general', latestVersion: latest?.version || null, versionCount: getVersions(n).length };
  }));
});

app.post('/api/apps', auth, (req, res) => {
  const { name, repoType } = req.body;
  if (!name || !/^[a-zA-Z0-9_-]+$/.test(name))
    return res.status(400).json({ error: 'App 名称只能包含字母、数字、下划线和连字符' });
  const dir = path.join(CONFIG.RELEASES_DIR, name);
  if (fs.existsSync(dir)) return res.status(400).json({ error: 'App 已存在' });
  fs.mkdirSync(dir, { recursive: true });
  writeAppMeta(name, { repoType: repoType === 'tauri' ? 'tauri' : 'general' });
  res.json({ success: true });
});

app.delete('/api/apps/:app', auth, (req, res) => {
  const dir = path.join(CONFIG.RELEASES_DIR, req.params.app);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'App 不存在' });
  fs.rmSync(dir, { recursive: true, force: true });
  deleteDraftFile(req.params.app);
  deleteAppMeta(req.params.app);
  res.json({ success: true });
});

app.get('/api/apps/:app/meta', auth, (req, res) => {
  if (!fs.existsSync(path.join(CONFIG.RELEASES_DIR, req.params.app))) return res.status(404).json({ error: 'App 不存在' });
  res.json(readAppMeta(req.params.app));
});

app.get('/api/apps/:app/versions', auth, (req, res) => {
  const { app } = req.params;
  const latest = readLatest(app);
  const latVer = latest?.version;
  res.json(getVersions(app).map(version => ({
    version,
    isLatest: latVer === version.replace(/^v/, '') || latVer === version,
    files: getFiles(app, version),
  })));
});

function validateVersionForUpload(req, res, next) {
  const { app, version } = req.params;
  const meta = readAppMeta(app);
  if (meta.repoType === 'tauri') {
    if (!isSemVer2CoreWithVPrefix(version)) {
      return res.status(400).json({
        error: 'Tauri 库版本须符合 SemVer 2.0：MAJOR.MINOR.PATCH 三段非负整数，且各位数不可前导零（例 v1.0.0）',
      });
    }
  }
  next();
}

app.post('/api/apps/:app/versions/:version/upload', auth, validateVersionForUpload, upload.array('files', 20), (req, res) => {
  const { app, version } = req.params;
  res.json({ uploaded: req.files.map(f => ({ name: f.originalname, size: f.size, url: fileUrl(app, version, f.originalname) })) });
});

app.delete('/api/apps/:app/versions/:version/files/:filename', auth, (req, res) => {
  const p = path.join(CONFIG.RELEASES_DIR, req.params.app, req.params.version, req.params.filename);
  if (!fs.existsSync(p)) return res.status(404).json({ error: '文件不存在' });
  fs.unlinkSync(p);
  res.json({ success: true });
});

app.delete('/api/apps/:app/versions/:version', auth, (req, res) => {
  const { app, version } = req.params;
  const dir = path.join(CONFIG.RELEASES_DIR, app, version);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: '版本不存在' });
  fs.rmSync(dir, { recursive: true, force: true });
  removeDraft(app, version);
  const latest = readLatest(app);
  if (latest?.version === version.replace(/^v/, '') || latest?.version === version)
    fs.writeFileSync(path.join(CONFIG.RELEASES_DIR, app, 'latest.json'), JSON.stringify(null));
  res.json({ success: true });
});

app.get('/api/apps/:app/notes-drafts', auth, (req, res) => {
  if (!fs.existsSync(path.join(CONFIG.RELEASES_DIR, req.params.app))) return res.status(404).json({ error: 'App 不存在' });
  res.json({ drafts: readDrafts(req.params.app) });
});

app.put('/api/apps/:app/versions/:version/notes', auth, (req, res) => {
  const { app, version } = req.params;
  let { text } = req.body;
  if (text !== undefined && typeof text !== 'string') return res.status(400).json({ error: 'text 必须为字符串' });
  if (!fs.existsSync(path.join(CONFIG.RELEASES_DIR, app))) return res.status(404).json({ error: 'App 不存在' });
  setDraft(app, version, text || '');
  res.json({ success: true });
});

app.get('/api/apps/:app/versions/:version/preview-release', auth, (req, res) => {
  const { app, version } = req.params;
  const meta = readAppMeta(app);
  const files = getFiles(app, version);
  const ver = version.replace(/^v/, '');
  const notes = readDrafts(app)[version] || '';

  if (meta.repoType === 'tauri') {
    const platforms = {};
    files.forEach(f => {
      if (f.name.endsWith('.sig')) return;
      const plat = detectPlatform(f.name);
      if (!plat) return;
      const sig = readSig(app, version, f.name + '.sig');
      platforms[plat] = { url: f.url, signature: sig || '(未找到 .sig 文件)' };
    });
    res.json({ version: ver, notes, pub_date: new Date().toISOString(), platforms });
  } else {
    const fileList = files.filter(f => f.name !== '.gitkeep').map(f => ({ name: f.name, url: f.url, size: f.size }));
    res.json({ version: ver, notes, pub_date: new Date().toISOString(), files: fileList });
  }
});

app.post('/api/apps/:app/publish', auth, (req, res) => {
  const { app } = req.params;
  const { version, notes, platforms, files, pub_date } = req.body;
  if (!version) return res.status(400).json({ error: '缺少 version 字段' });
  const meta = readAppMeta(app);
  let data;
  if (meta.repoType === 'tauri') {
    if (!platforms) return res.status(400).json({ error: '缺少 platforms 字段' });
    data = { version: version.replace(/^v/, ''), notes: notes || '', pub_date: pub_date || new Date().toISOString(), platforms };
  } else {
    const vdir = version.startsWith('v') ? version : 'v' + version;
    const fl = files || getFiles(app, vdir).filter(f => f.name !== '.gitkeep').map(f => ({ name: f.name, url: f.url, size: f.size }));
    data = { version: version.replace(/^v/, ''), notes: notes || '', pub_date: pub_date || new Date().toISOString(), files: fl };
  }
  writeLatest(app, data);
  res.json({ success: true, latest: data });
});

// Public endpoints (no auth)
app.get('/releases/:app/latest.json', (req, res) => {
  const d = readLatest(req.params.app);
  d ? res.json(d) : res.status(204).send();
});
app.get('/api/public/:app/latest', (req, res) => {
  const d = readLatest(req.params.app);
  d ? res.json(d) : res.status(204).send();
});
app.get('/api/apps/:app/latest', auth, (req, res) => {
  const d = readLatest(req.params.app);
  d ? res.json(d) : res.status(404).json({ error: '尚未发布任何版本' });
});

// 系统信息：releases 所在卷的磁盘空间（需 Node ≥18.15 且平台支持 statfs）
app.get('/api/system', auth, (req, res) => {
  if (typeof fs.statfsSync !== 'function') {
    return res.json({ disk: null });
  }
  try {
    const p = CONFIG.RELEASES_DIR;
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    const s = fs.statfsSync(p);
    const bs = Number(s.bsize) || 4096;
    const blocks = Number(s.blocks);
    const bavail = Number(s.bavail != null ? s.bavail : s.bfree);
    const total = blocks * bs;
    const free = bavail * bs;
    res.json({ disk: { total, free, used: total - free } });
  } catch {
    res.json({ disk: null });
  }
});

// Settings
app.get('/api/settings', auth, (req, res) => res.json({ baseUrl: CONFIG.BASE_URL }));

app.post('/api/base-url', auth, (req, res) => {
  let { baseUrl } = req.body;
  if (!baseUrl) return res.status(400).json({ error: '请提供 baseUrl' });
  baseUrl = baseUrl.trim().replace(/\/$/, '');
  if (!/^https?:\/\/.+/i.test(baseUrl)) return res.status(400).json({ error: 'BASE_URL 必须以 http:// 或 https:// 开头' });
  const ep = path.join(__dirname, '.env');
  let ec = fs.existsSync(ep) ? fs.readFileSync(ep, 'utf-8') : '';
  ec = ec.includes('BASE_URL=') ? ec.replace(/BASE_URL=.*/m, `BASE_URL=${baseUrl}`) : ec + (ec.endsWith('\n') ? '' : '\n') + `BASE_URL=${baseUrl}\n`;
  fs.writeFileSync(ep, ec);
  CONFIG.BASE_URL = baseUrl;
  res.json({ success: true, baseUrl });
});

app.post('/api/change-password', auth, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword) return res.status(400).json({ error: '请提供当前密码' });
  if (!await bcrypt.compare(oldPassword, CONFIG.ADMIN_PASSWORD_HASH)) return res.status(400).json({ error: '当前密码错误' });
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) return res.status(400).json({ error: `新密码至少${MIN_PASSWORD_LENGTH}位` });
  const hash = await bcrypt.hash(newPassword, 10);
  const ep = path.join(__dirname, '.env');
  let ec = fs.existsSync(ep) ? fs.readFileSync(ep, 'utf-8') : '';
  ec = ec.includes('ADMIN_PASSWORD_HASH=') ? ec.replace(/ADMIN_PASSWORD_HASH=.*/, `ADMIN_PASSWORD_HASH=${hash}`) : ec + `\nADMIN_PASSWORD_HASH=${hash}`;
  fs.writeFileSync(ep, ec);
  CONFIG.ADMIN_PASSWORD_HASH = hash;
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`🚀 数据分发控制台 running at http://localhost:${PORT}`);
  console.log(`📁 Releases dir: ${CONFIG.RELEASES_DIR}`);
});