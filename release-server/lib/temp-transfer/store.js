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
   */
  constructor(opts) {
    this.rootDir = path.resolve(opts.rootDir);
    this.metaDir = path.join(this.rootDir, 'meta');
    this.tokenDir = path.join(this.rootDir, 'token-index');
    this.blobsDir = path.join(this.rootDir, 'blobs');
    this.storage = new LocalStorageProvider(this.blobsDir);
  }

  initDirs() {
    fs.mkdirSync(this.metaDir, { recursive: true });
    fs.mkdirSync(this.tokenDir, { recursive: true });
    fs.mkdirSync(this.blobsDir, { recursive: true });
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
   * 过期/删除后 token 文件可写为 EXPIRED，便于返回 410 而非 404
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
   * @param {string} id
   */
  async removePhysical(id) {
    const rec = await this.readRecord(id);
    if (!rec) {
      const tip = this._guessTokenFileForId(id);
      for (const t of tip) {
        try {
          await fsp.unlink(t);
        } catch {}
      }
      await this.storage.delete(id);
      return;
    }
    const tip = this.tokenIndexPath(rec.token);
    try {
      if (tip) await fsp.writeFile(tip, 'GONE', 'utf-8');
    } catch (e) {
      if (e && e.code !== 'ENOENT') throw e;
    }
    try {
      await fsp.unlink(this.metaPath(id));
    } catch (e) {
      if (e && e.code !== 'ENOENT') throw e;
    }
    await this.storage.delete(id);
  }

  /** 孤儿恢复：不扫描全 token 时仅删 blob+meta；token 可尝试按 meta 再删。 */
  _guessTokenFileForId() {
    return [];
  }

  /**
   * 标记为已清理（文件可能已删）
   * @param {string} id
   * @param {string} [reason]
   */
  async markDeleted(id, reason) {
    const rec = await this.readRecord(id);
    if (!rec) return;
    rec.status = 'deleted';
    if (reason) rec.deletedReason = reason;
    try {
      await this.writeRecord(rec);
    } catch {}
  }

  /**
   * 扫描所有 meta，清理过期
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
      const expired = new Date(rec.expireAt).getTime() <= Date.now();
      if (!expired) continue;
      if (rec.status === 'deleted') {
        // 元信息残留，再删一次索引与 blob
        try {
          await this.removePhysical(id);
          removed += 1;
        } catch (e) {
          errors.push(`${id}: ${e && e.message}`);
        }
        continue;
      }
      rec.status = 'expired';
      try {
        await this.writeRecord(rec);
      } catch (e) {
        errors.push(`${id} meta: ${e && e.message}`);
      }
      try {
        const tip = this.tokenIndexPath(rec.token);
        if (tip) await fsp.writeFile(tip, 'EXPIRED', 'utf-8');
      } catch (e) {
        if (e && e.code !== 'ENOENT') errors.push(`${id} token: ${e.message}`);
      }
      try {
        await this.storage.delete(id);
        removed += 1;
      } catch (e) {
        errors.push(`${id} blob: ${e && e.message}`);
      }
      rec.status = 'deleted';
      try {
        await this.writeRecord(rec);
      } catch {}
    }
    return { removed, errors };
  }

  /**
   * 服务启动时：补偿删除已明确过期但残留的文件
   */
  async sweepOnStartup() {
    return this.sweepExpired();
  }
}

module.exports = {
  TempTransferStore,
  randomId,
  randomToken,
};
