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
  renderTempTransferDownloadPageHtml,
  renderTempTransferGoneHtml,
} = require('../download-pages');
const { getTempTransferStore } = require('./instance');
const { contentDispositionAttachment } = require('./content-disposition');

function getTt() {
  return CONFIG.TEMP_TRANSFER;
}

function publicBase() {
  return CONFIG.BASE_URL.replace(/\/$/, '');
}

function enrichRecordPublic(rec) {
  const base = publicBase();
  const t = encodeURIComponent(rec.token);
  return {
    landingUrl: `${base}/tt/p/${t}`,
    downloadPageUrl: `${base}/tt/d/${t}`,
    downloadUrl: `${base}/tt/${t}`,
  };
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
    limits: { fileSize: cfg.maxFileSizeBytes },
  });

  /**
   * @param {'info' | 'download'} which
   */
  async function handleTempPublicHtml(req, res, which) {
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
      const exists = await store.storage.exists(rec.id);
      if (!exists) {
        return res.status(410).type('html').send(renderTempTransferGoneHtml());
      }
      const badge = fileBadgeLabel(rec.originalName || 'file');
      const b = publicBase();
      const enc = encodeURIComponent(rec.token);
      const direct = `${b}/tt/${enc}`;
      const dpage = `${b}/tt/d/${enc}`;
      const expMs = new Date(rec.expireAt).getTime();
      const name = rec.originalName || 'file';
      if (which === 'info') {
        return res.type('html').send(
          renderTempTransferInfoPageHtml({
            filename: name,
            displayTitle: name,
            size: rec.size,
            badge,
            directDownloadHref: direct,
            downloadPageHref: dpage,
            expireAtMs: expMs,
          }),
        );
      }
      return res.type('html').send(
        renderTempTransferDownloadPageHtml({
          displayTitle: name,
          filename: name,
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
      upload.single('file')(req, res, err => {
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
      if (!req.file || !req.file.path) {
        return res.status(400).json({ error: '请上传 file 字段', code: 'NO_FILE' });
      }
      const parsed = parseTtl(ttc, req.body && req.body.ttlMinutes);
      if (!parsed.ok) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
        return res
          .status(422)
          .json({ error: parsed.error, code: 'INVALID_TTL', allowedTtlsMinutes: ttc.allowedTtlsMinutes });
      }
      const partPath = req.file.path;
      const originalName = req.file.originalname || 'file';
      const size = req.file.size || 0;
      const mimeType = req.file.mimetype || null;
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
      if (!(await st.storage.exists(rec.id))) {
        return res.status(410).json({ error: '文件已删除' });
      }
      const now = Date.now();
      const secondsRemaining = Math.max(0, Math.floor((new Date(rec.expireAt).getTime() - now) / 1000));
      const body = {
        id: rec.id,
        token: rec.token,
        originalName: rec.originalName,
        size: rec.size,
        mimeType: rec.mimeType,
        createdAt: rec.createdAt,
        expireAt: rec.expireAt,
        downloadCount: rec.downloadCount || 0,
        secondsRemaining,
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

  app.get('/tt/p/:token', (req, res) => {
    handleTempPublicHtml(req, res, 'info').catch(err => {
      console.error('[temp-transfer] tt/p', err);
      if (!res.headersSent) res.status(500).type('html').send(renderDownload404Html());
    });
  });
  app.get('/tt/d/:token', (req, res) => {
    handleTempPublicHtml(req, res, 'download').catch(err => {
      console.error('[temp-transfer] tt/d', err);
      if (!res.headersSent) res.status(500).type('html').send(renderDownload404Html());
    });
  });

  app.get('/tt/:token', downloadHandler);
}

module.exports = { registerTempTransferRoutes, parseTtl, getTt };
