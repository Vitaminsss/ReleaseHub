'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const {
  normalizeRelativePath,
  resolveUnderRoot,
  decodeUrlPathToRelative,
} = require('../lib/path-utils');

describe('path-utils', () => {
  it('normalizeRelativePath accepts nested paths', () => {
    assert.strictEqual(normalizeRelativePath('a/b/c.pdf'), 'a/b/c.pdf');
    assert.strictEqual(normalizeRelativePath('a\\b\\c.pdf'), 'a/b/c.pdf');
  });

  it('normalizeRelativePath strips traversal segments', () => {
    assert.strictEqual(normalizeRelativePath('../etc/passwd'), 'etc/passwd');
    assert.strictEqual(normalizeRelativePath('a/../b'), 'a/b');
    assert.strictEqual(normalizeRelativePath('..'), null);
  });

  it('resolveUnderRoot stays inside root', () => {
    const root = path.join(__dirname, 'fixtures-root');
    const fp = resolveUnderRoot(root, 'sub/file.txt');
    assert.ok(fp);
    assert.ok(fp.startsWith(path.resolve(root)));
  });

  it('decodeUrlPathToRelative', () => {
    assert.strictEqual(decodeUrlPathToRelative('a%2Fb/c.pdf'), 'a/b/c.pdf');
  });
});
