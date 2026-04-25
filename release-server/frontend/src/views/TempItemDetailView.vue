<template>
  <div class="layout-max">
    <header class="top">
      <button type="button" class="btn btn-ghost" @click="router.push({ path: '/', hash: '#temp-hub' })">← 总览</button>
      <div class="title-block">
        <div class="titles">
          <h1>
            {{ item?.originalName || '临时文件' }}
            <span v-if="pageLoading" class="loading-pill">载入中…</span>
          </h1>
          <p class="pkg-sub">单文件 · 到期即删 · 标识 <code>{{ itemIdShort }}</code></p>
        </div>
        <span class="badge-type temp-pill">临时</span>
      </div>
      <div class="actions">
        <button
          type="button"
          class="btn btn-ghost danger"
          :disabled="pageLoading || !item"
          @click="confirmCancel"
        >取消传输</button>
      </div>
    </header>

    <p v-if="errMsg" class="card err-c">{{ errMsg }}</p>

    <section v-else-if="item" class="card block timer-card">
      <h2>剩余时间</h2>
      <p class="timer-hero" aria-live="polite">
        <span class="timer-val mono">{{ liveRemaining }}</span>
      </p>
      <p class="hint no-mt sm">到 {{ expireLocal }}</p>
    </section>

    <section v-if="item && publicBase" class="card api-block" :class="{ 'section-dim': pageLoading }">
      <h2>对外链接</h2>
      <p class="hint sm no-mt">访客打开「信息页」可看到与公开资源库类似的说明；「仅下载页」适合只转发大按钮。直链为文件流。</p>
      <ShareLinkRow v-if="item.landingUrl" label="信息页" :url="item.landingUrl" />
      <ShareLinkRow v-if="item.downloadPageUrl" label="仅下载页" :url="item.downloadPageUrl" />
      <ShareLinkRow v-if="item.downloadUrl" label="直链（下载）" :url="item.downloadUrl" />
      <ShareLinkRow v-if="item.metaUrl" label="JSON 元信息" :url="item.metaUrl" />
    </section>

    <section v-if="item" class="card block">
      <h2>文件信息</h2>
      <ul class="meta-list">
        <li><span class="k">大小</span><span class="v mono">{{ fmtSize(item.size) }}</span></li>
        <li><span class="k">下载次数</span><span class="v">{{ item.downloadCount ?? 0 }}</span></li>
        <li v-if="item.mimeType"><span class="k">类型</span><span class="v mono sm">{{ item.mimeType }}</span></li>
        <li><span class="k">创建</span><span class="v">{{ item.createdAt }}</span></li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api/client';
import { useToast } from '@/composables/useToast';
import { formatBytes } from '@/utils/format-bytes';
import { formatRemainingSec } from '@/utils/format-remaining';
import ShareLinkRow from '@/components/ShareLinkRow.vue';
import { suggestedPublicBaseFromVite } from '@/utils/public-url';

const route = useRoute();
const router = useRouter();
const { toast } = useToast();

const pageLoading = ref(true);
const errMsg = ref('');
const item = ref(null);
const publicBase = ref('');

const itemId = computed(() => {
  const id = String(route.params.id || '').trim();
  return /^[0-9a-f]{16}$/.test(id) ? id : '';
});
const itemIdShort = computed(() => (itemId.value ? itemId.value.slice(0, 8) : '—'));

const expireLocal = computed(() => {
  if (!item.value?.expireAt) return '—';
  try {
    return new Date(item.value.expireAt).toLocaleString();
  } catch {
    return item.value.expireAt;
  }
});

let tickTimer = null;
const nowTick = ref(Date.now());
function fmtSize(n) {
  return formatBytes(n);
}

const liveRemaining = computed(() => {
  if (!item.value?.expireAt) return '—';
  const ms = new Date(item.value.expireAt).getTime() - nowTick.value;
  const sec = Math.max(0, Math.floor(ms / 1000));
  return formatRemainingSec(sec);
});

async function loadBase() {
  try {
    const s = await api('GET', '/api/settings');
    publicBase.value = (s.baseUrl || '').replace(/\/$/, '') || suggestedPublicBaseFromVite();
  } catch {
    publicBase.value = suggestedPublicBaseFromVite();
  }
}

async function load() {
  if (!itemId.value) {
    errMsg.value = '无效的 ID';
    pageLoading.value = false;
    return;
  }
  pageLoading.value = true;
  errMsg.value = '';
  try {
    const d = await api('GET', `/api/temp-transfer/item/${encodeURIComponent(itemId.value)}`);
    item.value = d;
  } catch (e) {
    if (e.status === 404) errMsg.value = '记录不存在。';
    else if (e.status === 410) errMsg.value = '已过期或已删除。';
    else errMsg.value = e.message || '加载失败';
    item.value = null;
  } finally {
    pageLoading.value = false;
  }
}

function startTick() {
  stopTick();
  tickTimer = setInterval(() => {
    nowTick.value = Date.now();
  }, 1000);
}
function stopTick() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

watch(
  () => item.value?.expireAt,
  () => {
    nowTick.value = Date.now();
  },
);

async function confirmCancel() {
  if (!itemId.value) return;
  if (!window.confirm('确定要取消此临时传输？文件将立即从服务器删除，链接全部失效。')) return;
  try {
    await api('DELETE', `/api/temp-transfer/item/${encodeURIComponent(itemId.value)}`);
    toast('已取消');
    router.push({ path: '/', hash: '#temp-hub' });
  } catch (e) {
    toast(e.message || '操作失败', 'error');
  }
}

onMounted(async () => {
  await loadBase();
  await load();
  startTick();
});

onUnmounted(() => {
  stopTick();
});
</script>

<style scoped>
.temp-pill {
  background: linear-gradient(135deg, rgba(232, 160, 53, 0.2) 0%, rgba(120, 90, 40, 0.35) 100%);
  color: #f0c978;
  border: 1px solid rgba(232, 160, 53, 0.35);
  letter-spacing: 0.12em;
}
.err-c {
  color: var(--danger, #e85d4c);
  font-size: 14px;
  line-height: 1.5;
  margin-bottom: 16px;
}
.timer-card {
  border-color: rgba(232, 160, 53, 0.22) !important;
  background: linear-gradient(160deg, rgba(232, 160, 53, 0.06) 0%, var(--surface, #12100e) 55%) !important;
}
.timer-hero {
  margin: 0 0 8px;
  font-size: 28px;
  line-height: 1.2;
  letter-spacing: 0.04em;
}
.timer-val {
  color: var(--accent, #e8a035);
  font-weight: 700;
}
.hint.no-mt {
  margin-top: 0;
}
.meta-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px 0;
  font-size: 14px;
}
.meta-list li {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  align-items: baseline;
  border-bottom: 1px solid var(--border);
  padding-bottom: 10px;
}
.meta-list li:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.meta-list .k {
  min-width: 88px;
  color: var(--text3);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.meta-list .v {
  color: var(--text);
  word-break: break-all;
}
.meta-list .v.sm {
  font-size: 12px;
  opacity: 0.9;
}
</style>
