require('./lib/config');

const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const CONFIG = require('./lib/config');
const { registerRoutes } = require('./lib/routes');
const { resolveReleaseFile } = require('./lib/releases');

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
  if (['api', 'releases', 'public', 'app', 'd', 'r', 'rd'].includes(appName)) return next();
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
    req.path.startsWith('/rd/')
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
});
