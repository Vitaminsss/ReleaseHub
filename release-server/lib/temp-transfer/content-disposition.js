/**
 * RFC 5987: attachment; filename="ascii"; filename*=UTF-8''utf8
 * @param {string} name
 * @returns {string}
 */
function contentDispositionAttachment(name) {
  const raw = String(name || 'download').replace(/[\r\n"]/g, '_');
  const encoded = encodeURIComponent(String(name || 'download').replace(/[\r\n]/g, ' '));
  return `attachment; filename="${raw}"; filename*=UTF-8''${encoded}`;
}

module.exports = { contentDispositionAttachment };
