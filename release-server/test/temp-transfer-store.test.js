const { test, describe, before, after } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { TempTransferStore } = require('../lib/temp-transfer/store');

describe('TempTransferStore', () => {
  let root;
  let store;

  before(async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'rh-tt-'));
    store = new TempTransferStore({ rootDir: root, pendingMaxAgeMs: 60_000 });
    store.initDirs();
  });

  after(async () => {
    try {
      await fsp.rm(root, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test('createFromPartFile 将分片移入 blobs 并建立 meta 与 token', async () => {
    const part = path.join(root, 'pending', 'p.part');
    await fsp.writeFile(part, 'hello', 'utf-8');
    const rec = await store.createFromPartFile(
      { originalName: 'a.txt', size: 5, mimeType: 'text/plain', ttlMinutes: 60 },
      part,
    );
    assert.match(rec.id, /^[0-9a-f]{16}$/);
    const blob = path.join(root, 'blobs', `${rec.id}.bin`);
    const meta = path.join(root, 'meta', `${rec.id}.json`);
    const tip = path.join(root, 'token-index', rec.token);
    assert.strictEqual((await fsp.readFile(blob, 'utf-8')).trim(), 'hello');
    const raw = JSON.parse(await fsp.readFile(meta, 'utf-8'));
    assert.strictEqual(raw.originalName, 'a.txt');
    assert.strictEqual((await fsp.readFile(tip, 'utf-8')).trim(), rec.id);
    assert.ok(!fs.existsSync(part));
  });

  test('hardDeleteTransfer 后 blobs、meta、token-index 中对应文件均消失', async () => {
    const part = path.join(root, 'pending', 'p2.part');
    await fsp.writeFile(part, 'x', 'utf-8');
    const rec = await store.createFromPartFile(
      { originalName: 'b.bin', size: 1, mimeType: null, ttlMinutes: 60 },
      part,
    );
    await store.hardDeleteTransfer(rec);
    assert.ok(!fs.existsSync(path.join(root, 'blobs', `${rec.id}.bin`)));
    assert.ok(!fs.existsSync(path.join(root, 'meta', `${rec.id}.json`)));
    assert.ok(!fs.existsSync(path.join(root, 'token-index', rec.token)));
  });

  test('runFullSweep 清理过期记录（单轮硬删）', async () => {
    const id = '1234567890abcdef';
    const token = 'sweepTestToken9';
    const rec = {
      id,
      token,
      originalName: 'old.txt',
      size: 1,
      mimeType: null,
      createdAt: new Date(0).toISOString(),
      expireAt: new Date(0).toISOString(),
      status: 'active',
      downloadCount: 0,
    };
    store.initDirs();
    await fsp.writeFile(path.join(root, 'meta', `${id}.json`), JSON.stringify(rec), 'utf-8');
    await fsp.writeFile(path.join(root, 'token-index', token), id, 'utf-8');
    await fsp.writeFile(path.join(root, 'blobs', `${id}.bin`), 'z', 'utf-8');
    const r = await store.runFullSweep();
    assert.ok(r.removed >= 1);
    assert.ok(!fs.existsSync(path.join(root, 'blobs', `${id}.bin`)));
    assert.ok(!fs.existsSync(path.join(root, 'meta', `${id}.json`)));
    assert.ok(!fs.existsSync(path.join(root, 'token-index', token)));
  });

  test('sweepLegacyTombstoneTokens 删除旧版 EXPIRED 墓碑', async () => {
    store.initDirs();
    const tpath = path.join(root, 'token-index', 'legacyTomb1');
    await fsp.writeFile(tpath, 'EXPIRED', 'utf-8');
    const { removed } = await store.sweepLegacyTombstoneTokens();
    assert.ok(removed >= 1);
    assert.ok(!fs.existsSync(tpath));
  });

  test('sweepStalePending 删除过旧的 .part', async () => {
    const stale = path.join(root, 'pending', 'stale.part');
    await fsp.writeFile(stale, 'a', 'utf-8');
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await fsp.utimes(stale, old, old);
    const { removed } = await store.sweepStalePending();
    assert.ok(removed >= 1);
    assert.ok(!fs.existsSync(stale));
  });

  test('getDirectoryStats 返回各子目录文件计数', async () => {
    const st = await store.getDirectoryStats();
    assert.strictEqual(st.rootDir, path.resolve(root));
    assert.ok(typeof st.fileCounts.blobs === 'number');
  });
});
