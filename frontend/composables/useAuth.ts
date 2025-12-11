export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'USER' | 'VIEWER';
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  tenantSlug?: string;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  tenantName: string;
  tenantSlug: string;
}

// Backend auth response structure
interface BackendAuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'USER' | 'VIEWER';
  };
  tenant: {
    id: string;
    slug: string;
    name: string;
  };
}

// Backend /auth/me response
interface BackendMeResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'USER' | 'VIEWER';
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
}

export const useAuth = () => {
  const { $api } = useNuxtApp();
  const router = useRouter();

  // State
  const user = useState<User | null>('auth_user', () => null);
  const isAuthenticated = computed(() => !!user.value);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // Cookies for tokens
  const accessToken = useCookie('auth_token', {
    maxAge: 60 * 60, // 1 hour
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });

  const refreshToken = useCookie('refresh_token', {
    maxAge: 60 * 60 * 24 * 7, // 7 days
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });

  // Helper to map backend response to User
  const mapBackendResponseToUser = (response: BackendAuthResponse): User => ({
    id: response.user.id,
    email: response.user.email,
    firstName: response.user.firstName,
    lastName: response.user.lastName,
    role: response.user.role,
    tenantId: response.tenant.id,
    tenantName: response.tenant.name,
    tenantSlug: response.tenant.slug,
  });

  // Login
  const login = async (credentials: LoginCredentials): Promise<boolean> => {
    isLoading.value = true;
    error.value = null;

    try {
      const response = await $api<BackendAuthResponse>('/auth/login', {
        method: 'POST',
        body: credentials,
      });

      accessToken.value = response.accessToken;
      refreshToken.value = response.refreshToken;
      user.value = mapBackendResponseToUser(response);

      return true;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'data' in err) {
        const fetchError = err as { data?: { message?: string } };
        error.value = fetchError.data?.message || 'Login failed';
      } else {
        error.value = 'Login failed';
      }
      return false;
    } finally {
      isLoading.value = false;
    }
  };

  // Register
  const register = async (data: RegisterData): Promise<boolean> => {
    isLoading.value = true;
    error.value = null;

    try {
      const response = await $api<BackendAuthResponse>('/auth/register', {
        method: 'POST',
        body: data,
      });

      accessToken.value = response.accessToken;
      refreshToken.value = response.refreshToken;
      user.value = mapBackendResponseToUser(response);

      return true;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'data' in err) {
        const fetchError = err as { data?: { message?: string } };
        error.value = fetchError.data?.message || 'Registration failed';
      } else {
        error.value = 'Registration failed';
      }
      return false;
    } finally {
      isLoading.value = false;
    }
  };

  // Logout
  const logout = async () => {
    try {
      if (refreshToken.value) {
        await $api('/auth/logout', {
          method: 'POST',
          body: { refreshToken: refreshToken.value },
        });
      }
    } catch {
      // Ignore errors on logout
    } finally {
      accessToken.value = null;
      refreshToken.value = null;
      user.value = null;
      router.push('/auth/login');
    }
  };

  // Fetch current user
  const fetchUser = async (): Promise<void> => {
    if (!accessToken.value) return;

    try {
      const response = await $api<BackendMeResponse>('/auth/me');
      user.value = {
        id: response.id,
        email: response.email,
        firstName: response.firstName,
        lastName: response.lastName,
        role: response.role,
        tenantId: response.tenant.id,
        tenantName: response.tenant.name,
        tenantSlug: response.tenant.slug,
      };
    } catch {
      // Token invalid, clear auth state
      accessToken.value = null;
      refreshToken.value = null;
      user.value = null;
    }
  };

  // Refresh access token
  const refreshAccessToken = async (): Promise<boolean> => {
    if (!refreshToken.value) return false;

    try {
      const response = await $api<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
        method: 'POST',
        body: { refreshToken: refreshToken.value },
      });

      accessToken.value = response.accessToken;
      refreshToken.value = response.refreshToken;
      return true;
    } catch {
      accessToken.value = null;
      refreshToken.value = null;
      user.value = null;
      return false;
    }
  };

  // Initialize auth state on app load
  const initAuth = async () => {
    if (accessToken.value && !user.value) {
      await fetchUser();
    }
  };

  return {
    user: readonly(user),
    isAuthenticated,
    isLoading: readonly(isLoading),
    error: readonly(error),
    login,
    register,
    logout,
    fetchUser,
    refreshAccessToken,
    initAuth,
  };
};
