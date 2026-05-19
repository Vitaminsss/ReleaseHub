<template>
  <div class="layout-max">
    <header class="top">
      <button type="button" class="btn btn-ghost" @click="router.push({ path: '/', hash: '#temp-hub' })">← 总览</button>
      <div class="title-block">
        <div class="titles">
          <h1>新的临时文件</h1>
          <p class="pkg-sub">单文件或文件夹分享，到期自动删除。链接与设置中的 <code>BASE_URL</code> 一致。</p>
        </div>
        <span class="badge-type">temp</span>
      </div>
    </header>

    <p v-if="loadError" class="card err-line">{{ loadError }}</p>

    <section v-else class="card upload-block" :class="{ 'section-dim': uploading }">
      <h2>上传</h2>
      <p class="hint">单文件最大 {{ maxFileSizeMb }} MB（文件夹为各文件分别计）。可选有效期须为服务端允许列表中的值。</p>

      <FolderAwareDropzone
        :disabled="uploading"
        :hint="
          uploading
            ? '正在上传…'
            : '拖拽文件或文件夹到此处，或点击选择（自动识别目录结构）'
        "
        @items="onUploadItems"
      />

      <label class="lbl">有效期</label>
      <select v-model="ttlMinutes" class="input" :disabled="uploading || !allowedTtls.length">
        <option v-for="m in allowedTtls" :key="m" :value="m">
          {{ formatTtl(m) }}（{{ m }} 分钟）
        </option>
      </select>

      <p v-if="pickedName" class="hint sm pick-hint">已选择：{{ pickedName }}</p>

      <div v-if="uploadPct != null && uploadPct >= 0" class="prog">
        <div class="prog-bar">
          <div class="prog-fill" :style="{ width: uploadPct + '%' }" />
        </div>
        <span class="prog-txt">{{ uploadPct }}%</span>
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
import FolderAwareDropzone from '@/components/FolderAwareDropzone.vue';
import { appendToFormData, describeUploadBatch } from '@/composables/useFolderUpload';

const router = useRouter();
const { toast } = useToast();

const pickedName = ref('');
const allowedTtls = ref([]);
const maxFileSizeMb = ref(100);
const loadError = ref('');

const ttlMinutes = ref(1440);
const uploading = ref(false);
const uploadPct = ref(/** @type {number | null} */ (null));
function formatTtl(m) {
  if (m === 1440) return '24 小时';
  if (m < 60) return `${m} 分钟`;
  if (m % 60 === 0) return `${m / 60} 小时`;
  return `${m} 分钟`;
}

async function onUploadItems(list) {
  if (!list?.length || loadError.value) return;
  const desc = describeUploadBatch(list);
  pickedName.value = desc.label || list[0].file.name;
  await doUpload(list, desc);
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

async function doUpload(list, desc) {
  if (!list?.length || loadError.value) return;
  uploading.value = true;
  uploadPct.value = 0;
  const isFolder = list.length > 1 || list.some(it => it.relativePath.includes('/'));
  if (isFolder && list.length > 100) {
    toast('临时文件夹一次最多 100 个文件', 'error');
    uploading.value = false;
    uploadPct.value = null;
    return;
  }
  try {
    let lastData = null;
    if (isFolder) {
      const fd = new FormData();
      appendToFormData(fd, list, 'files');
      fd.append('ttlMinutes', String(ttlMinutes.value));
      if (desc?.rootName) fd.append('folderName', desc.rootName);
      lastData = await uploadWithProgress({
        method: 'POST',
        path: '/api/temp-transfer/upload',
        formData: fd,
        onProgress: n => {
          uploadPct.value = n;
        },
      });
    } else {
      const fd = new FormData();
      fd.append('file', list[0].file);
      fd.append('ttlMinutes', String(ttlMinutes.value));
      lastData = await uploadWithProgress({
        method: 'POST',
        path: '/api/temp-transfer/upload',
        formData: fd,
        onProgress: n => {
          uploadPct.value = n;
        },
      });
    }
    toast(desc?.isFolder ? `已创建临时文件夹（${desc.label}）` : '已创建临时文件');
    if (lastData?.id) {
      router.push(`/temp-transfer/${encodeURIComponent(lastData.id)}`);
    } else {
      router.push({ path: '/', hash: '#temp-hub' });
    }
  } catch (e) {
    toast(e.message || '上传失败', 'error');
  } finally {
    uploading.value = false;
    uploadPct.value = null;
    pickedName.value = '';
  }
}

onMounted(() => {
  loadAllowed();
});
</script>

<style scoped>
/* 与 ResourceDetailView 页头、上传区对齐，避免无 padding、按钮错位 */
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
  flex: 1;
}
h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.pkg-sub {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text2);
  line-height: 1.45;
}
.badge-type {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text3);
  border: 1px solid var(--border);
  padding: 4px 8px;
  border-radius: 4px;
  flex-shrink: 0;
}
.err-line {
  padding: 20px;
  margin-bottom: 20px;
  color: var(--danger, #e85d4c);
  font-size: 14px;
  line-height: 1.55;
}
.upload-block {
  padding: 20px;
  margin-bottom: 20px;
}
.upload-block h2 {
  margin: 0 0 12px;
  font-size: 16px;
}
.section-dim {
  opacity: 0.55;
  pointer-events: none;
}
.hint {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--text2);
  line-height: 1.5;
}
.hint.sm {
  font-size: 12px;
  margin-top: 8px;
  margin-bottom: 0;
}
.pick-hint {
  word-break: break-all;
}
.lbl {
  display: block;
  font-size: 12px;
  color: var(--text2);
  margin: 16px 0 6px;
}
.input {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  font-size: 15px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 6px);
  background: var(--surface);
  color: var(--text);
}
.drop-zone {
  padding: 22px;
  border: 1px dashed rgba(232, 160, 53, 0.35);
  border-radius: var(--radius-sm, 6px);
  text-align: center;
  cursor: pointer;
  font-size: 13px;
  color: var(--text2);
  transition: background 0.2s, border-color 0.2s, opacity 0.2s;
  margin-top: 0;
  box-sizing: border-box;
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
  display: block;
}
.prog.indet {
  font-size: 12px;
  color: var(--text3);
  margin-top: 8px;
}
</style>
