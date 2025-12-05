// ============================================================================
// PubFlow AI - Color Mode Composable
// ============================================================================

export function useColorMode() {
  const colorMode = useState<'light' | 'dark' | 'system'>('color-mode', () => 'system');

  const systemPrefersDark = ref(false);

  // Initialize system preference detection
  onMounted(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    systemPrefersDark.value = mediaQuery.matches;

    mediaQuery.addEventListener('change', (e) => {
      systemPrefersDark.value = e.matches;
      updateDOMClass();
    });

    // Load saved preference
    const saved = localStorage.getItem('color-mode');
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      colorMode.value = saved;
    }

    updateDOMClass();
  });

  const isDark = computed(() => {
    if (colorMode.value === 'system') {
      return systemPrefersDark.value;
    }
    return colorMode.value === 'dark';
  });

  function updateDOMClass() {
    if (isDark.value) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  watch(isDark, updateDOMClass);

  return {
    value: colorMode,
    preference: computed({
      get: () => colorMode.value,
      set: (value: 'light' | 'dark' | 'system') => {
        colorMode.value = value;
        localStorage.setItem('color-mode', value);
        updateDOMClass();
      },
    }),
    isDark,
    toggle: () => {
      colorMode.value = isDark.value ? 'light' : 'dark';
      localStorage.setItem('color-mode', colorMode.value);
      updateDOMClass();
    },
  };
}
