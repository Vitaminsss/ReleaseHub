# 数据分发控制台（Release Hub）

Tauri 应用发布管理后台：多应用、多版本、文件上传、`latest.json` 一键发布。对外提供 `**/releases/:appName/latest.json**` 供 Tauri updater 拉取。

---

## 管理后台：登录方式

- 管理页面与 **API 同源**（由同一 Node 服务提供静态页与接口）。
- **只需输入管理员密码**，无需填写服务器地址；请用浏览器直接打开已部署的地址（例如 `http://服务器IP/releasehub/`（默认前缀）、`http://服务器IP:3721` 或 `https://你的域名/releasehub/`）。

---

## Linux 一键部署

### 前置条件

- Ubuntu/Debian 等（脚本使用 `apt` 安装 Node.js 20）
- 具有 `sudo` 权限
- 在 **`release-server` 目录**执行（与 `deploy.sh`、`server.js` 同级）；程序与 `**releases/`**、`**.env`** 均放在该目录下，**不再使用** `/opt/release-hub`。（若 monorepo 根目录下还有一层 `ReleaseHub/`，请先 `cd release-server`。）

### 启用 HTTPS（Let's Encrypt）— 部署前必读

`deploy.sh` 会在满足条件时**自动**申请证书，**无交互提问**。若要 HTTPS 一次成功，请先完成：

1. **DNS**：将域名的 **A 记录**（或 AAAA）指向本服务器的公网 IP，并等待生效（通常数分钟至半小时）。可用下面命令检查（将 `your-domain.com` 换成你的域名）：
  ```bash
   dig +short your-domain.com A
  ```
2. **端口**：确保本机 **80** 端口对公网开放（Let's Encrypt HTTP-01 验证需要；443 在证书签发成功后由脚本提示放行防火墙，若你自行管理防火墙请一并放行）。
3. **传入域名**：部署时通过环境变量指定公网域名，例如：
  ```bash
   DOMAIN=www.example.com bash deploy.sh
  ```
   勿依赖 `hostname -f`（云主机常为内网名，与证书域名无关）。

脚本顺序为：**DNS 预检** → `certbot certonly --nginx --dry-run` → 通过后正式 `**certbot certonly --nginx`（只签发证书，不改 Nginx）**，再由脚本写入 **80 跳转 + 443 含 `include .../locations/`**。任一步失败则保持 **HTTP**，部署不中断；修好 DNS 后可再次运行 `deploy.sh`。勿使用会改写整站配置的 `certbot --nginx --redirect`，否则易丢失反代导致域名 **502**。

跳过自动申请证书（仅 HTTP，仍可用 `DOMAIN` 生成 `BASE_URL`）：

```bash
USE_HTTPS=0 DOMAIN=www.example.com bash deploy.sh
```

### 步骤

```bash
scp -r release-server/ user@your-server:~/
ssh user@your-server
cd ~/release-server

chmod +x deploy.sh
bash deploy.sh
```

### Nginx 与环境变量

默认**不询问**；安装 **Nginx**（HTTP 80 反代到本机 `:3721`）；路径前缀默认为 `**releasehub`**（访问 `http://<公网IP>/releasehub/`）。HTTPS 在未设置 `USE_HTTPS=0` 且已安装 Nginx 时**自动尝试** Let's Encrypt（需 `DOMAIN` 与 DNS，见上文「启用 HTTPS」）。


| 变量              | 含义                                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `USE_NGINX=0`   | **不**安装 Nginx（直连 `http://<公网IP>:3721`）                                                                                       |
| `SKIP_NGINX=1`  | 与 `USE_NGINX=0` 相同（兼容旧用法）                                                                                                    |
| 未设置 `USE_NGINX` | **默认安装 Nginx**                                                                                                               |
| `NGINX_PREFIX`  | **HTTP 路径前缀**（仅字母数字 `_` `-`）。**未设置**时默认为 `releasehub`；**显式设为空** `NGINX_PREFIX=` 表示整站根路径 `/`；其他值如 `NGINX_PREFIX=my-app` 会覆盖默认 |
| `USE_HTTPS=0`   | 不尝试证书（仅 HTTP）；可配合 `DOMAIN` 生成 **BASE_URL**                                                                                   |
| 未设置 `USE_HTTPS` | 在已装 Nginx 时自动尝试签发（见「HTTPS 自动试签发」）                                                                                            |
| `DOMAIN`        | **公网域名**（如 `www.example.com`），须与 DNS 一致；**建议显式设置**。未设置时脚本会尝试 `hostname -f`（非内网保留名时采用）。`*.local` / `*.lan` 等内网保留名会被忽略         |
| `CERTBOT_EMAIL` | Let's Encrypt 注册邮箱（可选；缺省为 `admin@域名`）                                                                                        |


```bash
bash deploy.sh
DOMAIN=www.example.com bash deploy.sh          # 指定域名，自动试签发 HTTPS（DNS 须已指向本机）
USE_HTTPS=0 DOMAIN=www.example.com bash deploy.sh   # 仅用 HTTP，BASE_URL 仍可用域名
USE_NGINX=0 bash deploy.sh   # 不装 Nginx
NGINX_PREFIX= bash deploy.sh   # 整站根路径 /（无前缀）
NGINX_PREFIX=custom bash deploy.sh   # 自定义前缀 /custom/
```

### HTTPS 自动试签发（Let's Encrypt）

在**已安装 Nginx** 的前提下：

1. **域名**：优先环境变量 `**DOMAIN`**；若未设置且 `hostname -f` 为**非**内网保留名则自动采用。云主机常见 `hostname` 与证书域名无关，**请设置 `DOMAIN`**。
2. **DNS 预检**：脚本的公网 IP（`curl` 检测）须与域名 `A`/`AAAA` 记录之一一致（需安装 `dig`，通常来自 `dnsutils` / `bind9-dnsutils`）。不一致则**不调用 certbot**，Nginx 保持 HTTP。
3. **试签发**：`certbot certonly --nginx --dry-run`（staging）。仅当 dry-run **成功** 后才执行正式 `certbot certonly --nginx`。
4. **写入 Nginx**：证书落在 `/etc/letsencrypt/live/<域名>/` 后，由 `deploy.sh` 覆盖写入主 `server` 块（HTTP 301 + HTTPS + `include` locations），**不由 certbot 自动改配置**。
5. **失败**：任一步失败则保持 HTTP，不中断部署；可修正 DNS 后再次运行 `deploy.sh`。手动补证书时优先 `sudo certbot certonly --nginx -d 你的域名`，再运行 `deploy.sh` 以刷新 Nginx。

### 部署结果摘要

- 安装 Node.js 20（若未安装）、PM2。
- 若启用 Nginx：主 server 块写入 `/etc/nginx/conf.d/<根域标签>.conf`（由域名倒数第二段命名，如 `www.example.com` → `example.conf`；无可用域名时为 `_default.conf`）；Release Hub 的反向代理写在 `/etc/nginx/conf.d/locations/release-hub.conf`（`include` 进主 server 块）。HTTP 80 → `localhost:3721`；默认路径前缀为 `releasehub`，除非 `NGINX_PREFIX=` 空或自定义。可与其它服务共用同一主 server 块，各自只维护 `locations/` 下自己的片段。脚本会**删除**发行版自带的 `/etc/nginx/sites-enabled/default`，否则与无域名时的 `server_name _` 冲突，nginx 会忽略其一并导致反代不生效；若你依赖该默认站点请自行恢复后再合并配置。
- **程序与数据目录**：`deploy.sh` 所在目录（与 `server.js` 同级），其中 `**releases/`** 存放安装包与 `latest.json`，`**.env`** 在同目录。
- 首次生成 `.env`（含 `JWT_SECRET`、`ADMIN_PASSWORD_HASH`、`RELEASES_DIR`（指向本目录下 `releases/`）、`BASE_URL`、`PORT`）。启用 Nginx 且使用默认前缀时首次 `BASE_URL` 多为 `http://<公网IP>/releasehub`；无前缀（整站根）时为 `http://<公网IP>`；若配置了域名且 HTTPS 未成功，则可能为 `http://<域名>/...`；HTTPS 成功时为 `https://<域名>/...`；未启用 Nginx 时为 `http://<公网IP>:3721`。
- PM2 进程名：`release-hub`；防火墙在启用 Nginx 时通常放行 **80** 与 **3721**；仅在 HTTPS 成功时额外放行 **443**。

**默认密码**：`rainy`，登录后请在「设置」中修改，并核对 **BASE_URL**。

---

## 修改密码与忘记密码

### 在网页中修改

「设置」中填写 **当前密码**、新密码并确认。新密码**至少 5 位**。

接口：`POST /api/change-password`（需登录，Header：`Authorization: Bearer <token>`）

请求体 JSON：

```json
{
  "oldPassword": "当前密码",
  "newPassword": "新密码至少5位"
}
```

- 当前密码错误时返回 **HTTP 400**（不会把登录态清掉）。
- 新密码至少 5 位。

### 忘记密码（重置为初始密码）

需要能 SSH 登录服务器，进入**项目根目录**（与 `server.js`、`deploy.sh` 同级，即 `release-server` 目录），执行仓库自带的重置脚本，将管理员密码恢复为默认 `**rainy`**，并写回同目录下的 `.env`：

```bash
cd ~/release-server   # 换成你 clone 的实际路径
node scripts/reset-admin-password.js
pm2 restart release-hub
```

脚本会更新或追加 `ADMIN_PASSWORD_HASH=` 一行；重启后使用默认密码 `rainy` 登录，再在「设置」中改为新密码。

**备选（自定义新密码）**：若不想恢复为 `rainy`，可自行生成 bcrypt 哈希写入 `.env`：

```bash
cd ~/release-server
node -e "const b=require('bcryptjs'); console.log(b.hashSync('你的新密码', 10))"
```

将输出的**整段哈希**写入 `.env` 中 `ADMIN_PASSWORD_HASH=`（替换原有值），然后 `pm2 restart release-hub`。

---

## BASE_URL 与下载链接

文件直链与 `latest.json` 内 `platforms.*.url` 依赖 `.env` 中的 **BASE_URL**。若与浏览器实际访问的协议/域名不一致，请在「设置」中修改，或编辑 `.env` 后执行 `pm2 restart release-hub`。

使用 HTTPS 且默认路径前缀时请将 `BASE_URL` 设为 `https://你的域名/releasehub`（无末尾 `/`，与后台「设置」一致）。

### 公开下载页（分享链接）

- **始终指向当前已发布（推荐）**：`{BASE_URL}/app/{包名}/latest`，**302** 到 `{BASE_URL}/app/{包名}/{当前版本目录}`（与 Vue 后台 `/app/{包名}` 不冲突）。
- **固定某一版本**：`{BASE_URL}/app/{包名}/{版本目录}`。标题为软件名 + 版本号，**不展示包名**；可在后台填写 **软件简介**（`.meta` 的 `description`）居中展示。**点击文件名**进入 `/d/...`，右侧 **下载** 为直链。列表**不展示** `.sig`。
- **单文件落地页（兼容保留）**：`{BASE_URL}/d/{包名}/{版本目录}/{文件名}`。
- **直链**：`{BASE_URL}/{包名}/{版本目录}/{文件名}`（静态中间件 + `latest.json` 内 URL）。

`GET /api/public/{包名}/latest/download?redirect=1` **302** 到当前已发布主安装包直链（按**磁盘**与当前 **BASE_URL** 计算，不依赖 JSON 内旧 URL）。

### 临时传输（可与发布系统独立使用）

上传后按 **TTL** 自动失效，文件存于本机 `temp-transfers/`（可通过 `TEMP_TRANSFER_DIR` 指定）。对外链接与 `BASE_URL` 一致。管理员登录后，Vue 总览中可查看进行中的文件并**取消**；以下 HTML 为访客公开页，风格与资源库单文件落地页一致，并**显示剩余时间**（页面内实时倒计时）。

| 说明 | 路径 / 方法 |
| ---- | ------------- |
| 上传 | `POST /api/temp-transfer/upload`，`multipart/form-data`：`file`（必填）、`ttlMinutes`（可选，须在允许列表中） |
| 公开 · 信息页 | `GET /tt/p/{token}`（说明 + 直链、链到仅下载页；过期/删除 `410` HTML） |
| 公开 · 仅下载页 | `GET /tt/d/{token}`（大按钮、与 `/d/` 同气质；**剩余时间** 倒计时） |
| 直链（文件流） | `GET /tt/{token}`（成功 `200`；`413` / `422` 等见接口错误码） |
| 元信息 JSON | `GET /api/temp-transfer/{token}/meta` |
| 允许 TTL 与默认 | `GET /api/temp-transfer/allowed-ttls` |
| 管理 · 列表 | `GET /api/temp-transfer/list`（需 `Authorization: Bearer`） |
| 管理 · 单条 | `GET /api/temp-transfer/item/{id}`（需登录） |
| 管理 · 取消 | `DELETE /api/temp-transfer/item/{id}`（需登录，立即删除文件与链） |

环境变量（可选，未设时有默认值）：`TEMP_TRANSFER_ENABLED`、`TEMP_TRANSFER_DIR`、`TEMP_TRANSFER_DEFAULT_TTL_MINUTES`、`TEMP_TRANSFER_ALLOWED_TTLS`（逗号分隔，如 `30,60,180,360,720,1440`）、`TEMP_TRANSFER_MAX_FILE_SIZE_MB`、`TEMP_TRANSFER_SWEEP_INTERVAL_SECONDS`。

---

## 使用流程（管理后台）

1. 浏览器打开部署地址，**仅输入密码**登录。
2. **新建应用** → 填写**软件名**（可选，用于展示）与**包名**（目录与 URL，如 `my-tauri-app`）。
3. **新建版本** → Tauri 须 `v1.2.0` 形式 SemVer；**通用**类型目录名任意合法标识（如 `2.0.2`、`2024-01`），不强制 `v` 前缀。
4. **上传** 安装包及对应 `.sig`（Tauri 热更新需要有效签名）。
5. 填写**更新日志**（草稿保存在服务端 `.notes-cache/`，换浏览器或刷新后仍会加载）→ **发布为最新版本**（Tauri 若缺少 `.sig`，界面会**弹出确认**后仍允许发布；与旧版「强制发布」语义一致）。
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
        "https://your-domain.com/releasehub/releases/my-tauri-app/latest.json"
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
├── lib/                 # 路由与服务逻辑（由 server.js 加载）
├── frontend/            # Vue3 管理后台源码（Vite）
├── node_modules/
├── .env
├── public/              # 静态资源（含 Vue 构建产物 index.html + assets/）
│   ├── index.html
│   └── assets/
├── COMPATIBILITY.md     # 向后兼容说明
└── releases/
    └── my-app/
        ├── latest.json
        └── v1.2.0/
            ├── …
            └── *.sig
```

---

## API 一览


| 方法    | 路径                                    | 认证    | 说明                                                                   |
| ----- | ------------------------------------- | ----- | -------------------------------------------------------------------- |
| POST  | `/api/login`                          | 否     | 登录                                                                   |
| GET   | `/api/settings`                       | 是     | 当前 `BASE_URL` 等                                                      |
| POST  | `/api/base-url`                       | 是     | 更新 `BASE_URL`                                                        |
| POST  | `/api/change-password`                | 是     | 修改密码（需 `oldPassword`，新密码至少 5 位）                                      |
| GET   | `/api/apps`                           | 是     | 应用列表（含 `displayName` / `displayLabel`）                              |
| POST  | `/api/apps`                           | 是     | 创建应用；body 可选 `displayName`（软件名），`name` 为包名                         |
| PATCH | `/api/apps/:app/meta`                 | 是     | 更新 `.meta`（`displayName`、`description` 软件简介等）                         |
| POST  | `/api/apps/:app/rename`               | 是     | 重命名包名；body `{ "newName": "..." }`，迁移 releases / `.meta` / 草稿并合并刷新 URL |
| GET   | `/api/apps/:app/meta`                | 是     | 读取应用元数据（`repoType`、`displayName` 等）                              |
| GET   | `/api/apps/:app/versions`             | 是     | 版本与文件                                                                |
| GET   | `/api/apps/:app/notes-drafts`         | 是     | 各版本「更新日志」草稿（服务端持久化）                                                  |
| PUT   | `/api/apps/:app/versions/:version/notes`  | 是     | 保存某一版本的更新日志草稿（body: `{ text }`）                                      |
| POST  | `/api/apps/:app/versions/:version/upload` | 是     | 上传文件                                                                 |
| POST  | `/api/apps/:app/publish`              | 是     | 发布 `latest.json`                                                     |
| PATCH | `/api/apps/:app/latest`               | 是     | 直接更新当前已发布元数据（如 `notes` / `pub_date` / `platforms` / `files`）         |
| POST  | `/api/apps/:app/latest/refresh-urls`  | 是     | 刷新下载 URL；body 可选 `{ "mode": "merge" \| "replace" }`，默认 `merge`，`replace` 为整表按磁盘重建 |
| GET   | `/api/apps/:app/latest`               | 是     | 当前已发布 JSON（同 `latest.json`）                                          |
| GET   | `/api/public/:app/latest`             | **否** | 公开最新 JSON（204 表示尚无发布）                                                |
| GET   | `/api/public/:app/latest/download`    | **否** | 最新下载信息 JSON；`?redirect=1` 302 跳转；Tauri 可加 `&platform=windows-x86_64` |
| GET   | `/api/health`                         | **否** | 健康检查 `{ ok: true }`（部署脚本会探测）                                         |
| GET   | `/releases/:app/latest.json`          | **否** | Tauri updater                                                        |
| GET   | `/app/:app/latest`                   | **否** | 302 到当前已发布的 `/app/:app/:版本目录`                                       |
| GET   | `/app/:app/:version`                 | **否** | 公开版本浏览页（直链下载 + 可选 `/d/...` 详情）                                |


---

## Nginx 与 HTTPS

- 由 `deploy.sh` 生成：**主配置** `/etc/nginx/conf.d/<根域标签>.conf`，**Release Hub 片段** `/etc/nginx/conf.d/locations/release-hub.conf`（详见上文「部署结果摘要」）。
- 若日志出现 `conflicting server name "_"` 或 **502**（且 `pm2 status` 正常）：多为旧配置与发行版 `sites-enabled/default` 冲突。执行 `sudo rm -f /etc/nginx/sites-enabled/default`，再删除有问题的 `/etc/nginx/conf.d/_default.conf`（或对应主配置）后重新运行 `deploy.sh`，或手动为无域名站点加上 `listen 80 default_server` 并 `nginx -t`。
- **HTTP 正常、HTTPS 502**（`curl http://localhost:3721/` 为 200）：多为曾用 `**certbot --nginx` 改写配置**，导致 80/443 的 `server` 里丢了 `include /etc/nginx/conf.d/locations/*.conf;`。当前脚本已改为 `**certbot certonly` + 自管 80/443**；若仍为旧配置，请重新运行 `bash deploy.sh`，或手动在 443 的 `server { }` 内补上上述 `include` 后 `sudo nginx -t && sudo systemctl reload nginx`。
- 重载：`sudo nginx -t && sudo systemctl reload nginx`
- 仓库内 [nginx.conf](nginx.conf) 可供对照与手工覆盖（域名等）
- 一键部署已包含 **DNS 预检 → certbot certonly dry-run → 正式 certonly → 脚本写入 80/443**，失败则保持 HTTP；详见上文「启用 HTTPS」与「HTTPS 自动试签发」。

手动补证书（例如首次仅用 HTTP 部署后再开 HTTPS）：

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot certonly --nginx -d your-domain.com
bash deploy.sh   # 刷新主 server 块（含 HTTPS 与 locations include）
```

配置 HTTPS 后，在后台将 **BASE_URL** 改为 `https://你的域名`（若 `deploy.sh` 已成功签发，首次 `.env` 通常已是 `https://`）。

---

## 本地开发

**后端 API：**

```bash
npm install
npm run dev
```

默认端口 **3721**（环境变量 `PORT` 可覆盖）。

**管理后台（Vue3，热更新）：**

```bash
cd frontend
npm install
npm run dev
```

Vite 默认 **5173**。开发模式下 `VITE_BASE=/`（见 `frontend/.env.development`），已将 `/api`、`/releases`、`/d`、`/app` 代理到 `http://127.0.0.1:3721`，请先启动后端再开前端。

**子路径与生产构建：**

- 默认 Nginx 前缀为 `releasehub` 时，生产构建的静态资源与前端请求基址为 **`/releasehub/`**，由 `deploy.sh` 在构建前端前设置环境变量 **`VITE_BASE`**（与 `NGINX_PREFIX` 一致）。
- 若使用 `NGINX_PREFIX=`（整站根路径），则 **`VITE_BASE=/`**，与直连 `:3721` 一致。

**仅构建管理后台到 `public/`：**

```bash
cd frontend && npm install && npm run build
```

未设置 `VITE_BASE` 时，生产模式默认按 **`/releasehub/`** 打包（与默认部署一致）。需要根路径包时可执行：

```bash
cd frontend && VITE_BASE=/ npm run build
```

登录方式仍是**仅密码**。向后兼容约定见 [COMPATIBILITY.md](COMPATIBILITY.md)。