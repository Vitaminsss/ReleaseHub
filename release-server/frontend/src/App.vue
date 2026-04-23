<template>
  <ToastStack />
  <ServerStatusStrip v-if="showServerStrip" />
  <router-view v-slot="{ Component }">
    <transition name="fade" mode="out-in">
      <component :is="Component" />
    </transition>
  </router-view>
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
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
