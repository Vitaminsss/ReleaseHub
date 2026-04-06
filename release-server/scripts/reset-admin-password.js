#!/usr/bin/env node
/**
 * 将管理员密码重置为与「全新安装且未自定义 ADMIN_PASSWORD_HASH」时相同的初始密码（见 lib/admin-password-defaults.js）。
 * 需在 release-server 目录下存在可写的 .env（与 server.js 同级）。
 *
 * 用法：
 *   cd /path/to/release-server
 *   node scripts/reset-admin-password.js
 *   pm2 restart release-hub
 */

const fs = require('fs');
const path = require('path');
const { DEFAULT_ADMIN_PASSWORD, defaultAdminPasswordHash } = require('../lib/admin-password-defaults');

const root = path.join(__dirname, '..');
const ep = path.join(root, '.env');
const hash = defaultAdminPasswordHash();

let ec = fs.existsSync(ep) ? fs.readFileSync(ep, 'utf-8') : '';
if (ec.includes('ADMIN_PASSWORD_HASH=')) {
  ec = ec.replace(/ADMIN_PASSWORD_HASH=.*/m, `ADMIN_PASSWORD_HASH=${hash}`);
} else {
  ec += (ec && !ec.endsWith('\n') ? '\n' : '') + `ADMIN_PASSWORD_HASH=${hash}\n`;
}
fs.writeFileSync(ep, ec);

console.log(`已写入 ${ep}`);
console.log(`管理员密码已重置为初始值：${DEFAULT_ADMIN_PASSWORD}`);
console.log('请执行：pm2 restart release-hub（或你使用的进程管理方式）');
