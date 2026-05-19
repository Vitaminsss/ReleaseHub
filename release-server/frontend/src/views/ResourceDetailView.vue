<template>
  <div class="layout-max">
    <header class="top">
      <button
        type="button"
        class="btn btn-ghost"
        @click="router.push({ path: '/', hash: '#library-grid' })"
      >← 总览</button>
      <div class="title-block">
        <div class="titles">
          <h1>
            {{ displayLabel }}
            <span v-if="pageLoading" class="loading-pill">载入中…</span>
          </h1>
          <p class="pkg-sub">标识 <code>{{ libraryName }}</code></p>
        </div>
        <span class="badge-type">resource</span>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-ghost danger" @click="confirmDeleteLibrary">删除资源库</button>
      </div>
    </header>

    <section class="card meta-block" :class="{ 'section-dim': pageLoading }">
      <h2>资源库信息</h2>
      <label class="lbl">标识（修改后公开 URL 中的路径段会变化）</label>
      <div class="row-input">
        <input
          v-model="idEdit"
          class="input code"
          spellcheck="false"
          :placeholder="libraryName"
          :disabled="pageLoading"
        />
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="savingId || pageLoading || idEdit.trim() === libraryName || !idEdit.trim()"
          @click="saveRename"
        >
          保存标识
        </button>
      </div>
      <label class="lbl">展示名（可选）</label>
      <input v-model="displayNameEdit" class="input" :placeholder="libraryName" :disabled="pageLoading" />
      <label class="lbl">资源库简介（可选，显示在公开下载页顶部）</label>
      <textarea
        v-model="descriptionEdit"
        class="textarea"
        rows="4"
        placeholder="支持换行"
        :disabled="pageLoading"
      />
      <div class="row-btns">
        <button type="button" class="btn btn-primary" :disabled="savingMeta || pageLoading" @click="saveMeta">
          保存名称与简介
        </button>
      </div>
    </section>

    <section v-if="publicBase" class="card api-block" :class="{ 'section-dim': pageLoading }">
      <h2>对外链接</h2>
      <ShareLinkRow v-if="publicPageUrl" label="公开浏览页" :url="publicPageUrl" />
      <ShareLinkRow v-if="publicArchiveRootUrl" label="根目录 ZIP 直链" :url="publicArchiveRootUrl" />
      <ShareLinkRow v-if="publicJsonUrl" label="JSON" :url="publicJsonUrl" />
      <p class="hint sm no-mt">公开页为卡片网格展示简介与版本；含子目录时可进入文件夹浏览或打包 ZIP。</p>
    </section>

    <section class="card upload-block" :class="{ 'section-dim': pageLoading }">
      <h2>上传文件</h2>
      <FolderAwareDropzone
        :disabled="pageLoading || uploading"
        :hint="
          uploading
            ? '正在上传…'
            : '拖拽文件或文件夹到此处，或点击选择（自动识别目录结构；同名覆盖并保留元数据）'
        "
        @items="onUploadItems"
      />
      <div v-if="uploadPct != null && uploadPct >= 0" class="prog">
        <div class="prog-bar">
          <div class="prog-fill" :style="{ width: uploadPct + '%' }" />
        </div>
        <span class="prog-txt">{{ uploadPct }}%</span>
      </div>
      <div v-else-if="uploadPct === -1" class="prog indet">上传中（无法计算进度）…</div>
    </section>

    <section v-if="items.length" class="card items-section" :class="{ 'section-dim': pageLoading }">
      <div class="items-section-head">
        <h2>资源文件</h2>
        <button
          v-if="hasNestedPaths"
          type="button"
          class="btn btn-sm btn-ghost"
          @click="folderBrowse = !folderBrowse"
        >
          {{ folderBrowse ? '显示全部卡片' : '按文件夹浏览' }}
        </button>
      </div>
      <template v-if="folderBrowse && hasNestedPaths">
      <nav class="file-crumbs" aria-label="路径">
        <button
          v-for="(c, i) in browseCrumbs"
          :key="c.path"
          type="button"
          class="crumb-btn"
          :class="{ current: i === browseCrumbs.length - 1 }"
          @click="browsePath = c.path"
        >
          {{ c.label }}
        </button>
      </nav>
      <p v-if="browseArchiveUrl" class="hint sm">
        <button type="button" class="btn btn-sm btn-ghost" @click="copy(browseArchiveUrl)">复制当前目录 ZIP 直链</button>
      </p>
      <ul v-if="browseFolders.length" class="folder-list">
        <li v-for="f in browseFolders" :key="f.path">
          <button type="button" class="folder-row" @click="browsePath = f.path">📁 {{ f.name }}</button>
        </li>
      </ul>
      </template>
      <transition-group name="res-card" tag="div" class="items-grid">
      <article v-for="it in displayItems" :key="it.id" class="card item-card">
        <header class="item-head">
          <div class="item-title-block">
            <div class="item-title-row">
              <span class="item-title">{{ itemCardTitle(it) }}</span>
              <span v-if="itemEdits[it.id]?.version?.trim()" class="item-ver">{{ itemEdits[it.id].version.trim() }}</span>
            </div>
            <span
              v-if="itemCardSubtitle(it)"
              class="item-path"
              :class="{ 'path-font': folderBrowse && hasNestedPaths }"
              :title="it.fileName"
            >{{ itemCardSubtitle(it) }}</span>
          </div>
          <span class="sz">{{ fmtSize(it.size) }}</span>
        </header>
        <div class="item-body">
          <label class="lbl">显示名（可选）</label>
          <input v-model="itemEdits[it.id].displayName" class="input sm" :disabled="pageLoading" />
          <label class="lbl">版本号（可选，公开页显示在名称右侧）</label>
          <input v-model="itemEdits[it.id].version" class="input sm" :disabled="pageLoading" placeholder="如 v1.2.0" />
          <label class="lbl">简介（可选）</label>
          <textarea v-model="itemEdits[it.id].description" class="textarea sm" rows="2" :disabled="pageLoading" />
        </div>
        <div class="item-actions">
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="savingItem === it.id || deletingItem === it.id || pageLoading"
            @click="saveItem(it.id)"
          >
            保存此项
          </button>
          <button type="button" class="btn btn-sm btn-ghost" @click="copy(itemLanding(it))">复制说明页</button>
          <button type="button" class="btn btn-sm btn-ghost" @click="copy(itemDirect(it))">复制直链</button>
          <button
            v-if="itemInSubfolder(it)"
            type="button"
            class="btn btn-sm btn-ghost"
            @click="copy(itemFolderZip(it))"
          >复制所在文件夹 ZIP</button>
          <button
            type="button"
            class="btn btn-sm btn-ghost danger"
            :disabled="deletingItem === it.id || savingItem === it.id || pageLoading"
            @click="confirmDeleteItem(it)"
          >
            删除
          </button>
        </div>
      </article>
      </transition-group>
    </section>
    <p v-if="!pageLoading && !items.length" class="muted empty-hint">暂无文件，请上传。</p>
  </div>
</template>

<script setup>
import { ref, computed, watch, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, uploadWithProgress } from '@/api/client';
import { useToast } from '@/composables/useToast';
import ShareLinkRow from '@/components/ShareLinkRow.vue';
import FolderAwareDropzone from '@/components/FolderAwareDropzone.vue';
import { appendToFormData, describeUploadBatch } from '@/composables/useFolderUpload';
import { listDirectoryLevel, breadcrumbSegments, encodePathForUrl } from '@/utils/file-tree';
import { suggestedPublicBaseFromVite } from '@/utils/public-url';

const route = useRoute();
const router = useRouter();
const { toast } = useToast();

const libraryName = computed(() => decodeURIComponent(route.params.name || ''));
const pageLoading = ref(true);
const publicBase = ref('');
const displayNameEdit = ref('');
const descriptionEdit = ref('');
const idEdit = ref('');
const savingMeta = ref(false);
const savingId = ref(false);
const savingItem = ref(null);
const deletingItem = ref(null);
const uploading = ref(false);
const items = ref([]);
/** 每项编辑草稿；键与 items[].id 对齐，模板 v-model 依赖此对象已存在 */
const itemEdits = reactive({});
const uploadPct = ref(null);
const browsePath = ref('');
const folderBrowse = ref(false);

const displayLabel = computed(() => displayNameEdit.value.trim() || libraryName.value);

const publicPageUrl = computed(() =>
  publicBase.value && libraryName.value ? `${publicBase.value}/r/${encodeURIComponent(libraryName.value)}` : '',
);
const publicJsonUrl = computed(() =>
  publicBase.value && libraryName.value
    ? `${publicBase.value}/api/public/resources/${encodeURIComponent(libraryName.value)}`
    : '',
);
const publicArchiveRootUrl = computed(() =>
  publicBase.value && libraryName.value
    ? `${publicBase.value}/r/${encodeURIComponent(libraryName.value)}/archive`
    : '',
);
const browseCrumbs = computed(() => breadcrumbSegments(browsePath.value));
const browseListing = computed(() => listDirectoryLevel(items.value, browsePath.value));
const browseFolders = computed(() => browseListing.value.folders);
const browseFiles = computed(() => browseListing.value.files);
const hasNestedPaths = computed(() => items.value.some(it => String(it.fileName || '').includes('/')));
const displayItems = computed(() =>
  folderBrowse.value && hasNestedPaths.value ? browseFiles.value : items.value,
);
const browseArchiveUrl = computed(() => {
  if (!publicBase.value || !libraryName.value) return '';
  const q = browsePath.value ? `?path=${encodeURIComponent(browsePath.value)}` : '';
  return `${publicBase.value}/r/${encodeURIComponent(libraryName.value)}/archive${q}`;
});

function suggestedBase() {
  return suggestedPublicBaseFromVite();
}

async function loadSettingsBase() {
  try {
    const s = await api('GET', '/api/settings');
    publicBase.value = (s.baseUrl || '').replace(/\/$/, '') || suggestedBase();
  } catch {
    publicBase.value = suggestedBase();
  }
}

function enrichItem(it) {
  const name = libraryName.value;
  const base = publicBase.value;
  const encPath = encodePathForUrl(it.fileName);
  return {
    ...it,
    landingHref: `${base}/rd/${encodeURIComponent(name)}/${encPath}`,
    downloadUrl: `${base}/r/${encodeURIComponent(name)}/files/${encPath}`,
  };
}

function fileBaseName(path) {
  const s = String(path || '');
  const i = s.lastIndexOf('/');
  return i >= 0 ? s.slice(i + 1) : s;
}

function itemCardTitle(it) {
  const dn = itemEdits[it.id]?.displayName?.trim();
  if (dn) return dn;
  return fileBaseName(it.fileName) || it.fileName;
}

function itemCardSubtitle(it) {
  const path = String(it.fileName || '');
  const dn = itemEdits[it.id]?.displayName?.trim();
  if (dn && dn !== fileBaseName(path)) return path;
  if (path.includes('/')) return path;
  return '';
}

function itemInSubfolder(it) {
  return String(it.fileName || '').includes('/');
}

function itemFolderZip(it) {
  const base = publicBase.value;
  const name = libraryName.value;
  if (!base || !name) return '';
  const parts = String(it.fileName).split('/');
  parts.pop();
  const dir = parts.join('/');
  const q = dir ? `?path=${encodeURIComponent(dir)}` : '';
  return `${base}/r/${encodeURIComponent(name)}/archive${q}`;
}

function primeItemEdits(list) {
  const ids = new Set((list || []).map(x => x.id));
  for (const k of Object.keys(itemEdits)) {
    if (!ids.has(k)) delete itemEdits[k];
  }
  for (const it of list || []) {
    if (!itemEdits[it.id]) {
      itemEdits[it.id] = {
        displayName: it.displayName || '',
        version: it.version || '',
        description: it.description || '',
      };
    }
  }
}

function applyDetail(d) {
  displayNameEdit.value = d.displayName != null ? String(d.displayName) : '';
  descriptionEdit.value = d.description != null ? String(d.description) : '';
  idEdit.value = libraryName.value;
  const raw = d.items || [];
  items.value = raw.map(enrichItem);
  primeItemEdits(raw);
}

async function loadPage() {
  pageLoading.value = true;
  try {
    await loadSettingsBase();
    const d = await api('GET', `/api/resources/${encodeURIComponent(libraryName.value)}`);
    applyDetail(d);
  } catch (e) {
    toast(e.message, 'error');
    items.value = [];
    for (const k of Object.keys(itemEdits)) delete itemEdits[k];
  } finally {
    pageLoading.value = false;
  }
}

function fmtSize(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function itemLanding(it) {
  return (
    it.landingHref ||
    `${publicBase.value}/rd/${encodeURIComponent(libraryName.value)}/${encodeURIComponent(it.fileName)}`
  );
}
function itemDirect(it) {
  return (
    it.downloadUrl ||
    `${publicBase.value}/r/${encodeURIComponent(libraryName.value)}/files/${encodeURIComponent(it.fileName)}`
  );
}

function copy(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(
    () => toast('已复制'),
    () => toast('复制失败', 'error'),
  );
}

async function saveMeta() {
  if (descriptionEdit.value.length > 6000) {
    toast('简介过长（最多 6000 字）', 'error');
    return;
  }
  savingMeta.value = true;
  try {
    const idx = await api('PATCH', `/api/resources/${encodeURIComponent(libraryName.value)}`, {
      displayName: displayNameEdit.value.trim(),
      description: descriptionEdit.value.trim(),
    });
    displayNameEdit.value = idx.displayName != null ? String(idx.displayName) : '';
    descriptionEdit.value = idx.description != null ? String(idx.description) : '';
    toast('已保存');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    savingMeta.value = false;
  }
}

async function saveRename() {
  const next = idEdit.value.trim();
  if (!next || !/^[a-zA-Z0-9_-]+$/.test(next)) {
    toast('标识只能包含字母、数字、下划线和连字符', 'error');
    return;
  }
  if (next === libraryName.value) return;
  if (
    !window.confirm(
      `将资源库标识「${libraryName.value}」改为「${next}」：公开 URL 路径会变化，旧链接将失效。确定继续？`,
    )
  )
    return;
  savingId.value = true;
  try {
    await api('POST', `/api/resources/${encodeURIComponent(libraryName.value)}/rename`, { newName: next });
    toast('已修改标识');
    await router.replace(`/resources/${encodeURIComponent(next)}`);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    savingId.value = false;
  }
}

async function saveItem(id) {
  const ed = itemEdits[id];
  if (!ed) return;
  if ((ed.description || '').length > 6000) {
    toast('简介过长', 'error');
    return;
  }
  savingItem.value = id;
  try {
    const r = await api('PATCH', `/api/resources/${encodeURIComponent(libraryName.value)}/items/${encodeURIComponent(id)}`, {
      displayName: ed.displayName,
      version: ed.version,
      description: ed.description,
    });
    const updated = enrichItem(r.item);
    const i = items.value.findIndex(x => x.id === updated.id);
    if (i >= 0) items.value[i] = updated;
    itemEdits[id] = {
      displayName: updated.displayName || '',
      version: updated.version || '',
      description: updated.description || '',
    };
    toast('已保存');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    savingItem.value = null;
  }
}

async function confirmDeleteItem(it) {
  if (!window.confirm(`删除文件「${it.fileName}」？磁盘文件与列表项都会删除。`)) return;
  deletingItem.value = it.id;
  try {
    await api('DELETE', `/api/resources/${encodeURIComponent(libraryName.value)}/items/${encodeURIComponent(it.id)}`);
    items.value = items.value.filter(x => x.id !== it.id);
    delete itemEdits[it.id];
    toast('已删除');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    deletingItem.value = null;
  }
}

async function confirmDeleteLibrary() {
  if (!window.confirm(`删除整个资源库「${libraryName.value}」？此操作不可恢复。`)) return;
  try {
    await api('DELETE', `/api/resources/${encodeURIComponent(libraryName.value)}`);
    toast('已删除资源库');
    router.push({ path: '/', hash: '#library-grid' });
  } catch (e) {
    toast(e.message, 'error');
  }
}

const UPLOAD_BATCH = 50;

async function doUploadItems(uploadItems) {
  if (!uploadItems?.length || pageLoading.value) return;
  const desc = describeUploadBatch(uploadItems);
  uploading.value = true;
  uploadPct.value = 0;
  let totalUploaded = 0;
  let failed = 0;
  try {
    for (let i = 0; i < uploadItems.length; i += UPLOAD_BATCH) {
      const batch = uploadItems.slice(i, i + UPLOAD_BATCH);
      const fd = new FormData();
      appendToFormData(fd, batch);
      const data = await uploadWithProgress({
        method: 'POST',
        path: `/api/resources/${encodeURIComponent(libraryName.value)}/upload`,
        formData: fd,
        onProgress: pct => {
          uploadPct.value = pct < 0 ? -1 : pct;
        },
      });
      const uploaded = data?.uploaded || [];
      totalUploaded += uploaded.length;
      for (const u of uploaded) {
        const e = enrichItem(u);
        const ix = items.value.findIndex(x => x.fileName === e.fileName);
        if (ix >= 0) items.value.splice(ix, 1);
        items.value.push(e);
        itemEdits[u.id] = {
          displayName: u.displayName || '',
          version: u.version || '',
          description: u.description || '',
        };
      }
    }
    items.value.sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true }));
    const msg =
      failed > 0
        ? `${desc.label}：成功 ${totalUploaded}，失败 ${failed}`
        : `${desc.label}：已上传 ${totalUploaded} 个文件`;
    toast(msg);
  } catch (e) {
    toast(e.message || '上传失败', 'error');
  } finally {
    uploading.value = false;
    uploadPct.value = null;
  }
}

function onUploadItems(list) {
  doUploadItems(list);
}

watch(
  () => route.params.name,
  (name, oldName) => {
    if (oldName !== undefined && name !== oldName) {
      items.value = [];
      for (const k of Object.keys(itemEdits)) delete itemEdits[k];
      displayNameEdit.value = '';
      descriptionEdit.value = '';
      idEdit.value = decodeURIComponent(name || '');
    }
    loadPage();
  },
  { immediate: true },
);

/** 防止异步或边界情况下 v-model 读到未初始化的 id */
watch(
  items,
  arr => {
    for (const it of arr) {
      if (it?.id && !itemEdits[it.id]) {
        itemEdits[it.id] = {
          displayName: it.displayName || '',
          version: it.version || '',
          description: it.description || '',
        };
      }
    }
  },
  { deep: true },
);
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
h1 {
  margin: 0;
  font-size: 24px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.loading-pill {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  border: 1px solid rgba(232, 160, 53, 0.35);
  padding: 3px 10px;
  border-radius: 999px;
  letter-spacing: 0.04em;
}
.pkg-sub {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text2);
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
.meta-block,
.api-block,
.upload-block {
  padding: 20px;
  margin-bottom: 20px;
}
.section-dim {
  opacity: 0.55;
  pointer-events: none;
}
.meta-block h2,
.api-block h2,
.upload-block h2 {
  margin: 0 0 12px;
  font-size: 16px;
}
.lbl {
  display: block;
  font-size: 12px;
  color: var(--text2);
  margin-bottom: 6px;
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
.input.sm {
  margin-bottom: 8px;
}
.row-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.hint {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--text2);
}
.hint.sm {
  font-size: 12px;
  margin-top: 10px;
}
.hint.no-mt {
  margin-top: 0;
}
.drop-zone {
  padding: 22px;
  border: 1px dashed rgba(232, 160, 53, 0.35);
  border-radius: var(--radius-sm);
  text-align: center;
  cursor: pointer;
  font-size: 13px;
  color: var(--text2);
  transition: background 0.2s, border-color 0.2s, opacity 0.2s;
}
.drop-zone.drag {
  background: rgba(232, 160, 53, 0.08);
  border-color: var(--accent);
}
.drop-zone.disabled {
  cursor: not-allowed;
  opacity: 0.65;
}
.hidden-input {
  display: none;
}
.prog {
  margin-top: 12px;
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
}
.prog-txt {
  font-size: 11px;
  color: var(--text3);
  margin-top: 4px;
}
.prog.indet {
  font-size: 12px;
  color: var(--text3);
  margin-top: 8px;
}
.items-section {
  padding: 20px;
  margin-bottom: 20px;
}
.items-section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}
.items-section-head h2 {
  margin: 0;
  font-size: 16px;
}
.file-crumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 12px;
  font-size: 13px;
}
.crumb-btn {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  padding: 2px 4px;
  font: inherit;
}
.crumb-btn.current {
  color: var(--text);
  cursor: default;
}
.folder-list {
  list-style: none;
  margin: 0 0 14px;
  padding: 0;
}
.folder-row {
  width: 100%;
  text-align: left;
  background: rgba(232, 160, 53, 0.06);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  color: var(--text);
  cursor: pointer;
  font-size: 14px;
  margin-bottom: 6px;
}
.folder-row:hover {
  border-color: rgba(232, 160, 53, 0.35);
}
.path-font {
  font-family: var(--font-path, 'IBM Plex Mono'), ui-monospace, monospace;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.items-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
.item-card {
  padding: 0;
  display: flex;
  flex-direction: column;
  min-height: 100%;
  border: 1px solid var(--border);
  background: linear-gradient(168deg, #14110e 0%, #0e0c0a 52%, #12100e 100%);
  box-shadow:
    0 20px 50px rgba(0, 0, 0, 0.42),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  overflow: hidden;
  transition:
    border-color 0.22s ease,
    box-shadow 0.22s ease,
    transform 0.22s ease;
}
.item-card:hover {
  border-color: rgba(232, 160, 53, 0.38);
  box-shadow:
    0 26px 56px rgba(0, 0, 0, 0.48),
    0 0 0 1px rgba(232, 160, 53, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  transform: translateY(-2px);
}
.item-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px 14px;
  padding: 15px 16px 14px;
  border-bottom: 1px solid var(--border);
}
.item-title-block {
  flex: 1;
  min-width: 0;
}
.item-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 12px;
}
.item-title {
  font-weight: 700;
  font-size: 17px;
  line-height: 1.3;
  color: var(--accent);
  letter-spacing: -0.015em;
  word-break: break-word;
}
.item-ver {
  font-family: var(--font-path);
  font-size: 12px;
  font-weight: 600;
  color: var(--text3);
  letter-spacing: 0.06em;
  flex-shrink: 0;
}
.item-path {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  color: var(--text3);
  overflow-wrap: anywhere;
}
.sz {
  font-family: var(--font-path);
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  flex-shrink: 0;
  opacity: 0.92;
}
.item-body {
  padding: 12px 16px 14px;
  flex: 1;
}
.item-body .textarea.sm {
  font-family: 'Fraunces', 'Noto Serif SC', 'Source Han Serif CN', serif;
  font-size: 14px;
  line-height: 1.65;
  color: #e3ddd4;
}
.item-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 11px 16px 12px;
  border-top: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.18);
  margin-top: auto;
}
.muted {
  color: var(--text2);
}
.empty-hint {
  padding: 24px;
  text-align: center;
}

.res-card-enter-active,
.res-card-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}
.res-card-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.res-card-leave-to {
  opacity: 0;
  transform: scale(0.98);
}
.res-card-move {
  transition: transform 0.22s ease;
}
</style>
