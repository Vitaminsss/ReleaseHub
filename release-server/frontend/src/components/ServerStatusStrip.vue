<template>
  <header class="storage-strip" aria-label="Releases 所在磁盘容量">
    <div class="strip-bg" aria-hidden="true">
      <div class="strip-scan" />
      <div class="strip-vignette" />
    </div>

    <div class="strip-inner layout-max">
      <RouterLink to="/" class="brand" title="返回应用列表">
        <span class="brand-mark" aria-hidden="true">
          <svg class="logo-svg" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M6 11a2 2 0 0 1 2-2h2.5v22H8a2 2 0 0 1-2-2V11Z"
              fill="currentColor"
              opacity="0.35"
            />
            <rect x="13" y="9" width="21" height="6" rx="1.5" stroke="currentColor" stroke-width="1.4" fill="rgba(56,189,248,0.12)" />
            <rect x="13" y="17" width="21" height="6" rx="1.5" stroke="currentColor" stroke-width="1.4" fill="rgba(56,189,248,0.08)" />
            <rect x="13" y="25" width="21" height="6" rx="1.5" stroke="currentColor" stroke-width="1.4" fill="rgba(56,189,248,0.05)" />
            <circle cx="30" cy="12" r="1.1" fill="currentColor" opacity="0.85" />
            <circle cx="30" cy="20" r="1.1" fill="currentColor" opacity="0.55" />
            <circle cx="30" cy="28" r="1.1" fill="currentColor" opacity="0.4" />
          </svg>
        </span>
        <span class="brand-text">
          <span class="brand-name">ReleaseHub</span>
          <span class="brand-tag mono">releases · 存储</span>
        </span>
      </RouterLink>

      <div v-if="error" class="state err mono">{{ error }}</div>

      <template v-else-if="disk">
        <div class="console-panel">
          <div class="panel-rail" aria-hidden="true">
            <span /><span /><span /><span />
          </div>
          <div class="panel-body">
            <div class="panel-head">
              <span class="panel-title">Releases 卷</span>
              <span class="panel-readout mono">{{ usedPct }}% 已用</span>
            </div>
            <div
              class="meter"
              role="img"
              :aria-label="`releases 卷已用 ${usedPct}%，剩余 ${formatBytes(disk.free)}`"
            >
              <div class="meter-fill" :style="{ width: `${usedPct}%` }" />
              <div class="meter-ticks" aria-hidden="true" />
            </div>
            <div class="panel-stats mono">
              <span><span class="k">剩余</span> {{ formatBytes(disk.free) }}</span>
              <span class="sep">/</span>
              <span><span class="k">已用</span> {{ formatBytes(disk.used) }}</span>
              <span class="sep">/</span>
              <span><span class="k">容量</span> {{ formatBytes(disk.total) }}</span>
            </div>
          </div>
        </div>
      </template>

      <div v-else-if="loaded" class="state muted mono">当前环境无法读取 releases 目录所在磁盘统计</div>
      <div v-else class="state muted mono">读取中…</div>
    </div>
  </header>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '@/api/client';
import { formatBytes } from '@/utils/format-bytes';

const disk = ref(null);
const error = ref('');
const loaded = ref(false);

const usedPct = computed(() => {
  const d = disk.value;
  if (!d?.total) return 0;
  return Math.min(100, Math.max(0, Math.round((d.used / d.total) * 100)));
});

let timer = null;

async function pull() {
  try {
    const s = await api('GET', '/api/system');
    disk.value = s?.disk || null;
    error.value = '';
  } catch (e) {
    if (e.message !== '未授权') {
      error.value = e.message || '无法读取磁盘信息';
    }
    disk.value = null;
  } finally {
    loaded.value = true;
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
.storage-strip {
  --s-bg: #07090c;
  --s-panel: rgba(15, 23, 42, 0.55);
  --s-border: rgba(56, 189, 248, 0.22);
  --s-text: #e2e8f0;
  --s-dim: #64748b;
  --s-accent: #38bdf8;
  --s-accent-dim: #0ea5e9;

  position: relative;
  overflow: hidden;
  border-bottom: 1px solid rgba(56, 189, 248, 0.14);
  background: var(--s-bg);
}

.strip-bg {
  pointer-events: none;
  position: absolute;
  inset: 0;
}

.strip-scan {
  position: absolute;
  inset: -40% -10%;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 3px,
    rgba(56, 189, 248, 0.03) 3px,
    rgba(56, 189, 248, 0.03) 4px
  );
  animation: scan 14s linear infinite;
  opacity: 0.65;
}

.strip-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 85% 120% at 12% -20%, rgba(14, 165, 233, 0.09), transparent 50%),
    radial-gradient(ellipse 60% 80% at 100% 100%, rgba(15, 23, 42, 0.5), transparent 45%);
}

@keyframes scan {
  0% {
    transform: translateY(0);
  }
  100% {
    transform: translateY(24px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .strip-scan {
    animation: none;
    opacity: 0.35;
  }
}

.strip-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px 28px;
  padding-top: 15px;
  padding-bottom: 15px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 13px;
  flex-shrink: 0;
  text-decoration: none;
  color: inherit;
  outline: none;
  border-radius: 10px;
  margin: -4px -6px;
  padding: 4px 6px;
  transition: background 0.18s ease, box-shadow 0.18s ease;
}

.brand:hover {
  background: rgba(56, 189, 248, 0.06);
}

.brand:focus-visible {
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.5);
}

.brand-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 11px;
  color: var(--s-accent);
  background: linear-gradient(155deg, rgba(56, 189, 248, 0.14) 0%, rgba(7, 9, 12, 0.95) 70%);
  border: 1px solid var(--s-border);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 10px 24px rgba(0, 0, 0, 0.4);
}

.logo-svg {
  width: 30px;
  height: 30px;
  display: block;
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.brand-name {
  font-family: 'Outfit', var(--font);
  font-weight: 700;
  font-size: 1.12rem;
  letter-spacing: -0.035em;
  line-height: 1.1;
  color: #f1f5f9;
}

.brand-tag {
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.88);
}

.console-panel {
  flex: 1;
  min-width: min(100%, 300px);
  display: flex;
  gap: 0;
  border-radius: 12px;
  border: 1px solid rgba(56, 189, 248, 0.12);
  background: var(--s-panel);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  backdrop-filter: blur(8px);
}

.panel-rail {
  width: 14px;
  flex-shrink: 0;
  background: linear-gradient(90deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.5));
  border-right: 1px solid rgba(56, 189, 248, 0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 0;
}

.panel-rail span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(56, 189, 248, 0.35);
  box-shadow: 0 0 6px rgba(56, 189, 248, 0.25);
}

.panel-body {
  flex: 1;
  padding: 12px 14px 12px 12px;
  min-width: 0;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 10px;
}

.panel-title {
  font-family: 'Outfit', var(--font);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.95);
}

.panel-readout {
  font-size: 11px;
  font-weight: 500;
  color: var(--s-accent);
}

.meter {
  position: relative;
  height: 10px;
  border-radius: 3px;
  background: rgba(2, 6, 23, 0.75);
  border: 1px solid rgba(51, 65, 85, 0.6);
  overflow: hidden;
}

.meter-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--s-accent-dim) 0%, var(--s-accent) 48%, #7dd3fc 100%);
  box-shadow: 0 0 18px rgba(56, 189, 248, 0.35);
  transition: width 0.65s cubic-bezier(0.22, 1, 0.36, 1);
}

.meter-ticks {
  pointer-events: none;
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(
    90deg,
    transparent,
    transparent 19px,
    rgba(148, 163, 184, 0.07) 19px,
    rgba(148, 163, 184, 0.07) 20px
  );
  mix-blend-mode: overlay;
}

.panel-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 5px;
  margin-top: 10px;
  font-size: 11px;
  color: var(--s-text);
}

.panel-stats .k {
  color: var(--s-dim);
  margin-right: 4px;
  font-size: 10px;
}

.sep {
  color: rgba(71, 85, 105, 0.65);
  user-select: none;
}

.mono {
  font-family: 'Share Tech Mono', ui-monospace, monospace;
}

.state {
  font-size: 12px;
}

.state.err {
  color: var(--danger);
}

.state.muted {
  color: var(--text2);
}
</style>
