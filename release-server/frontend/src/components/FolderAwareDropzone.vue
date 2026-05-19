<template>
  <div
    class="drop-zone"
    :class="{ drag: dragActive, disabled }"
    @dragover.prevent="!disabled && (dragActive = true)"
    @dragleave="dragActive = false"
    @drop.prevent="onDrop"
    @click="onClick"
  >
    <input
      ref="fileInputRef"
      type="file"
      multiple
      class="hidden-input"
      :disabled="disabled"
      @change="onInputChange"
    />
    <span>{{ hint }}</span>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import {
  ingestFromDataTransfer,
  ingestFromFileList,
  pickOnZoneClick,
} from '@/composables/useFolderUpload';

const props = defineProps({
  disabled: { type: Boolean, default: false },
  hint: {
    type: String,
    default: '拖拽文件或文件夹到此处，或点击选择（自动识别目录结构）',
  },
});

const emit = defineEmits(['items']);

const fileInputRef = ref(null);
const dragActive = ref(false);

async function emitItems(list) {
  if (list?.length) emit('items', list);
}

async function onDrop(e) {
  dragActive.value = false;
  if (props.disabled) return;
  const list = await ingestFromDataTransfer(e.dataTransfer);
  await emitItems(list);
}

async function onClick() {
  if (props.disabled) return;
  const list = await pickOnZoneClick(fileInputRef.value);
  await emitItems(list);
}

async function onInputChange(e) {
  if (props.disabled) return;
  const list = await ingestFromFileList(e.target.files);
  e.target.value = '';
  await emitItems(list);
}
</script>

<style scoped>
.drop-zone {
  border: 2px dashed var(--border);
  border-radius: var(--radius);
  padding: 28px 20px;
  text-align: center;
  color: var(--text2);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  font-size: 14px;
  line-height: 1.55;
}
.drop-zone.drag {
  border-color: rgba(232, 160, 53, 0.55);
  background: rgba(232, 160, 53, 0.06);
}
.drop-zone.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.hidden-input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}
</style>
