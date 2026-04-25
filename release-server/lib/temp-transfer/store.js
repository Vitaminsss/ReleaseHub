const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { LocalStorageProvider } = require('./local-storage');

/** @typedef {'active'|'expired'|'deleted'} TransferStatus */

/**
 * @typedef {object} TransferRecord
 * @property {string} id
 * @property {string} token
 * @property {string} originalName
 * @property {number} size
 * @property {string} [mimeType]
 * @property {string} createdAt
 * @property {string} expireAt
 * @property {TransferStatus} status
 * @property {number} [downloadCount]
 */

/**
 * @typedef {object} TempTransferSweepSummary
 * @property {string} at ISO 时间
 * @property {number} removed 过期/残留 meta 已硬删除的条数
 * @property {number} pendingRemoved 清掉的 orphan .part 数
 * @property {number} legacyTokensRemoved 旧版 EXPIRED/GONE 墓碑文件数
 * @property {number} errorCount
 * @property {number} durationMs
 * @property {string[]} [errors] 全量（供日志；API 可裁剪）
 */

function randomId() {
  return crypto.randomBytes(8).toString('hex');
}

function randomToken() {
  return crypto.randomBytes(24).toString('base64url');
}

class TempTransferStore {
  /**
   * @param {object} opts
   * @param {string} opts.rootDir 根目录
   * @param {number} [opts.pendingMaxAgeMs] pending 中 .part 视为孤儿的时间阈值
   */
  constructor(opts) {
    this.rootDir = path.resolve(opts.rootDir);
    this.metaDir = path.join(this.rootDir, 'meta');
    this.tokenDir = path.join(this.rootDir, 'token-index');
    this.blobsDir = path.join(this.rootDir, 'blobs');
    this.pendingDir = path.join(this.rootDir, 'pending');
    this.storage = new LocalStorageProvider(this.blobsDir);
    this.pendingMaxAgeMs = opts.pendingMaxAgeMs != null && opts.pendingMaxAgeMs > 0 ? opts.pendingMaxAgeMs : 24 * 60 * 60 * 1000;

    /** @type {string | null} */
    this._lastSweepAt = null;
    /** @type {TempTransferSweepSummary | null} */
    this._lastSweepSummary = null;
  }

  initDirs() {
    fs.mkdirSync(this.metaDir, { recursive: true });
    fs.mkdirSync(this.tokenDir, { recursive: true });
    fs.mkdirSync(this.blobsDir, { recursive: true });
    fs.mkdirSync(this.pendingDir, { recursive: true });
  }

  /** @param {string} id */
  metaPath(id) {
    return path.join(this.metaDir, `${id}.json`);
  }

  /** @param {string} token */
  tokenIndexPath(token) {
    if (!/^[A-Za-z0-9_-]+$/.test(token) || token.length > 200) {
      return null;
    }
    return path.join(this.tokenDir, token);
  }

  /**
   * @param {{ originalName: string, size: number, mimeType?: string|null, ttlMinutes: number }} fields
   * @param {string} partFileAbs 上传落盘的临时文件
   */
  async createFromPartFile(fields, partFileAbs) {
    const id = randomId();
    const token = randomToken();
    const now = new Date();
    const expireAt = new Date(now.getTime() + fields.ttlMinutes * 60 * 1000);
    /** @type {TransferRecord} */
    const rec = {
      id,
      token,
      originalName: fields.originalName,
      size: fields.size,
      mimeType: fields.mimeType || null,
      createdAt: now.toISOString(),
      expireAt: expireAt.toISOString(),
      status: 'active',
      downloadCount: 0,
    };
    this.initDirs();
    const tip = this.tokenIndexPath(token);
    if (!tip) {
      const err = new Error('Invalid token path');
      err.code = 'INVALID_TOKEN';
      throw err;
    }
    const metaFile = this.metaPath(id);
    try {
      await this.storage.putFromFile(partFileAbs, id);
      await fsp.writeFile(metaFile, JSON.stringify(rec, null, 0), 'utf-8');
      await fsp.writeFile(tip, id, 'utf-8');
    } catch (e) {
      try {
        await fsp.unlink(tip);
      } catch {}
      try {
        await fsp.unlink(metaFile);
      } catch {}
      try {
        await this.storage.delete(id);
      } catch {}
      throw e;
    }
    return rec;
  }

  /** @param {string} id */
  async readRecord(id) {
    const p = this.metaPath(id);
    let raw;
    try {
      raw = await fsp.readFile(p, 'utf-8');
    } catch (e) {
      if (e && e.code === 'ENOENT') return null;
      throw e;
    }
    try {
      return /** @type {TransferRecord} */ (JSON.parse(raw));
    } catch {
      return null;
    }
  }

  /**
   * 兼容：旧版在 token 文件写过 EXPIRED / GONE；新逻辑不再写入，但读取仍识别直至被清扫删掉
   * @param {string} token
   * @returns {Promise<TransferRecord|null|{ __tomb: true, reason: string }>}
   */
  async getByToken(token) {
    const tip = this.tokenIndexPath(token);
    if (!tip) return null;
    let raw0;
    try {
      raw0 = (await fsp.readFile(tip, 'utf-8')).trim();
    } catch (e) {
      if (e && e.code === 'ENOENT') return null;
      throw e;
    }
    if (raw0 === 'EXPIRED' || raw0 === 'GONE') {
      return { __tomb: true, reason: raw0 };
    }
    if (!/^[0-9a-f]{16}$/.test(raw0)) return null;
    return this.readRecord(raw0);
  }

  /**
   * @param {string} id
   * @param {TransferRecord} rec
   */
  async writeRecord(rec) {
    await fsp.writeFile(this.metaPath(rec.id), JSON.stringify(rec, null, 0), 'utf-8');
  }

  /**
   * 下载前：记录仍 active 且未过期
   * @param {TransferRecord} rec
   */
  isUsable(rec) {
    if (!rec || rec.status === 'deleted') return false;
    if (new Date(rec.expireAt).getTime() <= Date.now()) return false;
    return true;
  }

  /**
   * 硬删除：先 blob（可重试），再 token，再 meta。避免元数据已删而 blob 残留。
   * @param {TransferRecord} rec
   */
  async hardDeleteTransfer(rec) {
    const id = rec.id;
    await this.storage.deleteWithRetry(id);
    const tip = this.tokenIndexPath(rec.token);
    if (tip) {
      try {
        await fsp.unlink(tip);
      } catch (e) {
        if (e && e.code !== 'ENOENT') throw e;
      }
    }
    try {
      await fsp.unlink(this.metaPath(id));
    } catch (e) {
      if (e && e.code !== 'ENOENT') throw e;
    }
  }

  /**
   * 管理删除或补删：有记录则整链硬删；无记录则尽量删 blob（无 meta 时无法定位 token 文件）
   * @param {string} id
   */
  async removePhysical(id) {
    const rec = await this.readRecord(id);
    if (!rec) {
      try {
        await this.storage.deleteWithRetry(id);
      } catch (e) {
        if (e && e.code !== 'ENOENT') throw e;
      }
      return;
    }
    await this.hardDeleteTransfer(rec);
  }

  /**
   * 旧版在 token-index 中遗留的纯文本墓碑，直接删除小文件
   * @returns {Promise<{ removed: number, errors: string[] }>}
   */
  async sweepLegacyTombstoneTokens() {
    this.initDirs();
    let removed = 0;
    const errors = [];
    let names;
    try {
      names = await fsp.readdir(this.tokenDir);
    } catch (e) {
      errors.push(String(e && e.message));
      return { removed, errors };
    }
    for (const name of names) {
      const p = path.join(this.tokenDir, name);
      let raw;
      try {
        const st = await fsp.stat(p);
        if (!st.isFile()) continue;
        raw = (await fsp.readFile(p, 'utf-8')).trim();
      } catch (e) {
        errors.push(`${name}: ${e && e.message}`);
        continue;
      }
      if (raw === 'EXPIRED' || raw === 'GONE') {
        try {
          await fsp.unlink(p);
          removed += 1;
        } catch (e) {
          if (e && e.code !== 'ENOENT') errors.push(`${name}: ${e && e.message}`);
        }
      }
    }
    return { removed, errors };
  }

  /**
   * 删除过旧的 pending .part（上传中断/进程崩溃）
   * @returns {Promise<{ removed: number, errors: string[] }>}
   */
  async sweepStalePending() {
    this.initDirs();
    let removed = 0;
    const errors = [];
    const now = Date.now();
    const maxAge = this.pendingMaxAgeMs;
    let names;
    try {
      names = await fsp.readdir(this.pendingDir);
    } catch (e) {
      errors.push(String(e && e.message));
      return { removed, errors };
    }
    for (const name of names) {
      if (!name.endsWith('.part')) continue;
      const p = path.join(this.pendingDir, name);
      try {
        const st = await fsp.stat(p);
        if (!st.isFile()) continue;
        if (now - st.mtimeMs > maxAge) {
          await fsp.unlink(p);
          removed += 1;
        }
      } catch (e) {
        if (e && e.code === 'ENOENT') continue;
        errors.push(`${name}: ${e && e.message}`);
      }
    }
    return { removed, errors };
  }

  /**
   * 扫描 meta：过期或状态需收尾的记录一次硬删
   * @returns {Promise<{ removed: number, errors: string[] }>}
   */
  async sweepExpired() {
    this.initDirs();
    let removed = 0;
    const errors = [];
    let names;
    try {
      names = await fsp.readdir(this.metaDir);
    } catch (e) {
      errors.push(String(e && e.message));
      return { removed, errors };
    }
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const id = name.replace(/\.json$/, '');
      let rec;
      try {
        rec = await this.readRecord(id);
        if (!rec) continue;
      } catch (e) {
        errors.push(`${id}: ${e && e.message}`);
        continue;
      }
      const timeExpired = new Date(rec.expireAt).getTime() <= Date.now();
      const staleStatus = rec.status === 'deleted' || rec.status === 'expired';
      if (!timeExpired && !staleStatus) continue;
      try {
        await this.hardDeleteTransfer(rec);
        removed += 1;
      } catch (e) {
        errors.push(`${id}: ${e && e.message}`);
      }
    }
    return { removed, errors };
  }

  /**
   * 一次完整清扫：旧墓碑 token → 过期 meta 硬删 → 孤儿 pending
   * @returns {Promise<{ removed: number, pendingRemoved: number, legacyTokensRemoved: number, errors: string[], lastSweep: TempTransferSweepSummary }>}
   */
  async runFullSweep() {
    const t0 = Date.now();
    const allErrors = [];

    const leg = await this.sweepLegacyTombstoneTokens();
    allErrors.push(...leg.errors);

    const exp = await this.sweepExpired();
    allErrors.push(...exp.errors);

    const pend = await this.sweepStalePending();
    allErrors.push(...pend.errors);

    const removed = exp.removed;
    const pendingRemoved = pend.removed;
    const legacyTokensRemoved = leg.removed;
    const errorCount = allErrors.length;

    /** @type {TempTransferSweepSummary} */
    const lastSweep = {
      at: new Date().toISOString(),
      removed,
      pendingRemoved,
      legacyTokensRemoved,
      errorCount,
      durationMs: Date.now() - t0,
      errors: allErrors,
    };
    this._lastSweepAt = lastSweep.at;
    this._lastSweepSummary = lastSweep;

    return {
      removed,
      pendingRemoved,
      legacyTokensRemoved,
      errors: allErrors,
      lastSweep,
    };
  }

  /**
   * 服务启动/定时器：全量清扫
   */
  async sweepOnStartup() {
    return this.runFullSweep();
  }

  /**
   * 各子目录文件数，便于在设置中展示
   * @returns {Promise<{ rootDir: string, pendingDir: string, blobsDir: string, metaDir: string, tokenIndexDir: string, fileCounts: { pending: number, blobs: number, meta: number, tokenIndex: number } }>}
   */
  async getDirectoryStats() {
    this.initDirs();
    const countFiles = async dir => {
      let n = 0;
      try {
        const list = await fsp.readdir(dir);
        for (const name of list) {
          const p = path.join(dir, name);
          try {
            const s = await fsp.stat(p);
            if (s.isFile()) n += 1;
          } catch {
            // skip
          }
        }
      } catch {
        return 0;
      }
      return n;
    };
    return {
      rootDir: this.rootDir,
      pendingDir: this.pendingDir,
      blobsDir: this.blobsDir,
      metaDir: this.metaDir,
      tokenIndexDir: this.tokenDir,
      fileCounts: {
        pending: await countFiles(this.pendingDir),
        blobs: await countFiles(this.blobsDir),
        meta: await countFiles(this.metaDir),
        tokenIndex: await countFiles(this.tokenDir),
      },
    };
  }

  /**
   * @returns {TempTransferSweepSummary | null}
   */
  getLastSweepSummary() {
    return this._lastSweepSummary;
  }

  /**
   * @returns {string | null}
   */
  getLastSweepAt() {
    return this._lastSweepAt;
  }

  /**
   * 管理总览：未过期且仍为 active 的临时文件（按创建时间新到旧）
   * @returns {Promise<Array<{ id: string, token: string, originalName: string, size: number, mimeType: string|null, createdAt: string, expireAt: string, downloadCount: number, secondsRemaining: number }>>}
   */
  async listActiveForAdmin() {
    this.initDirs();
    let names;
    try {
      names = await fsp.readdir(this.metaDir);
    } catch {
      return [];
    }
    const now = Date.now();
    const out = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const id = name.replace(/\.json$/, '');
      const rec = await this.readRecord(id);
      if (!rec || rec.status !== 'active') continue;
      if (new Date(rec.expireAt).getTime() <= now) continue;
      out.push({
        id: rec.id,
        token: rec.token,
        originalName: rec.originalName,
        size: rec.size,
        mimeType: rec.mimeType || null,
        createdAt: rec.createdAt,
        expireAt: rec.expireAt,
        downloadCount: rec.downloadCount || 0,
        secondsRemaining: Math.max(0, Math.floor((new Date(rec.expireAt).getTime() - now) / 1000)),
      });
    }
    out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return out;
  }
}

module.exports = {
  TempTransferStore,
  randomId,
  randomToken,
};
