# Release Hub 向后兼容说明

本版本重构了代码结构与管理后台（Vue3），**不改变**既有数据布局与对外契约。

## 磁盘数据（完全保留）

- `releases/<app>/<版本目录>/`（Tauri 多为 `v*`；**通用**可为任意合法目录名，不限 `v` 前缀）
- `releases/<app>/latest.json` 已发布元数据（Tauri `platforms` / 通用 `files` 形状不变）
- `.meta/<app>.json` 应用类型（`tauri` / `general`）与可选 **`displayName`**（软件展示名；缺省时界面回退为包名）
- `.notes-cache/<app>.json` 各版本说明草稿
- 根目录 `.env`（`BASE_URL`、`JWT_SECRET`、`ADMIN_PASSWORD_HASH` 等）

升级后**无需**迁移或批量重写历史文件；服务启动即可读取旧数据。

## HTTP 接口（旧路径全部保留）

以下路径行为与旧版一致（仅**新增**接口，不删除、不改语义）：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/login` | 登录 |
| GET | `/api/settings` | 设置 |
| POST | `/api/base-url` | 更新 BASE_URL |
| POST | `/api/change-password` | 改密 |
| GET | `/api/apps` | 应用列表（新增字段 `displayName`、`displayLabel`，旧客户端可忽略） |
| POST | `/api/apps` | 创建应用（可选 body `displayName`；`name` 仍为包名） |
| PATCH | `/api/apps/:app/meta` | 更新元数据（如 `displayName`） |
| POST | `/api/apps/:app/rename` | **新增** 重命名包（body `newName`）；迁移数据并刷新 `latest` 内 URL |
| DELETE | `/api/apps/:app` | 删除应用 |
| GET | `/api/apps/:app/meta` | 元数据 |
| GET | `/api/apps/:app/versions` | 版本列表 |
| GET | `/api/apps/:app/notes-drafts` | 草稿 |
| PUT | `/api/apps/:app/versions/:ver/notes` | 保存草稿 |
| POST | `/api/apps/:app/versions/:ver/upload` | 上传 |
| DELETE | `/api/apps/:app/versions/:ver/files/:filename` | 删文件 |
| DELETE | `/api/apps/:app/versions/:ver` | 删版本 |
| GET | `/api/apps/:app/versions/:ver/preview-release` | 发布预览 |
| POST | `/api/apps/:app/publish` | 写入 `latest.json` |
| GET | `/api/apps/:app/latest` | 当前发布（需登录） |
| GET | `/releases/:app/latest.json` | 对外 `latest.json`（Tauri updater） |
| GET | `/api/public/:app/latest` | 公开 JSON（与 `latest.json` 同源） |
| GET | `/d/:app/:version/:filename` | 下载落地页（保留） |
| GET | `/app/:app/latest` | **新增** 302 到当前已发布版本的 `/app/:app/:version`（与 Vue `/app/:name` 不冲突） |
| GET | `/app/:app/:version` | **新增** 公开版本浏览页（列表 → `/d/...`） |
| GET | `/:app/:v/:filename` | 短链直链（非 api/releases/public/d/app；**通用**时第二段可不以 `v` 开头） |

## 新增接口（可选使用，不影响旧客户端）

- `GET /api/health` — 部署与健康探测
- `PATCH /api/apps/:app/latest` — 仅更新请求体中出现的已发布字段（如 `notes`、`pub_date`、`platforms`、`files`），**不会**在只改 `notes` 时删除另一侧历史字段
- `POST /api/apps/:app/latest/refresh-urls` — 按当前 `BASE_URL` 与磁盘刷新下载 URL；请求体可选 `{ "mode": "merge" | "replace" }`，默认 **`merge`**（合并刷新，保留磁盘匹配不到的已发布条目）；**`replace`** 为整表替换，可能丢失手工条目
- `GET /api/public/:app/latest/download` — 结构化最新下载信息；`?redirect=1` 时 **302** 到当前已发布主文件直链（按磁盘 + `BASE_URL` 解析）；Tauri 可选 `&platform=windows-x86_64` 等

## `latest.json` 字段

- 未对既有字段做重命名或删减；新能力仅通过**可选**扩展字段或**新 URL** 提供。
- `PATCH` / `refresh-urls` 仅在用户操作时写回磁盘，不会在启动时批量改写历史文件。

## 管理后台

- 旧版单文件 `public/index.html` 已由 **Vue3 构建产物** 替代。
- **子路径部署**（默认 Nginx 前缀 `releasehub`）时，浏览器访问形如 `https://域名/releasehub/`，前端资源与 `fetch` 使用同一前缀（如 `/releasehub/api/...`），经反代后 Node 仍收到 `/api/...`。
- 本地开发：在 `frontend/` 执行 `npm install` && `npm run dev`（默认 `VITE_BASE=/`，Vite 将 `/api`、`/d`、`/app` 等代理到 `3721`）；生产构建由 `deploy.sh` 根据 `NGINX_PREFIX` 注入 `VITE_BASE`。
- **通用**类型版本目录名不强制 `v` 前缀；**Tauri** 仍为严格 SemVer + `v*` 目录习惯。
