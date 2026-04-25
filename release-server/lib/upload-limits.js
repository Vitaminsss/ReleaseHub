'use strict';

/** 应用版本上传、资源库上传、临时传输（未设 TEMP_TRANSFER_MAX_FILE_SIZE_MB 时）与 Nginx `client_max_body_size` 对齐 */
const MAX_UPLOAD_MB = 100;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

module.exports = { MAX_UPLOAD_MB, MAX_UPLOAD_BYTES };
