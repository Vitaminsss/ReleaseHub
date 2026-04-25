<template>
  <ToastStack />
  <div class="app-root" :class="{ 'app-root--shelled': shelled }">
    <ServerStatusStrip v-if="showServerStrip" />
    <div v-if="shelled" class="app-shelled-body">
      <aside class="app-sidenav" aria-label="主导航">
        <div
          class="app-sidenav-brand"
          role="link"
          tabindex="0"
          @click="goHome"
          @keydown.enter.prevent="goHome"
        >
          Release Hub
        </div>
        <nav class="app-sidenav-nav" aria-label="页面">
          <RouterLink to="/" class="sidenav-link" :class="{ 'sidenav-link--active': isHomeRoute }">总览</RouterLink>
        </nav>
        <div class="app-sidenav-spacer" />
        <nav class="app-sidenav-bottom" aria-label="系统">
          <RouterLink to="/settings" class="sidenav-link" :class="{ 'sidenav-link--active': isSettings }">设置</RouterLink>
        </nav>
      </aside>
      <main class="app-main">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
    <main v-else class="app-main app-main--auth">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import ToastStack from '@/components/ToastStack.vue';
import ServerStatusStrip from '@/components/ServerStatusStrip.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const showServerStrip = computed(() => !!auth.token && route.name !== 'login');
const shelled = computed(() => !!auth.token && route.name !== 'login');
const isHomeRoute = computed(() => route.name === 'home');
const isSettings = computed(() => route.name === 'settings');

function goHome() {
  router.push('/');
}
</script>

<style scoped>
.app-root {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.app-shelled-body {
  display: flex;
  flex: 1;
  min-height: 0;
  width: 100%;
  align-items: stretch;
}
.app-sidenav {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  align-self: stretch;
  padding: 20px 14px 18px;
  border-right: 1px solid var(--border, rgba(235, 230, 223, 0.08));
  background: linear-gradient(180deg, #14110d 0%, #0d0b09 100%);
}
.app-sidenav-brand {
  font-family: var(--font-display, system-ui, sans-serif);
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--accent, #e8a035);
  cursor: pointer;
  user-select: none;
  line-height: 1.2;
  margin-bottom: 20px;
}
.app-sidenav-brand:hover,
.app-sidenav-brand:focus {
  color: #f0be5c;
  outline: none;
}
.app-sidenav-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.app-sidenav-spacer {
  flex: 1;
  min-height: 1rem;
}
.app-sidenav-bottom {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--border, rgba(235, 230, 223, 0.08));
}
.sidenav-link {
  display: block;
  padding: 10px 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text2, #9a9288);
  text-decoration: none;
  border-radius: var(--radius-sm, 6px);
  transition: color 0.15s, background 0.15s;
}
.sidenav-link:hover {
  color: var(--text, #ebe6df);
  background: rgba(255, 255, 255, 0.04);
}
.sidenav-link--active {
  color: var(--accent, #e8a035);
  background: rgba(232, 160, 53, 0.1);
}
.app-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}
.app-main--auth {
  width: 100%;
}

@media (max-width: 700px) {
  .app-shelled-body {
    flex-direction: column;
  }
  .app-sidenav {
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    padding: 10px 12px;
    border-right: none;
    border-bottom: 1px solid var(--border, rgba(235, 230, 223, 0.08));
  }
  .app-sidenav-brand {
    margin: 0 10px 0 0;
  }
  .app-sidenav-nav {
    display: flex;
    flex: 1;
    flex-direction: row;
    min-width: 0;
    gap: 4px;
  }
  .app-sidenav-spacer {
    display: none;
  }
  .app-sidenav-bottom {
    display: flex;
    flex: 0 0 auto;
    flex-direction: row;
    margin-left: auto;
    border-top: none;
    border-left: 1px solid var(--border, rgba(235, 230, 223, 0.08));
    padding: 0 0 0 8px;
  }
  .sidenav-link {
    padding: 8px 10px;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
