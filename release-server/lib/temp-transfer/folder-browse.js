'use strict';

const { listDirectoryLevel, breadcrumbSegments, archiveBaseName } = require('../file-tree');
const { encodeRelativePathForUrl } = require('../path-utils');

/**
 * @param {string} base public base URL without trailing slash
 * @param {string} token
 * @param {string} [dirPath]
 */
function tempBrowseUrl(base, token, dirPath = '') {
  const t = encodeURIComponent(token);
  const pathQ = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
  return `${base}/tt/p/${t}${pathQ}`;
}

function tempArchiveUrl(base, token, dirPath = '') {
  const t = encodeURIComponent(token);
  const pathQ = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
  return `${base}/tt/${t}/archive${pathQ}`;
}

function tempFileDownloadUrl(base, token, relativePath) {
  const t = encodeURIComponent(token);
  const enc = encodeRelativePathForUrl(relativePath);
  return `${base}/tt/${t}/files/${enc}`;
}

/**
 * @param {import('./store').TransferRecord} rec
 * @param {string} base
 * @param {string} [currentPath]
 */
function toTempBrowsePayload(rec, base, currentPath = '') {
  const entries = (rec.entries || []).map(e => ({
    relativePath: e.relativePath,
    size: e.size,
  }));
  const normPath = currentPath ? String(currentPath) : '';
  const listing = listDirectoryLevel(entries, normPath || '');
  const crumbs = breadcrumbSegments(normPath || '').map(c => ({
    ...c,
    browseHref: tempBrowseUrl(base, rec.token, c.path),
  }));
  return {
    kind: 'temp',
    displayLabel: rec.originalName || '文件夹',
    description: '',
    path: normPath || '',
    breadcrumbs: crumbs,
    browseUrl: tempBrowseUrl(base, rec.token, normPath || ''),
    archiveUrl: tempArchiveUrl(base, rec.token, normPath || ''),
    folders: listing.folders.map(f => ({
      ...f,
      browseUrl: tempBrowseUrl(base, rec.token, f.path),
      archiveUrl: tempArchiveUrl(base, rec.token, f.path),
    })),
    files: listing.files.map(it => ({
      fileName: it.relativePath,
      displayName: it.name,
      size: it.size,
      directHref: tempFileDownloadUrl(base, rec.token, it.relativePath),
      landingHref: tempFileDownloadUrl(base, rec.token, it.relativePath),
    })),
  };
}

module.exports = {
  tempBrowseUrl,
  tempArchiveUrl,
  tempFileDownloadUrl,
  toTempBrowsePayload,
  archiveBaseName,
};
