const { test, describe } = require('node:test');
const assert = require('assert');
const { listDirectoryLevel, breadcrumbSegments, collectUnderPrefix } = require('../lib/file-tree');

describe('file-tree', () => {
  const entries = [
    { relativePath: 'a.txt', size: 1 },
    { relativePath: 'dir/b.pdf', size: 2 },
    { relativePath: 'dir/sub/c.png', size: 3 },
  ];

  test('listDirectoryLevel root', () => {
    const { folders, files } = listDirectoryLevel(entries, '');
    assert.strictEqual(files.length, 1);
    assert.strictEqual(files[0].name, 'a.txt');
    assert.strictEqual(folders.length, 1);
    assert.strictEqual(folders[0].name, 'dir');
  });

  test('listDirectoryLevel subfolder', () => {
    const { folders, files } = listDirectoryLevel(entries, 'dir');
    assert.strictEqual(files.length, 1);
    assert.strictEqual(files[0].name, 'b.pdf');
    assert.strictEqual(folders.length, 1);
    assert.strictEqual(folders[0].name, 'sub');
  });

  test('breadcrumbSegments', () => {
    const crumbs = breadcrumbSegments('dir/sub');
    assert.strictEqual(crumbs.length, 3);
    assert.strictEqual(crumbs[0].label, '根目录');
    assert.strictEqual(crumbs[2].path, 'dir/sub');
  });

  test('collectUnderPrefix', () => {
    const all = collectUnderPrefix(entries, '');
    assert.strictEqual(all.length, 3);
    const underDir = collectUnderPrefix(entries, 'dir');
    assert.strictEqual(underDir.length, 2);
  });
});
