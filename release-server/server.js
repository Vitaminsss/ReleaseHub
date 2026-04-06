require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3721;

// ─── 配置 ────────────────────────────────────────────
const CONFIG = {
  JWT_SECRET: process.env.JWT_SECRET || 'change-this-secret-in-production',
  ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync('admin123', 10),
  RELEASES_DIR: process.env.RELEASES_DIR || path.join(__dirname, 'releases'),
  BASE_URL: process.env.BASE_URL || 'http://localhost:3721',
};

if (!fs.existsSync(CONFIG.RELEASES_DIR)) {
  fs.mkdirSync(CONFIG.RELEASES_DIR, { recursive: true });
}

// ─── App 元数据（repoType: 'general' | 'tauri'）─────────
const META_DIR = path.join(__dirname, '.meta');

function metaPath(appName) {
  return path.join(META_DIR, `${appName}.json`);
}

function readAppMeta(appName) {
  const p = metaPath(appName);
  if (!fs.existsSync(p)) return { repoType: 'general' };
  try {
    const o = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return o && typeof o === 'object' ? o : { repoType: 'general' };
  } catch { return { repoType: 'general' }; }
}

function writeAppMeta(appName, data) {
  if (!fs.existsSync(META_DIR)) fs.mkdirSync(META_DIR, { recursive: true });
  fs.writeFileSync(metaPath(appName), JSON.stringify(data, null, 2), 'utf-8');
}

function deleteAppMeta(appName) {
  const p = metaPath(appName);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// ─── 更新日志草稿 ──────────────────────────────────────
const NOTES_DRAFT_DIR = path.join(__dirname, '.notes-cache');

function notesDraftPath(appName) {
  return path.join(NOTES_DRAFT_DIR, `${appName}.json`);
}

function readNotesDraftsForApp(appName) {
  const p = notesDraftPath(appName);
  if (!fs.existsSync(p)) return {};
  try {
    const o = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return o && typeof o === 'object' ? o : {};
  } catch { return {}; }
}

function writeNotesDraftsForApp(appName, data) {
  if (!fs.existsSync(NOTES_DRAFT_DIR)) fs.mkdirSync(NOTES_DRAFT_DIR, { recursive: true });
  const p = notesDraftPath(appName);
  if (Object.keys(data).length === 0) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return;
  }
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
}

function setNotesDraft(appName, version, text) {
  const d = readNotesDraftsForApp(appName);
  if (!text || String(text).trim() === '') delete d[version];
  else d[version] = String(text);
  writeNotesDraftsForApp(appName, d);
}

function removeNotesDraftVersion(appName, version) {
  const d = readNotesDraftsForApp(appName);
  if (!(version in d)) return;
  delete d[version];
  writeNotesDraftsForApp(appName, d);
}

function deleteNotesDraftFile(appName) {
  const p = notesDraftPath(appName);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// ─── 中间件 ───────────────────────────────────────────
app.use(cors());
app.use(express.json());

app.use('/releases', express.static(CONFIG.RELEASES_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// ─── JWT 认证 ──────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    req.user = jwt.verify(token, CONFIG.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token 无效或已过期' });
  }
}

// ─── Multer ────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { appName, version } = req.params;
    const dir = path.join(CONFIG.RELEASES_DIR, appName, version);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

// ─── 工具函数 ─────────────────────────────────────────
function getApps() {
  if (!fs.existsSync(CONFIG.RELEASES_DIR)) return [];
  return fs.readdirSync(CONFIG.RELEASES_DIR).filter(f =>
    fs.statSync(path.join(CONFIG.RELEASES_DIR, f)).isDirectory()
  );
}

function getVersions(appName) {
  const appDir = path.join(CONFIG.RELEASES_DIR, appName);
  if (!fs.existsSync(appDir)) return [];
  return fs.readdirSync(appDir)
    .filter(f => {
      const fp = path.join(appDir, f);
      return fs.statSync(fp).isDirectory() && f.startsWith('v');
    })
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}

function getFiles(appName, version) {
  const dir = path.join(CONFIG.RELEASES_DIR, appName, version);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map(f => {
    const stat = fs.statSync(path.join(dir, f));
    return {
      name: f,
      size: stat.size,
      url: `${CONFIG.BASE_URL}/releases/${appName}/${version}/${f}`,
      updatedAt: stat.mtime,
    };
  });
}

function readLatestJson(appName) {
  const p = path.join(CONFIG.RELEASES_DIR, appName, 'latest.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function writeLatestJson(appName, data) {
  const p = path.join(CONFIG.RELEASES_DIR, appName, 'latest.json');
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
}

function readSig(appName, version, filename) {
  const p = path.join(CONFIG.RELEASES_DIR, appName, version, filename);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf-8').trim();
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

// ─── 路由：认证 ────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { password } = req.body;
  const ok = await bcrypt.compare(password, CONFIG.ADMIN_PASSWORD_HASH);
  if (!ok) return res.status(401).json({ error: '密码错误' });
  const token = jwt.sign({ role: 'admin' }, CONFIG.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

// ─── 路由：应用 ────────────────────────────────────────
app.get('/api/apps', auth, (req, res) => {
  const apps = getApps().map(appName => {
    const latest = readLatestJson(appName);
    const versions = getVersions(appName);
    const meta = readAppMeta(appName);
    return {
      name: appName,
      repoType: meta.repoType || 'general',
      latestVersion: latest?.version || null,
      versionCount: versions.length,
    };
  });
  res.json(apps);
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

app.delete('/api/apps/:appName', auth, (req, res) => {
  const dir = path.join(CONFIG.RELEASES_DIR, req.params.appName);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'App 不存在' });
  fs.rmSync(dir, { recursive: true, force: true });
  deleteNotesDraftFile(req.params.appName);
  deleteAppMeta(req.params.appName);
  res.json({ success: true });
});

// 获取 App 元数据
app.get('/api/apps/:appName/meta', auth, (req, res) => {
  const dir = path.join(CONFIG.RELEASES_DIR, req.params.appName);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'App 不存在' });
  res.json(readAppMeta(req.params.appName));
});

// ─── 路由：版本 ────────────────────────────────────────
app.get('/api/apps/:appName/versions', auth, (req, res) => {
  const { appName } = req.params;
  const latest = readLatestJson(appName);
  const latestVersion = latest?.version;
  const versions = getVersions(appName).map(version => ({
    version,
    isLatest: latestVersion === version.replace(/^v/, '') || latestVersion === version,
    files: getFiles(appName, version),
  }));
  res.json(versions);
});

app.post('/api/apps/:appName/versions/:version/upload', auth,
  upload.array('files', 20),
  (req, res) => {
    const { appName, version } = req.params;
    const uploaded = req.files.map(f => ({
      name: f.originalname,
      size: f.size,
      url: `${CONFIG.BASE_URL}/releases/${appName}/${version}/${f.originalname}`,
    }));
    res.json({ uploaded });
  }
);

app.delete('/api/apps/:appName/versions/:version/files/:filename', auth, (req, res) => {
  const { appName, version, filename } = req.params;
  const p = path.join(CONFIG.RELEASES_DIR, appName, version, filename);
  if (!fs.existsSync(p)) return res.status(404).json({ error: '文件不存在' });
  fs.unlinkSync(p);
  res.json({ success: true });
});

app.delete('/api/apps/:appName/versions/:version', auth, (req, res) => {
  const { appName, version } = req.params;
  const dir = path.join(CONFIG.RELEASES_DIR, appName, version);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: '版本不存在' });
  fs.rmSync(dir, { recursive: true, force: true });
  removeNotesDraftVersion(appName, version);
  const latest = readLatestJson(appName);
  if (latest?.version === version.replace(/^v/, '') || latest?.version === version) {
    fs.writeFileSync(path.join(CONFIG.RELEASES_DIR, appName, 'latest.json'), JSON.stringify(null));
  }
  res.json({ success: true });
});

// ─── 路由：更新日志草稿 ────────────────────────────────
app.get('/api/apps/:appName/notes-drafts', auth, (req, res) => {
  const { appName } = req.params;
  const appDir = path.join(CONFIG.RELEASES_DIR, appName);
  if (!fs.existsSync(appDir)) return res.status(404).json({ error: 'App 不存在' });
  res.json({ drafts: readNotesDraftsForApp(appName) });
});

app.put('/api/apps/:appName/versions/:version/notes', auth, (req, res) => {
  const { appName, version } = req.params;
  let { text } = req.body;
  if (text !== undefined && typeof text !== 'string')
    return res.status(400).json({ error: 'text 必须为字符串' });
  text = text === undefined ? '' : text;
  const appDir = path.join(CONFIG.RELEASES_DIR, appName);
  if (!fs.existsSync(appDir)) return res.status(404).json({ error: 'App 不存在' });
  setNotesDraft(appName, version, text);
  res.json({ success: true });
});

// ─── 路由：预览发布内容 ────────────────────────────────
app.get('/api/apps/:appName/versions/:version/preview-release', auth, (req, res) => {
  const { appName, version } = req.params;
  const meta = readAppMeta(appName);
  const files = getFiles(appName, version);
  const ver = version.replace(/^v/, '');
  const drafts = readNotesDraftsForApp(appName);
  const notesDraft = drafts[version] || '';

  if (meta.repoType === 'tauri') {
    // Tauri 格式：platforms 对象 + signature
    const platforms = {};
    files.forEach(f => {
      if (f.name.endsWith('.sig')) return;
      const platform = detectPlatform(f.name);
      if (!platform) return;
      const sig = readSig(appName, version, f.name + '.sig');
      platforms[platform] = {
        url: f.url,
        signature: sig || '(未找到 .sig 文件)',
      };
    });
    res.json({ version: ver, notes: notesDraft, pub_date: new Date().toISOString(), platforms });
  } else {
    // 通用格式：files 数组
    const fileList = files
      .filter(f => f.name !== '.gitkeep')
      .map(f => ({ name: f.name, url: f.url, size: f.size }));
    res.json({
      version: ver,
      notes: notesDraft,
      pub_date: new Date().toISOString(),
      files: fileList,
    });
  }
});

// ─── 路由：发布 ────────────────────────────────────────
app.post('/api/apps/:appName/publish', auth, (req, res) => {
  const { appName } = req.params;
  const { version, notes, platforms, files, pub_date } = req.body;
  if (!version) return res.status(400).json({ error: '缺少 version 字段' });

  const meta = readAppMeta(appName);
  let data;

  if (meta.repoType === 'tauri') {
    if (!platforms) return res.status(400).json({ error: '缺少 platforms 字段' });
    data = {
      version: version.replace(/^v/, ''),
      notes: notes || '',
      pub_date: pub_date || new Date().toISOString(),
      platforms,
    };
  } else {
    // 通用格式：如果前端传来 files 就用，否则自动生成
    const fileList = files || getFiles(appName, `v${version.replace(/^v/, '')}`).map(f => ({ name: f.name, url: f.url, size: f.size }));
    data = {
      version: version.replace(/^v/, ''),
      notes: notes || '',
      pub_date: pub_date || new Date().toISOString(),
      files: fileList,
    };
  }

  writeLatestJson(appName, data);
  res.json({ success: true, latest: data });
});

// ─── 路由：公开接口 ────────────────────────────────────
// latest.json（Tauri updater 或通用客户端均可调用）
app.get('/releases/:appName/latest.json', (req, res) => {
  const latest = readLatestJson(req.params.appName);
  if (!latest) return res.status(204).send();
  res.json(latest);
});

// 公开：获取指定应用当前发布的最新版本信息（通用客户端检查更新用）
app.get('/api/public/:appName/latest', (req, res) => {
  const latest = readLatestJson(req.params.appName);
  if (!latest) return res.status(204).send();
  res.json(latest);
});

// 获取当前 latest.json（管理后台用）
app.get('/api/apps/:appName/latest', auth, (req, res) => {
  const latest = readLatestJson(req.params.appName);
  if (!latest) return res.status(404).json({ error: '尚未发布任何版本' });
  res.json(latest);
});

// ─── 路由：设置 ────────────────────────────────────────
app.get('/api/settings', auth, (req, res) => {
  res.json({ baseUrl: CONFIG.BASE_URL });
});

app.post('/api/base-url', auth, (req, res) => {
  let { baseUrl } = req.body;
  if (!baseUrl || typeof baseUrl !== 'string')
    return res.status(400).json({ error: '请提供 baseUrl' });
  baseUrl = baseUrl.trim().replace(/\/$/, '');
  if (!/^https?:\/\/.+/i.test(baseUrl))
    return res.status(400).json({ error: 'BASE_URL 必须以 http:// 或 https:// 开头' });
  const envPath = path.join(__dirname, '.env');
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
  if (envContent.includes('BASE_URL='))
    envContent = envContent.replace(/BASE_URL=.*/m, `BASE_URL=${baseUrl}`);
  else
    envContent += (envContent.endsWith('\n') ? '' : '\n') + `BASE_URL=${baseUrl}\n`;
  fs.writeFileSync(envPath, envContent);
  CONFIG.BASE_URL = baseUrl;
  res.json({ success: true, baseUrl });
});

app.post('/api/change-password', auth, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || typeof oldPassword !== 'string')
    return res.status(400).json({ error: '请提供当前密码' });
  const oldOk = await bcrypt.compare(oldPassword, CONFIG.ADMIN_PASSWORD_HASH);
  if (!oldOk) return res.status(400).json({ error: '当前密码错误' });
  if (!newPassword || newPassword.length < 8)
    return res.status(400).json({ error: '新密码至少8位' });
  const hash = await bcrypt.hash(newPassword, 10);
  const envPath = path.join(__dirname, '.env');
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
  if (envContent.includes('ADMIN_PASSWORD_HASH='))
    envContent = envContent.replace(/ADMIN_PASSWORD_HASH=.*/, `ADMIN_PASSWORD_HASH=${hash}`);
  else
    envContent += `\nADMIN_PASSWORD_HASH=${hash}`;
  fs.writeFileSync(envPath, envContent);
  CONFIG.ADMIN_PASSWORD_HASH = hash;
  res.json({ success: true, message: '密码已更新' });
});

// ─── 启动 ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Release Hub running at http://localhost:${PORT}`);
  console.log(`📁 Releases dir: ${CONFIG.RELEASES_DIR}`);
  console.log(`🔑 Default password: admin123 (请尽快修改!)`);
});