require('./lib/config');

const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const CONFIG = require('./lib/config');
const { registerRoutes } = require('./lib/routes');
const { resolveReleaseFile } = require('./lib/releases');
const { getTempTransferStore } = require('./lib/temp-transfer/instance');
const { startTempTransferSweeper } = require('./lib/temp-transfer/sweeper');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3721;

app.use(cors());
app.use(express.json());

/** 先注册含 GET /releases/:app/latest.json 的 API/路由，再挂 /releases 静态，否则 latest.json 会直出磁盘、无法按 BASE_URL 重灌 */
registerRoutes(app);

app.use('/releases', express.static(CONFIG.RELEASES_DIR));

app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const parts = req.path.split('/').filter(Boolean);
  if (parts.length !== 3) return next();
  const [appName, version, filename] = parts;
  if (['api', 'releases', 'public', 'app', 'd', 'r', 'rd', 'tt'].includes(appName)) return next();
  const filePath = resolveReleaseFile(appName, version, filename);
  if (!filePath || !fs.existsSync(filePath)) return next();
  try {
    if (!fs.statSync(filePath).isFile()) return next();
  } catch {
    return next();
  }
  res.sendFile(filePath);
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res, next) => {
  if (req.method !== 'GET') return next();
  if (
    req.path.startsWith('/api') ||
    req.path.startsWith('/releases') ||
    req.path.startsWith('/d/') ||
    req.path === '/d' ||
    req.path.startsWith('/app/') ||
    req.path.startsWith('/r/') ||
    req.path.startsWith('/rd/') ||
    req.path.startsWith('/tt/')
  ) {
    return next();
  }
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else next();
});

app.listen(PORT, () => {
  console.log(`🚀 数据分发控制台 running at http://localhost:${PORT}`);
  console.log(`📁 Releases dir: ${CONFIG.RELEASES_DIR}`);
  console.log(`📚 Resource libraries dir: ${CONFIG.RESOURCE_LIBRARIES_DIR}`);
  if (CONFIG.TEMP_TRANSFER?.enabled) {
    try {
      const store = getTempTransferStore();
      store
        .sweepOnStartup()
        .then(({ removed, errors }) => {
          if (removed > 0) console.log(`[temp-transfer] startup sweep removed ${removed}`);
          if (errors && errors.length) console.warn('[temp-transfer] startup sweep', errors);
        })
        .catch(e => console.error('[temp-transfer] startup sweep', e));
    } catch (e) {
      console.error('[temp-transfer] init', e);
    }
    startTempTransferSweeper();
    console.log(`📤 Temp transfer dir: ${CONFIG.TEMP_TRANSFER.rootDir}`);
  }
});
