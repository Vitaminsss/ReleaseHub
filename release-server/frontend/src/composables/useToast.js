import { ref } from 'vue';

const toasts = ref([]);

let idSeq = 0;

export function useToast() {
  function toast(message, type = 'success') {
    const id = ++idSeq;
    toasts.value.push({ id, message, type });
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id);
    }, 3200);
  }

  return { toasts, toast };
}
