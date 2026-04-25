const CONFIG = require('../config');
const { TempTransferStore } = require('./store');

let _store = null;

function getTempTransferStore() {
  if (!CONFIG.TEMP_TRANSFER || !CONFIG.TEMP_TRANSFER.enabled) return null;
  if (!_store) {
    _store = new TempTransferStore({
      rootDir: CONFIG.TEMP_TRANSFER.rootDir,
      pendingMaxAgeMs: CONFIG.TEMP_TRANSFER.pendingMaxAgeMs,
    });
    _store.initDirs();
  }
  return _store;
}

module.exports = { getTempTransferStore };
