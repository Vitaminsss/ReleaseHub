'use strict';

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { normalizeRelativePath, resolveUnderRoot } = require('./path-utils');
const { collectUnderPrefix, archiveBaseName } = require('./file-tree');

const ARCHIVE_MAX_BYTES = parseInt(process.env.ARCHIVE_MAX_BYTES, 10) || 500 * 1024 * 1024;
const ARCHIVE_MAX_FILES = parseInt(process.env.ARCHIVE_MAX_FILES, 10) || 500;

/**
 * @param {{ relativePath: string, size?: number }[]} entries
 * @param {string} [dirPath]
 */
function estimateArchive(entries, dirPath = '') {
  const list = collectUnderPrefix(entries, dirPath);
  let totalBytes = 0;
  for (const e of list) {
    totalBytes += typeof e.size === 'number' && Number.isFinite(e.size) ? e.size : 0;
  }
  return { totalBytes, fileCount: list.length, files: list };
}

/**
 * @returns {{ ok: true } | { ok: false, code: string, error: string, totalBytes: number, fileCount: number }}
 */
function checkArchiveLimits(entries, dirPath = '') {
  const { totalBytes, fileCount } = estimateArchive(entries, dirPath);
  if (fileCount > ARCHIVE_MAX_FILES) {
    return {
      ok: false,
      code: 'ARCHIVE_TOO_MANY_FILES',
      error: `文件夹包含 ${fileCount} 个文件，超过直链打包上限 ${ARCHIVE_MAX_FILES}。请使用分享页选择性下载。`,
      totalBytes,
      fileCount,
    };
  }
  if (totalBytes > ARCHIVE_MAX_BYTES) {
    return {
      ok: false,
      code: 'ARCHIVE_TOO_LARGE',
      error: `文件夹约 ${Math.ceil(totalBytes / 1024 / 1024)}MB，超过直链打包上限 ${Math.ceil(ARCHIVE_MAX_BYTES / 1024 / 1024)}MB。请使用分享页选择性下载。`,
      totalBytes,
      fileCount,
    };
  }
  return { ok: true, totalBytes, fileCount };
}

/**
 * Stream zip to Express response from disk root + relative paths in entries.
 * @param {import('express').Response} res
 * @param {string} filesRoot absolute path to files directory
 * @param {{ relativePath: string }[]} entries
 * @param {string} [dirPath] folder prefix inside library
 * @param {string} [downloadName] without .zip
 */
function streamZipFromEntries(res, filesRoot, entries, dirPath = '', downloadName) {
  const check = checkArchiveLimits(entries, dirPath);
  if (!check.ok) {
    const err = new Error(check.error);
    err.code = check.code;
    err.status = 413;
    err.data = check;
    throw err;
  }

  const list = collectUnderPrefix(entries, dirPath);
  const base = dirPath ? normalizeRelativePath(dirPath) : '';
  const prefix = base ? `${base}/` : '';
  const zipName = `${downloadName || archiveBaseName(dirPath)}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(zipName)}"`);

  const archive = archiver('zip', { zlib: { level: 1 } });
  archive.on('error', err => {
    if (!res.headersSent) res.status(500);
    res.end();
    console.error('archive error', err);
  });
  archive.pipe(res);

  for (const ent of list) {
    const rel = normalizeRelativePath(ent.relativePath);
    if (!rel) continue;
    const abs = resolveUnderRoot(filesRoot, rel);
    if (!abs || !fs.existsSync(abs)) continue;
    try {
      if (!fs.statSync(abs).isFile()) continue;
    } catch {
      continue;
    }
    const nameInZip = prefix && rel.startsWith(prefix) ? rel.slice(prefix.length) : rel;
    archive.file(abs, { name: nameInZip });
  }

  archive.finalize();
}

module.exports = {
  ARCHIVE_MAX_BYTES,
  ARCHIVE_MAX_FILES,
  estimateArchive,
  checkArchiveLimits,
  streamZipFromEntries,
};
