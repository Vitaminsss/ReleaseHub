const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const CONFIG = require('../config');
const { auth } = require('../auth-middleware');
const { fileBadgeLabel } = require('../download-utils');
const {
  renderDownload404Html,
  renderTempTransferInfoPageHtml,
  renderTempTransferGoneHtml,
  renderFolderBrowseHtml,
} = require('../download-pages');
const { getTempTransferStore } = require('./instance');
const { contentDispositionAttachment } = require('./content-disposition');
const { multerFixOriginalNameFileFilter } = require('../fix-multipart-filename');
const { normalizeRelativePath, decodeUrlPathToRelative } = require('../path-utils');
const { streamZipFromEntries } = require('../folder-archive');
const { toTempBrowsePayload, tempArchiveUrl } = require('./folder-browse');
const pathUtil = require('path');

function getTt() {
  return CONFIG.TEMP_TRANSFER;
}

function publicBase() {
  return CONFIG.BASE_URL.replace(/\/$/, '');
}

function enrichRecordPublic(rec) {
  const base = publicBase();
  const t = encodeURIComponent(rec.token);
  if (rec.kind === 'folder') {
    return {
      kind: 'folder',
      fileCount: rec.fileCount || (rec.entries || []).length,
      landingUrl: `${base}/tt/p/${t}`,
      browseUrl: `${base}/tt/p/${t}`,
      downloadUrl: `${base}/tt/p/${t}`,
      archiveUrl: tempArchiveUrl(base, rec.token, ''),
    };
  }
  return {
    kind: 'file',
    landingUrl: `${base}/tt/p/${t}`,
    downloadUrl: `${base}/tt/${t}`,
  };
}

async function loadActiveRecord(store, token) {
  const rec = await store.getByToken(token);
  if (rec && /** @type {any} */ (rec).__tomb) return { status: 410, rec: null };
  if (!rec) return { status: 404, rec: null };
  if (rec.status === 'deleted' || rec.status === 'expired') return { status: 410, rec: null };
  if (new Date(rec.expireAt).getTime() <= Date.now()) return { status: 410, rec: null };
  const kind = rec.kind === 'folder' ? 'folder' : 'file';
  if (!(await store.storage.exists(rec.id, { kind }))) return { status: 410, rec: null };
  return { status: 200, rec };
}

/**
 * 解析 ttl：数字或在允许列表
 * @param {import('./config').TempTransferConfig} cfg
 * @param {any} raw
 * @returns {{ ok: true, minutes: number } | { ok: false, error: string }}
 */
function parseTtl(cfg, raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, minutes: cfg.defaultTtlMinutes };
  }
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) {
    return { ok: false, error: 'ttlMinutes 必须为正整数' };
  }
  if (!cfg.allowedTtlsMinutes.includes(n)) {
    return { ok: false, error: 'ttlMinutes 不在允许列表中' };
  }
  if (n > cfg.maxTtlMinutes) {
    return { ok: false, error: 'ttlMinutes 超过允许的最大值' };
  }
  return { ok: true, minutes: n };
}

/**
 * @param {import('express').Application} app
 */
function registerTempTransferRoutes(app) {
  const cfg = getTt();
  if (!cfg || !cfg.enabled) {
    return;
  }

  const pendingDir = path.join(cfg.rootDir, 'pending');
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        fs.mkdirSync(pendingDir, { recursive: true });
        cb(null, pendingDir);
      } catch (e) {
        cb(/** @type {any} */ (e));
      }
    },
    filename: (req, file, cb) => {
      const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.part`;
      cb(null, name);
    },
  });
  const upload = multer({
    storage,
    fileFilter: multerFixOriginalNameFileFilter(),
    limits: { fileSize: cfg.maxFileSizeBytes },
  });

  const folderPendingStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        if (!req._ttFolderStaging) {
          req._ttFolderStaging = path.join(
            pendingDir,
            `batch-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
          );
        }
        const rel = normalizeRelativePath(file.originalname);
        if (!rel) return cb(new Error('无效文件路径'));
        const abs = pathUtil.join(req._ttFolderStaging, pathUtil.dirname(rel));
        fs.mkdirSync(abs, { recursive: true });
        cb(null, abs);
      } catch (e) {
        cb(/** @type {any} */ (e));
      }
    },
    filename: (req, file, cb) => {
      const rel = normalizeRelativePath(file.originalname);
      if (!rel) return cb(new Error('无效文件路径'));
      cb(null, pathUtil.basename(rel));
    },
  });
  const folderUpload = multer({
    storage: folderPendingStorage,
    fileFilter: multerFixOriginalNameFileFilter(),
    limits: { fileSize: cfg.maxFileSizeBytes },
  });

  async function handleTempPublicHtml(req, res) {
    const store = getTempTransferStore();
    if (!store) return res.status(404).type('html').send(renderDownload404Html());
    const { token } = req.params;
    if (!token || !/^[A-Za-z0-9_-]+$/.test(token) || token.length > 200) {
      return res.status(404).type('html').send(renderDownload404Html());
    }
    try {
      const rec = await store.getByToken(token);
      if (rec && /** @type {any} */ (rec).__tomb) {
        return res.status(410).type('html').send(renderTempTransferGoneHtml());
      }
      if (!rec) {
        return res.status(404).type('html').send(renderDownload404Html());
      }
      if (rec.status === 'deleted' || rec.status === 'expired' || new Date(rec.expireAt).getTime() <= Date.now()) {
        return res.status(410).type('html').send(renderTempTransferGoneHtml());
      }
      const kind = rec.kind === 'folder' ? 'folder' : 'file';
      const exists = await store.storage.exists(rec.id, { kind });
      if (!exists) {
        return res.status(410).type('html').send(renderTempTransferGoneHtml());
      }
      const b = publicBase();
      if (rec.kind === 'folder') {
        const pathQ = req.query.path != null ? String(req.query.path) : '';
        const payload = toTempBrowsePayload(rec, b, pathQ);
        return res.type('html').send(
          renderFolderBrowseHtml({
            kind: 'temp',
            displayLabel: payload.displayLabel,
            description: payload.description,
            breadcrumbs: payload.breadcrumbs,
            archiveUrl: payload.archiveUrl,
            folders: payload.folders,
            files: payload.files,
          }),
        );
      }
      const badge = fileBadgeLabel(rec.originalName || 'file');
      const enc = encodeURIComponent(rec.token);
      const direct = `${b}/tt/${enc}`;
      const expMs = new Date(rec.expireAt).getTime();
      const name = rec.originalName || 'file';
      return res.type('html').send(
        renderTempTransferInfoPageHtml({
          filename: name,
          displayTitle: name,
          size: rec.size,
          badge,
          directDownloadHref: direct,
          expireAtMs: expMs,
        }),
      );
    } catch (e) {
      console.error('[temp-transfer] public html', e);
      return res.status(500).type('html').send(renderDownload404Html());
    }
  }

  const downloadHandler = (req, res) => {
    const store = getTempTransferStore();
    if (!store) {
      return res.status(404).json({ error: '临时传输未启用', code: 'DISABLED' });
    }
    const { token } = req.params;
    if (!token || !/^[A-Za-z0-9_-]+$/.test(token) || token.length > 200) {
      return res.status(404).json({ error: '链接无效', code: 'NOT_FOUND' });
    }
    (async () => {
      const rec = await store.getByToken(token);
      if (rec && /** @type {any} */ (rec).__tomb) {
        return res.status(410).json({ error: '文件已过期或已删除', code: 'GONE' });
      }
      if (!rec) {
        return res.status(404).json({ error: '文件不存在', code: 'NOT_FOUND' });
      }
      if (rec.status === 'deleted' || rec.status === 'expired') {
        return res.status(410).json({ error: '文件已过期或已删除', code: 'GONE' });
      }
      if (new Date(rec.expireAt).getTime() <= Date.now()) {
        return res.status(410).json({ error: '文件已过期', code: 'EXPIRED' });
      }
      if (rec.kind === 'folder') {
        const b = publicBase();
        return res.redirect(302, `${b}/tt/p/${encodeURIComponent(rec.token)}`);
      }
      const exists = await store.storage.exists(rec.id);
      if (!exists) {
        return res.status(410).json({ error: '文件已删除', code: 'GONE' });
      }
      rec.downloadCount = (rec.downloadCount || 0) + 1;
      store.writeRecord(rec).catch(() => {});

      res.setHeader('Content-Disposition', contentDispositionAttachment(rec.originalName || 'file'));
      if (rec.mimeType) res.setHeader('Content-Type', rec.mimeType);
      if (Number.isFinite(rec.size) && rec.size > 0) res.setHeader('Content-Length', String(rec.size));
      const stream = store.storage.createReadStream(rec.id);
      stream.on('error', () => {
        if (!res.headersSent) res.status(410).json({ error: '文件已删除', code: 'GONE' });
      });
      stream.pipe(res);
    })().catch(err => {
      console.error('[temp-transfer] download', err);
      if (!res.headersSent) res.status(500).json({ error: '下载失败' });
    });
  };

  const metaHandler = (req, res) => {
    const store = getTempTransferStore();
    if (!store) {
      return res.status(404).json({ error: '临时传输未启用', code: 'DISABLED' });
    }
    const { token } = req.params;
    if (!token || !/^[A-Za-z0-9_-]+$/.test(token) || token.length > 200) {
      return res.status(404).json({ error: '链接无效', code: 'NOT_FOUND' });
    }
    (async () => {
      const rec = await store.getByToken(token);
      if (rec && /** @type {any} */ (rec).__tomb) {
        return res.status(410).json({ error: '已过期', code: 'GONE' });
      }
      if (!rec) {
        return res.status(404).json({ error: '文件不存在', code: 'NOT_FOUND' });
      }
      if (new Date(rec.expireAt).getTime() <= Date.now() || rec.status === 'deleted') {
        return res.status(410).json({ error: '已过期', code: 'GONE' });
      }
      const exp = new Date(rec.expireAt).getTime();
      const secondsRemaining = Math.max(0, Math.floor((exp - Date.now()) / 1000));
      const pub = enrichRecordPublic(rec);
      res.json({
        id: rec.id,
        kind: rec.kind === 'folder' ? 'folder' : 'file',
        fileCount: rec.fileCount,
        originalName: rec.originalName,
        size: rec.size,
        mimeType: rec.mimeType,
        createdAt: rec.createdAt,
        expireAt: rec.expireAt,
        secondsRemaining,
        downloadCount: rec.downloadCount || 0,
        ...pub,
        metaUrl: `${publicBase()}/api/temp-transfer/${encodeURIComponent(rec.token)}/meta`,
      });
    })().catch(err => {
      console.error('[temp-transfer] meta', err);
      res.status(500).json({ error: '查询失败' });
    });
  };

  app.post(
    '/api/temp-transfer/upload',
    (req, res, next) => {
      const st = getTempTransferStore();
      if (!st) return res.status(404).json({ error: '临时传输未启用', code: 'DISABLED' });
      next();
    },
    (req, res, next) => {
      folderUpload.fields([
        { name: 'file', maxCount: 1 },
        { name: 'files', maxCount: 100 },
      ])(req, res, err => {
        if (err) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: '文件超过大小限制', code: 'FILE_TOO_LARGE' });
          }
          return res.status(400).json({ error: err.message || '上传失败', code: 'UPLOAD_ERROR' });
        }
        next();
      });
    },
    (req, res) => {
      const st = getTempTransferStore();
      const ttc = getTt();
      if (!st || !ttc) return res.status(404).json({ error: '临时传输未启用' });
      const parsed = parseTtl(ttc, req.body && req.body.ttlMinutes);
      if (!parsed.ok) {
        const all = [...(req.files?.files || []), ...(req.files?.file || [])];
        for (const f of all) {
          try {
            if (f.path) fs.unlinkSync(f.path);
          } catch {}
        }
        return res
          .status(422)
          .json({ error: parsed.error, code: 'INVALID_TTL', allowedTtlsMinutes: ttc.allowedTtlsMinutes });
      }
      const multi = req.files?.files || [];
      const single = req.files?.file?.[0];
      if (multi.length > 0) {
        const folderName =
          (req.body && req.body.folderName && String(req.body.folderName).trim()) ||
          (() => {
            const first = multi[0]?.originalname;
            const rel = normalizeRelativePath(first);
            return rel && rel.includes('/') ? rel.split('/')[0] : '文件夹';
          })();
        (async () => {
          try {
            const rec = await st.createFromFolderUpload(
              { originalName: folderName, ttlMinutes: parsed.minutes },
              multi,
            );
            if (req._ttFolderStaging) {
              try {
                fs.rmSync(req._ttFolderStaging, { recursive: true, force: true });
              } catch {}
            }
            const pub = enrichRecordPublic(rec);
            res.json({
              id: rec.id,
              token: rec.token,
              kind: 'folder',
              fileCount: rec.fileCount,
              ...pub,
              metaUrl: `${publicBase()}/api/temp-transfer/${encodeURIComponent(rec.token)}/meta`,
              originalName: rec.originalName,
              size: rec.size,
              createdAt: rec.createdAt,
              expireAt: rec.expireAt,
              ttlMinutes: parsed.minutes,
            });
          } catch (e) {
            console.error('[temp-transfer] folder upload', e);
            for (const f of multi) {
              try {
                if (f.path) fs.unlinkSync(f.path);
              } catch {}
            }
            res.status(500).json({ error: e.message || '上传失败' });
          }
        })();
        return;
      }
      if (!single || !single.path) {
        return res.status(400).json({ error: '请上传 file 或 files 字段', code: 'NO_FILE' });
      }
      const partPath = single.path;
      const originalName = single.originalname || 'file';
      const size = single.size || 0;
      const mimeType = single.mimetype || null;
      (async () => {
        try {
          const rec = await st.createFromPartFile(
            {
              originalName,
              size,
              mimeType,
              ttlMinutes: parsed.minutes,
            },
            partPath,
          );
          const pub = enrichRecordPublic(rec);
          res.json({
            id: rec.id,
            token: rec.token,
            kind: 'file',
            ...pub,
            metaUrl: `${publicBase()}/api/temp-transfer/${encodeURIComponent(rec.token)}/meta`,
            originalName: rec.originalName,
            size: rec.size,
            createdAt: rec.createdAt,
            expireAt: rec.expireAt,
            ttlMinutes: parsed.minutes,
          });
        } catch (e) {
          console.error('[temp-transfer] upload', e);
          try {
            if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
          } catch {}
          res.status(500).json({ error: e.message || '上传失败' });
        }
      })();
    },
  );

  app.get('/api/temp-transfer/allowed-ttls', (req, res) => {
    const t = getTt();
    if (!t || !t.enabled) return res.status(404).json({ error: '临时传输未启用' });
    res.json({
      defaultTtlMinutes: t.defaultTtlMinutes,
      allowedTtlsMinutes: t.allowedTtlsMinutes,
      maxFileSizeMb: Math.floor(t.maxFileSizeBytes / (1024 * 1024)),
    });
  });

  app.get('/api/temp-transfer/list', auth, (req, res) => {
    const st = getTempTransferStore();
    if (!st) return res.status(404).json({ error: '临时传输未启用' });
    (async () => {
      const rows = await st.listActiveForAdmin();
      const out = rows.map(r => ({
        ...r,
        ...enrichRecordPublic(r),
        metaUrl: `${publicBase()}/api/temp-transfer/${encodeURIComponent(r.token)}/meta`,
      }));
      res.json({ items: out });
    })().catch(e => {
      console.error('[temp-transfer] list', e);
      res.status(500).json({ error: e.message || '列表失败' });
    });
  });

  app.get('/api/temp-transfer/item/:id', auth, (req, res) => {
    const st = getTempTransferStore();
    if (!st) return res.status(404).json({ error: '临时传输未启用' });
    const { id } = req.params;
    if (!/^[0-9a-f]{16}$/.test(id || '')) {
      return res.status(400).json({ error: '无效的 id' });
    }
    (async () => {
      const rec = await st.readRecord(id);
      if (!rec) return res.status(404).json({ error: '记录不存在' });
      if (rec.status !== 'active' || new Date(rec.expireAt).getTime() <= Date.now()) {
        return res.status(410).json({ error: '已过期或已删除' });
      }
      const kind = rec.kind === 'folder' ? 'folder' : 'file';
      if (!(await st.storage.exists(rec.id, { kind }))) {
        return res.status(410).json({ error: '文件已删除' });
      }
      const now = Date.now();
      const secondsRemaining = Math.max(0, Math.floor((new Date(rec.expireAt).getTime() - now) / 1000));
      const body = {
        id: rec.id,
        token: rec.token,
        kind,
        fileCount: rec.fileCount,
        originalName: rec.originalName,
        size: rec.size,
        mimeType: rec.mimeType,
        createdAt: rec.createdAt,
        expireAt: rec.expireAt,
        downloadCount: rec.downloadCount || 0,
        secondsRemaining,
        entries: rec.kind === 'folder' ? rec.entries : undefined,
        ...enrichRecordPublic(rec),
        metaUrl: `${publicBase()}/api/temp-transfer/${encodeURIComponent(rec.token)}/meta`,
      };
      res.json(body);
    })().catch(e => {
      console.error('[temp-transfer] item', e);
      res.status(500).json({ error: e.message || '查询失败' });
    });
  });

  app.delete('/api/temp-transfer/item/:id', auth, (req, res) => {
    const st = getTempTransferStore();
    if (!st) return res.status(404).json({ error: '临时传输未启用' });
    const { id } = req.params;
    if (!/^[0-9a-f]{16}$/.test(id || '')) {
      return res.status(400).json({ error: '无效的 id' });
    }
    (async () => {
      const rec = await st.readRecord(id);
      if (!rec) return res.status(404).json({ error: '记录不存在' });
      if (rec.status === 'deleted') {
        return res.json({ success: true, id });
      }
      await st.removePhysical(id);
      res.json({ success: true, id });
    })().catch(e => {
      console.error('[temp-transfer] delete', e);
      res.status(500).json({ error: e.message || '删除失败' });
    });
  });

  app.get('/api/temp-transfer/:token/meta', metaHandler);

  app.get('/api/temp-transfer/:token/browse', (req, res) => {
    const store = getTempTransferStore();
    if (!store) return res.status(404).json({ error: '临时传输未启用' });
    const { token } = req.params;
    (async () => {
      const loaded = await loadActiveRecord(store, token);
      if (loaded.status !== 200 || !loaded.rec) {
        return res.status(loaded.status).json({ error: '不可用', code: 'GONE' });
      }
      if (loaded.rec.kind !== 'folder') {
        return res.status(400).json({ error: '非文件夹传输', code: 'NOT_FOLDER' });
      }
      const pathQ = req.query.path != null ? String(req.query.path) : '';
      res.json(toTempBrowsePayload(loaded.rec, publicBase(), pathQ));
    })().catch(e => {
      console.error('[temp-transfer] browse', e);
      res.status(500).json({ error: '查询失败' });
    });
  });

  app.get('/tt/:token/archive', (req, res) => {
    const store = getTempTransferStore();
    if (!store) return res.status(404).type('html').send(renderDownload404Html());
    const { token } = req.params;
    (async () => {
      const loaded = await loadActiveRecord(store, token);
      if (loaded.status !== 200 || !loaded.rec) {
        return res.status(loaded.status).type('html').send(renderTempTransferGoneHtml());
      }
      if (loaded.rec.kind !== 'folder') {
        return res.status(404).type('html').send(renderDownload404Html());
      }
      const dirPath = req.query.path != null ? String(req.query.path) : '';
      const entries = (loaded.rec.entries || []).map(e => ({ relativePath: e.relativePath, size: e.size }));
      try {
        streamZipFromEntries(
          res,
          store.storage.folderPath(loaded.rec.id),
          entries,
          dirPath,
          loaded.rec.originalName || 'download',
        );
      } catch (e) {
        const status = e.status || 413;
        if (req.accepts('json')) {
          return res.status(status).json({ error: e.message, code: e.code });
        }
        return res.status(status).type('html').send(renderDownload404Html());
      }
    })().catch(err => {
      console.error('[temp-transfer] archive', err);
      if (!res.headersSent) res.status(500).type('html').send(renderDownload404Html());
    });
  });

  app.get('/tt/:token/files/*', (req, res) => {
    const store = getTempTransferStore();
    if (!store) return res.status(404).type('html').send(renderDownload404Html());
    const { token } = req.params;
    const rel = decodeUrlPathToRelative(req.params[0]);
    if (!rel) return res.status(404).type('html').send(renderDownload404Html());
    (async () => {
      const loaded = await loadActiveRecord(store, token);
      if (loaded.status !== 200 || !loaded.rec) {
        return res.status(loaded.status).type('html').send(renderTempTransferGoneHtml());
      }
      if (loaded.rec.kind !== 'folder') {
        return res.status(404).type('html').send(renderDownload404Html());
      }
      const ent = (loaded.rec.entries || []).find(e => e.relativePath === rel);
      if (!ent) return res.status(404).type('html').send(renderDownload404Html());
      const fp = store.storage.entryPath(loaded.rec.id, rel);
      if (!fp || !fs.existsSync(fp)) return res.status(404).type('html').send(renderDownload404Html());
      loaded.rec.downloadCount = (loaded.rec.downloadCount || 0) + 1;
      store.writeRecord(loaded.rec).catch(() => {});
      const baseName = rel.split('/').pop() || 'file';
      res.setHeader('Content-Disposition', contentDispositionAttachment(baseName));
      if (ent.size > 0) res.setHeader('Content-Length', String(ent.size));
      const stream = store.storage.createReadStreamEntry(loaded.rec.id, rel);
      stream.on('error', () => {
        if (!res.headersSent) res.status(410).type('html').send(renderTempTransferGoneHtml());
      });
      stream.pipe(res);
    })().catch(err => {
      console.error('[temp-transfer] file', err);
      if (!res.headersSent) res.status(500).type('html').send(renderDownload404Html());
    });
  });

  app.get('/tt/p/:token', (req, res) => {
    handleTempPublicHtml(req, res).catch(err => {
      console.error('[temp-transfer] tt/p', err);
      if (!res.headersSent) res.status(500).type('html').send(renderDownload404Html());
    });
  });

  app.get('/tt/:token', downloadHandler);
}

module.exports = { registerTempTransferRoutes, parseTtl, getTt };
