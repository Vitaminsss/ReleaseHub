const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const CONFIG = require('./config');
const { MIN_PASSWORD_LENGTH } = require('./admin-password-defaults');
const { auth } = require('./auth-middleware');
const { upload, validateVersionForUpload } = require('./multer-upload');
const {
  readAppMeta,
  writeAppMeta,
  deleteAppMeta,
  readDrafts,
  setDraft,
  removeDraft,
  deleteDraftFile,
  appDirExists,
} = require('./meta-notes');
const {
  getApps,
  getVersions,
  fileUrl,
  getFiles,
  resolveReleaseFile,
  readLatest,
  writeLatest,
  previewReleasePayload,
  publishFromBody,
  rebuildLatestUrls,
  patchLatest,
  getPublicDownloadInfo,
  getTauriPlatformUrl,
  pickPrimaryTauriUrl,
} = require('./releases');
const { renderDownload404Html, renderDownloadPageHtml } = require('./download-pages');
const { fileBadgeLabel } = require('./download-utils');

function registerRoutes(app) {
  app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'release-hub' });
  });

  app.post('/api/login', async (req, res) => {
    if (!(await bcrypt.compare(req.body.password || '', CONFIG.ADMIN_PASSWORD_HASH)))
      return res.status(401).json({ error: '密码错误' });
    res.json({ token: jwt.sign({ role: 'admin' }, CONFIG.JWT_SECRET, { expiresIn: '7d' }) });
  });

  app.get('/api/apps', auth, (req, res) => {
    res.json(
      getApps().map(n => {
        const latest = readLatest(n);
        const meta = readAppMeta(n);
        return {
          name: n,
          repoType: meta.repoType || 'general',
          latestVersion: latest?.version || null,
          versionCount: getVersions(n).length,
        };
      }),
    );
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
    if (!appDirExists(req.params.app)) return res.status(404).json({ error: 'App 不存在' });
    res.json(readAppMeta(req.params.app));
  });

  app.get('/api/apps/:app/versions', auth, (req, res) => {
    const { app } = req.params;
    const latest = readLatest(app);
    const latVer = latest?.version;
    res.json(
      getVersions(app).map(version => ({
        version,
        isLatest: latVer === version.replace(/^v/, '') || latVer === version,
        files: getFiles(app, version),
      })),
    );
  });

  app.post(
    '/api/apps/:app/versions/:version/upload',
    auth,
    validateVersionForUpload,
    (req, res, next) => {
      upload.array('files', 20)(req, res, err => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: '单个文件超过 500MB 限制', code: 'FILE_TOO_LARGE' });
        }
        return res.status(400).json({ error: err.message || '上传失败', code: 'UPLOAD_ERROR' });
      });
    },
    (req, res) => {
      const { app, version } = req.params;
      res.json({
        uploaded: (req.files || []).map(f => ({
          name: f.originalname,
          size: f.size,
          url: fileUrl(app, version, f.originalname),
        })),
      });
    },
  );

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
    if (!appDirExists(req.params.app)) return res.status(404).json({ error: 'App 不存在' });
    res.json({ drafts: readDrafts(req.params.app) });
  });

  app.put('/api/apps/:app/versions/:version/notes', auth, (req, res) => {
    const { app, version } = req.params;
    let { text } = req.body;
    if (text !== undefined && typeof text !== 'string') return res.status(400).json({ error: 'text 必须为字符串' });
    if (!appDirExists(app)) return res.status(404).json({ error: 'App 不存在' });
    setDraft(app, version, text || '');
    res.json({ success: true });
  });

  app.get('/api/apps/:app/versions/:version/preview-release', auth, (req, res) => {
    const { app, version } = req.params;
    res.json(previewReleasePayload(app, version));
  });

  app.post('/api/apps/:app/publish', auth, (req, res) => {
    const { app } = req.params;
    const result = publishFromBody(app, req.body);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ success: true, latest: result.latest });
  });

  /** 直接 PATCH 当前已发布的 latest.json（无需重新走发布流程） */
  app.patch('/api/apps/:app/latest', auth, (req, res) => {
    const result = patchLatest(req.params.app, req.body || {});
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ success: true, latest: result.latest });
  });

  /**
   * 按当前 BASE_URL 与磁盘刷新下载 URL
   * body: { mode?: 'merge' | 'replace' }，默认 merge（保留手工条目，仅更新能匹配磁盘的 url）
   */
  app.post('/api/apps/:app/latest/refresh-urls', auth, (req, res) => {
    const { app } = req.params;
    const mode = req.body?.mode === 'replace' ? 'replace' : 'merge';
    const rebuilt = rebuildLatestUrls(app, mode);
    if (!rebuilt) return res.status(404).json({ error: '无已发布数据或版本目录不存在' });
    writeLatest(app, rebuilt);
    res.json({ success: true, latest: rebuilt, mode });
  });

  app.get('/d/:app/:version/:filename', (req, res) => {
    const { app, version, filename } = req.params;
    const filePath = resolveReleaseFile(app, version, filename);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).type('html').send(renderDownload404Html());
    }
    let st;
    try {
      st = fs.statSync(filePath);
    } catch {
      return res.status(404).type('html').send(renderDownload404Html());
    }
    if (!st.isFile()) return res.status(404).type('html').send(renderDownload404Html());
    const badge = fileBadgeLabel(filename);
    const downloadHref = `${CONFIG.BASE_URL}/${[app, version, filename].map(encodeURIComponent).join('/')}`;
    res.type('html').send(
      renderDownloadPageHtml({
        appName: app,
        version,
        filename,
        size: st.size,
        badge,
        downloadHref,
      }),
    );
  });

  app.get('/releases/:app/latest.json', (req, res) => {
    const d = readLatest(req.params.app);
    if (d) res.json(d);
    else res.status(204).send();
  });

  app.get('/api/public/:app/latest', (req, res) => {
    const d = readLatest(req.params.app);
    if (d) res.json(d);
    else res.status(204).send();
  });

  /**
   * 公开：结构化最新版本与下载信息（不替代 latest.json；旧客户端仍用 /releases/:app/latest.json）
   * ?redirect=1[&platform=windows-x86_64] 时 302 到具体文件 URL
   */
  app.get('/api/public/:app/latest/download', (req, res) => {
    const { app } = req.params;
    const wantRedirect = req.query.redirect === '1' || req.query.redirect === 'true';
    const platform = req.query.platform ? String(req.query.platform) : null;

    const latest = readLatest(app);
    if (!latest) return res.status(204).send();

    if (wantRedirect) {
      let url = null;
      if (platform && latest.platforms) url = getTauriPlatformUrl(latest, platform);
      if (!url && latest.platforms) {
        url = pickPrimaryTauriUrl(latest.platforms);
      }
      if (!url && latest.files && latest.files.length) {
        const first = latest.files.find(f => f.name && !String(f.name).endsWith('.sig'));
        url = first?.url || null;
      }
      if (!url) return res.status(404).json({ error: '无法解析下载地址' });
      return res.redirect(302, url);
    }

    const info = getPublicDownloadInfo(app);
    if (!info) return res.status(204).send();
    res.json(info);
  });

  app.get('/api/apps/:app/latest', auth, (req, res) => {
    const d = readLatest(req.params.app);
    if (d) res.json(d);
    else res.status(404).json({ error: '尚未发布任何版本' });
  });

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

  app.get('/api/settings', auth, (req, res) => res.json({ baseUrl: CONFIG.BASE_URL }));

  app.post('/api/base-url', auth, (req, res) => {
    let { baseUrl } = req.body;
    if (!baseUrl) return res.status(400).json({ error: '请提供 baseUrl' });
    baseUrl = baseUrl.trim().replace(/\/$/, '');
    if (!/^https?:\/\/.+/i.test(baseUrl)) return res.status(400).json({ error: 'BASE_URL 必须以 http:// 或 https:// 开头' });
    const ep = path.join(__dirname, '..', '.env');
    let ec = fs.existsSync(ep) ? fs.readFileSync(ep, 'utf-8') : '';
    ec = ec.includes('BASE_URL=')
      ? ec.replace(/BASE_URL=.*/m, `BASE_URL=${baseUrl}`)
      : ec + (ec.endsWith('\n') ? '' : '\n') + `BASE_URL=${baseUrl}\n`;
    fs.writeFileSync(ep, ec);
    CONFIG.BASE_URL = baseUrl;
    res.json({ success: true, baseUrl });
  });

  app.post('/api/change-password', auth, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword) return res.status(400).json({ error: '请提供当前密码' });
    if (!(await bcrypt.compare(oldPassword, CONFIG.ADMIN_PASSWORD_HASH)))
      return res.status(400).json({ error: '当前密码错误' });
    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH)
      return res.status(400).json({ error: `新密码至少${MIN_PASSWORD_LENGTH}位` });
    const hash = await bcrypt.hash(newPassword, 10);
    const ep = path.join(__dirname, '..', '.env');
    let ec = fs.existsSync(ep) ? fs.readFileSync(ep, 'utf-8') : '';
    ec = ec.includes('ADMIN_PASSWORD_HASH=')
      ? ec.replace(/ADMIN_PASSWORD_HASH=.*/, `ADMIN_PASSWORD_HASH=${hash}`)
      : ec + `\nADMIN_PASSWORD_HASH=${hash}`;
    fs.writeFileSync(ep, ec);
    CONFIG.ADMIN_PASSWORD_HASH = hash;
    res.json({ success: true });
  });
}

module.exports = { registerRoutes };
