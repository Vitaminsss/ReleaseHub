<template>
  <div class="layout-max temp-upload">
    <header class="top">
      <button type="button" class="btn btn-ghost" @click="router.push({ path: '/', hash: '#temp-hub' })">← 总览</button>
      <div class="title-block">
        <div class="titles">
          <h1>新的临时文件</h1>
          <p class="pkg-sub">拖拽或选择文件，指定有效期。上传后可在总览中管理。对外链接与 <code>BASE_URL</code> 一致。</p>
        </div>
        <span class="badge-nova">+</span>
      </div>
    </header>

    <p v-if="loadError" class="card err-banner">{{ loadError }}</p>

    <section v-else class="card block upload-hero" :class="{ 'is-busy': uploading }">
      <h2>上传</h2>
      <p class="hint">最大 {{ maxFileSizeMb }} MB。可选有效期为服务端允许范围。</p>

      <div
        class="drop-zone"
        :class="{ drag: dragActive, disabled: uploading }"
        @dragover.prevent="!uploading && (dragActive = true)"
        @dragleave="dragActive = false"
        @drop.prevent="onDrop"
        @click="!uploading && fileInputRef?.click()"
      >
        <input
          ref="fileInputRef"
          type="file"
          class="hidden-input"
          :disabled="uploading"
          @change="onFileChange"
        />
        <div class="dz-inner">
          <span class="dz-orbit" aria-hidden="true" />
          <p class="dz-line1">{{ uploading ? '正在上传…' : '将文件拖入此处' }}</p>
          <p class="dz-line2">或点击从本机选择</p>
        </div>
      </div>

      <div class="ttl-row">
        <label class="lbl">有效期</label>
        <select v-model="ttlMinutes" class="input ttl-select" :disabled="uploading || !allowedTtls.length">
          <option v-for="m in allowedTtls" :key="m" :value="m">
            {{ formatTtl(m) }}（{{ m }} 分钟）
          </option>
        </select>
      </div>

      <p v-if="pickedName" class="pick-name">
        已选 <strong>{{ pickedName }}</strong>
      </p>

      <div v-if="uploadPct != null && uploadPct >= 0" class="prog">
        <div class="prog-bar">
          <div class="prog-fill" :style="{ width: uploadPct + '%' }" />
        </div>
        <span class="prog-txt mono">{{ uploadPct }}%</span>
      </div>
      <div v-else-if="uploadPct === -1" class="prog indet">上传中（无法计算进度）…</div>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api, uploadWithProgress } from '@/api/client';
import { useToast } from '@/composables/useToast';

const router = useRouter();
const { toast } = useToast();

const fileInputRef = ref(null);
const file = ref(null);
const pickedName = ref('');
const allowedTtls = ref([]);
const maxFileSizeMb = ref(500);
const loadError = ref('');

const ttlMinutes = ref(1440);
const uploading = ref(false);
const uploadPct = ref(/** @type {number | null} */ (null));
const dragActive = ref(false);

function formatTtl(m) {
  if (m === 1440) return '24 小时';
  if (m < 60) return `${m} 分钟`;
  if (m % 60 === 0) return `${m / 60} 小时`;
  return `${m} 分钟`;
}

function pickFile(f) {
  if (!f) return;
  file.value = f;
  pickedName.value = f.name;
}

function onFileChange(e) {
  const f = e?.target?.files?.[0];
  if (f) {
    pickFile(f);
    doUpload();
  }
}

function onDrop(e) {
  dragActive.value = false;
  if (uploading.value) return;
  const f = e.dataTransfer?.files?.[0];
  if (f) {
    pickFile(f);
    doUpload();
  }
}

async function loadAllowed() {
  loadError.value = '';
  try {
    const d = await api('GET', '/api/temp-transfer/allowed-ttls');
    allowedTtls.value = d.allowedTtlsMinutes || [];
    if (d.defaultTtlMinutes != null && allowedTtls.value.includes(d.defaultTtlMinutes)) {
      ttlMinutes.value = d.defaultTtlMinutes;
    } else {
      ttlMinutes.value = allowedTtls.value[0] ?? 1440;
    }
    if (d.maxFileSizeMb != null) maxFileSizeMb.value = d.maxFileSizeMb;
  } catch (e) {
    if (e.status === 404) {
      loadError.value = '本服务器未启用「临时传输」。可在 .env 中设置 TEMP_TRANSFER_ENABLED。';
    } else {
      loadError.value = e.message || '无法读取配置';
    }
  }
}

async function doUpload() {
  if (!file.value) return;
  if (loadError.value) return;
  const fd = new FormData();
  fd.append('file', file.value);
  fd.append('ttlMinutes', String(ttlMinutes.value));
  uploading.value = true;
  uploadPct.value = 0;
  try {
    const data = await uploadWithProgress({
      method: 'POST',
      path: '/api/temp-transfer/upload',
      formData: fd,
      onProgress: n => {
        uploadPct.value = n;
      },
    });
    toast('已创建临时文件');
    if (data?.id) {
      router.push(`/temp-transfer/${encodeURIComponent(data.id)}`);
    } else {
      router.push({ path: '/', hash: '#temp-hub' });
    }
  } catch (e) {
    toast(e.message || '上传失败', 'error');
  } finally {
    uploading.value = false;
    uploadPct.value = null;
    if (fileInputRef.value) fileInputRef.value.value = '';
    file.value = null;
    pickedName.value = '';
  }
}

onMounted(() => {
  loadAllowed();
});
</script>

<style scoped>
.temp-upload {
  padding-bottom: 40px;
}
.badge-nova {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 2.4rem;
  height: 2.4rem;
  border-radius: 0.5rem;
  background: linear-gradient(145deg, #f0b24a 0%, #c98728 100%);
  color: #1a1208;
  font-size: 1.4rem;
  font-weight: 800;
  line-height: 1;
  box-shadow: 0 8px 24px rgba(232, 160, 53, 0.25);
}
.err-banner {
  color: var(--danger, #e85d4c);
  font-size: 14px;
  line-height: 1.5;
  margin-bottom: 16px;
}
.upload-hero {
  position: relative;
  overflow: hidden;
}
.upload-hero::after {
  content: '';
  position: absolute;
  right: -40px;
  top: -40px;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(232, 160, 53, 0.12) 0%, transparent 70%);
  pointer-events: none;
}
.upload-hero.is-busy {
  opacity: 0.95;
  pointer-events: none;
}
.hidden-input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}
.drop-zone {
  position: relative;
  border: 1.5px dashed rgba(232, 160, 53, 0.35);
  background: linear-gradient(165deg, rgba(18, 16, 14, 0.95) 0%, rgba(10, 9, 8, 0.98) 100%);
  border-radius: 12px;
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin-top: 12px;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}
.drop-zone:hover,
.drop-zone.drag {
  border-color: rgba(232, 160, 53, 0.6);
  box-shadow: 0 0 0 1px rgba(232, 160, 53, 0.15), 0 12px 40px rgba(0, 0, 0, 0.4);
  background: linear-gradient(165deg, rgba(30, 26, 22, 0.98) 0%, rgba(12, 11, 9, 1) 100%);
}
.drop-zone.disabled {
  opacity: 0.55;
  cursor: not-allowed;
  pointer-events: none;
}
.dz-inner {
  text-align: center;
  padding: 24px 20px;
  position: relative;
  z-index: 1;
}
.dz-orbit {
  display: block;
  width: 48px;
  height: 48px;
  margin: 0 auto 16px;
  border-radius: 12px;
  border: 2px solid rgba(232, 160, 53, 0.45);
  border-top-color: transparent;
  animation: spin 1.1s linear infinite;
  opacity: 0.85;
}
.upload-hero:not(.is-busy) .dz-orbit {
  animation: none;
  border: 2px solid rgba(232, 160, 53, 0.25);
  border-top-color: rgba(232, 160, 53, 0.55);
}
.dz-line1 {
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 6px;
  letter-spacing: 0.02em;
}
.dz-line2 {
  font-size: 13px;
  color: var(--text3);
  margin: 0;
}
.ttl-row {
  margin-top: 20px;
  max-width: 320px;
}
.ttl-select {
  margin-top: 6px;
}
.pick-name {
  margin-top: 12px;
  font-size: 13px;
  color: var(--text2);
  word-break: break-all;
}
.prog {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}
.prog-bar {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--border);
  overflow: hidden;
}
.prog-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #c98728 0%, #e8a035 100%);
  transition: width 0.15s ease;
}
.prog-txt {
  font-size: 12px;
  color: var(--text2);
  min-width: 2.5rem;
  text-align: right;
}
.prog.indet {
  font-size: 12px;
  color: var(--text2);
  margin-top: 8px;
}
.mono {
  font-family: 'Share Tech Mono', ui-monospace, monospace;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
