<template>
  <div v-if="url" class="share-link-row">
    <span class="share-lbl">{{ label }}</span>
    <a class="share-url" :href="url" target="_blank" rel="noopener noreferrer" :title="url">{{ url }}</a>
    <button type="button" class="btn btn-sm btn-ghost share-copy" @click="onCopy">复制</button>
  </div>
</template>

<script setup>
import { useToast } from '@/composables/useToast';

const props = defineProps({
  label: { type: String, required: true },
  url: { type: String, default: '' },
});

const { toast } = useToast();

function onCopy() {
  if (!props.url) return;
  navigator.clipboard.writeText(props.url).then(
    () => toast('已复制'),
    () => toast('复制失败', 'error'),
  );
}
</script>

<style scoped>
.share-link-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-bottom: 10px;
  font-size: 13px;
}
.share-lbl {
  min-width: 88px;
  flex-shrink: 0;
  color: var(--text3);
  font-size: 12px;
}
.share-url {
  flex: 1;
  min-width: 120px;
  color: var(--accent);
  text-decoration: none;
  font-size: 12px;
  word-break: break-all;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.share-url:hover {
  text-decoration: underline;
}
.share-copy {
  flex-shrink: 0;
}
</style>
