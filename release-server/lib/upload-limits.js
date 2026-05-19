'use strict';

/** 应用版本上传、资源库上传、临时传输（未设 TEMP_TRANSFER_MAX_FILE_SIZE_MB 时）与 Nginx 上传子域上限对齐 */
const parsed = parseInt(process.env.MAX_UPLOAD_MB, 10);
const MAX_UPLOAD_MB = Number.isFinite(parsed) && parsed > 0 ? parsed : 2048;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

module.exports = { MAX_UPLOAD_MB, MAX_UPLOAD_BYTES };
