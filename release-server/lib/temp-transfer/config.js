const path = require('path');
const fs = require('fs');
const { MAX_UPLOAD_MB } = require('../upload-limits');

/**
 * @typedef {object} TempTransferConfig
 * @property {boolean} enabled
 * @property {string} rootDir
 * @property {number} defaultTtlMinutes
 * @property {number[]} allowedTtlsMinutes
 * @property {number} maxTtlMinutes
 * @property {number} maxFileSizeBytes
 * @property {number} sweepIntervalMs
 * @property {number} pendingMaxAgeMs pending 中 .part 超过该时长视为孤儿（可删）
 */

function parseIntList(s, fallback) {
  if (s == null || String(s).trim() === '') return fallback;
  return String(s)
    .split(',')
    .map(p => parseInt(p.trim(), 10))
    .filter(n => Number.isFinite(n) && n > 0);
}

/**
 * @param {string} rootDir
 * @returns {TempTransferConfig}
 */
function loadTempTransferConfig(rootDir) {
  const defaultTtls = [30, 60, 180, 360, 720, 1440];
  const list = parseIntList(process.env.TEMP_TRANSFER_ALLOWED_TTLS, defaultTtls);
  let uniqueSorted = [...new Set(list.filter(n => n > 0))].sort((a, b) => a - b);
  if (!uniqueSorted.length) uniqueSorted = [...defaultTtls];
  const maxTtl = Math.max(...uniqueSorted);
  const def = parseInt(process.env.TEMP_TRANSFER_DEFAULT_TTL_MINUTES, 10);
  let defaultTtlMinutes = Number.isFinite(def) && def > 0 ? def : 1440;
  if (!uniqueSorted.includes(defaultTtlMinutes)) {
    defaultTtlMinutes = uniqueSorted.includes(1440) ? 1440 : uniqueSorted[0] || 60;
  }
  defaultTtlMinutes = Math.min(defaultTtlMinutes, maxTtl);
  const maxMb = parseInt(process.env.TEMP_TRANSFER_MAX_FILE_SIZE_MB, 10);
  const maxFileSizeBytes = (Number.isFinite(maxMb) && maxMb > 0 ? maxMb : MAX_UPLOAD_MB) * 1024 * 1024;
  const sweepSec = parseInt(process.env.TEMP_TRANSFER_SWEEP_INTERVAL_SECONDS, 10);
  const sweepIntervalMs = (Number.isFinite(sweepSec) && sweepSec >= 10 ? sweepSec : 60) * 1000;
  const rawEnabled = process.env.TEMP_TRANSFER_ENABLED;
  const enabled = rawEnabled === undefined || rawEnabled === '' ? true : rawEnabled === 'true' || rawEnabled === '1';

  const pendingMin = parseInt(process.env.TEMP_TRANSFER_PENDING_MAX_AGE_MINUTES, 10);
  const pendingMaxAgeMs =
    Number.isFinite(pendingMin) && pendingMin > 0 ? pendingMin * 60 * 1000 : 24 * 60 * 60 * 1000;

  return {
    enabled,
    rootDir: path.resolve(rootDir),
    defaultTtlMinutes,
    allowedTtlsMinutes: uniqueSorted,
    maxTtlMinutes: maxTtl,
    maxFileSizeBytes,
    sweepIntervalMs,
    pendingMaxAgeMs,
  };
}

function ensureRootDir(config) {
  if (!fs.existsSync(config.rootDir)) {
    fs.mkdirSync(config.rootDir, { recursive: true });
  }
}

module.exports = { loadTempTransferConfig, ensureRootDir };
