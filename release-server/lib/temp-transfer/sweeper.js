const CONFIG = require('../config');
const { getTempTransferStore } = require('./instance');

let intervalId = null;

function startTempTransferSweeper() {
  if (!CONFIG.TEMP_TRANSFER || !CONFIG.TEMP_TRANSFER.enabled) {
    return;
  }
  const run = () => {
    const store = getTempTransferStore();
    if (!store) return;
    store
      .runFullSweep()
      .then(({ removed, pendingRemoved, legacyTokensRemoved, errors, lastSweep }) => {
        const hasWork =
          removed > 0 || pendingRemoved > 0 || legacyTokensRemoved > 0 || (errors && errors.length);
        if (hasWork) {
          const parts = [
            `expired/records=${removed}`,
            `pending=${pendingRemoved}`,
            `legacyTomb=${legacyTokensRemoved}`,
            lastSweep ? ` ${lastSweep.durationMs}ms` : '',
          ];
          console.log(`[temp-transfer] sweeper: ${parts.join(', ')}` + (errors && errors.length ? ` errors=${errors.length}` : ''));
          if (errors && errors.length) console.warn('[temp-transfer] sweeper errors', errors);
        }
      })
      .catch(e => {
        console.error('[temp-transfer] sweeper', e);
      });
  };
  if (intervalId) return;
  const ms = Math.max(10000, CONFIG.TEMP_TRANSFER.sweepIntervalMs);
  setImmediate(run);
  intervalId = setInterval(run, ms);
}

module.exports = { startTempTransferSweeper };
