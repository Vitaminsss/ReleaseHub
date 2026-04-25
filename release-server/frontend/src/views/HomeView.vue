<template>
  <div class="layout-max home" id="library-grid">
    <header class="page-head">
      <h1>总览</h1>
      <p class="sub">Tauri、通用、资源库与「临时文件」在此并列；点击卡片进入对应管理页。临时文件为单份、可定时删除的分享链。</p>
    </header>

    <p v-if="loading" class="muted">加载中…</p>

    <template v-else>
      <section id="temp-hub" class="section-temp" aria-label="临时传输">
        <div class="toolbar">
          <div class="toolbar-text">
            <h2 class="toolbar-title">临时文件</h2>
            <p v-if="!tempItems.length" class="section-sub">无进行中的文件。可新建一条并对外分享，到期自动删除。</p>
          </div>
          <div class="toolbar-actions">
            <button type="button" class="btn btn-primary" @click="router.push('/temp-transfer')">新的临时文件</button>
          </div>
        </div>

        <div v-if="tempItems.length" class="grid temp-grid">
          <button
            v-for="it in tempItems"
            :key="it.id"
            type="button"
            class="app-tile card temp-tile"
            @click="goTemp(it)"
          >
            <div class="lib-tile-header">
              <div class="lib-title-block">
                <span class="name temp-filename">{{ it.originalName || '未命名' }}</span>
                <span class="pkg-id temp-id" :title="it.id">#{{ it.id.slice(0, 8) }}</span>
              </div>
              <span class="lib-count temp-remain mono">{{ remLabel(it) }}</span>
            </div>
            <div class="lib-growth temp-sheen" aria-hidden="true" />
            <div class="lib-footer lib-footer--pillOnly">
              <span class="lib-pill lib-pill--temp">临时 · 单文件</span>
            </div>
          </button>
        </div>
      </section>

      <div class="section-gutter" role="separator" aria-hidden="true" />

      <div class="toolbar">
        <div class="toolbar-text">
          <h2 class="toolbar-title">所有库</h2>
        </div>
        <div class="toolbar-actions">
          <button type="button" class="btn btn-primary" @click="showCreateApp = true">新建应用</button>
          <button type="button" class="btn btn-primary" @click="showCreateResource = true">新建资源库</button>
        </div>
      </div>

      <p v-if="!allItems.length" class="empty-hint">暂无库。可新建「应用」（多版本发版）或「资源库」（多文件无版本线）</p>

      <TransitionGroup v-else name="slide-up" tag="div" class="grid">
        <button
          v-for="it in allItems"
          :key="it.key"
          type="button"
          class="app-tile card lib-card"
          @click="goItem(it)"
        >
          <template v-if="it.kind === 'app'">
            <div class="lib-tile-header">
              <div class="lib-title-block">
                <span class="name">{{ it.displayLabel || it.name }}</span>
                <span v-if="it.displayName" class="pkg-id" aria-label="包名">{{ it.name }}</span>
              </div>
              <span class="lib-count">{{ it.versionCount }} 个版本</span>
            </div>
            <div class="lib-growth" aria-hidden="true" />
            <div class="lib-footer">
              <div class="lib-footer-left">
                <span v-if="it.latestVersion" class="ver">
                  <span class="ver-label">最新</span>
                  <strong>{{ it.latestVersion }}</strong>
                </span>
                <span v-else class="ver muted2">尚未发布</span>
              </div>
              <span
                class="lib-pill"
                :class="it.repoType === 'tauri' ? 'lib-pill--tauri' : 'lib-pill--general'"
              >{{ it.repoType === 'tauri' ? 'Tauri' : '通用' }}</span>
            </div>
          </template>
          <template v-else>
            <div class="lib-tile-header">
              <div class="lib-title-block">
                <span class="name">{{ it.displayLabel || it.name }}</span>
                <span v-if="it.displayName" class="pkg-id">{{ it.name }}</span>
              </div>
              <span class="lib-count">{{ it.itemCount }} 个文件</span>
            </div>
            <div class="lib-growth" aria-hidden="true" />
            <div class="lib-footer lib-footer--pillOnly">
              <span class="lib-pill lib-pill--resource">资源库</span>
            </div>
          </template>
        </button>
      </TransitionGroup>
    </template>

    <teleport to="body">
      <div v-if="showCreateApp" class="modal-back" @click.self="showCreateApp = false">
        <div class="modal card">
          <h2>新建应用</h2>
          <label class="lbl">软件名（可选，用于展示）</label>
          <input v-model="newAppDisplayName" class="input" placeholder="例如：闪电助手" />
          <label class="lbl">包名（目录与 URL，仅字母数字、_ -）</label>
          <input v-model="newAppName" class="input" placeholder="my-app" />
          <label class="lbl">类型</label>
          <select v-model="newAppRepoType" class="input">
            <option value="general">通用</option>
            <option value="tauri">Tauri</option>
          </select>
          <div class="row">
            <button type="button" class="btn btn-ghost" @click="showCreateApp = false">取消</button>
            <button type="button" class="btn btn-primary" :disabled="creatingApp" @click="createApp">创建</button>
          </div>
        </div>
      </div>
    </teleport>

    <teleport to="body">
      <div v-if="showCreateResource" class="modal-back" @click.self="showCreateResource = false">
        <div class="modal card">
          <h2>新建资源库</h2>
          <label class="lbl">展示名（可选）</label>
          <input v-model="newResDisplayName" class="input" placeholder="例如：常用工具合集" />
          <label class="lbl">资源库标识（目录与 URL，仅字母数字、_ -）</label>
          <input v-model="newResName" class="input" placeholder="my-resources" />
          <label class="lbl">资源库简介（可选）</label>
          <textarea v-model="newResDescription" class="textarea" rows="3" placeholder="对外下载页顶部说明" />
          <div class="row">
            <button type="button" class="btn btn-ghost" @click="showCreateResource = false">取消</button>
            <button type="button" class="btn btn-primary" :disabled="creatingRes" @click="createLibrary">创建</button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/client';
import { useToast } from '@/composables/useToast';
import { formatRemainingSec } from '@/utils/format-remaining';

const router = useRouter();
const { toast } = useToast();
const apps = ref([]);
const libraries = ref([]);
const tempItems = ref([]);
const loading = ref(true);
const tempTick = ref(0);
let tempListTimer = null;
let tempTickTimer = null;
const showCreateApp = ref(false);
const showCreateResource = ref(false);
const newAppName = ref('');
const newAppDisplayName = ref('');
const newAppRepoType = ref('general');
const creatingApp = ref(false);
const newResName = ref('');
const newResDisplayName = ref('');
const newResDescription = ref('');
const creatingRes = ref(false);

const allItems = computed(() => {
  const a = apps.value.map(x => ({ kind: 'app', key: `app:${x.name}`, ...x }));
  const r = libraries.value.map(x => ({ kind: 'resource', key: `res:${x.name}`, ...x }));
  return [...a, ...r];
});

function goItem(it) {
  if (it.kind === 'app') {
    router.push(`/app/${encodeURIComponent(it.name)}`);
  } else {
    router.push(`/resources/${encodeURIComponent(it.name)}`);
  }
}

function goTemp(it) {
  router.push(`/temp-transfer/${encodeURIComponent(it.id)}`);
}

function remLabel(it) {
  void tempTick.value;
  const exp = it.expireAt ? new Date(it.expireAt).getTime() : 0;
  const sec = Math.max(0, Math.floor((exp - Date.now()) / 1000));
  if (!exp) return formatRemainingSec(it.secondsRemaining || 0);
  return `剩余 ${formatRemainingSec(sec)}`;
}

async function loadTempList() {
  try {
    const t = await api('GET', '/api/temp-transfer/list');
    tempItems.value = t?.items || [];
  } catch {
    tempItems.value = [];
  }
}

async function load() {
  loading.value = true;
  try {
    const [a, r] = await Promise.all([api('GET', '/api/apps'), api('GET', '/api/resources')]);
    apps.value = a;
    libraries.value = r;
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    loading.value = false;
  }
  await loadTempList();
}

async function createApp() {
  const name = newAppName.value.trim();
  if (!name) {
    toast('请填写包名', 'error');
    return;
  }
  creatingApp.value = true;
  try {
    const body = { name, repoType: newAppRepoType.value };
    const dn = newAppDisplayName.value.trim();
    if (dn) body.displayName = dn;
    await api('POST', '/api/apps', body);
    toast('已创建');
    showCreateApp.value = false;
    newAppName.value = '';
    newAppDisplayName.value = '';
    await load();
    router.push(`/app/${encodeURIComponent(name)}`);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    creatingApp.value = false;
  }
}

async function createLibrary() {
  const name = newResName.value.trim();
  if (!name) {
    toast('请填写资源库标识', 'error');
    return;
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    toast('标识只能包含字母、数字、下划线和连字符', 'error');
    return;
  }
  creatingRes.value = true;
  try {
    const body = { name };
    const dn = newResDisplayName.value.trim();
    if (dn) body.displayName = dn;
    const desc = newResDescription.value.trim();
    if (desc) body.description = desc;
    await api('POST', '/api/resources', body);
    toast('已创建');
    showCreateResource.value = false;
    newResName.value = '';
    newResDisplayName.value = '';
    newResDescription.value = '';
    await load();
    router.push(`/resources/${encodeURIComponent(name)}`);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    creatingRes.value = false;
  }
}

onMounted(async () => {
  await load();
  tempTickTimer = setInterval(() => {
    tempTick.value += 1;
  }, 1000);
  tempListTimer = setInterval(() => {
    loadTempList();
  }, 40000);
  if (
    window.location.hash === '#section-resources' ||
    window.location.hash === '#library-grid' ||
    window.location.hash === '#temp-hub'
  ) {
    const id = window.location.hash === '#temp-hub' ? 'temp-hub' : 'library-grid';
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
});

onUnmounted(() => {
  if (tempListTimer) clearInterval(tempListTimer);
  if (tempTickTimer) clearInterval(tempTickTimer);
});
</script>

<style scoped>
.home {
  padding-bottom: 32px;
}
.page-head {
  margin-bottom: 20px;
}
h1 {
  margin: 0;
  font-size: 26px;
  font-family: var(--font-display, system-ui);
  letter-spacing: 0.02em;
}
.sub {
  margin: 8px 0 0;
  color: var(--text2);
  font-size: 14px;
  max-width: 40rem;
  line-height: 1.5;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
  margin-bottom: 16px;
}
.toolbar-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text2);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.empty-hint {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--text3);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
  align-content: start;
  min-height: 0;
}
.app-tile {
  padding: 20px;
  cursor: pointer;
  border: 1px solid var(--border);
  background: linear-gradient(165deg, var(--surface) 0%, var(--surface2) 100%);
  border-radius: var(--radius);
  transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
}
.app-tile:hover {
  border-color: rgba(232, 160, 53, 0.35);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  transform: translateY(-2px);
}
.muted {
  color: var(--text2);
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
  max-width: 420px;
  padding: 24px;
}
.modal h2 {
  margin: 0 0 16px;
  font-size: 18px;
}
.lbl {
  display: block;
  font-size: 12px;
  color: var(--text2);
  margin-bottom: 6px;
  margin-top: 12px;
}
.lbl:first-of-type {
  margin-top: 0;
}
.input,
.textarea {
  width: 100%;
  margin-bottom: 0;
}
.textarea {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font-family: inherit;
  font-size: 14px;
  resize: vertical;
  margin-top: 4px;
}
.row {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
.section-temp {
  margin-bottom: 8px;
}
.section-temp .toolbar {
  margin-bottom: 14px;
}
.section-sub {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text3);
  line-height: 1.5;
  max-width: 36rem;
  font-weight: 400;
  letter-spacing: 0.01em;
}
.temp-grid {
  margin-top: 4px;
}
.temp-tile {
  text-align: left;
  background: linear-gradient(168deg, rgba(20, 17, 14, 0.98) 0%, rgba(8, 7, 6, 0.99) 100%);
  border-color: rgba(232, 160, 53, 0.22) !important;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35);
}
.temp-tile:hover {
  border-color: rgba(232, 160, 53, 0.45) !important;
  box-shadow: 0 16px 44px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(232, 160, 53, 0.12);
}
.temp-filename {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}
.temp-id {
  font-size: 10px;
  letter-spacing: 0.1em;
  opacity: 0.7;
}
.temp-remain {
  font-size: 12px;
  color: #e8a035;
  max-width: 8.5rem;
  text-align: right;
  line-height: 1.3;
}
.lib-pill--temp {
  background: linear-gradient(90deg, rgba(232, 160, 53, 0.18) 0%, rgba(60, 45, 20, 0.5) 100%);
  color: #f0c978;
  border: 1px solid rgba(232, 160, 53, 0.25);
}
.temp-sheen {
  background: linear-gradient(105deg, transparent 0%, rgba(232, 160, 53, 0.04) 40%, transparent 80%);
  min-height: 6px;
  margin: 4px 0 8px;
  border-radius: 4px;
}
.section-gutter {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border), transparent);
  margin: 22px 0 20px;
  opacity: 0.85;
}
.mono {
  font-family: 'Share Tech Mono', ui-monospace, monospace;
}
</style>
