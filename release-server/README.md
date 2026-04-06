# Release Hub

Tauri 应用发布管理后台：多应用、多版本、文件上传、`latest.json` 一键发布。对外提供 `**/releases/:appName/latest.json**` 供 Tauri updater 拉取。

---

## 管理后台：登录方式

- 管理页面与 **API 同源**（由同一 Node 服务提供静态页与接口）。
- **只需输入管理员密码**，无需填写服务器地址；请用浏览器直接打开已部署的地址（例如 `http://服务器IP/`、`http://服务器IP:3721` 或 `https://你的域名/`）。

---

## Linux 一键部署

### 前置条件

- Ubuntu/Debian 等（脚本使用 `apt` 安装 Node.js 20）
- 具有 `sudo` 权限
- 在**仓库根目录**执行（`deploy.sh` 与 `server.js` 同级）；程序与 `**releases/`**、`**.env`** 均放在该目录下，**不再使用** `/opt/release-hub`。

### 步骤

```bash
scp -r release-server/ user@your-server:~/
ssh user@your-server
cd ~/release-server

chmod +x deploy.sh
bash deploy.sh
```

### Nginx：交互与非交互

在**交互式终端**中运行 `deploy.sh` 时，脚本会询问：

> 是否安装并启用 Nginx，将 HTTP 80 反代到本机 :3721？

- 直接回车或输入 `y`：**安装并配置 Nginx**（访问 `http://<公网IP>/`）。
- 输入 `n`：**不安装 Nginx**（通常访问 `http://<公网IP>:3721`）。

**非交互**环境（如 CI、管道、无 TTY）不会提问，请用环境变量显式指定：


| 变量             | 含义                                                                  |
| -------------- | ------------------------------------------------------------------- |
| `USE_NGINX=1`  | 安装并配置 Nginx                                                         |
| `USE_NGINX=0`  | 不安装 Nginx                                                           |
| `SKIP_NGINX=1` | 与 `USE_NGINX=0` 相同（兼容旧用法）                                           |
| `NGINX_PREFIX` | 非交互时指定 **HTTP 路径前缀**（仅字母数字 `_` `-`），如 `release-hub`；留空表示占用整站根路径 `/` |
| `USE_HTTPS=0` | 已启用 Nginx 时**不尝试**自动申请证书（仅 HTTP）；可配合 `DOMAIN` 生成 `http://域名` 的 **BASE_URL** |
| `USE_HTTPS=1` 或未设置 | 已启用 Nginx 时**尝试**自动 HTTPS（见下方「HTTPS 自动试签发」） |
| `DOMAIN` | 非交互时优先使用的域名；未设置时若 `hostname -f` 为合法 FQDN（含 `.` 且非 `localhost`）则自动采用 |
| `CERTBOT_EMAIL` | Let's Encrypt 注册邮箱（可选；缺省为 `admin@域名`） |


未设置且非交互时，**默认不安装 Nginx**。

```bash
USE_NGINX=1 bash deploy.sh   # CI 中强制安装 Nginx
USE_NGINX=0 bash deploy.sh   # CI 中跳过 Nginx
USE_NGINX=1 NGINX_PREFIX=release-hub bash deploy.sh   # 仅反代到 http://<IP>/release-hub/，避免占满 80 端口根路径
USE_NGINX=1 DOMAIN=releases.example.com bash deploy.sh   # 非交互：自动试签发 HTTPS（见下）
USE_NGINX=1 USE_HTTPS=0 DOMAIN=releases.example.com bash deploy.sh   # 仅用 HTTP，但 BASE_URL 用域名
```

交互式部署时，若启用 Nginx，脚本会询问路径前缀；留空则与以前一致（`location /`）。填写 `release-hub` 时，访问地址为 `http://<公网IP>/release-hub/`，首次生成的 **BASE_URL** 为 `http://<公网IP>/release-hub`（管理页与前端会自动适配子路径）。

### HTTPS 自动试签发（Let's Encrypt）

在**已安装 Nginx** 的前提下（交互式默认会走该流程，除非设置 `USE_HTTPS=0`）：

1. **域名**：交互式会询问一次（留空则跳过证书申请）；非交互式使用 `DOMAIN`，否则在 `hostname -f` 为合法 FQDN 时自动采用。
2. **DNS 预检**：脚本的公网 IP（`curl` 检测）须与域名 `A`/`AAAA` 记录之一一致（需安装 `dig`，通常来自 `dnsutils` / `bind9-dnsutils`）。不一致则**不调用 certbot**，Nginx 保持 HTTP，**BASE_URL** 仍为 `http://域名/...`（便于稍后修好 DNS 再部署）。
3. **试签发**：`certbot certonly --nginx --dry-run`（staging，不占正式额度）。仅当 dry-run **成功** 后才执行正式 `certbot --nginx` 并配置 HTTPS 与跳转。
4. **失败回退**：任一步失败（dry-run、正式申请、certbot 安装失败等）会恢复 `server_name _` 的 HTTP 反代，**保留域名**写入 **BASE_URL**（`http://`），可在修正 DNS/防火墙后再次运行 `deploy.sh` 或手动 `sudo certbot --nginx -d 你的域名`。

### 部署结果摘要

- 安装 Node.js 20（若未安装）、PM2。
- 若启用 Nginx：写入 `/etc/nginx/sites-available/release-hub`，HTTP 80 → `127.0.0.1:3721`。
- **程序与数据目录**：`deploy.sh` 所在目录（与 `server.js` 同级），其中 `**releases/`** 存放安装包与 `latest.json`，`**.env`** 在同目录。
- 首次生成 `.env`（含 `JWT_SECRET`、`ADMIN_PASSWORD_HASH`、`RELEASES_DIR`（指向本目录下 `releases/`）、`BASE_URL`、`PORT`）。启用 Nginx 且无路径前缀时首次 `BASE_URL` 多为 `http://<公网IP>`（无端口）；有前缀时为 `http://<公网IP>/<前缀>`；若配置了域名且 HTTPS 未成功，则可能为 `http://<域名>/...`；HTTPS 成功时为 `https://<域名>/...`；未启用 Nginx 时为 `http://<公网IP>:3721`。
- PM2 进程名：`release-hub`；防火墙在启用 Nginx 时通常放行 **80** 与 **3721**；仅在 HTTPS 成功时额外放行 **443**。

**默认密码**：`admin123`，登录后请在「设置」中修改，并核对 **BASE_URL**。

---

## 修改密码与忘记密码

### 在网页中修改

「设置」中填写 **当前密码**、新密码并确认。

接口：`POST /api/change-password`（需登录，Header：`Authorization: Bearer <token>`）

请求体 JSON：

```json
{
  "oldPassword": "当前密码",
  "newPassword": "新密码至少8位"
}
```

- 当前密码错误时返回 **HTTP 400**（不会把登录态清掉）。
- 新密码至少 8 位。

### 忘记密码（在服务器上重置）

需要能 SSH 登录服务器，先 `cd` 到你的**项目根目录**（与 `server.js`、`deploy.sh` 同级），再执行（示例将新密码设为 `MyNewPass123`，请自行替换）：

```bash
cd ~/release-server   # 换成你 clone 的实际路径
node -e "const b=require('bcryptjs'); console.log(b.hashSync('MyNewPass123', 10))"
```

将输出的**整段哈希**写入该目录下的 `.env` 中 `ADMIN_PASSWORD_HASH=`（替换原有值），例如：

```bash
# 编辑 .env，修改一行：
# ADMIN_PASSWORD_HASH=$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

pm2 restart release-hub
```

---

## BASE_URL 与下载链接

文件直链与 `latest.json` 内 `platforms.*.url` 依赖 `.env` 中的 **BASE_URL**。若与浏览器实际访问的协议/域名不一致，请在「设置」中修改，或编辑 `.env` 后执行 `pm2 restart release-hub`。

使用 HTTPS 时请将 `BASE_URL` 设为 `https://你的域名`。

---

## 使用流程（管理后台）

1. 浏览器打开部署地址，**仅输入密码**登录。
2. **新建应用** → 填写应用标识（如 `my-tauri-app`）。
3. **新建版本** → 如 `v1.2.0`。
4. **上传** 安装包及对应 `.sig`（Tauri 热更新需要有效签名）。
5. 填写**更新日志**（草稿保存在服务端 `.notes-cache/`，换浏览器或刷新后仍会加载）→ **发布为最新版本**（若仅需纯下载、暂无 `.sig`，可勾选 **强制发布**）。
6. **查看接口** 中复制 `latest.json` URL，填入 Tauri 配置。

---

## 服务管理（PM2）


| 操作   | 命令                        |
| ---- | ------------------------- |
| 查看状态 | `pm2 status`              |
| 查看日志 | `pm2 logs release-hub`    |
| 停止   | `pm2 stop release-hub`    |
| 启动   | `pm2 start release-hub`   |
| 重启   | `pm2 restart release-hub` |
| 移除进程 | `pm2 delete release-hub`  |
| 保存列表 | `pm2 save`                |


---

## Tauri 项目配置示例

```json
{
  "plugins": {
    "updater": {
      "pubkey": "你的公钥内容",
      "endpoints": [
        "https://your-domain.com/releases/my-tauri-app/latest.json"
      ]
    }
  }
}
```

将域名、路径中的应用标识换成你的实际 **BASE_URL** 与应用名。

---

## 服务器目录结构（仓库根目录）

```
release-server/          # 或你 clone 后的目录名，与 deploy.sh 同级
├── deploy.sh
├── server.js
├── package.json
├── node_modules/
├── .env
├── public/
│   └── index.html
└── releases/
    └── my-app/
        ├── latest.json
        └── v1.2.0/
            ├── …
            └── *.sig
```

---

## API 一览


| 方法   | 路径                                    | 认证    | 说明                              |
| ---- | ------------------------------------- | ----- | ------------------------------- |
| POST | `/api/login`                          | 否     | 登录                              |
| GET  | `/api/settings`                       | 是     | 当前 `BASE_URL` 等                 |
| POST | `/api/base-url`                       | 是     | 更新 `BASE_URL`                   |
| POST | `/api/change-password`                | 是     | 修改密码（需 `oldPassword`）           |
| GET  | `/api/apps`                           | 是     | 应用列表                            |
| POST | `/api/apps`                           | 是     | 创建应用                            |
| GET  | `/api/apps/:app/versions`             | 是     | 版本与文件                           |
| GET  | `/api/apps/:app/notes-drafts`         | 是     | 各版本「更新日志」草稿（服务端持久化）             |
| PUT  | `/api/apps/:app/versions/:ver/notes`  | 是     | 保存某一版本的更新日志草稿（body: `{ text }`） |
| POST | `/api/apps/:app/versions/:ver/upload` | 是     | 上传文件                            |
| POST | `/api/apps/:app/publish`              | 是     | 发布 `latest.json`                |
| GET  | `/releases/:app/latest.json`          | **否** | Tauri updater                   |


---

## Nginx 与 HTTPS

- 由 `deploy.sh` 生成的配置：`/etc/nginx/sites-available/release-hub`
- 重载：`sudo nginx -t && sudo systemctl reload nginx`
- 仓库内 [nginx.conf](nginx.conf) 可供对照与手工覆盖（域名等）
- 一键部署已包含 **DNS 预检 → certbot dry-run → 正式签发**，失败自动回退 HTTP；详见上文「HTTPS 自动试签发」。

手动补证书（例如首次仅用 HTTP 部署后再开 HTTPS）：

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

配置 HTTPS 后，在后台将 **BASE_URL** 改为 `https://你的域名`（若 `deploy.sh` 已成功签发，首次 `.env` 通常已是 `https://`）。

---

## 本地开发

```bash
npm install
npm run dev
```

默认端口 **3721**（环境变量 `PORT` 可覆盖）。本地访问 `http://localhost:3721`，登录方式同样是**仅密码**。