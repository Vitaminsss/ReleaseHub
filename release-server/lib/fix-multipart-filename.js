'use strict';

/**
 * busboy/multer 常将 multipart 里 filename 的 UTF-8 字节按 latin1 读入，导致中文等显示为乱码。
 * 若字符串中已出现 codePoint > 0xFF，通常表示已是正确 Unicode，不再二次解码。
 *
 * @param {string | undefined | null} name
 * @returns {string}
 */
function fixMultipartOriginalName(name) {
  if (name == null || name === undefined) return '';
  const s = String(name);
  if (!s) return s;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 0xff) return s;
  }
  try {
    const fixed = Buffer.from(s, 'latin1').toString('utf8');
    if (fixed && fixed !== s && !/[\uFFFD]/.test(fixed)) return fixed;
  } catch {
    /* ignore */
  }
  return s;
}

/**
 * @returns {import('multer').Options['fileFilter']}
 */
function multerFixOriginalNameFileFilter() {
  return (req, file, cb) => {
    file.originalname = fixMultipartOriginalName(file.originalname);
    cb(null, true);
  };
}

module.exports = { fixMultipartOriginalName, multerFixOriginalNameFileFilter };
