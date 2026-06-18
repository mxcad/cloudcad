import { ref } from 'vue';

export function usePopup(initial = true) {
  const show = ref(initial);

  function open() {
    show.value = true;
  }

  function close() {
    show.value = false;
  }

  return { show, open, close };
}
