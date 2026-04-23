# Release Hub 向后兼容说明

本版本重构了代码结构与管理后台（Vue3），**不改变**既有数据布局与对外契约。

## 磁盘数据（完全保留）

- `releases/<app>/v*/` 版本目录
- `releases/<app>/latest.json` 已发布元数据（Tauri `platforms` / 通用 `files` 形状不变）
- `.meta/<app>.json` 应用类型（`tauri` / `general`）
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
| GET | `/api/apps` | 应用列表 |
| POST | `/api/apps` | 创建应用 |
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
| GET | `/d/:app/:version/:filename` | 下载落地页 |
| GET | `/:app/:v/:filename` | 短链直链（非 api/releases/public） |

## 新增接口（可选使用，不影响旧客户端）

- `GET /api/health` — 部署与健康探测
- `PATCH /api/apps/:app/latest` — 仅更新请求体中出现的已发布字段（如 `notes`、`pub_date`、`platforms`、`files`），**不会**在只改 `notes` 时删除另一侧历史字段
- `POST /api/apps/:app/latest/refresh-urls` — 按当前 `BASE_URL` 与磁盘刷新下载 URL；请求体可选 `{ "mode": "merge" | "replace" }`，默认 **`merge`**（合并刷新，保留磁盘匹配不到的已发布条目）；**`replace`** 为整表替换，可能丢失手工条目
- `GET /api/public/:app/latest/download` — 结构化最新下载信息；`?redirect=1` 可 302 跳转；Tauri 可选 `&platform=windows-x86_64` 等

## `latest.json` 字段

- 未对既有字段做重命名或删减；新能力仅通过**可选**扩展字段或**新 URL** 提供。
- `PATCH` / `refresh-urls` 仅在用户操作时写回磁盘，不会在启动时批量改写历史文件。

## 管理后台

- 旧版单文件 `public/index.html` 已由 **Vue3 构建产物** 替代。
- **子路径部署**（默认 Nginx 前缀 `releasehub`）时，浏览器访问形如 `https://域名/releasehub/`，前端资源与 `fetch` 使用同一前缀（如 `/releasehub/api/...`），经反代后 Node 仍收到 `/api/...`。
- 本地开发：在 `frontend/` 执行 `npm install` && `npm run dev`（默认 `VITE_BASE=/`，Vite 将 `/api` 代理到 `3721`）；生产构建由 `deploy.sh` 根据 `NGINX_PREFIX` 注入 `VITE_BASE`。
