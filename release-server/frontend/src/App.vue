<template>
  <ToastStack />
  <div class="app-root" :class="{ 'app-root--shelled': showServerStrip }">
    <ServerStatusStrip v-if="showServerStrip" />
    <main class="app-main">
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
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import ToastStack from '@/components/ToastStack.vue';
import ServerStatusStrip from '@/components/ServerStatusStrip.vue';

const route = useRoute();
const auth = useAuthStore();
const showServerStrip = computed(() => !!auth.token && route.name !== 'login');
</script>

<style scoped>
.app-root {
  min-height: 100vh;
  min-height: 100dvh;
}

.app-root--shelled {
  display: flex;
  align-items: flex-start;
}

.app-main {
  flex: 1;
  min-width: 0;
}

@media (max-width: 768px) {
  .app-root--shelled {
    flex-direction: column;
    align-items: stretch;
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
