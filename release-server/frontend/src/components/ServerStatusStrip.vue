<template>
  <header class="server-strip" aria-label="服务器资源概览">
    <div class="strip-noise" aria-hidden="true" />
    <div class="strip-inner layout-max">
      <div class="brand-cluster">
        <span class="wordmark">ReleaseHub</span>
        <span class="badge">node</span>
      </div>

      <div v-if="error" class="err-line">{{ error }}</div>

      <template v-else-if="memory">
        <div class="mem-panel">
          <div class="mem-head">
            <span class="mem-title">主机内存</span>
            <span class="mem-pct mono">{{ usedPct }}% 已用</span>
          </div>
          <div class="mem-track" role="img" :aria-label="`内存已用 ${usedPct}%`">
            <div class="mem-fill" :style="{ width: `${usedPct}%` }" />
            <div class="mem-glow" :style="{ width: `${usedPct}%` }" />
          </div>
          <div class="mem-stats mono">
            <span><em>可用</em> {{ fmt(memory.free) }}</span>
            <span class="dot">·</span>
            <span><em>已用</em> {{ fmt(memory.used) }}</span>
            <span class="dot">·</span>
            <span><em>总计</em> {{ fmt(memory.total) }}</span>
          </div>
        </div>

        <div v-if="disk" class="disk-chip mono">
          <span class="disk-label">releases 卷</span>
          <span class="disk-val">{{ fmt(disk.free) }} 空闲</span>
          <span class="disk-sep">/</span>
          <span>{{ fmt(disk.total) }}</span>
        </div>
      </template>

      <div v-else class="loading-line mono">读取中…</div>
    </div>
  </header>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { api } from '@/api/client';

const memory = ref(null);
const disk = ref(null);
const error = ref('');

const usedPct = computed(() => {
  const m = memory.value;
  if (!m?.total) return 0;
  return Math.min(100, Math.max(0, Math.round((m.used / m.total) * 100)));
});

function fmt(n) {
  if (n == null || Number.isNaN(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

let timer = null;

async function pull() {
  try {
    const s = await api('GET', '/api/system');
    memory.value = s.memory || null;
    disk.value = s.disk || null;
    error.value = '';
  } catch (e) {
    error.value = e.message || '无法读取系统信息';
    memory.value = null;
    disk.value = null;
  }
}

onMounted(() => {
  pull();
  timer = setInterval(pull, 45000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped>
.server-strip {
  position: relative;
  overflow: hidden;
  border-bottom: 1px solid rgba(232, 160, 53, 0.14);
  background: linear-gradient(105deg, #0a0908 0%, #14110d 42%, #0f0d0a 100%);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
}

.strip-noise {
  pointer-events: none;
  position: absolute;
  inset: 0;
  opacity: 0.07;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  mix-blend-mode: overlay;
}

.strip-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px 28px;
  padding-top: 18px;
  padding-bottom: 18px;
}

.brand-cluster {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-shrink: 0;
}

.wordmark {
  font-family: 'Bricolage Grotesque', var(--font);
  font-weight: 700;
  font-size: 1.15rem;
  letter-spacing: -0.03em;
  background: linear-gradient(92deg, #f0d7a8 0%, var(--accent) 48%, #c98728 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.badge {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(235, 230, 223, 0.45);
  border: 1px solid rgba(235, 230, 223, 0.12);
  padding: 3px 8px;
  border-radius: 4px;
}

.mem-panel {
  flex: 1;
  min-width: min(100%, 320px);
}

.mem-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}

.mem-title {
  font-family: 'Bricolage Grotesque', var(--font);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(235, 230, 223, 0.55);
}

.mem-pct {
  font-size: 11px;
  color: var(--accent);
}

.mem-track {
  position: relative;
  height: 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(235, 230, 223, 0.06);
  overflow: hidden;
}

.mem-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #7a5c20 0%, var(--accent) 55%, #f0b24a 100%);
  transition: width 0.55s cubic-bezier(0.22, 1, 0.36, 1);
}

.mem-glow {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.22), transparent);
  opacity: 0.35;
  pointer-events: none;
  transition: width 0.55s cubic-bezier(0.22, 1, 0.36, 1);
  animation: sheen 4.5s ease-in-out infinite;
}

@keyframes sheen {
  0%,
  100% {
    opacity: 0.2;
  }
  50% {
    opacity: 0.45;
  }
}

.mem-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 4px;
  margin-top: 10px;
  font-size: 11px;
  color: rgba(235, 230, 223, 0.72);
}

.mem-stats em {
  font-style: normal;
  color: var(--text3);
  margin-right: 3px;
}

.dot {
  color: rgba(235, 230, 223, 0.25);
  user-select: none;
}

.disk-chip {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(232, 160, 53, 0.06);
  border: 1px solid rgba(232, 160, 53, 0.12);
  font-size: 11px;
  color: rgba(235, 230, 223, 0.75);
}

.disk-label {
  font-family: 'Bricolage Grotesque', var(--font);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(235, 230, 223, 0.45);
}

.disk-sep {
  opacity: 0.35;
}

.mono {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
}

.loading-line,
.err-line {
  font-size: 12px;
  color: var(--text2);
}

.err-line {
  color: var(--danger);
}
</style>
