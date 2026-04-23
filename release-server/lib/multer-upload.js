const multer = require('multer');
const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');
const { readAppMeta } = require('./meta-notes');
const { isSemVer2CoreWithVPrefix, isValidGeneralVersionForUpload } = require('./releases');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(CONFIG.RELEASES_DIR, req.params.app, req.params.version);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, file.originalname),
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
});

const { libraryFilesDir, ensureLibraryFilesDir } = require('./resource-libraries');

const resourceLibraryStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const name = req.params.name;
    ensureLibraryFilesDir(name);
    cb(null, libraryFilesDir(name));
  },
  filename: (req, file, cb) => cb(null, file.originalname),
});

const resourceLibraryUpload = multer({
  storage: resourceLibraryStorage,
  limits: { fileSize: 500 * 1024 * 1024 },
});

function validateVersionForUpload(req, res, next) {
  const { app, version } = req.params;
  const meta = readAppMeta(app);
  if (meta.repoType === 'tauri') {
    if (!isSemVer2CoreWithVPrefix(version)) {
      return res.status(400).json({
        error:
          'Tauri 库版本须符合 SemVer 2.0：MAJOR.MINOR.PATCH 三段非负整数，且各位数不可前导零（例 v1.0.0）',
      });
    }
  } else if (!isValidGeneralVersionForUpload(version)) {
    return res.status(400).json({
      error:
        '通用库版本目录名仅含字母、数字、点、下划线、连字符（不可含 /、\\ 或 ..），长度不超过 120',
    });
  }
  next();
}

module.exports = { upload, validateVersionForUpload, resourceLibraryUpload };
