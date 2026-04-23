const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');

const META_DIR = path.join(__dirname, '..', '.meta');
const NOTES_DIR = path.join(__dirname, '..', '.notes-cache');

function metaPath(n) {
  return path.join(META_DIR, `${n}.json`);
}

function readAppMeta(n) {
  try {
    const o = JSON.parse(fs.readFileSync(metaPath(n), 'utf-8'));
    return o && typeof o === 'object' ? o : { repoType: 'general' };
  } catch {
    return { repoType: 'general' };
  }
}

function writeAppMeta(n, d) {
  if (!fs.existsSync(META_DIR)) fs.mkdirSync(META_DIR, { recursive: true });
  fs.writeFileSync(metaPath(n), JSON.stringify(d, null, 2), 'utf-8');
}

function deleteAppMeta(n) {
  try {
    fs.unlinkSync(metaPath(n));
  } catch {}
}

function notesPath(n) {
  return path.join(NOTES_DIR, `${n}.json`);
}

function readDrafts(n) {
  try {
    const o = JSON.parse(fs.readFileSync(notesPath(n), 'utf-8'));
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

function writeDrafts(n, d) {
  if (!fs.existsSync(NOTES_DIR)) fs.mkdirSync(NOTES_DIR, { recursive: true });
  const p = notesPath(n);
  if (Object.keys(d).length === 0) {
    try {
      fs.unlinkSync(p);
    } catch {}
    return;
  }
  fs.writeFileSync(p, JSON.stringify(d, null, 2), 'utf-8');
}

function setDraft(app, ver, text) {
  const d = readDrafts(app);
  if (!text || !String(text).trim()) delete d[ver];
  else d[ver] = String(text);
  writeDrafts(app, d);
}

function removeDraft(app, ver) {
  const d = readDrafts(app);
  delete d[ver];
  writeDrafts(app, d);
}

function deleteDraftFile(n) {
  try {
    fs.unlinkSync(notesPath(n));
  } catch {}
}

function appDirExists(app) {
  return fs.existsSync(path.join(CONFIG.RELEASES_DIR, app));
}

module.exports = {
  readAppMeta,
  writeAppMeta,
  deleteAppMeta,
  readDrafts,
  setDraft,
  removeDraft,
  deleteDraftFile,
  appDirExists,
};
