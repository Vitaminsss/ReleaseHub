'use strict';

const path = require('path');

/**
 * Normalize a relative path for storage (POSIX-style, no leading slash).
 * @param {string} raw
 * @returns {string | null} null if invalid
 */
function normalizeRelativePath(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/\\/g, '/');
  if (!s || s === '.' || s === '..') return null;
  if (s.startsWith('/')) s = s.slice(1);
  const parts = s.split('/').filter(p => p && p !== '.' && p !== '..');
  if (!parts.length) return null;
  if (parts.some(p => p === '..')) return null;
  return parts.join('/');
}

/**
 * Resolve relativePath under root; returns null if escapes root.
 * @param {string} root absolute directory
 * @param {string} relativePath
 * @returns {string | null} absolute file path
 */
function resolveUnderRoot(root, relativePath) {
  const norm = normalizeRelativePath(relativePath);
  if (!norm) return null;
  const base = path.resolve(root);
  const fp = path.resolve(base, norm);
  if (fp === base) return null;
  if (!fp.startsWith(base + path.sep)) return null;
  return fp;
}

/**
 * Encode relative path for URL segment (each part encoded).
 * @param {string} relativePath
 */
function encodeRelativePathForUrl(relativePath) {
  const norm = normalizeRelativePath(relativePath);
  if (!norm) return '';
  return norm.split('/').map(p => encodeURIComponent(p)).join('/');
}

/**
 * Decode URL path segments to normalized relative path.
 * @param {string} urlPath e.g. "a/b/c.pdf" or from splat
 */
function decodeUrlPathToRelative(urlPath) {
  if (urlPath == null) return null;
  const decoded = String(urlPath)
    .split('/')
    .map(seg => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })
    .join('/');
  return normalizeRelativePath(decoded);
}

module.exports = {
  normalizeRelativePath,
  resolveUnderRoot,
  encodeRelativePathForUrl,
  decodeUrlPathToRelative,
};
