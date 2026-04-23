<template>
  <div class="layout-max">
    <header class="top">
      <div>
        <h1>应用</h1>
        <p class="sub">选择应用管理版本与发布</p>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-ghost" @click="router.push('/settings')">设置</button>
        <button type="button" class="btn btn-primary" @click="showCreate = true">新建应用</button>
      </div>
    </header>

    <div v-if="loading" class="muted">加载中…</div>
    <div v-else class="grid">
      <transition-group name="slide-up">
        <button
          v-for="a in apps"
          :key="a.name"
          type="button"
          class="app-tile card"
          @click="router.push(`/app/${encodeURIComponent(a.name)}`)"
        >
          <span class="name">{{ a.displayLabel || a.name }}</span>
          <span v-if="a.displayName" class="pkg-id">{{ a.name }}</span>
          <span class="meta">{{ a.repoType }} · {{ a.versionCount }} 个版本</span>
          <span v-if="a.latestVersion" class="ver">最新 {{ a.latestVersion }}</span>
          <span v-else class="ver muted2">尚未发布</span>
        </button>
      </transition-group>
    </div>

    <teleport to="body">
      <div v-if="showCreate" class="modal-back" @click.self="showCreate = false">
        <div class="modal card">
          <h2>新建应用</h2>
          <label class="lbl">软件名（可选，用于展示）</label>
          <input v-model="newDisplayName" class="input" placeholder="例如：闪电助手" />
          <label class="lbl">包名（目录与 URL，仅字母数字、_ -）</label>
          <input v-model="newName" class="input" placeholder="my-app" />
          <label class="lbl">类型</label>
          <select v-model="newRepoType" class="input">
            <option value="general">通用</option>
            <option value="tauri">Tauri</option>
          </select>
          <div class="row">
            <button type="button" class="btn btn-ghost" @click="showCreate = false">取消</button>
            <button type="button" class="btn btn-primary" :disabled="creating" @click="createApp">创建</button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/client';
import { useToast } from '@/composables/useToast';

const router = useRouter();
const { toast } = useToast();
const apps = ref([]);
const loading = ref(true);
const showCreate = ref(false);
const newName = ref('');
const newDisplayName = ref('');
const newRepoType = ref('general');
const creating = ref(false);

async function load() {
  loading.value = true;
  try {
    apps.value = await api('GET', '/api/apps');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    loading.value = false;
  }
}

async function createApp() {
  const name = newName.value.trim();
  if (!name) {
    toast('请填写包名', 'error');
    return;
  }
  creating.value = true;
  try {
    const body = { name, repoType: newRepoType.value };
    const dn = newDisplayName.value.trim();
    if (dn) body.displayName = dn;
    await api('POST', '/api/apps', body);
    toast('已创建');
    showCreate.value = false;
    newName.value = '';
    newDisplayName.value = '';
    await load();
    router.push(`/app/${encodeURIComponent(name)}`);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    creating.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 28px;
}
h1 {
  margin: 0;
  font-size: 26px;
}
.sub {
  margin: 6px 0 0;
  color: var(--text2);
  font-size: 14px;
}
.actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}
.app-tile {
  text-align: left;
  padding: 20px;
  cursor: pointer;
  border: 1px solid var(--border);
  background: linear-gradient(165deg, var(--surface) 0%, var(--surface2) 100%);
  transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
}
.app-tile:hover {
  border-color: rgba(232, 160, 53, 0.35);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  transform: translateY(-2px);
}
.name {
  display: block;
  font-weight: 700;
  font-size: 17px;
  margin-bottom: 6px;
}
.pkg-id {
  display: block;
  font-size: 12px;
  color: var(--text3);
  font-family: ui-monospace, monospace;
  margin-bottom: 4px;
}
.meta {
  display: block;
  font-size: 12px;
  color: var(--text3);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.ver {
  display: block;
  margin-top: 12px;
  font-size: 13px;
  color: var(--accent);
}
.muted {
  color: var(--text2);
}
.muted2 {
  color: var(--text3);
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
.row {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
</style>
