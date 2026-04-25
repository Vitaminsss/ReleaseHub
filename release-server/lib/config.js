require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const fs = require('fs');
const { defaultAdminPasswordHash } = require('./admin-password-defaults');
const { normalizeBaseUrl } = require('./base-url');
const { loadTempTransferConfig, ensureRootDir } = require('./temp-transfer/config');

const RELEASES_DIR = process.env.RELEASES_DIR || path.join(__dirname, '..', 'releases');
const RESOURCE_LIBRARIES_DIR =
  process.env.RESOURCE_LIBRARIES_DIR || path.join(__dirname, '..', 'resource-libraries');
const TEMP_TRANSFER_DIR =
  process.env.TEMP_TRANSFER_DIR || path.join(__dirname, '..', 'temp-transfers');

const TEMP_TRANSFER = loadTempTransferConfig(TEMP_TRANSFER_DIR);
if (TEMP_TRANSFER.enabled) {
  ensureRootDir(TEMP_TRANSFER);
}

const CONFIG = {
  JWT_SECRET: process.env.JWT_SECRET || 'change-this-secret-in-production',
  ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH || defaultAdminPasswordHash(),
  RELEASES_DIR,
  RESOURCE_LIBRARIES_DIR,
  TEMP_TRANSFER_DIR,
  TEMP_TRANSFER,
  BASE_URL: normalizeBaseUrl(process.env.BASE_URL || 'http://localhost:3721'),
};

if (!fs.existsSync(CONFIG.RELEASES_DIR)) {
  fs.mkdirSync(CONFIG.RELEASES_DIR, { recursive: true });
}

if (!fs.existsSync(CONFIG.RESOURCE_LIBRARIES_DIR)) {
  fs.mkdirSync(CONFIG.RESOURCE_LIBRARIES_DIR, { recursive: true });
}

module.exports = CONFIG;
