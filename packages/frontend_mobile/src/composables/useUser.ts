import { ref, readonly, onMounted } from 'vue';

interface UserInfo {
  id: string;
  username: string;
  email: string;
  avatar?: string;
}

function readUserFromStorage(): UserInfo | null {
  try {
    const raw = localStorage.getItem('user');
    if (raw) {
      return JSON.parse(raw) as UserInfo;
    }
  } catch {
    // ignore
  }
  return null;
}

function hasToken(): boolean {
  const at = localStorage.getItem('accessToken');
  const rt = localStorage.getItem('refreshToken');
  return !!(at || rt);
}

export function useUser() {
  const user = ref<UserInfo | null>(readUserFromStorage());
  const isAuthenticated = ref(hasToken());

  function refresh() {
    user.value = readUserFromStorage();
    isAuthenticated.value = hasToken();
  }

  onMounted(() => {
    window.addEventListener('storage', refresh);
  });

  return {
    user: readonly(user),
    isAuthenticated: readonly(isAuthenticated),
    refresh,
  };
}
