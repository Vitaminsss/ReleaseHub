<template>
  <aside class="disk-rail" aria-label="Releases 所在磁盘与导航">
    <div class="rail-top">
      <RouterLink to="/" class="rail-brand" title="返回总览">ReleaseHub</RouterLink>
      <p class="rail-scope">releases 卷</p>

      <div v-if="error" class="state err mono">{{ error }}</div>

      <template v-else-if="disk">
        <div class="rail-block">
          <span class="hero-label">剩余</span>
          <span class="hero-val mono">{{ formatBytes(disk.free) }}</span>
        </div>

        <div
          class="meter"
          role="img"
          :aria-label="`已用 ${usedPct}%，剩余 ${formatBytes(disk.free)}`"
        >
          <div class="meter-fill" :style="{ width: `${usedPct}%` }" />
        </div>

        <p class="pct-line mono">{{ usedPct }}% 已用</p>

        <div class="sub-grid mono">
          <div class="sub-item">
            <span class="sub-k">已用</span>
            <span class="sub-v">{{ formatBytes(disk.used) }}</span>
          </div>
          <div class="sub-item">
            <span class="sub-k">容量</span>
            <span class="sub-v">{{ formatBytes(disk.total) }}</span>
          </div>
        </div>
      </template>

      <div v-else-if="loaded" class="state muted mono">无法读取该卷磁盘统计</div>
      <div v-else class="state muted mono">读取中…</div>
    </div>

    <nav class="rail-foot" aria-label="系统">
      <RouterLink
        to="/temp-transfer"
        class="rail-link"
        :class="{ 'rail-link--active': isTempTransfer }"
      >临时传输</RouterLink>
      <RouterLink
        to="/settings"
        class="rail-link"
        :class="{ 'rail-link--active': isSettings }"
      >设置</RouterLink>
    </nav>
  </aside>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { api } from '@/api/client';
import { formatBytes } from '@/utils/format-bytes';

const route = useRoute();
const isSettings = computed(() => route.name === 'settings');
const isTempTransfer = computed(
  () => route.name === 'temp-transfer' || route.name === 'temp-item',
);

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
.disk-rail {
  --rail-accent: var(--accent, #e8a035);
  --rail-accent-dim: var(--accent-dim, #c98728);
  --rail-border: var(--border, rgba(235, 230, 223, 0.08));

  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 240px;
  min-height: 100vh;
  min-height: 100dvh;
  position: sticky;
  top: 0;
  align-self: flex-start;
  z-index: 2;
  padding: 22px 18px 28px;
  background: linear-gradient(180deg, #0e0c0a 0%, var(--surface, #12100e) 38%, #0c0b09 100%);
  border-right: 1px solid var(--rail-border);
  box-sizing: border-box;
}

.rail-top {
  flex: 0 0 auto;
}

.rail-foot {
  flex-shrink: 0;
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid var(--rail-border);
}

.rail-link {
  display: block;
  padding: 10px 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text2, #9a9288);
  text-decoration: none;
  border-radius: 6px;
  transition: color 0.15s, background 0.15s;
}
.rail-link + .rail-link {
  margin-top: 4px;
}

.rail-link:hover {
  color: var(--text, #ebe6df);
  background: rgba(255, 255, 255, 0.04);
}

.rail-link--active {
  color: var(--rail-accent);
  background: rgba(232, 160, 53, 0.1);
}

.rail-brand {
  display: block;
  font-family: 'Outfit', var(--font, system-ui, sans-serif);
  font-weight: 700;
  font-size: 1.15rem;
  letter-spacing: -0.03em;
  color: var(--text, #ebe6df);
  text-decoration: none;
  line-height: 1.2;
  margin-bottom: 4px;
  transition: color 0.15s ease;
}

.rail-brand:hover {
  color: var(--rail-accent);
}

.rail-brand:focus-visible {
  outline: 2px solid rgba(232, 160, 53, 0.45);
  outline-offset: 2px;
  border-radius: 4px;
}

.rail-scope {
  margin: 0 0 22px;
  font-family: 'Share Tech Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text2, #9a9288);
}

.rail-block {
  margin-bottom: 14px;
}

.hero-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text3, #6b6459);
  margin-bottom: 6px;
}

.hero-val {
  display: block;
  font-size: 1.65rem;
  font-weight: 600;
  line-height: 1.15;
  color: var(--text, #ebe6df);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  word-break: break-word;
}

.meter {
  position: relative;
  height: 9px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(235, 230, 223, 0.08);
  overflow: hidden;
  margin-bottom: 10px;
}

.meter-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--rail-accent-dim) 0%, var(--rail-accent) 55%, #f0b24a 100%);
  box-shadow: 0 0 14px rgba(232, 160, 53, 0.22);
  transition: width 0.65s cubic-bezier(0.22, 1, 0.36, 1);
}

.pct-line {
  margin: 0 0 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--rail-accent);
  font-variant-numeric: tabular-nums;
}

.sub-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 4px;
  border-top: 1px solid var(--rail-border);
}

.sub-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sub-k {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text3, #6b6459);
}

.sub-v {
  font-size: 13px;
  font-weight: 500;
  color: var(--text2, #9a9288);
  font-variant-numeric: tabular-nums;
}

.mono {
  font-family: 'Share Tech Mono', ui-monospace, monospace;
}

.state {
  font-size: 12px;
  line-height: 1.5;
}

.state.err {
  color: var(--danger, #e85d4c);
}

.state.muted {
  color: var(--text2, #9a9288);
}

@media (max-width: 768px) {
  .disk-rail {
    width: 100%;
    min-height: 0;
    position: relative;
    top: auto;
    border-right: none;
    border-bottom: 1px solid var(--rail-border);
    padding: 14px 18px 16px;
  }

  .rail-scope {
    margin-bottom: 14px;
  }

  .hero-val {
    font-size: 1.45rem;
  }
}
</style>
