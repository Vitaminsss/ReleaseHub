const { fmtBytesServer, fileBadgeLabel } = require('./download-utils');

function htmlEsc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 列表页头像 / favicon 用首字符（支持中文等多字节） */
function pageAvatarInitial(displayLabel) {
  const s = String(displayLabel || '').trim();
  if (!s) return '?';
  const first = [...s][0];
  return first || '?';
}

function svgTextEsc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 多行纯文本：先 HTML 转义再换行变 br */
function formatPlainMultiline(s) {
  return htmlEsc(String(s || ''))
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, '<br />');
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
  const { displayLabel, version, filename, size, badge, downloadHref } = opts;
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
  const pageTitle = `${displayLabel} · ${version} — ${filename}`;
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&display=swap" rel="stylesheet">
<title>${htmlEsc(pageTitle)}</title>
<style>
:root { --bg:#0c0b09; --text:#ebe6df; --text2:#9a9288; --text3:#6b6459; --accent:#e8a035; --border:rgba(235,230,223,0.08); }
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Manrope',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 20px}
body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(232,160,53,.028) 1px,transparent 1px),linear-gradient(90deg,rgba(232,160,53,.028) 1px,transparent 1px);background-size:24px 24px;pointer-events:none;z-index:0}
.wrap{position:relative;z-index:1;width:100%;max-width:480px}
.brand{font-size:11px;font-weight:700;color:var(--accent);letter-spacing:.35em;text-transform:uppercase;margin-bottom:16px;text-align:center}
.hero{display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:20px;text-align:center}
.app-title{font-size:26px;font-weight:800;line-height:1.2;letter-spacing:-.03em;margin:0;max-width:100%}
.ver-mark{font-family:ui-monospace,'Cascadia Code','Segoe UI Mono',monospace;font-size:13px;font-weight:600;color:var(--text3);letter-spacing:.06em}
.card{border:1px solid var(--border);background:linear-gradient(165deg,#12100e 0%,#1a1714 100%);border-radius:10px;padding:28px 24px;box-shadow:0 24px 48px rgba(0,0,0,.35)}
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
  <div class="hero">
    <h1 class="app-title">${htmlEsc(displayLabel)}</h1>
    <span class="ver-mark">${htmlEsc(version)}</span>
  </div>
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

/** 公开「应用 + 版本」页：文件名进详情页，右侧直链下载；不展示包名，可展示简介 */
function renderVersionBrowserHtml(opts) {
  const { displayLabel, version, files, description } = opts;
  const initial = pageAvatarInitial(displayLabel);
  const initialSvg = svgTextEsc(initial);
  const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#e8a035"/><text x="16" y="21" text-anchor="middle" fill="#1a1208" font-size="15" font-weight="700" font-family="system-ui,sans-serif">${initialSvg}</text></svg>`;
  const faviconHref = `data:image/svg+xml,${encodeURIComponent(faviconSvg)}`;
  const pageTitle = `${displayLabel} · ${version}`.trim();
  const introHtml =
    description && String(description).trim()
      ? `<div class="intro">${formatPlainMultiline(String(description).trim())}</div>`
      : '';
  const rows = (files || [])
    .map(
      f => `<li class="file-row">
  <a class="file-link" href="${htmlEsc(f.landingHref)}">${htmlEsc(f.name)}</a>
  <span class="sz">${htmlEsc(fmtBytesServer(f.size))}</span>
  <a class="btn-dl" href="${htmlEsc(f.directHref)}" download rel="noopener">⬇ 下载</a>
</li>`,
    )
    .join('');
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" href="${faviconHref}" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,480;0,9..144,560;1,9..144,450&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet">
<title>${htmlEsc(pageTitle)}</title>
<style>
:root { --bg:#0c0b09; --text:#ebe6df; --text2:#9a9288; --text3:#6b6459; --accent:#e8a035; --border:rgba(235,230,223,0.08); --intro:#e3ddd4; }
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Manrope',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;min-height:100dvh;margin:0;padding:24px 20px;display:flex;flex-direction:column;align-items:center;justify-content:center}
body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(232,160,53,.028) 1px,transparent 1px),linear-gradient(90deg,rgba(232,160,53,.028) 1px,transparent 1px);background-size:24px 24px;pointer-events:none;z-index:0}
.wrap{position:relative;z-index:1;width:100%;max-width:560px;display:flex;flex-direction:column;align-items:center;text-align:center}
.page-avatar{width:72px;height:72px;margin:0 auto 18px;border-radius:18px;background:linear-gradient(145deg,#f0b24a 0%,var(--accent) 100%);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;color:#1a1208;box-shadow:0 12px 32px rgba(232,160,53,.2);letter-spacing:0;flex-shrink:0}
.hero{display:flex;flex-direction:column;align-items:center;gap:8px;margin:0 0 18px;text-align:center;max-width:100%}
.app-title{font-size:28px;font-weight:800;line-height:1.2;letter-spacing:-.035em;margin:0;max-width:100%;color:var(--text)}
.ver-mark{font-family:ui-monospace,'Cascadia Code','Segoe UI Mono',monospace;font-size:13px;font-weight:600;color:var(--text3);letter-spacing:.07em}
.intro{width:100%;text-align:center;color:var(--intro);font-size:15px;font-weight:500;line-height:1.75;margin:0 auto 24px;padding:0 10px;max-width:38rem;font-family:'Fraunces','Noto Serif SC','Source Han Serif CN',serif}
.card{width:100%;text-align:left;border:1px solid var(--border);background:linear-gradient(165deg,#12100e 0%,#1a1714 100%);border-radius:10px;padding:8px 0 4px;box-shadow:0 24px 48px rgba(0,0,0,.35)}
ul{list-style:none}
.file-row{display:flex;align-items:center;gap:10px 14px;padding:14px 16px;border-top:1px solid var(--border);font-size:14px}
.file-row:first-child{border-top:none}
.file-link{flex:1;min-width:0;word-break:break-all;color:var(--accent);text-decoration:none;font-weight:600}
.file-link:hover{text-decoration:underline}
.sz{color:var(--text2);font-size:12px;white-space:nowrap;flex-shrink:0}
.btn-dl{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;padding:9px 16px;font-size:12px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;text-decoration:none;border-radius:6px;background:linear-gradient(180deg,#f0b24a 0%,var(--accent) 100%);color:#1a1208;transition:filter .15s,box-shadow .15s}
.btn-dl:hover{filter:brightness(1.06);box-shadow:0 0 18px rgba(232,160,53,.22)}
</style>
</head>
<body>
<div class="wrap">
  <div class="page-avatar" aria-hidden="true">${htmlEsc(initial)}</div>
  <div class="hero">
    <h1 class="app-title">${htmlEsc(displayLabel)}</h1>
    <span class="ver-mark">${htmlEsc(version)}</span>
  </div>
  ${introHtml}
  <div class="card">
    <ul>${rows || '<li class="file-row" style="color:var(--text2);justify-content:center">暂无文件</li>'}</ul>
  </div>
</div>
</body>
</html>`;
}

/** 资源库公开页：与后台版本卡片类似的响应式网格，每项一卡 */
function renderResourceLibraryHtml(opts) {
  const { displayLabel, description, items } = opts;
  const initial = pageAvatarInitial(displayLabel);
  const initialSvg = svgTextEsc(initial);
  const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#e8a035"/><text x="16" y="21" text-anchor="middle" fill="#1a1208" font-size="15" font-weight="700" font-family="system-ui,sans-serif">${initialSvg}</text></svg>`;
  const faviconHref = `data:image/svg+xml,${encodeURIComponent(faviconSvg)}`;
  const introHtml =
    description && String(description).trim()
      ? `<div class="intro">${formatPlainMultiline(String(description).trim())}</div>`
      : '';
  const list = items || [];
  const cards = list
    .map(it => {
      const title = (it.displayName && String(it.displayName).trim()) || it.fileName;
      const verRaw = it.version != null && String(it.version).trim() ? String(it.version).trim() : '';
      const verHtml = verRaw ? `<span class="res-card-ver">${htmlEsc(verRaw)}</span>` : '';
      const descInner =
        it.description && String(it.description).trim()
          ? `<div class="res-card-desc">${formatPlainMultiline(String(it.description).trim())}</div>`
          : '';
      const mainBlock = descInner ? `<div class="res-card-main">${descInner}</div>` : '';
      return `<article class="res-card">
  <header class="res-card-head">
    <div class="res-card-title-row">
      <a class="res-card-title" href="${htmlEsc(it.landingHref)}">${htmlEsc(title)}</a>
      ${verHtml}
    </div>
  </header>
  ${mainBlock}
  <footer class="res-card-foot">
    <span class="res-sz">${htmlEsc(fmtBytesServer(it.size))}</span>
    <a class="btn-dl" href="${htmlEsc(it.directHref)}" download rel="noopener">⬇ 下载</a>
  </footer>
</article>`;
    })
    .join('');
  const gridInner =
    list.length === 0
      ? '<div class="res-empty">暂无资源</div>'
      : `<div class="items-grid">${cards}</div>`;
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" href="${faviconHref}" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,480;0,9..144,560;1,9..144,450&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet">
<title>${htmlEsc(displayLabel)} — 资源库</title>
<style>
:root { --bg:#0a0908; --text:#f0ebe3; --text2:#9a9288; --text3:#6b6459; --accent:#e8a035; --border:rgba(235,230,223,0.09); --desc:#e3ddd4; }
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Manrope',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;min-height:100dvh;margin:0;padding:24px 20px 40px;display:flex;flex-direction:column;align-items:center}
body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(232,160,53,.022) 1px,transparent 1px),linear-gradient(90deg,rgba(232,160,53,.022) 1px,transparent 1px);background-size:28px 28px;pointer-events:none;z-index:0}
.wrap{position:relative;z-index:1;width:100%;max-width:1040px;display:flex;flex-direction:column;align-items:center}
.page-avatar{width:72px;height:72px;margin:0 auto 20px;border-radius:18px;background:linear-gradient(145deg,#f0b24a 0%,var(--accent) 100%);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;color:#1a1208;box-shadow:0 12px 32px rgba(232,160,53,.2);letter-spacing:0;flex-shrink:0;font-family:'Manrope',system-ui,sans-serif}
h1{font-family:'Manrope',system-ui,sans-serif;font-size:24px;font-weight:800;margin:0 0 14px;text-align:center;line-height:1.25;max-width:100%;letter-spacing:-.02em}
.intro{width:100%;text-align:center;color:var(--text2);font-size:14px;line-height:1.75;margin:0 auto 22px;padding:0 8px;max-width:42rem;font-family:'Fraunces','Noto Serif SC','Source Han Serif CN',serif;font-weight:450}
.items-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px;width:100%;align-items:stretch}
.res-card{position:relative;border:1px solid var(--border);background:linear-gradient(168deg,#14110e 0%,#0e0c0a 52%,#12100e 100%);border-radius:12px;padding:0;box-shadow:0 20px 50px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.04);display:flex;flex-direction:column;text-align:left;min-height:100%;overflow:hidden;transition:border-color .22s ease,box-shadow .22s ease,transform .22s ease}
.res-card:hover,.res-card:focus-within{border-color:rgba(232,160,53,.38);box-shadow:0 26px 56px rgba(0,0,0,.48),0 0 0 1px rgba(232,160,53,.12),inset 0 1px 0 rgba(255,255,255,.06);transform:translateY(-2px)}
.res-card-head{padding:15px 16px 14px;border-bottom:1px solid var(--border)}
.res-card-title-row{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px 14px}
.res-card-title{display:block;flex:1;min-width:0;color:var(--accent);text-decoration:none;font-weight:700;font-size:17px;line-height:1.3;word-break:break-word;letter-spacing:-.015em;font-family:'Manrope',system-ui,sans-serif}
.res-card-title:hover{text-decoration:underline;text-underline-offset:3px}
.res-card-ver{font-family:ui-monospace,'Cascadia Code','Segoe UI Mono',monospace;font-size:12px;font-weight:600;color:var(--text3);letter-spacing:.06em;flex-shrink:0}
.res-card-main{flex:1;min-height:0;display:flex;flex-direction:column}
.res-card-desc{padding:14px 16px 10px;font-family:'Fraunces','Noto Serif SC','Source Han Serif CN',serif;font-size:15px;font-weight:500;font-style:normal;color:var(--desc);line-height:1.72;letter-spacing:.01em}
.res-card-foot{margin-top:auto;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:11px 16px 12px;border-top:1px solid var(--border);background:rgba(0,0,0,.18)}
@media (prefers-reduced-motion:reduce){.res-card,.res-card:hover,.res-card:focus-within{transition:border-color .2s ease,box-shadow .2s ease;transform:none}}
.res-sz{font-family:ui-monospace,'Cascadia Code','Segoe UI Mono',monospace;font-size:13px;font-weight:600;color:var(--text);letter-spacing:.04em;opacity:.92}
.btn-dl{display:inline-flex;align-items:center;justify-content:center;padding:8px 15px;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;text-decoration:none;border-radius:7px;background:linear-gradient(180deg,#f0b24a 0%,var(--accent) 100%);color:#1a1208;transition:filter .15s,box-shadow .15s,transform .12s;font-family:'Manrope',system-ui,sans-serif}
.btn-dl:hover{filter:brightness(1.06);box-shadow:0 0 20px rgba(232,160,53,.28);transform:translateY(-1px)}
.res-empty{width:100%;text-align:center;color:var(--text2);font-size:14px;padding:32px 16px;border:1px dashed var(--border);border-radius:8px}
</style>
</head>
<body>
<div class="wrap">
  <div class="page-avatar" aria-hidden="true">${htmlEsc(initial)}</div>
  <h1>${htmlEsc(displayLabel)}</h1>
  <p class="intro" style="margin-top:-8px;margin-bottom:16px;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent)">资源库</p>
  ${introHtml}
  ${gridInner}
</div>
</body>
</html>`;
}

/** 资源库单文件落地页 */
function renderResourceItemLandingHtml(opts) {
  const { libraryName, displayTitle, itemVersion, filename, description, size, badge, downloadHref } = opts;
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
  const descBlock =
    description && String(description).trim()
      ? `<div style="margin:0 0 18px;font-size:14px;color:var(--text2);line-height:1.65;text-align:left">${formatPlainMultiline(String(description).trim())}</div>`
      : '';
  const verRaw = itemVersion != null && String(itemVersion).trim() ? String(itemVersion).trim() : '';
  const titleRowVer = verRaw
    ? `<span class="item-ver">${htmlEsc(verRaw)}</span>`
    : '';
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${htmlEsc(displayTitle || filename)} — ReleaseHub</title>
<style>
:root { --bg:#0c0b09; --text:#ebe6df; --text2:#9a9288; --text3:#6b6459; --accent:#e8a035; --border:rgba(235,230,223,0.08); }
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 20px}
body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(232,160,53,.028) 1px,transparent 1px),linear-gradient(90deg,rgba(232,160,53,.028) 1px,transparent 1px);background-size:24px 24px;pointer-events:none;z-index:0}
.wrap{position:relative;z-index:1;width:100%;max-width:480px}
.brand{font-size:11px;font-weight:700;color:var(--accent);letter-spacing:.35em;text-transform:uppercase;margin-bottom:18px;text-align:center}
.meta{font-size:14px;color:var(--text2);text-align:center;margin-bottom:22px;line-height:1.5}
.meta strong{color:var(--text);font-weight:600}
.card{border:1px solid var(--border);background:linear-gradient(165deg,#12100e 0%,#1a1714 100%);border-radius:8px;padding:28px 24px;box-shadow:0 24px 48px rgba(0,0,0,.35)}
.title-row{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px 12px;margin-bottom:14px}
.filename{font-size:17px;font-weight:700;word-break:break-word;line-height:1.45;flex:1;min-width:0}
.item-ver{font-family:ui-monospace,'Cascadia Code','Segoe UI Mono',monospace;font-size:12px;font-weight:600;color:var(--text3);letter-spacing:.06em;flex-shrink:0}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;margin-bottom:22px;font-size:14px;color:var(--text2)}
.badge{display:inline-flex;align-items:center;font-size:10px;letter-spacing:.6px;padding:4px 8px;border:1px solid;border-radius:4px;text-transform:uppercase;font-weight:600;${badgeStyle}}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px 20px;font-size:15px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;text-decoration:none;border-radius:6px;border:none;cursor:pointer;background:linear-gradient(180deg,#f0b24a 0%,var(--accent) 100%);color:#1a1208;transition:filter .15s,box-shadow .15s}
.btn:hover{filter:brightness(1.06);box-shadow:0 0 24px rgba(232,160,53,.25)}
.footer{margin-top:28px;text-align:center;font-size:11px;color:var(--text2);letter-spacing:.2px}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand">ReleaseHub · 资源库</div>
  <p class="meta"><strong>${htmlEsc(libraryName)}</strong></p>
  <div class="card">
    <div class="title-row">
      <div class="filename">${htmlEsc(displayTitle || filename)}</div>
      ${titleRowVer}
    </div>
    ${descBlock}
    <div class="row">
      <span>文件：<strong style="color:var(--text);font-weight:600;word-break:break-all">${htmlEsc(filename)}</strong></span>
    </div>
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

/** 内联脚本：在 data-expire-ms 的 #countdown-box 上更新剩余时间文案 */
const countdownScript = `<script>
(function(){
  var el = document.getElementById("countdown-box");
  if (!el) return;
  var exp = parseInt(el.getAttribute("data-expire-ms"), 10) || 0;
  function fmt(s) {
    if (s <= 0) return "已过期";
    var d = Math.floor(s / 86400);
    var h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (d > 0) return d + " 天 " + h + " 小时 " + m + " 分钟";
    if (h > 0) return h + " 小时 " + m + " 分 " + sec + " 秒";
    if (m > 0) return m + " 分 " + sec + " 秒";
    return sec + " 秒";
  }
  function tick() {
    var left = Math.floor((exp - Date.now()) / 1000);
    el.textContent = fmt(left);
    if (left <= 0) { el.textContent = "已过期"; return; }
    setTimeout(tick, 1000);
  }
  tick();
})();<\/script>`;

/**
 * 临时传输 · 信息页（资源库单文件落地页同款气质 + 剩余时间）
 */
function renderTempTransferInfoPageHtml(opts) {
  const { filename, displayTitle, size, badge, directDownloadHref, downloadPageHref, expireAtMs } = opts;
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
  const t = String(displayTitle || filename);
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${htmlEsc(t)} — 临时传输</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet">
<style>
:root { --bg:#0a0908; --text:#f0ebe3; --text2:#9a9288; --text3:#6b6459; --accent:#e8a035; --border:rgba(235,230,223,0.09); }
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Manrope',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 20px}
body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(232,160,53,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(232,160,53,.02) 1px,transparent 1px);background-size:28px 28px;pointer-events:none;z-index:0}
.wrap{position:relative;z-index:1;width:100%;max-width:500px}
.brand{font-size:11px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;margin-bottom:10px;text-align:center;color:var(--accent)}
.subbrand{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--text3);text-align:center;margin-bottom:20px}
.timer-box{border:1px solid rgba(232,160,53,.32);background:linear-gradient(135deg,rgba(232,160,53,.1) 0%,rgba(0,0,0,.25) 100%);border-radius:10px;padding:12px 16px;margin-bottom:20px;text-align:center}
.timer-label{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--text3);margin-bottom:6px}
.timer-val{font-size:1.15rem;font-weight:800;color:var(--accent);font-variant-numeric:tabular-nums;letter-spacing:.04em}
.card{border:1px solid var(--border);background:linear-gradient(168deg,#14110e 0%,#0e0c0a 100%);border-radius:12px;padding:28px 24px;box-shadow:0 24px 50px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.04)}
.title-row{margin-bottom:14px}
.filename{font-size:18px;font-weight:800;word-break:break-word;line-height:1.4;letter-spacing:-.02em}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;margin-bottom:18px;font-size:14px;color:var(--text2)}
.badge{display:inline-flex;align-items:center;font-size:10px;letter-spacing:.6px;padding:4px 8px;border:1px solid;border-radius:4px;text-transform:uppercase;font-weight:600;${badgeStyle}}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px 20px;font-size:14px;font-weight:800;letter-spacing:.4px;text-decoration:none;border-radius:8px;border:none;cursor:pointer;background:linear-gradient(180deg,#f0b24a 0%,var(--accent) 100%);color:#1a1208;transition:filter .15s,box-shadow .15s;box-shadow:0 0 0 1px rgba(0,0,0,.2)}
.btn:hover{filter:brightness(1.06);box-shadow:0 0 24px rgba(232,160,53,.3)}
.sub-actions{display:flex;flex-direction:column;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)}
.sub-actions a{color:var(--text2);font-size:13px;text-decoration:none;transition:color .15s}
.sub-actions a:hover{color:var(--accent);text-decoration:underline}
.hint-s{font-family:'Fraunces','Noto Serif SC',serif;font-size:14px;font-weight:450;color:var(--text2);line-height:1.65;margin-bottom:16px}
.footer{margin-top:24px;text-align:center;font-size:11px;color:var(--text2)}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand">ReleaseHub</div>
  <p class="subbrand">临时传输 · 信息</p>
  <div class="timer-box">
    <div class="timer-label">剩余可用时间</div>
    <div id="countdown-box" class="timer-val" data-expire-ms="${String(Math.floor(expireAtMs))}">—</div>
  </div>
  <div class="card">
    <div class="title-row">
      <div class="filename">${htmlEsc(t)}</div>
    </div>
    <p class="hint-s">此链接在到期后将无法下载，文件从服务器上删除。你可先分享本页，或使用下方仅下载页、直链。</p>
    <div class="row">
      <span>大小 <strong style="color:var(--text)">${htmlEsc(fmtBytesServer(size))}</strong></span>
      <span class="badge">${htmlEsc(badge.label)}</span>
    </div>
    <a class="btn" href="${htmlEsc(directDownloadHref)}" rel="noopener">⬇ 直接下载文件</a>
    <div class="sub-actions">
      <a href="${htmlEsc(downloadPageHref)}">仅下载页（大按钮、适合转发）</a>
    </div>
  </div>
  <p class="footer">Powered by ReleaseHub</p>
</div>
${countdownScript}
</body>
</html>`;
}

/**
 * 临时传输 · 仅下载页（对齐 /d/ 与 renderDownloadPageHtml 风格）
 */
function renderTempTransferDownloadPageHtml(opts) {
  const { displayTitle, filename, size, badge, directDownloadHref, expireAtMs } = opts;
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
  const pageTitle = `${String(displayLabelForTitle(displayTitle, filename))} — 临时下载`;
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&display=swap" rel="stylesheet">
<title>${htmlEsc(pageTitle)}</title>
<style>
:root { --bg:#0c0b09; --text:#ebe6df; --text2:#9a9288; --text3:#6b6459; --accent:#e8a035; --border:rgba(235,230,223,0.08); }
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Manrope',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 20px}
body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(232,160,53,.028) 1px,transparent 1px),linear-gradient(90deg,rgba(232,160,53,.028) 1px,transparent 1px);background-size:24px 24px;pointer-events:none;z-index:0}
.wrap{position:relative;z-index:1;width:100%;max-width:480px}
.brand{font-size:11px;font-weight:700;color:var(--accent);letter-spacing:.35em;text-transform:uppercase;margin-bottom:8px;text-align:center}
.brand2{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--text3);text-align:center;margin-bottom:12px}
.timer-inline{text-align:center;font-size:13px;color:var(--text2);margin-bottom:18px}
.timer-inline strong{color:var(--accent);font-weight:800}
.hero{display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:16px;text-align:center}
.app-title{font-size:24px;font-weight:800;line-height:1.2;letter-spacing:-.03em;margin:0;max-width:100%}
.expire-mono{font-family:ui-monospace,monospace;font-size:12px;font-weight:600;color:var(--text3);letter-spacing:.04em}
.card{border:1px solid var(--border);background:linear-gradient(165deg,#12100e 0%,#1a1714 100%);border-radius:10px;padding:28px 24px;box-shadow:0 24px 48px rgba(0,0,0,.35)}
.filename{font-size:17px;font-weight:700;word-break:break-all;line-height:1.45;margin-bottom:14px}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;margin-bottom:22px;font-size:14px;color:var(--text2)}
.badge{display:inline-flex;align-items:center;font-size:10px;letter-spacing:.6px;padding:4px 8px;border:1px solid;border-radius:4px;text-transform:uppercase;font-weight:600;${badgeStyle}}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px 20px;font-size:15px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;text-decoration:none;border-radius:6px;border:none;cursor:pointer;background:linear-gradient(180deg,#f0b24a 0%,var(--accent) 100%);color:#1a1208;transition:filter .15s,box-shadow .15s}
.btn:hover{filter:brightness(1.06);box-shadow:0 0 24px rgba(232,160,53,.25)}
.footer{margin-top:28px;text-align:center;font-size:11px;color:var(--text2)}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand">ReleaseHub</div>
  <div class="brand2">临时传输 · 下载</div>
  <p class="timer-inline">剩余 <strong id="countdown-box" data-expire-ms="${String(Math.floor(expireAtMs))}">—</strong></p>
  <div class="hero">
    <h1 class="app-title">${htmlEsc(String(displayTitle || filename))}</h1>
    <span class="expire-mono">单文件 · 到期后删除</span>
  </div>
  <div class="card">
    <div class="filename">${htmlEsc(filename)}</div>
    <div class="row">
      <span>大小：<strong style="color:var(--text)">${htmlEsc(fmtBytesServer(size))}</strong></span>
      <span class="badge">${htmlEsc(badge.label)}</span>
    </div>
    <a class="btn" href="${htmlEsc(directDownloadHref)}" download rel="noopener">⬇ 立即下载</a>
  </div>
  <p class="footer">Powered by ReleaseHub</p>
</div>
${countdownScript}
</body>
</html>`;
}

function displayLabelForTitle(displayTitle, filename) {
  return displayTitle || filename;
}

function renderTempTransferGoneHtml() {
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>链接已失效 — 临时传输</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0c0b09;color:#9a9288;font-family:system-ui,sans-serif;padding:24px;text-align:center}strong{color:#e8a035;display:block;font-size:18px;margin-bottom:8px;color:#ebe6df}</style></head><body><div><strong>文件已删除或已过期</strong><p>临时传输链接已失效。</p><p style="font-size:12px;margin-top:16px;opacity:.7">ReleaseHub</p></div></body></html>`;
}

module.exports = {
  htmlEsc,
  renderDownload404Html,
  renderDownloadPageHtml,
  renderVersionBrowserHtml,
  renderResourceLibraryHtml,
  renderResourceItemLandingHtml,
  renderTempTransferInfoPageHtml,
  renderTempTransferDownloadPageHtml,
  renderTempTransferGoneHtml,
};
