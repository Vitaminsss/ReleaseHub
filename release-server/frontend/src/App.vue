<template>
  <ToastStack />
  <div class="app-root" :class="{ 'app-root--shelled': shelled }">
    <div v-if="shelled" class="app-shelled-wrap">
      <ServerStatusStrip v-if="showServerStrip" />
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
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import ToastStack from '@/components/ToastStack.vue';
import ServerStatusStrip from '@/components/ServerStatusStrip.vue';

const route = useRoute();
const auth = useAuthStore();
const showServerStrip = computed(() => !!auth.token && route.name !== 'login');
const shelled = computed(() => !!auth.token && route.name !== 'login');
</script>

<style scoped>
.app-root {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.app-shelled-wrap {
  display: flex;
  flex: 1;
  min-height: 0;
  width: 100%;
  align-items: stretch;
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

@media (max-width: 768px) {
  .app-shelled-wrap {
    flex-direction: column;
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
