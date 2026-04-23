import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

const TOKEN_KEY = 'rh_token';

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) || '');

  const isAuthenticated = computed(() => !!token.value);

  function setToken(t) {
    token.value = t || '';
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }

  function logout() {
    setToken('');
  }

  return { token, isAuthenticated, setToken, logout };
});
