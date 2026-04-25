const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

/**
 * 本地磁盘存储（临时文件 blob）
 * 存储路径：{blobsDir}/{id}.bin
 */
class LocalStorageProvider {
  constructor(blobsDir) {
    this.blobsDir = blobsDir;
  }

  ensureDir() {
    if (!fs.existsSync(this.blobsDir)) {
      fs.mkdirSync(this.blobsDir, { recursive: true });
    }
  }

  /** @returns {string} 绝对路径 */
  blobPath(id) {
    return path.join(this.blobsDir, `${id}.bin`);
  }

  /**
   * 将已落盘的临时文件移动为最终 blob
   * @param {string} fromAbsPath
   * @param {string} id
   */
  async putFromFile(fromAbsPath, id) {
    this.ensureDir();
    const to = this.blobPath(id);
    await fsp.rename(fromAbsPath, to);
  }

  /** @returns {import('fs').ReadStream} */
  createReadStream(id) {
    return fs.createReadStream(this.blobPath(id));
  }

  async exists(id) {
    const p = this.blobPath(id);
    try {
      const s = await fsp.stat(p);
      return s.isFile();
    } catch {
      return false;
    }
  }

  async delete(id) {
    const p = this.blobPath(id);
    try {
      await fsp.unlink(p);
    } catch (e) {
      if (e && e.code !== 'ENOENT') throw e;
    }
  }

  /**
   * 先尝试删除，失败时有限次重试（避免 Windows/并发下短暂占用直接产生孤儿文件）
   * @param {string} id
   * @param {{ retries?: number, delayMs?: number }} [opts]
   */
  async deleteWithRetry(id, opts = {}) {
    const retries = opts.retries != null && opts.retries > 0 ? opts.retries : 5;
    const baseDelay = opts.delayMs != null && opts.delayMs > 0 ? opts.delayMs : 150;
    let lastErr;
    for (let i = 0; i < retries; i++) {
      const p = this.blobPath(id);
      try {
        await fsp.unlink(p);
        return;
      } catch (e) {
        if (e && e.code === 'ENOENT') return;
        lastErr = e;
        if (i < retries - 1) {
          await new Promise(r => setTimeout(r, baseDelay * (i + 1)));
        }
      }
    }
    if (lastErr) throw lastErr;
  }
}

module.exports = { LocalStorageProvider };
