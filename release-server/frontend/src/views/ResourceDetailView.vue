<template>
  <div class="layout-max">
    <header class="top">
      <button type="button" class="btn btn-ghost" @click="router.push('/resources')">← 资源库列表</button>
      <div class="title-block">
        <div class="titles">
          <h1>{{ displayLabel }}</h1>
          <p class="pkg-sub">标识 <code>{{ libraryName }}</code></p>
        </div>
        <span class="badge-type">resource</span>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-ghost" @click="router.push('/settings')">设置</button>
        <button type="button" class="btn btn-ghost danger" @click="confirmDeleteLibrary">删除资源库</button>
      </div>
    </header>

    <section class="card meta-block">
      <h2>资源库信息</h2>
      <label class="lbl">标识（修改后公开 URL 中的路径段会变化）</label>
      <div class="row-input">
        <input v-model="idEdit" class="input code" spellcheck="false" :placeholder="libraryName" />
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="savingId || idEdit.trim() === libraryName || !idEdit.trim()"
          @click="saveRename"
        >
          保存标识
        </button>
      </div>
      <label class="lbl">展示名（可选）</label>
      <input v-model="displayNameEdit" class="input" :placeholder="libraryName" />
      <label class="lbl">资源库简介（可选，显示在公开下载页顶部）</label>
      <textarea v-model="descriptionEdit" class="textarea" rows="4" placeholder="支持换行" />
      <div class="row-btns">
        <button type="button" class="btn btn-primary" :disabled="savingMeta" @click="saveMeta">保存名称与简介</button>
      </div>
    </section>

    <section v-if="publicBase" class="card api-block">
      <h2>对外链接</h2>
      <ShareLinkRow v-if="publicPageUrl" label="公开下载页" :url="publicPageUrl" />
      <ShareLinkRow v-if="publicJsonUrl" label="JSON" :url="publicJsonUrl" />
      <p class="hint sm no-mt">访客打开公开页可浏览列表；每项可点进单文件说明页再下载。</p>
    </section>

    <section class="card upload-block">
      <h2>上传安装包</h2>
      <div
        class="drop-zone"
        :class="{ drag: dragActive }"
        @dragover.prevent="dragActive = true"
        @dragleave="dragActive = false"
        @drop.prevent="onDrop"
        @click="fileInputRef?.click()"
      >
        <input ref="fileInputRef" type="file" multiple class="hidden-input" @change="onFileChange" />
        <span>拖拽文件到此处或点击上传（同文件名会覆盖并保留元数据）</span>
      </div>
      <div v-if="uploadPct != null && uploadPct >= 0" class="prog">
        <div class="prog-bar">
          <div class="prog-fill" :style="{ width: uploadPct + '%' }" />
        </div>
        <span class="prog-txt">{{ uploadPct }}%</span>
      </div>
      <div v-else-if="uploadPct === -1" class="prog indet">上传中…</div>
    </section>

    <div v-if="loading" class="muted">加载中…</div>
    <div v-else class="items">
      <article v-for="it in items" :key="it.id" class="card item-card">
        <header class="item-head">
          <span class="fn">{{ it.fileName }}</span>
          <span class="sz">{{ fmtSize(it.size) }}</span>
        </header>
        <label class="lbl">显示名（可选）</label>
        <input
          class="input sm"
          :modelValue="editFor(it).displayName"
          @update:modelValue="v => { editFor(it).displayName = v }"
        />
        <label class="lbl">简介（可选）</label>
        <textarea
          class="textarea sm"
          rows="2"
          :modelValue="editFor(it).description"
          @update:modelValue="v => { editFor(it).description = v }"
        />
        <div class="row-btns">
          <button type="button" class="btn btn-primary btn-sm" :disabled="savingItem === it.id" @click="saveItem(it.id)">
            保存此项
          </button>
          <button type="button" class="btn btn-sm btn-ghost" @click="copy(itemLanding(it))">复制说明页</button>
          <button type="button" class="btn btn-sm btn-ghost" @click="copy(itemDirect(it))">复制直链</button>
          <button type="button" class="btn btn-sm btn-ghost danger" @click="confirmDeleteItem(it)">删除</button>
        </div>
      </article>
      <p v-if="!items.length" class="muted empty-hint">暂无文件，请上传。</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, uploadWithProgress } from '@/api/client';
import { useToast } from '@/composables/useToast';
import ShareLinkRow from '@/components/ShareLinkRow.vue';

const route = useRoute();
const router = useRouter();
const { toast } = useToast();

const libraryName = computed(() => decodeURIComponent(route.params.name || ''));
const loading = ref(true);
const publicBase = ref('');
const displayNameEdit = ref('');
const descriptionEdit = ref('');
const idEdit = ref('');
const savingMeta = ref(false);
const savingId = ref(false);
const savingItem = ref(null);
const items = ref([]);
const itemEdits = reactive({});
const dragActive = ref(false);
const fileInputRef = ref(null);
const uploadPct = ref(null);

const displayLabel = computed(() => displayNameEdit.value.trim() || libraryName.value);

const publicPageUrl = computed(() =>
  publicBase.value && libraryName.value ? `${publicBase.value}/r/${encodeURIComponent(libraryName.value)}` : '',
);
const publicJsonUrl = computed(() =>
  publicBase.value && libraryName.value
    ? `${publicBase.value}/api/public/resources/${encodeURIComponent(libraryName.value)}`
    : '',
);

function suggestedBase() {
  let p = window.location.pathname.replace(/\/index\.html$/i, '');
  p = p.replace(/\/$/, '') || '';
  const basePath = p && p !== '/' ? p : '';
  return `${window.location.origin}${basePath}`.replace(/\/$/, '');
}

async function loadSettingsBase() {
  try {
    const s = await api('GET', '/api/settings');
    publicBase.value = (s.baseUrl || '').replace(/\/$/, '') || suggestedBase();
  } catch {
    publicBase.value = suggestedBase();
  }
}

function syncItemEdits(list) {
  const ids = new Set((list || []).map(x => x.id));
  for (const k of Object.keys(itemEdits)) {
    if (!ids.has(k)) delete itemEdits[k];
  }
  for (const it of list || []) {
    if (!itemEdits[it.id]) {
      itemEdits[it.id] = { displayName: it.displayName || '', description: it.description || '' };
    }
  }
}

/** 渲染前保证 itemEdits[id] 存在，避免 v-model 访问 undefined */
function editFor(it) {
  const id = it?.id;
  if (!id) return { displayName: '', description: '' };
  if (!itemEdits[id]) {
    itemEdits[id] = { displayName: it.displayName || '', description: it.description || '' };
  }
  return itemEdits[id];
}

async function loadDetail() {
  loading.value = true;
  try {
    await loadSettingsBase();
    const d = await api('GET', `/api/resources/${encodeURIComponent(libraryName.value)}`);
    displayNameEdit.value = d.displayName != null ? String(d.displayName) : '';
    descriptionEdit.value = d.description != null ? String(d.description) : '';
    idEdit.value = libraryName.value;
    const rawItems = d.items || [];
    syncItemEdits(rawItems);
    items.value = rawItems;
  } catch (e) {
    toast(e.message, 'error');
    syncItemEdits([]);
    items.value = [];
  } finally {
    loading.value = false;
  }
}

function fmtSize(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function itemLanding(it) {
  return it.landingHref || `${publicBase.value}/rd/${encodeURIComponent(libraryName.value)}/${encodeURIComponent(it.fileName)}`;
}
function itemDirect(it) {
  return it.downloadUrl || `${publicBase.value}/r/${encodeURIComponent(libraryName.value)}/files/${encodeURIComponent(it.fileName)}`;
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
    await api('PATCH', `/api/resources/${encodeURIComponent(libraryName.value)}`, {
      displayName: displayNameEdit.value.trim(),
      description: descriptionEdit.value.trim(),
    });
    toast('已保存');
    await loadDetail();
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
    await api('PATCH', `/api/resources/${encodeURIComponent(libraryName.value)}/items/${encodeURIComponent(id)}`, {
      displayName: ed.displayName,
      description: ed.description,
    });
    toast('已保存');
    await loadDetail();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    savingItem.value = null;
  }
}

async function confirmDeleteItem(it) {
  if (!window.confirm(`删除文件「${it.fileName}」？磁盘文件与列表项都会删除。`)) return;
  try {
    await api('DELETE', `/api/resources/${encodeURIComponent(libraryName.value)}/items/${encodeURIComponent(it.id)}`);
    toast('已删除');
    await loadDetail();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function confirmDeleteLibrary() {
  if (!window.confirm(`删除整个资源库「${libraryName.value}」？此操作不可恢复。`)) return;
  try {
    await api('DELETE', `/api/resources/${encodeURIComponent(libraryName.value)}`);
    toast('已删除资源库');
    router.push('/resources');
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function doUpload(files) {
  if (!files?.length) return;
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  uploadPct.value = 0;
  try {
    await uploadWithProgress({
      method: 'POST',
      path: `/api/resources/${encodeURIComponent(libraryName.value)}/upload`,
      formData: fd,
      onProgress: pct => {
        uploadPct.value = pct < 0 ? -1 : pct;
      },
    });
    toast('上传完成');
    await loadDetail();
  } catch (e) {
    toast(e.message || '上传失败', 'error');
  } finally {
    uploadPct.value = null;
    dragActive.value = false;
  }
}

function onDrop(e) {
  dragActive.value = false;
  doUpload([...e.dataTransfer.files]);
}

function onFileChange(e) {
  const files = e.target.files ? [...e.target.files] : [];
  e.target.value = '';
  doUpload(files);
}

watch(
  () => route.params.name,
  () => {
    loadDetail();
  },
  { immediate: true },
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
}
.drop-zone.drag {
  background: rgba(232, 160, 53, 0.08);
  border-color: var(--accent);
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
.items {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.item-card {
  padding: 16px;
}
.item-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 10px;
}
.fn {
  font-weight: 700;
  word-break: break-all;
  flex: 1;
  min-width: 0;
}
.sz {
  font-size: 12px;
  color: var(--text3);
}
.muted {
  color: var(--text2);
}
.empty-hint {
  padding: 24px;
  text-align: center;
}
</style>
