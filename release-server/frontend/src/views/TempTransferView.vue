<template>
  <div class="layout-max">
    <header class="top">
      <button type="button" class="btn btn-ghost" @click="router.push('/')">← 总览</button>
      <div class="title-block">
        <div class="titles">
          <h1>临时传输</h1>
          <p class="pkg-sub">上传后生成短链，到期自动删除。链接依赖设置中的 <code>BASE_URL</code>。</p>
        </div>
        <span class="badge-type badge--tool">工具</span>
      </div>
    </header>

    <p v-if="loadError" class="card err-banner">{{ loadError }}</p>

    <section v-else class="card block">
      <h2>选择文件与有效期</h2>
      <p class="hint">单文件大小上限为 {{ maxFileSizeMb }} MB。有效期需在服务器允许列表内。</p>

      <input
        ref="fileInput"
        type="file"
        class="file-input"
        :disabled="uploading"
        @change="onFileChange"
      />
      <div class="row-pick">
        <button
          type="button"
          class="btn btn-ghost"
          :disabled="uploading"
          @click="fileInput?.click()"
        >选择文件</button>
        <span class="file-name" :class="{ muted2: !pickedName }">{{ pickedName || '未选择' }}</span>
      </div>

      <label class="lbl">有效期</label>
      <select v-model="ttlMinutes" class="input" :disabled="uploading || !allowedTtls.length">
        <option v-for="m in allowedTtls" :key="m" :value="m">
          {{ formatTtl(m) }}（{{ m }} 分钟）
        </option>
      </select>

      <div v-if="uploading" class="progress-line">
        <div class="progress-fill" :style="{ width: progressPct < 0 ? '40%' : `${progressPct}%` }" />
        <span class="progress-txt">
          {{ progressPct < 0 ? '上传中…' : `${progressPct}%` }}
        </span>
      </div>

      <div class="row-btns" style="margin-top: 16px">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="!file || uploading || !allowedTtls.length"
          @click="startUpload"
        >上传并生成链接</button>
        <button v-if="result" type="button" class="btn btn-ghost" @click="resetResult">清除结果</button>
      </div>
    </section>

    <section v-if="result" class="card block">
      <h2>分享链接</h2>
      <p class="hint">截止 {{ result.expireAtLabel }}（已上传 {{ result.originalName || '文件' }}）</p>
      <ShareLinkRow label="下载" :url="result.downloadUrl" />
      <ShareLinkRow label="元信息" :url="result.metaUrl" />
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api, uploadWithProgress } from '@/api/client';
import { useToast } from '@/composables/useToast';
import ShareLinkRow from '@/components/ShareLinkRow.vue';

const router = useRouter();
const { toast } = useToast();

const fileInput = ref(null);
const file = ref(null);
const pickedName = ref('');
const allowedTtls = ref([]);
const defaultTtl = ref(1440);
const maxFileSizeMb = ref(500);
const loadError = ref('');

const ttlMinutes = ref(1440);
const uploading = ref(false);
const progressPct = ref(0);
const result = ref(null);

function formatTtl(m) {
  if (m === 1440) return '24 小时';
  if (m < 60) return `${m} 分钟`;
  if (m % 60 === 0) return `${m / 60} 小时`;
  return `${m} 分钟`;
}

function onFileChange(e) {
  const f = e?.target?.files?.[0];
  file.value = f || null;
  pickedName.value = f ? f.name : '';
  result.value = null;
}

function resetResult() {
  result.value = null;
  if (fileInput.value) fileInput.value.value = '';
  file.value = null;
  pickedName.value = '';
}

async function loadAllowed() {
  loadError.value = '';
  try {
    const d = await api('GET', '/api/temp-transfer/allowed-ttls');
    allowedTtls.value = d.allowedTtlsMinutes || [];
    if (d.defaultTtlMinutes != null) {
      defaultTtl.value = d.defaultTtlMinutes;
      if (allowedTtls.value.includes(d.defaultTtlMinutes)) {
        ttlMinutes.value = d.defaultTtlMinutes;
      } else {
        ttlMinutes.value = allowedTtls.value[0] ?? 1440;
      }
    } else {
      ttlMinutes.value = allowedTtls.value[0] ?? 1440;
    }
    if (d.maxFileSizeMb != null) maxFileSizeMb.value = d.maxFileSizeMb;
  } catch (e) {
    if (e.status === 404) {
      loadError.value = '本服务器未启用「临时传输」，或该功能已关闭。可在服务端设置 TEMP_TRANSFER_ENABLED。';
    } else {
      loadError.value = e.message || '无法读取临时传输配置';
    }
  }
}

function expireLabel(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

async function startUpload() {
  if (!file.value) {
    toast('请选择文件', 'error');
    return;
  }
  const fd = new FormData();
  fd.append('file', file.value);
  fd.append('ttlMinutes', String(ttlMinutes.value));
  uploading.value = true;
  progressPct.value = 0;
  result.value = null;
  try {
    const data = await uploadWithProgress({
      method: 'POST',
      path: '/api/temp-transfer/upload',
      formData: fd,
      onProgress: (n) => {
        progressPct.value = n;
      },
    });
    const expireAt = data.expireAt || '';
    result.value = {
      downloadUrl: data.downloadUrl || '',
      metaUrl: data.metaUrl || '',
      originalName: data.originalName,
      expireAtLabel: expireLabel(expireAt),
    };
    toast('已生成链接');
  } catch (e) {
    toast(e.message || '上传失败', 'error');
  } finally {
    uploading.value = false;
    progressPct.value = 0;
  }
}

onMounted(() => {
  loadAllowed();
});
</script>

<style scoped>
.file-input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}
.row-pick {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.file-name {
  font-size: 14px;
  word-break: break-all;
}
.muted2 {
  color: var(--text3);
}
.progress-line {
  position: relative;
  margin-top: 16px;
  height: 10px;
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--border);
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-dim, #c98728) 0%, var(--accent, #e8a035) 100%);
  transition: width 0.2s ease;
}
.progress-txt {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  color: var(--text2);
  text-shadow: 0 0 4px #000;
}
.err-banner {
  color: var(--danger, #e85d4c);
  font-size: 14px;
  line-height: 1.5;
  margin-bottom: 16px;
}
.badge--tool {
  background: rgba(100, 180, 200, 0.15);
  color: #9ad4e0;
}
</style>
