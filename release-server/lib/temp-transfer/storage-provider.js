/**
 * 存储抽象，便于后续接入 S3 兼容服务（如 MinIO、AWS S3、阿里云 OSS 等）。
 * 当前实现见 local-storage.js 中的 LocalStorageProvider。
 *
 * @typedef {object} StorageProvider
 * @property {(id: string) => Promise<void>} putFromFile 将本地已存在文件作为 blob 存为 id
 * @property {(id: string) => import('fs').ReadStream} createReadStream
 * @property {(id: string) => Promise<boolean>} exists
 * @property {(id: string) => Promise<void>} delete
 */

// 占位；未来可添加 S3CompatibleProvider 等实现
module.exports = {};
