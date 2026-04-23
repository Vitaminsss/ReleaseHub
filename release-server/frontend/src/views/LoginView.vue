<template>
  <div class="login">
    <div class="card panel">
      <p class="brand">Release Hub</p>
      <h1>管理后台</h1>
      <p class="hint">输入管理员密码登录</p>
      <form @submit.prevent="submit">
        <input
          v-model="password"
          type="password"
          class="input"
          placeholder="密码"
          autocomplete="current-password"
          :disabled="loading"
        />
        <p v-if="err" class="err">{{ err }}</p>
        <button type="submit" class="btn btn-primary full" :disabled="loading">
          {{ loading ? '验证中…' : '登录' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/api/client';
import { useToast } from '@/composables/useToast';

const password = ref('');
const err = ref('');
const loading = ref(false);
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { toast } = useToast();

async function submit() {
  err.value = '';
  if (!password.value.trim()) {
    err.value = '请输入密码';
    return;
  }
  loading.value = true;
  try {
    const data = await api('POST', '/api/login', { password: password.value });
    auth.setToken(data.token);
    toast('登录成功');
    const redirect = route.query.redirect || '/';
    router.replace(typeof redirect === 'string' ? redirect : '/');
  } catch (e) {
    err.value = e.message || '登录失败';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.panel {
  width: 100%;
  max-width: 400px;
  padding: 36px 32px;
}
.brand {
  font-size: 11px;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 0.35em;
  text-transform: uppercase;
  margin: 0 0 12px;
  text-align: center;
}
h1 {
  margin: 0 0 8px;
  font-size: 22px;
  text-align: center;
}
.hint {
  margin: 0 0 24px;
  color: var(--text2);
  font-size: 14px;
  text-align: center;
}
form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.full {
  width: 100%;
  margin-top: 8px;
}
.err {
  margin: 0;
  color: var(--danger);
  font-size: 13px;
}
</style>
