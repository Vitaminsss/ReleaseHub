const { fmtBytesServer, fileBadgeLabel } = require('./download-utils');

function htmlEsc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderDownload404Html() {
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>文件不存在 — ReleaseHub</title></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0c0b09;color:#ebe6df;font-family:system-ui,sans-serif;padding:24px">
<div style="text-align:center;max-width:420px">
<p style="font-size:12px;letter-spacing:.35em;text-transform:uppercase;color:#e8a035;margin-bottom:12px">ReleaseHub</p>
<h1 style="font-size:20px;font-weight:800;margin:0 0 10px">文件不存在</h1>
<p style="color:#9a9288;font-size:14px;line-height:1.6;margin:0">该资源可能已删除或链接有误。</p>
</div></body></html>`;
}

function renderDownloadPageHtml(opts) {
  const { appName, version, filename, size, badge, downloadHref } = opts;
  const cls = badge.cls;
  const badgeStyle =
    cls === 'sig'
      ? 'background:rgba(167,139,250,.12);border-color:rgba(167,139,250,.4);color:#a78bfa'
      : cls === 'win'
        ? 'background:rgba(110,181,255,.1);border-color:rgba(110,181,255,.35);color:#6eb5ff'
        : cls === 'linux'
          ? 'background:rgba(82,212,138,.1);border-color:rgba(82,212,138,.35);color:#52d48a'
          : cls === 'mac'
            ? 'background:rgba(232,160,53,.12);border-color:rgba(232,160,53,.35);color:#e8a035'
            : 'background:rgba(235,230,223,.06);border-color:rgba(235,230,223,.12);color:#9a9288';
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${htmlEsc(filename)} — ReleaseHub</title>
<style>
:root { --bg:#0c0b09; --text:#ebe6df; --text2:#9a9288; --accent:#e8a035; --border:rgba(235,230,223,0.08); }
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 20px}
body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(232,160,53,.028) 1px,transparent 1px),linear-gradient(90deg,rgba(232,160,53,.028) 1px,transparent 1px);background-size:24px 24px;pointer-events:none;z-index:0}
.wrap{position:relative;z-index:1;width:100%;max-width:480px}
.brand{font-size:11px;font-weight:700;color:var(--accent);letter-spacing:.35em;text-transform:uppercase;margin-bottom:18px;text-align:center}
.meta{font-size:14px;color:var(--text2);text-align:center;margin-bottom:22px;line-height:1.5}
.meta strong{color:var(--text);font-weight:600}
.card{border:1px solid var(--border);background:linear-gradient(165deg,#12100e 0%,#1a1714 100%);border-radius:8px;padding:28px 24px;box-shadow:0 24px 48px rgba(0,0,0,.35)}
.filename{font-size:17px;font-weight:700;word-break:break-all;line-height:1.45;margin-bottom:14px}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;margin-bottom:22px;font-size:14px;color:var(--text2)}
.badge{display:inline-flex;align-items:center;font-size:10px;letter-spacing:.6px;padding:4px 8px;border:1px solid;border-radius:4px;text-transform:uppercase;font-weight:600;${badgeStyle}}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px 20px;font-size:15px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;text-decoration:none;border-radius:6px;border:none;cursor:pointer;background:linear-gradient(180deg,#f0b24a 0%,var(--accent) 100%);color:#1a1208;transition:filter .15s,box-shadow .15s}
.btn:hover{filter:brightness(1.06);box-shadow:0 0 24px rgba(232,160,53,.25)}
.footer{margin-top:28px;text-align:center;font-size:11px;color:var(--text2);letter-spacing:.2px}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand">ReleaseHub</div>
  <p class="meta"><strong>${htmlEsc(appName)}</strong> / <strong>${htmlEsc(version)}</strong></p>
  <div class="card">
    <div class="filename">${htmlEsc(filename)}</div>
    <div class="row">
      <span>大小：<strong style="color:var(--text)">${htmlEsc(fmtBytesServer(size))}</strong></span>
      <span class="badge">${htmlEsc(badge.label)}</span>
    </div>
    <a class="btn" href="${htmlEsc(downloadHref)}" download rel="noopener">⬇ 立即下载</a>
  </div>
  <p class="footer">Powered by ReleaseHub</p>
</div>
</body>
</html>`;
}

module.exports = {
  htmlEsc,
  renderDownload404Html,
  renderDownloadPageHtml,
};
