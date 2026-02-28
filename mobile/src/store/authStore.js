import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import api, {
  authApi,
  customerApi,
  setToken,
  clearToken,
  getToken,
  setBaseURL,
  getBaseURL,
  authEvents,
  initializeApi,
} from '../services/api';

// Zustand AsyncStorage adapter
const asyncStorageAdapter = {
  getItem: async (name) => {
    try {
      const value = await AsyncStorage.getItem(name);
      return value ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      await AsyncStorage.setItem(name, value);
    } catch (err) {
      console.error('authStore: Failed to persist state:', err);
    }
  },
  removeItem: async (name) => {
    try {
      await AsyncStorage.removeItem(name);
    } catch (err) {
      console.error('authStore: Failed to remove persisted state:', err);
    }
  },
};

const useAuthStore = create(
  persist(
    (set, get) => ({
      // ---- State ----
      serverUrl: null,
      token: null,
      user: null,
      customerData: null,
      userType: null, // 'admin' | 'reseller' | 'customer' | null
      isAuthenticated: false,
      isLoading: false,
      permissions: [],
      error: null,

      // Impersonation state (saved admin session)
      impersonatedFrom: null, // { token, user, userType, permissions }

      // ---- Computed getters (as functions) ----

      /**
       * Check if the current user has a specific permission.
       * Admins implicitly have all permissions.
       * Resellers with no permission group have all permissions (backward compat).
       */
      hasPermission: (name) => {
        const state = get();
        if (!state.isAuthenticated) return false;
        if (state.userType === 'admin') return true;
        if (state.userType === 'customer') return false;
        // Reseller: if no permissions array (no group assigned), grant all
        if (!state.permissions || state.permissions.length === 0) return true;
        return state.permissions.includes(name);
      },

      isAdmin: () => get().userType === 'admin',
      isReseller: () => get().userType === 'reseller',
      isCustomer: () => get().userType === 'customer',

      // ---- Actions ----

      /**
       * Set the server URL and persist it.
       */
      setServer: async (url) => {
        const normalized = url ? url.replace(/\/+$/, '') : null;
        await setBaseURL(normalized || '');
        set({ serverUrl: normalized });
      },

      /**
       * Login with username and password.
       * Tries admin/reseller login first. If that fails with 401, tries customer login.
       */
      login: async (username, password) => {
        set({ isLoading: true, error: null });

        try {
          // Attempt admin/reseller login
          const response = await authApi.login(username, password);
          const data = response.data;

          if (data.success && data.token) {
            await setToken(data.token);

            const user = data.user || {};
            const userType = user.user_type === 'admin' ? 'admin' : 'reseller';
            const permissions = user.permissions || [];

            set({
              token: data.token,
              user,
              userType,
              permissions,
              customerData: null,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });

            return { success: true, userType };
          }

          // Unexpected response shape
          throw new Error(data.message || 'Login failed.');
        } catch (adminError) {
          // If admin login returns 401, try customer login
          const status = adminError.status || adminError.originalError?.response?.status;
          if (status === 401 || status === 400) {
            try {
              const custResponse = await authApi.customerLogin(username, password);
              const custData = custResponse.data;

              if (custData.success && custData.token) {
                await setToken(custData.token);

                const customerData = custData.customer || custData.user || {};

                set({
                  token: custData.token,
                  user: null,
                  userType: 'customer',
                  permissions: [],
                  customerData,
                  isAuthenticated: true,
                  isLoading: false,
                  error: null,
                });

                return { success: true, userType: 'customer' };
              }

              throw new Error(custData.message || 'Customer login failed.');
            } catch (custError) {
              const message =
                custError.message || 'Invalid username or password.';
              set({ isLoading: false, error: message });
              return { success: false, error: message };
            }
          }

          // Non-401 error from admin login (network error, server error, etc.)
          const message = adminError.message || 'Login failed. Please try again.';
          set({ isLoading: false, error: message });
          return { success: false, error: message };
        }
      },

      /**
       * Logout: clear everything and call API logout endpoint.
       */
      logout: async () => {
        // Best-effort API logout (don't block on failure)
        try {
          await authApi.logout();
        } catch {
          // Ignore errors - we are logging out regardless
        }

        await clearToken();

        set({
          token: null,
          user: null,
          customerData: null,
          userType: null,
          isAuthenticated: false,
          permissions: [],
          error: null,
          impersonatedFrom: null,
        });
      },

      /**
       * Refresh the current user data from the server.
       * Updates user object and permissions in store.
       */
      refreshUser: async () => {
        const state = get();
        if (!state.isAuthenticated || !state.token) return;

        try {
          if (state.userType === 'customer') {
            const response = await customerApi.dashboard();
            if (response.data?.success) {
              set({ customerData: response.data.data || response.data.customer });
            }
          } else {
            const response = await authApi.me();
            if (response.data?.success) {
              const user = response.data.user || response.data.data;
              const permissions = user?.permissions || state.permissions;
              set({ user, permissions });
            }
          }
        } catch (err) {
          console.error('refreshUser failed:', err.message);
          // If we got a 401 the response interceptor already handled it
        }
      },

      /**
       * Load session on app startup.
       * Restores token from SecureStore, validates it, and restores user state.
       */
      loadSession: async () => {
        set({ isLoading: true });

        try {
          await initializeApi();

          const token = await getToken();
          const serverUrl = await getBaseURL();

          if (!token || !serverUrl) {
            set({ isLoading: false });
            return false;
          }

          set({ token, serverUrl });

          // Validate token by fetching user data
          try {
            const response = await authApi.me();
            if (response.data?.success) {
              const user = response.data.user || response.data.data;
              const userType = user?.user_type === 'admin' ? 'admin' : 'reseller';
              const permissions = user?.permissions || [];

              set({
                user,
                userType,
                permissions,
                isAuthenticated: true,
                isLoading: false,
              });
              return true;
            }
          } catch {
            // Admin/reseller token invalid; try customer endpoint
            try {
              const custResponse = await customerApi.dashboard();
              if (custResponse.data?.success) {
                set({
                  customerData: custResponse.data.data || custResponse.data.customer,
                  userType: 'customer',
                  isAuthenticated: true,
                  isLoading: false,
                });
                return true;
              }
            } catch {
              // Both failed - token is invalid
            }
          }

          // Token is invalid, clear it
          await clearToken();
          set({
            token: null,
            user: null,
            customerData: null,
            userType: null,
            isAuthenticated: false,
            permissions: [],
            isLoading: false,
          });
          return false;
        } catch (err) {
          console.error('loadSession error:', err);
          set({ isLoading: false });
          return false;
        }
      },

      /**
       * Authenticate with biometrics (fingerprint / Face ID), then restore the
       * last saved session. The user must have previously logged in normally.
       */
      biometricLogin: async () => {
        set({ isLoading: true, error: null });

        try {
          // Check hardware support
          const compatible = await LocalAuthentication.hasHardwareAsync();
          if (!compatible) {
            set({ isLoading: false, error: 'Biometric authentication is not available on this device.' });
            return { success: false, error: 'Biometric authentication not available.' };
          }

          // Check enrollment
          const enrolled = await LocalAuthentication.isEnrolledAsync();
          if (!enrolled) {
            set({ isLoading: false, error: 'No biometrics enrolled. Please set up fingerprint or Face ID in device settings.' });
            return { success: false, error: 'No biometrics enrolled.' };
          }

          // Prompt
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Authenticate to access ProxPanel',
            cancelLabel: 'Cancel',
            disableDeviceFallback: false,
          });

          if (!result.success) {
            const errorMsg =
              result.error === 'user_cancel'
                ? 'Authentication cancelled.'
                : result.error === 'user_fallback'
                  ? 'Fallback authentication selected.'
                  : 'Biometric authentication failed.';
            set({ isLoading: false, error: errorMsg });
            return { success: false, error: errorMsg };
          }

          // Biometric passed - restore session from secure storage
          const restored = await get().loadSession();
          if (restored) {
            return { success: true, userType: get().userType };
          }

          set({
            isLoading: false,
            error: 'No saved session found. Please log in with your credentials first.',
          });
          return { success: false, error: 'No saved session.' };
        } catch (err) {
          const message = err.message || 'Biometric authentication failed.';
          set({ isLoading: false, error: message });
          return { success: false, error: message };
        }
      },

      /**
       * Clear any displayed error.
       */
      clearError: () => set({ error: null }),

      /**
       * Impersonate a reseller: save admin session and switch to reseller.
       */
      startImpersonation: async (resellerToken, resellerUser) => {
        const state = get();
        // Save admin session
        const adminSession = {
          token: state.token,
          user: state.user,
          userType: state.userType,
          permissions: state.permissions,
        };

        // Switch to reseller session
        await setToken(resellerToken);
        set({
          impersonatedFrom: adminSession,
          token: resellerToken,
          user: resellerUser,
          userType: 'reseller',
          permissions: resellerUser.permissions || [],
          customerData: null,
          error: null,
        });
      },

      /**
       * Exit impersonation and restore admin session.
       */
      stopImpersonation: async () => {
        const state = get();
        const admin = state.impersonatedFrom;
        if (!admin) return;

        // Restore admin session
        await setToken(admin.token);
        set({
          impersonatedFrom: null,
          token: admin.token,
          user: admin.user,
          userType: admin.userType,
          permissions: admin.permissions,
          customerData: null,
          error: null,
        });
      },
    }),
    {
      name: 'proxpanel-auth-store',
      storage: createJSONStorage(() => asyncStorageAdapter),
      // Only persist non-sensitive data. The token is in SecureStore.
      partialize: (state) => ({
        serverUrl: state.serverUrl,
        userType: state.userType,
        user: state.user,
        customerData: state.customerData,
        permissions: state.permissions,
        impersonatedFrom: state.impersonatedFrom,
        // Do NOT persist: token, isAuthenticated, isLoading, error
      }),
    },
  ),
);

// ---------- Auth event listener setup ----------
// Listen for 401 events emitted by the API response interceptor.
// This ensures the store is cleared even if the 401 came from a background request.
authEvents.subscribe('auth:expired', () => {
  const state = useAuthStore.getState();
  if (state.isAuthenticated) {
    useAuthStore.setState({
      token: null,
      user: null,
      customerData: null,
      userType: null,
      isAuthenticated: false,
      permissions: [],
      error: 'Your session has expired. Please log in again.',
      impersonatedFrom: null,
    });
  }
});

export default useAuthStore;
