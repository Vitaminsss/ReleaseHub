<template>
  <header class="storage-strip" aria-label="Releases 所在磁盘容量">
    <div class="strip-bg" aria-hidden="true">
      <div class="strip-scan" />
      <div class="strip-vignette" />
    </div>

    <div class="strip-inner layout-max">
      <RouterLink to="/" class="brand" title="返回应用列表">
        <span class="brand-rule" aria-hidden="true" />
        <span class="brand-block">
          <span class="brand-name">ReleaseHub</span>
          <span class="brand-sub mono">releases 卷</span>
        </span>
      </RouterLink>

      <div v-if="error" class="state err mono">{{ error }}</div>

      <template v-else-if="disk">
        <div class="console-panel">
          <div class="panel-body">
            <div class="panel-head">
              <span class="panel-title">磁盘占用</span>
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
            <div class="panel-stats">
              <div class="stat">
                <span class="k">剩余</span>
                <span class="val mono">{{ formatBytes(disk.free) }}</span>
              </div>
              <span class="sep mono">·</span>
              <div class="stat">
                <span class="k">已用</span>
                <span class="val mono">{{ formatBytes(disk.used) }}</span>
              </div>
              <span class="sep mono">·</span>
              <div class="stat">
                <span class="k">容量</span>
                <span class="val mono">{{ formatBytes(disk.total) }}</span>
              </div>
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
  --s-panel: rgba(15, 23, 42, 0.42);
  --s-border: rgba(56, 189, 248, 0.16);
  --s-text: #e2e8f0;
  --s-dim: #64748b;
  --s-accent: #38bdf8;
  --s-accent-dim: #0ea5e9;

  position: relative;
  overflow: hidden;
  border-bottom: 1px solid rgba(56, 189, 248, 0.12);
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
    rgba(56, 189, 248, 0.025) 3px,
    rgba(56, 189, 248, 0.025) 4px
  );
  animation: scan 14s linear infinite;
  opacity: 0.55;
}

.strip-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 80% 100% at 8% -30%, rgba(14, 165, 233, 0.06), transparent 45%),
    radial-gradient(ellipse 50% 70% at 100% 110%, rgba(15, 23, 42, 0.35), transparent 40%);
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
    opacity: 0.28;
  }
}

.strip-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px 22px;
  padding-top: 8px;
  padding-bottom: 8px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  text-decoration: none;
  color: inherit;
  outline: none;
  border-radius: 8px;
  margin: -2px -4px;
  padding: 2px 4px;
  transition: background 0.18s ease, box-shadow 0.18s ease;
}

.brand:hover {
  background: rgba(56, 189, 248, 0.05);
}

.brand:focus-visible {
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.45);
}

.brand-rule {
  width: 3px;
  height: 34px;
  border-radius: 2px;
  background: linear-gradient(180deg, var(--s-accent) 0%, rgba(56, 189, 248, 0.15) 100%);
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.25);
}

.brand-block {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
  line-height: 1.15;
}

.brand-name {
  font-family: 'Outfit', var(--font);
  font-weight: 700;
  font-size: 1.02rem;
  letter-spacing: -0.03em;
  color: #f1f5f9;
}

.brand-sub {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.82);
}

.console-panel {
  flex: 1;
  min-width: min(100%, 260px);
  border-radius: 8px;
  border: 1px solid rgba(56, 189, 248, 0.1);
  background: var(--s-panel);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.28);
  overflow: hidden;
  backdrop-filter: blur(6px);
}

.panel-body {
  padding: 8px 11px 9px;
  min-width: 0;
  border-left: 2px solid rgba(56, 189, 248, 0.35);
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}

.panel-title {
  font-family: 'Outfit', var(--font);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.9);
}

.panel-readout {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--s-accent);
  font-variant-numeric: tabular-nums;
}

.meter {
  position: relative;
  height: 6px;
  border-radius: 2px;
  background: rgba(2, 6, 23, 0.72);
  border: 1px solid rgba(51, 65, 85, 0.45);
  overflow: hidden;
}

.meter-fill {
  height: 100%;
  border-radius: 1px;
  background: linear-gradient(90deg, var(--s-accent-dim) 0%, var(--s-accent) 48%, #7dd3fc 100%);
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.28);
  transition: width 0.65s cubic-bezier(0.22, 1, 0.36, 1);
}

.meter-ticks {
  pointer-events: none;
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(
    90deg,
    transparent,
    transparent 24px,
    rgba(148, 163, 184, 0.06) 24px,
    rgba(148, 163, 184, 0.06) 25px
  );
  mix-blend-mode: overlay;
}

.panel-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px 6px;
  margin-top: 8px;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.stat .k {
  font-family: 'Outfit', var(--font);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--s-dim);
}

.stat .val {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.2;
  color: var(--s-text);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.03em;
}

.sep {
  align-self: center;
  padding-bottom: 2px;
  font-size: 18px;
  line-height: 1;
  color: rgba(71, 85, 105, 0.5);
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
