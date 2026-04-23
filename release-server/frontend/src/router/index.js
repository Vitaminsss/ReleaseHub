import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const LoginView = () => import('@/views/LoginView.vue');
const AppsView = () => import('@/views/AppsView.vue');
const AppDetailView = () => import('@/views/AppDetailView.vue');
const SettingsView = () => import('@/views/SettingsView.vue');
const ResourcesView = () => import('@/views/ResourcesView.vue');
const ResourceDetailView = () => import('@/views/ResourceDetailView.vue');

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { guest: true } },
    { path: '/', name: 'apps', component: AppsView, meta: { requiresAuth: true } },
    { path: '/app/:name', name: 'app-detail', component: AppDetailView, meta: { requiresAuth: true } },
    { path: '/resources', name: 'resources', component: ResourcesView, meta: { requiresAuth: true } },
    { path: '/resources/:name', name: 'resource-detail', component: ResourceDetailView, meta: { requiresAuth: true } },
    { path: '/settings', name: 'settings', component: SettingsView, meta: { requiresAuth: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.token) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.meta.guest && auth.token) {
    return { name: 'apps' };
  }
  return true;
});

export default router;
