<template>
  <div class="layout-max">
    <header class="top">
      <button type="button" class="btn btn-ghost" @click="router.push('/')">← 应用列表</button>
      <div class="title-block">
        <div class="titles">
          <h1>{{ displayLabel }}</h1>
          <p v-if="displayNameEdit.trim()" class="pkg-sub">包名 <code>{{ appName }}</code></p>
        </div>
        <span class="badge-type">{{ repoType }}</span>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-ghost" @click="router.push('/settings')">设置</button>
        <button type="button" class="btn btn-ghost danger" @click="confirmDeleteApp">删除应用</button>
        <button type="button" class="btn btn-primary" @click="showNewVer = true">新建版本</button>
      </div>
    </header>

    <section class="card meta-name-block">
      <h2>软件信息</h2>
      <label class="lbl">软件名（对外展示；留空则仅显示包名）</label>
      <div class="row-input">
        <input v-model="displayNameEdit" class="input" :placeholder="appName" />
        <button type="button" class="btn btn-primary btn-sm" :disabled="savingDisplayName" @click="saveDisplayName">
          保存软件名
        </button>
      </div>
    </section>

    <section v-if="publicBase" class="card api-block">
      <h2>对外接口</h2>
      <p class="hint">旧版 Tauri / 脚本请继续使用 <code>latest.json</code>，行为不变。</p>
      <div v-if="publishedVersionPageUrl" class="link-row">
        <span class="lbl">版本页（推荐分享）</span>
        <code class="mono">{{ publishedVersionPageUrl }}</code>
        <button type="button" class="btn btn-sm btn-ghost" @click="copy(publishedVersionPageUrl)">复制</button>
      </div>
      <p v-if="publishedVersionPageUrl" class="hint sm no-mt">
        短链形态：<code>/app/{{ appName }}/&lt;版本目录&gt;</code>，进入后选择文件再打开落地页下载；旧版单文件链 <code>/d/...</code> 仍永久可用。
      </p>
      <div class="link-row">
        <span class="lbl">latest.json</span>
        <code class="mono">{{ latestJsonUrl }}</code>
        <button type="button" class="btn btn-sm btn-ghost" @click="copy(latestJsonUrl)">复制</button>
      </div>
      <div class="link-row">
        <span class="lbl">JSON 摘要</span>
        <code class="mono">{{ downloadInfoUrl }}</code>
        <button type="button" class="btn btn-sm btn-ghost" @click="copy(downloadInfoUrl)">复制</button>
      </div>
      <div class="link-row">
        <span class="lbl">直链跳转</span>
        <code class="mono">{{ downloadRedirectUrl }}</code>
        <button type="button" class="btn btn-sm btn-ghost" @click="copy(downloadRedirectUrl)">复制</button>
      </div>
    </section>

    <section v-if="latestLoaded && published" class="card pub-block">
      <h2>当前已发布</h2>
      <p class="ver-line">版本 <strong>{{ published.version }}</strong></p>

      <label class="lbl">发布时间 pub_date（ISO 字符串，可选）</label>
      <div class="row-input">
        <input v-model="publishedPubDate" class="input" placeholder="2025-01-01T12:00:00.000Z" />
        <button type="button" class="btn btn-ghost btn-sm" :disabled="savingPubDate" @click="savePublishedPubDate">保存时间</button>
      </div>

      <label class="lbl">已发布更新说明（保存后直接写 latest.json，无需重新发布）</label>
      <textarea v-model="publishedNotes" class="textarea" rows="5" placeholder="更新说明…" />
      <div class="row-btns">
        <button type="button" class="btn btn-primary" :disabled="savingPub" @click="savePublishedNotes">保存说明</button>
      </div>

      <template v-if="repoType === 'tauri'">
        <label class="lbl">已发布 platforms（JSON，高级）</label>
        <textarea v-model="publishedPlatformsJson" class="textarea code" rows="12" spellcheck="false" />
        <button type="button" class="btn btn-ghost" :disabled="savingPlatforms" @click="savePublishedPlatforms">保存 platforms</button>
      </template>
      <template v-else>
        <label class="lbl">已发布 files（JSON 数组，高级）</label>
        <textarea v-model="publishedFilesJson" class="textarea code" rows="12" spellcheck="false" />
        <button type="button" class="btn btn-ghost" :disabled="savingFiles" @click="savePublishedFiles">保存 files</button>
      </template>

      <div class="row-btns mt">
        <button type="button" class="btn btn-ghost" :disabled="refreshingUrls" @click="refreshPublishedUrls">
          刷新下载链接（合并磁盘）
        </button>
        <button type="button" class="btn btn-ghost danger" :disabled="refreshingUrls" @click="refreshPublishedUrlsReplace">
          从磁盘完全重建…
        </button>
      </div>
      <p class="hint sm">
        合并：只更新磁盘上能匹配到的文件的 URL / 签名，保留手工平台或条目。完全重建：仅用磁盘扫描结果覆盖 platforms 或 files，可能丢失手工数据。
      </p>
    </section>
    <section v-else-if="latestLoaded && !published" class="card pub-block muted-box">
      <p>尚未发布任何版本。上传文件后在某一版本上点击「设为最新发布」。</p>
    </section>

    <div v-if="loading" class="muted">加载中…</div>
    <div v-else class="v-grid">
      <article v-for="v in versions" :key="v.version" class="card v-card">
        <header class="v-head">
          <span class="v-name">{{ v.version }}</span>
          <span v-if="v.isLatest" class="pill">当前最新</span>
          <div class="v-actions">
            <button
              v-if="!v.isLatest"
              type="button"
              class="btn btn-sm btn-primary"
              @click="quickPublish(v.version)"
            >
              设为最新发布
            </button>
            <button v-else type="button" class="btn btn-sm btn-ghost" @click="republish(v.version)">重新发布</button>
            <button
              v-if="publicBase"
              type="button"
              class="btn btn-sm btn-ghost"
              @click="copy(versionPageUrl(v.version))"
            >
              复制版本页
            </button>
            <details class="ver-more">
              <summary class="ver-more-sum">更多</summary>
              <div class="ver-more-menu">
                <button
                  type="button"
                  class="ver-more-danger"
                  @click="confirmDeleteVersion(v.version)"
                >
                  删除此版本…
                </button>
              </div>
            </details>
          </div>
        </header>
        <div class="notes">
          <label class="lbl">此版本说明草稿</label>
          <textarea
            v-model="notesDraft[v.version]"
            class="textarea sm"
            rows="3"
            placeholder="仅草稿；发布时会写入 latest"
            @blur="saveDraft(v.version)"
          />
          <button type="button" class="btn btn-sm btn-ghost" @click="saveDraft(v.version)">保存草稿</button>
        </div>
        <div
          class="drop-zone"
          :class="{ drag: dragVer === v.version }"
          @dragover.prevent="dragVer = v.version"
          @dragleave="dragVer = null"
          @drop.prevent="onDrop($event, v.version)"
          @click="triggerFile(v.version)"
        >
          <input
            :ref="el => setFileInput(v.version, el)"
            type="file"
            multiple
            class="hidden-input"
            @change="onFileChange(v.version, $event)"
          />
          <span>拖拽文件到此处或点击上传</span>
          <span v-if="repoType === 'tauri'" class="subz">Tauri 需上传各平台包及对应 .sig</span>
        </div>
        <div v-if="uploadProgress[v.version] != null && uploadProgress[v.version] >= 0" class="prog">
          <div class="prog-bar">
            <div class="prog-fill" :style="{ width: uploadProgress[v.version] + '%' }" />
          </div>
          <span class="prog-txt">{{ uploadProgress[v.version] }}%</span>
        </div>
        <div v-else-if="uploadProgress[v.version] === -1" class="prog indet">上传中（无法计算进度）…</div>
        <ul class="files">
          <li v-for="f in v.files.filter(x => x.name !== '.gitkeep')" :key="f.name">
            <a :href="fileLandingUrl(v.version, f.name)" target="_blank" rel="noopener">{{ f.name }}</a>
            <span class="sz">{{ fmtSize(f.size) }}</span>
            <button type="button" class="btn-icon" @click.stop="deleteFile(v.version, f.name)">×</button>
          </li>
        </ul>
      </article>
    </div>

    <teleport to="body">
      <div v-if="showNewVer" class="modal-back" @click.self="showNewVer = false">
        <div class="modal card">
          <h2>新建版本</h2>
          <p v-if="repoType === 'tauri'" class="hint">Tauri：须为 SemVer 2.0 三段式，如 v1.0.0</p>
          <p v-else class="hint">
            通用：可用任意可读版本号（将存为以 <code>v</code> 开头的目录名），如 <code>2.0.2</code>、<code>v2024-01</code>、<code>1.0-beta</code>
          </p>
          <input v-model="newVerInput" class="input" :placeholder="repoType === 'tauri' ? 'v1.0.0' : '例如 2.0.2 或 v1.0-beta'" />
          <p v-if="newVerErr" class="err">{{ newVerErr }}</p>
          <div class="row">
            <button type="button" class="btn btn-ghost" @click="showNewVer = false">取消</button>
            <button type="button" class="btn btn-primary" :disabled="creatingVer" @click="createVersion">创建</button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, uploadWithProgress } from '@/api/client';
import { useToast } from '@/composables/useToast';

const route = useRoute();
const router = useRouter();
const { toast } = useToast();

const appName = computed(() => decodeURIComponent(route.params.name || ''));
const loading = ref(true);
const repoType = ref('general');
const displayNameEdit = ref('');
const savingDisplayName = ref(false);
const versions = ref([]);
const notesDraft = ref({});
const publicBase = ref('');
const published = ref(null);
const latestLoaded = ref(false);
const publishedNotes = ref('');
const publishedPubDate = ref('');
const publishedPlatformsJson = ref('{}');
const publishedFilesJson = ref('[]');
const savingPub = ref(false);
const savingPubDate = ref(false);
const savingPlatforms = ref(false);
const savingFiles = ref(false);
const refreshingUrls = ref(false);
const showNewVer = ref(false);
const newVerInput = ref('');
const newVerErr = ref('');
const creatingVer = ref(false);
const dragVer = ref(null);
const uploadProgress = ref({});
const fileInputs = ref({});

const displayLabel = computed(() => displayNameEdit.value.trim() || appName.value);

const publishedVersionDir = computed(() => {
  if (!published.value?.version) return null;
  const v = String(published.value.version);
  return v.startsWith('v') ? v : `v${v}`;
});

const publishedVersionPageUrl = computed(() => {
  if (!publicBase.value || !publishedVersionDir.value) return '';
  return `${publicBase.value}/app/${encodeURIComponent(appName.value)}/${encodeURIComponent(publishedVersionDir.value)}`;
});

const latestJsonUrl = computed(() => `${publicBase.value}/releases/${appName.value}/latest.json`);
const downloadInfoUrl = computed(
  () => `${publicBase.value}/api/public/${encodeURIComponent(appName.value)}/latest/download`,
);
const downloadRedirectUrl = computed(
  () =>
    `${publicBase.value}/api/public/${encodeURIComponent(appName.value)}/latest/download?redirect=1`,
);

function suggestedBase() {
  let p = window.location.pathname.replace(/\/index\.html$/i, '');
  p = p.replace(/\/$/, '') || '';
  const basePath = p && p !== '/' ? p : '';
  return `${window.location.origin}${basePath}`.replace(/\/$/, '');
}

function rewritePreviewUrls(preview, base) {
  const b = base.replace(/\/$/, '');
  const fix = url => {
    if (!url || !/^https?:\/\//i.test(url)) return url;
    try {
      const u = new URL(url);
      return b + u.pathname + u.search + u.hash;
    } catch {
      return url;
    }
  };
  if (preview.platforms) {
    Object.values(preview.platforms).forEach(p => {
      if (p?.url) p.url = fix(p.url);
    });
  }
  if (preview.files) preview.files.forEach(f => { if (f.url) f.url = fix(f.url); });
}

function isSemVer2CoreWithVPrefix(v) {
  return /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v);
}

const GENERAL_VER_MAX = 120;
function normalizeGeneralVersionForClient(raw) {
  let s = String(raw || '').trim();
  if (!s) return { error: '请填写版本号' };
  if (!s.startsWith('v')) s = `v${s}`;
  const slug = s.slice(1);
  if (!slug || slug.length > GENERAL_VER_MAX) return { error: '版本号过长' };
  if (slug.includes('..') || /[/\\]/.test(s)) return { error: '不可含路径字符或 ..' };
  if (!/^[a-zA-Z0-9._-]+$/.test(slug)) return { error: '仅允许字母、数字、点、下划线、连字符' };
  return { ver: s };
}

function versionPageUrl(ver) {
  return `${publicBase.value}/app/${encodeURIComponent(appName.value)}/${encodeURIComponent(ver)}`;
}

function fileLandingUrl(ver, filename) {
  return `${publicBase.value}/d/${[appName.value, ver, filename].map(encodeURIComponent).join('/')}`;
}

function fmtSize(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function setFileInput(ver, el) {
  if (el) fileInputs.value[ver] = el;
}

function triggerFile(ver) {
  fileInputs.value[ver]?.click();
}

async function loadMeta() {
  const m = await api('GET', `/api/apps/${encodeURIComponent(appName.value)}/meta`);
  repoType.value = m.repoType === 'tauri' ? 'tauri' : 'general';
  displayNameEdit.value = m.displayName != null ? String(m.displayName) : '';
}

async function saveDisplayName() {
  savingDisplayName.value = true;
  try {
    await api('PATCH', `/api/apps/${encodeURIComponent(appName.value)}/meta`, {
      displayName: displayNameEdit.value.trim(),
    });
    toast('已保存软件名');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    savingDisplayName.value = false;
  }
}

async function loadSettingsBase() {
  try {
    const s = await api('GET', '/api/settings');
    publicBase.value = (s.baseUrl || '').replace(/\/$/, '') || suggestedBase();
  } catch {
    publicBase.value = suggestedBase();
  }
}

function syncPublishedEditors(d) {
  if (!d) {
    publishedPubDate.value = '';
    publishedPlatformsJson.value = '{}';
    publishedFilesJson.value = '[]';
    return;
  }
  publishedPubDate.value = d.pub_date || '';
  try {
    publishedPlatformsJson.value = JSON.stringify(d.platforms || {}, null, 2);
  } catch {
    publishedPlatformsJson.value = '{}';
  }
  try {
    publishedFilesJson.value = JSON.stringify(d.files || [], null, 2);
  } catch {
    publishedFilesJson.value = '[]';
  }
}

async function loadLatest() {
  latestLoaded.value = false;
  try {
    const d = await api('GET', `/api/apps/${encodeURIComponent(appName.value)}/latest`);
    published.value = d;
    publishedNotes.value = d.notes || '';
    syncPublishedEditors(d);
  } catch (e) {
    if (e.status === 404) {
      published.value = null;
      syncPublishedEditors(null);
    } else toast(e.message, 'error');
  } finally {
    latestLoaded.value = true;
  }
}

async function loadVersions() {
  const v = await api('GET', `/api/apps/${encodeURIComponent(appName.value)}/versions`);
  versions.value = v;
}

async function loadDrafts() {
  const r = await api('GET', `/api/apps/${encodeURIComponent(appName.value)}/notes-drafts`);
  notesDraft.value = { ...(r.drafts || {}) };
}

async function loadAll() {
  loading.value = true;
  try {
    await loadSettingsBase();
    await loadMeta();
    await loadVersions();
    await loadDrafts();
    await loadLatest();
  } catch (e) {
    toast(e.message, 'error');
    router.push('/');
  } finally {
    loading.value = false;
  }
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('已复制');
  } catch {
    toast('复制失败', 'error');
  }
}

async function saveDraft(ver) {
  const text = notesDraft.value[ver] ?? '';
  try {
    await api('PUT', `/api/apps/${encodeURIComponent(appName.value)}/versions/${encodeURIComponent(ver)}/notes`, {
      text,
    });
    toast('草稿已保存');
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function savePublishedNotes() {
  savingPub.value = true;
  try {
    await api('PATCH', `/api/apps/${encodeURIComponent(appName.value)}/latest`, {
      notes: publishedNotes.value,
    });
    toast('已更新已发布说明');
    await loadLatest();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    savingPub.value = false;
  }
}

async function savePublishedPubDate() {
  savingPubDate.value = true;
  try {
    await api('PATCH', `/api/apps/${encodeURIComponent(appName.value)}/latest`, {
      pub_date: publishedPubDate.value.trim() || '',
    });
    toast('已更新 pub_date');
    await loadLatest();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    savingPubDate.value = false;
  }
}

async function savePublishedPlatforms() {
  let parsed;
  try {
    parsed = JSON.parse(publishedPlatformsJson.value || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('须为 JSON 对象');
  } catch (e) {
    toast(e.message || 'JSON 无效', 'error');
    return;
  }
  savingPlatforms.value = true;
  try {
    await api('PATCH', `/api/apps/${encodeURIComponent(appName.value)}/latest`, { platforms: parsed });
    toast('已更新 platforms');
    await loadLatest();
    await loadVersions();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    savingPlatforms.value = false;
  }
}

async function savePublishedFiles() {
  let parsed;
  try {
    parsed = JSON.parse(publishedFilesJson.value || '[]');
    if (!Array.isArray(parsed)) throw new Error('须为 JSON 数组');
  } catch (e) {
    toast(e.message || 'JSON 无效', 'error');
    return;
  }
  savingFiles.value = true;
  try {
    await api('PATCH', `/api/apps/${encodeURIComponent(appName.value)}/latest`, { files: parsed });
    toast('已更新 files');
    await loadLatest();
    await loadVersions();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    savingFiles.value = false;
  }
}

async function refreshPublishedUrls() {
  refreshingUrls.value = true;
  try {
    await api('POST', `/api/apps/${encodeURIComponent(appName.value)}/latest/refresh-urls`, { mode: 'merge' });
    toast('已合并刷新下载链接');
    await loadLatest();
    await loadVersions();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    refreshingUrls.value = false;
  }
}

async function refreshPublishedUrlsReplace() {
  if (!window.confirm('将仅用磁盘扫描结果覆盖 platforms 或 files，手工条目可能丢失。确定？')) return;
  refreshingUrls.value = true;
  try {
    await api('POST', `/api/apps/${encodeURIComponent(appName.value)}/latest/refresh-urls`, { mode: 'replace' });
    toast('已从磁盘完全重建发布条目');
    await loadLatest();
    await loadVersions();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    refreshingUrls.value = false;
  }
}

async function runPublish(ver, { allowMissingSig = false } = {}) {
  await saveDraft(ver);
  let preview = await api(
    'GET',
    `/api/apps/${encodeURIComponent(appName.value)}/versions/${encodeURIComponent(ver)}/preview-release`,
  );
  const k = notesDraft.value[ver] ?? '';
  preview = { ...preview, notes: k };
  rewritePreviewUrls(preview, publicBase.value);

  if (repoType.value === 'tauri') {
    const miss = Object.entries(preview.platforms || {}).filter(([, p]) =>
      String(p.signature || '').includes('未找到'),
    );
    if (miss.length && !allowMissingSig) {
      const ok = window.confirm(`缺少 .sig：${miss.map(([x]) => x).join(', ')}。仍要发布？`);
      if (!ok) return;
    }
  }

  await api('POST', `/api/apps/${encodeURIComponent(appName.value)}/publish`, preview);
  toast(`✓ ${ver} 已发布`);
  await loadVersions();
  await loadLatest();
  await loadDrafts();
}

function quickPublish(ver) {
  runPublish(ver).catch(e => toast(e.message, 'error'));
}
function republish(ver) {
  runPublish(ver).catch(e => toast(e.message, 'error'));
}

async function deleteFile(ver, name) {
  try {
    await api(
      'DELETE',
      `/api/apps/${encodeURIComponent(appName.value)}/versions/${encodeURIComponent(ver)}/files/${encodeURIComponent(name)}`,
    );
    toast(`已删除 ${name}`);
    await loadVersions();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function confirmDeleteVersion(ver) {
  if (
    !window.confirm(
      `删除版本「${ver}」将永久移除该目录下全部文件；若当前已发布指向此版本，latest.json 会被清空。不可恢复，确定继续？`,
    )
  )
    return;
  api('DELETE', `/api/apps/${encodeURIComponent(appName.value)}/versions/${encodeURIComponent(ver)}`)
    .then(async () => {
      toast(`版本 ${ver} 已删除`);
      delete notesDraft.value[ver];
      await loadVersions();
      await loadLatest();
    })
    .catch(e => toast(e.message, 'error'));
}

function confirmDeleteApp() {
  if (
    !window.confirm(
      `将删除应用「${displayLabel.value}」（包名 ${appName.value}）及 releases 下全部版本、latest.json、草稿与元数据。不可恢复，确定继续？`,
    )
  )
    return;
  api('DELETE', `/api/apps/${encodeURIComponent(appName.value)}`)
    .then(() => {
      toast('已删除');
      router.push('/');
    })
    .catch(e => toast(e.message, 'error'));
}

async function onFileChange(ver, ev) {
  const files = ev.target.files;
  if (files?.length) await doUpload(ver, files);
  ev.target.value = '';
}

async function onDrop(ev, ver) {
  dragVer.value = null;
  const files = ev.dataTransfer?.files;
  if (files?.length) await doUpload(ver, files);
}

async function doUpload(ver, files) {
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  uploadProgress.value = { ...uploadProgress.value, [ver]: 0 };
  try {
    await uploadWithProgress({
      method: 'POST',
      path: `/api/apps/${encodeURIComponent(appName.value)}/versions/${encodeURIComponent(ver)}/upload`,
      formData: fd,
      onProgress: pct => {
        uploadProgress.value = { ...uploadProgress.value, [ver]: pct < 0 ? -1 : pct };
      },
    });
    toast('上传完成');
    await loadVersions();
  } catch (e) {
    toast(e.message || '上传失败', 'error');
  } finally {
    const next = { ...uploadProgress.value };
    delete next[ver];
    uploadProgress.value = next;
  }
}

async function createVersion() {
  newVerErr.value = '';
  let ver = newVerInput.value.trim();
  if (!ver) return;
  if (repoType.value === 'tauri') {
    if (!ver.startsWith('v')) ver = `v${ver}`;
    if (!isSemVer2CoreWithVPrefix(ver)) {
      newVerErr.value = '须为 SemVer 2.0 三段式，如 v1.0.0';
      return;
    }
  } else {
    const r = normalizeGeneralVersionForClient(ver);
    if (r.error) {
      newVerErr.value = r.error;
      return;
    }
    ver = r.ver;
  }
  creatingVer.value = true;
  try {
    const fd = new FormData();
    fd.append('files', new File([''], '.gitkeep'));
    await uploadWithProgress({
      method: 'POST',
      path: `/api/apps/${encodeURIComponent(appName.value)}/versions/${encodeURIComponent(ver)}/upload`,
      formData: fd,
      onProgress: () => {},
    });
    toast(`版本 ${ver} 已创建`);
    showNewVer.value = false;
    newVerInput.value = '';
    await loadVersions();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    creatingVer.value = false;
  }
}

watch(
  () => route.params.name,
  () => {
    loadAll();
  },
);

onMounted(loadAll);
</script>

<style scoped>
.top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 22px;
}
.title-block {
  flex: 1;
  min-width: 120px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.titles {
  min-width: 0;
}
h1 {
  margin: 0;
  font-size: 24px;
}
.pkg-sub {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text2);
}
.pkg-sub code {
  font-size: 12px;
}
.meta-name-block {
  padding: 20px;
  margin-bottom: 20px;
}
.meta-name-block h2 {
  margin: 0 0 8px;
  font-size: 16px;
}
.hint.no-mt {
  margin-top: 0;
}
.badge-type {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text3);
  border: 1px solid var(--border);
  padding: 4px 8px;
  border-radius: 4px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.danger {
  color: #ff9a8b;
}
.api-block,
.pub-block {
  padding: 20px;
  margin-bottom: 20px;
}
.api-block h2,
.pub-block h2 {
  margin: 0 0 8px;
  font-size: 16px;
}
.hint {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--text2);
  line-height: 1.5;
}
.link-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 13px;
}
.link-row .lbl {
  min-width: 88px;
  color: var(--text3);
  font-size: 12px;
}
.mono {
  flex: 1;
  min-width: 200px;
  word-break: break-all;
  font-size: 12px;
  color: var(--accent-dim);
}
code {
  background: rgba(0, 0, 0, 0.25);
  padding: 2px 6px;
  border-radius: 4px;
}
.ver-line {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--text2);
}
.textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font-family: inherit;
  font-size: 14px;
  resize: vertical;
  margin-bottom: 10px;
}
.textarea.sm {
  font-size: 13px;
}
.lbl {
  display: block;
  font-size: 12px;
  color: var(--text2);
  margin-bottom: 6px;
}
.row-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.row-input {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 14px;
}
.row-input .input {
  flex: 1;
  min-width: 200px;
}
.textarea.code {
  font-family: ui-monospace, monospace;
  font-size: 12px;
}
.mt {
  margin-top: 16px;
}
.hint.sm {
  font-size: 12px;
  margin-top: 10px;
  margin-bottom: 0;
}
.muted-box {
  padding: 18px;
  margin-bottom: 20px;
  color: var(--text2);
}
.v-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}
.v-card {
  padding: 0;
  display: flex;
  flex-direction: column;
}
.v-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}
.v-name {
  font-weight: 700;
  font-size: 16px;
}
.pill {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ok);
  border: 1px solid rgba(82, 212, 138, 0.35);
  padding: 2px 8px;
  border-radius: 4px;
}
.v-actions {
  margin-left: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.ver-more {
  position: relative;
}
.ver-more-sum {
  cursor: pointer;
  list-style: none;
  font-size: 12px;
  color: var(--text3);
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.2);
}
.ver-more-sum::-webkit-details-marker {
  display: none;
}
.ver-more[open] .ver-more-sum {
  color: var(--text);
  border-color: rgba(232, 160, 53, 0.35);
}
.ver-more-menu {
  position: absolute;
  right: 0;
  top: 100%;
  margin-top: 4px;
  z-index: 20;
  min-width: 160px;
  padding: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
}
.ver-more-danger {
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border: none;
  border-radius: 4px;
  background: rgba(232, 93, 76, 0.12);
  color: #ff9a8b;
  font-size: 13px;
  cursor: pointer;
}
.ver-more-danger:hover {
  background: rgba(232, 93, 76, 0.2);
}
.notes {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.drop-zone {
  margin: 12px 16px;
  padding: 22px;
  border: 1px dashed rgba(232, 160, 53, 0.35);
  border-radius: var(--radius-sm);
  text-align: center;
  cursor: pointer;
  font-size: 13px;
  color: var(--text2);
  transition: background 0.2s, border-color 0.2s;
}
.drop-zone.drag {
  background: rgba(232, 160, 53, 0.08);
  border-color: var(--accent);
}
.subz {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  color: var(--text3);
}
.hidden-input {
  display: none;
}
.prog {
  padding: 0 16px 8px;
}
.prog-bar {
  height: 6px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  overflow: hidden;
}
.prog-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-dim), var(--accent));
  transition: width 0.15s ease;
}
.prog-txt {
  font-size: 11px;
  color: var(--text3);
  margin-top: 4px;
  display: block;
}
.prog.indet {
  font-size: 12px;
  color: var(--text3);
}
.files {
  list-style: none;
  margin: 0;
  padding: 8px 16px 16px;
}
.files li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 6px 0;
  border-top: 1px solid var(--border);
}
.files li:first-child {
  border-top: none;
}
.files a {
  flex: 1;
  min-width: 0;
  word-break: break-all;
  color: var(--text);
  text-decoration: none;
}
.files a:hover {
  color: var(--accent);
}
.sz {
  color: var(--text3);
  font-size: 12px;
}
.btn-icon {
  border: none;
  background: rgba(232, 93, 76, 0.15);
  color: #ff9a8b;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}
.modal-back {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  z-index: 8000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.modal {
  width: 100%;
  max-width: 400px;
  padding: 22px;
}
.modal h2 {
  margin: 0 0 12px;
}
.row {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
.err {
  color: var(--danger);
  font-size: 13px;
  margin: 8px 0 0;
}
.muted {
  color: var(--text2);
}
</style>
