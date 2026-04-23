require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const fs = require('fs');
const { defaultAdminPasswordHash } = require('./admin-password-defaults');

const RELEASES_DIR = process.env.RELEASES_DIR || path.join(__dirname, '..', 'releases');

const CONFIG = {
  JWT_SECRET: process.env.JWT_SECRET || 'change-this-secret-in-production',
  ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH || defaultAdminPasswordHash(),
  RELEASES_DIR,
  BASE_URL: process.env.BASE_URL || 'http://localhost:3721',
};

if (!fs.existsSync(CONFIG.RELEASES_DIR)) {
  fs.mkdirSync(CONFIG.RELEASES_DIR, { recursive: true });
}

module.exports = CONFIG;
