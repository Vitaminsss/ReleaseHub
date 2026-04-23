<template>
  <div class="layout-max">
    <header class="top">
      <button type="button" class="btn btn-ghost" @click="router.push('/')">← 返回</button>
      <h1>设置</h1>
    </header>

    <section class="card block">
      <h2>数据目录（排查「应用列表为空」）</h2>
      <p class="hint">
        Tauri / 通用库只读 <strong>应用目录</strong>，与资源库无关。若升级后列表空了，多半是服务读到的路径下没有旧数据：请核对
        <code>RELEASES_DIR</code> 是否仍指向你以前放包的目录（可在部署环境 <code>.env</code> 里设置）。
      </p>
      <p v-if="releasesDir" class="mono-path"><span class="lbl-inline">应用（releases）</span>{{ releasesDir }}</p>
      <p v-if="resourceLibrariesDir" class="mono-path">
        <span class="lbl-inline">资源库</span>{{ resourceLibrariesDir }}
      </p>
    </section>

    <section class="card block">
      <h2>BASE_URL</h2>
      <p class="hint">下载直链与 latest.json 内 url 依赖此项。修改后可用应用页的「刷新下载链接」批量更新已发布 URL。</p>
      <div class="row-input">
        <input v-model="baseUrl" class="input" placeholder="https://example.com/releasehub" />
        <button type="button" class="btn btn-primary" :disabled="savingBase" @click="saveBase">保存</button>
      </div>
    </section>

    <section class="card block">
      <h2>磁盘空间（releases 卷）</h2>
      <p v-if="!disk" class="muted">当前环境无法读取磁盘统计</p>
      <p v-else class="disk">
        已用 <strong>{{ fmt(disk.used) }}</strong> / 共 {{ fmt(disk.total) }} · 剩余
        {{ fmt(disk.free) }}
      </p>
    </section>

    <section class="card block">
      <h2>修改密码</h2>
      <label class="lbl">当前密码</label>
      <input v-model="oldPwd" type="password" class="input" autocomplete="current-password" />
      <label class="lbl">新密码（至少 5 位）</label>
      <input v-model="newPwd" type="password" class="input" autocomplete="new-password" />
      <label class="lbl">确认新密码</label>
      <input v-model="newPwd2" type="password" class="input" autocomplete="new-password" />
      <button type="button" class="btn btn-primary mt" :disabled="changingPwd" @click="changePwd">更新密码</button>
    </section>

    <footer class="foot">
      <button type="button" class="btn btn-ghost" @click="logout">退出登录</button>
    </footer>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/api/client';
import { useToast } from '@/composables/useToast';

const router = useRouter();
const auth = useAuthStore();
const { toast } = useToast();

const baseUrl = ref('');
const releasesDir = ref('');
const resourceLibrariesDir = ref('');
const savingBase = ref(false);
const disk = ref(null);
const oldPwd = ref('');
const newPwd = ref('');
const newPwd2 = ref('');
const changingPwd = ref(false);

function fmt(n) {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

async function load() {
  try {
    const s = await api('GET', '/api/settings');
    baseUrl.value = s.baseUrl || '';
    releasesDir.value = s.releasesDir || '';
    resourceLibrariesDir.value = s.resourceLibrariesDir || '';
  } catch (e) {
    toast(e.message, 'error');
  }
  try {
    const sys = await api('GET', '/api/system');
    disk.value = sys.disk;
  } catch {
    disk.value = null;
  }
}

async function saveBase() {
  savingBase.value = true;
  try {
    const r = await api('POST', '/api/base-url', { baseUrl: baseUrl.value.trim() });
    baseUrl.value = r.baseUrl;
    toast('已保存 BASE_URL');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    savingBase.value = false;
  }
}

async function changePwd() {
  if (newPwd.value !== newPwd2.value) {
    toast('两次新密码不一致', 'error');
    return;
  }
  changingPwd.value = true;
  try {
    await api('POST', '/api/change-password', { oldPassword: oldPwd.value, newPassword: newPwd.value });
    toast('密码已更新，请重新登录');
    auth.logout();
    router.replace('/login');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    changingPwd.value = false;
  }
}

function logout() {
  auth.logout();
  router.replace('/login');
}

onMounted(load);
</script>

<style scoped>
.top {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}
.top h1 {
  margin: 0;
  font-size: 22px;
}
.block {
  padding: 22px;
  margin-bottom: 18px;
}
.block h2 {
  margin: 0 0 10px;
  font-size: 16px;
}
.hint {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--text2);
  line-height: 1.5;
}
.mono-path {
  font-size: 12px;
  font-family: ui-monospace, monospace;
  word-break: break-all;
  color: var(--accent-dim);
  margin: 0 0 10px;
  line-height: 1.5;
}
.lbl-inline {
  display: block;
  font-size: 11px;
  color: var(--text3);
  margin-bottom: 4px;
  font-family: system-ui, sans-serif;
}
.row-input {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.row-input .input {
  flex: 1;
  min-width: 200px;
}
.lbl {
  display: block;
  font-size: 12px;
  color: var(--text2);
  margin: 12px 0 6px;
}
.mt {
  margin-top: 16px;
}
.muted {
  color: var(--text2);
  font-size: 14px;
}
.disk {
  font-size: 14px;
  color: var(--text2);
}
.disk strong {
  color: var(--text);
}
.foot {
  margin-top: 28px;
}
</style>
