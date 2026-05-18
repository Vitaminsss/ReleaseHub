const path = require('path');

/**
 * Legacy `filename=` must be ISO-8859-1 per RFC 2616. Node rejects header values with
 * code points > 255 (ERR_INVALID_CHAR), so Unicode names cannot appear raw in filename="".
 * Real names go in RFC 5987 `filename*=UTF-8''…` (percent-encoded ASCII only).
 * @param {string} name
 * @returns {string}
 */
function legacyFilenameForQuotedString(name) {
  const s = String(name || 'download').replace(/[\r\n]/g, ' ');
  const extRaw = path.extname(s);
  const ext = extRaw.replace(/[^\w.-]/gi, '').slice(0, 32);
  const baseRaw = path.basename(s, extRaw);
  let baseOut = '';
  for (let i = 0; i < baseRaw.length; i++) {
    const c = baseRaw.charCodeAt(i);
    if (c === 9) {
      baseOut += ' ';
      continue;
    }
    if (c < 32 || c === 127) {
      baseOut += '_';
      continue;
    }
    if (c === 34 || c === 92) {
      baseOut += '_';
      continue;
    }
    if (c <= 255) {
      baseOut += baseRaw[i];
      continue;
    }
    baseOut += '_';
  }
  let collapsed = baseOut.replace(/^[\s._]+|[\s._]+$/g, '').replace(/_+/g, '_');
  if (!collapsed) collapsed = 'download';
  const combined = `${collapsed}${ext || ''}`;
  return combined.slice(0, 200);
}

/**
 * RFC 5987: attachment; filename="latin1-safe"; filename*=UTF-8''percent-encoded
 * @param {string} name
 * @returns {string}
 */
function contentDispositionAttachment(name) {
  const legacy = legacyFilenameForQuotedString(name);
  const encoded = encodeURIComponent(String(name || 'download').replace(/[\r\n]/g, ' '));
  return `attachment; filename="${legacy}"; filename*=UTF-8''${encoded}`;
}

module.exports = { contentDispositionAttachment };
