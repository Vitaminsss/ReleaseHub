<template>
  <div class="layout-max">
    <header class="top">
      <div>
        <h1>资源库</h1>
        <p class="sub">无版本概念，公开一页列出当前所有安装包，可为每项写简介</p>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-ghost" @click="router.push('/')">应用</button>
        <button type="button" class="btn btn-ghost" @click="router.push('/settings')">设置</button>
        <button type="button" class="btn btn-primary" @click="showCreate = true">新建资源库</button>
      </div>
    </header>

    <div v-if="loading" class="muted">加载中…</div>
    <div v-else class="grid">
      <transition-group name="slide-up">
        <button
          v-for="r in libraries"
          :key="r.name"
          type="button"
          class="app-tile card lib-card"
          @click="router.push(`/resources/${encodeURIComponent(r.name)}`)"
        >
          <div class="lib-tile-header">
            <div class="lib-title-block">
              <span class="name">{{ r.displayLabel || r.name }}</span>
              <span v-if="r.displayName" class="pkg-id">{{ r.name }}</span>
            </div>
            <span class="lib-count">{{ r.itemCount }} 个文件</span>
          </div>
          <div class="lib-growth" aria-hidden="true" />
          <div class="lib-footer lib-footer--pillOnly">
            <span class="lib-pill lib-pill--resource">资源库</span>
          </div>
        </button>
      </transition-group>
    </div>

    <teleport to="body">
      <div v-if="showCreate" class="modal-back" @click.self="showCreate = false">
        <div class="modal card">
          <h2>新建资源库</h2>
          <label class="lbl">展示名（可选）</label>
          <input v-model="newDisplayName" class="input" placeholder="例如：常用工具合集" />
          <label class="lbl">资源库标识（目录与 URL，仅字母数字、_ -）</label>
          <input v-model="newName" class="input" placeholder="my-resources" />
          <label class="lbl">资源库简介（可选）</label>
          <textarea v-model="newDescription" class="textarea" rows="3" placeholder="对外下载页顶部说明" />
          <div class="row">
            <button type="button" class="btn btn-ghost" @click="showCreate = false">取消</button>
            <button type="button" class="btn btn-primary" :disabled="creating" @click="createLibrary">创建</button>
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
const libraries = ref([]);
const loading = ref(true);
const showCreate = ref(false);
const newName = ref('');
const newDisplayName = ref('');
const newDescription = ref('');
const creating = ref(false);

async function load() {
  loading.value = true;
  try {
    libraries.value = await api('GET', '/api/resources');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    loading.value = false;
  }
}

async function createLibrary() {
  const name = newName.value.trim();
  if (!name) {
    toast('请填写资源库标识', 'error');
    return;
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    toast('标识只能包含字母、数字、下划线和连字符', 'error');
    return;
  }
  creating.value = true;
  try {
    const body = { name };
    const dn = newDisplayName.value.trim();
    if (dn) body.displayName = dn;
    const desc = newDescription.value.trim();
    if (desc) body.description = desc;
    await api('POST', '/api/resources', body);
    toast('已创建');
    showCreate.value = false;
    newName.value = '';
    newDisplayName.value = '';
    newDescription.value = '';
    await load();
    router.push(`/resources/${encodeURIComponent(name)}`);
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
  margin: 8px 0 0;
  color: var(--text2);
  font-size: 14px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}
.app-tile {
  cursor: pointer;
  padding: 20px;
  border: 1px solid var(--border);
  background: linear-gradient(165deg, var(--surface) 0%, var(--surface2) 100%);
  border-radius: var(--radius);
  transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
}
.app-tile:hover {
  border-color: rgba(232, 160, 53, 0.4);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.3);
  transform: translateY(-2px);
}
.muted {
  color: var(--text2);
}
.lbl {
  display: block;
  font-size: 12px;
  color: var(--text2);
  margin-bottom: 6px;
}
.input,
.textarea {
  width: 100%;
  margin-bottom: 12px;
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
  padding: 22px;
}
.modal h2 {
  margin: 0 0 12px;
}
.row {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}
</style>
