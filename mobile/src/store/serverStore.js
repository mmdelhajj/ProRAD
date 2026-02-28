import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { setBaseURL } from '../services/api';

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
      console.error('serverStore: Failed to persist state:', err);
    }
  },
  removeItem: async (name) => {
    try {
      await AsyncStorage.removeItem(name);
    } catch (err) {
      console.error('serverStore: Failed to remove persisted state:', err);
    }
  },
};

/**
 * Normalize a URL to a consistent format:
 *  - Ensure https:// or http:// prefix
 *  - Remove trailing slashes
 *  - Lowercase the hostname portion
 */
function normalizeUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let url = raw.trim();
  if (!url) return '';

  // Add protocol if missing
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  // Remove trailing slashes
  url = url.replace(/\/+$/, '');

  return url;
}

const useServerStore = create(
  persist(
    (set, get) => ({
      // ---- State ----
      serverUrl: null,
      serverName: null,
      serverLogo: null,
      isConnected: false,
      savedServers: [], // Array of { url, name, logo, addedAt }

      // ---- Actions ----

      /**
       * Set the current active server. Persists the URL to the API layer
       * as well so all requests use it.
       */
      setServer: async (url, name, logo) => {
        const normalized = normalizeUrl(url);
        if (!normalized) return;

        await setBaseURL(normalized);

        set({
          serverUrl: normalized,
          serverName: name || null,
          serverLogo: logo || null,
          isConnected: true,
        });

        // Auto-add to saved servers if not already there
        const state = get();
        const exists = state.savedServers.some(
          (s) => normalizeUrl(s.url) === normalized,
        );
        if (!exists) {
          set({
            savedServers: [
              ...state.savedServers,
              {
                url: normalized,
                name: name || normalized,
                logo: logo || null,
                addedAt: new Date().toISOString(),
              },
            ],
          });
        } else {
          // Update name/logo for existing entry
          set({
            savedServers: state.savedServers.map((s) =>
              normalizeUrl(s.url) === normalized
                ? { ...s, name: name || s.name, logo: logo || s.logo }
                : s,
            ),
          });
        }
      },

      /**
       * Add a server to the saved list without making it the active server.
       */
      addServer: (url, name, logo) => {
        const normalized = normalizeUrl(url);
        if (!normalized) return;

        const state = get();
        const exists = state.savedServers.some(
          (s) => normalizeUrl(s.url) === normalized,
        );
        if (exists) {
          // Update name/logo
          set({
            savedServers: state.savedServers.map((s) =>
              normalizeUrl(s.url) === normalized
                ? { ...s, name: name || s.name, logo: logo || s.logo }
                : s,
            ),
          });
          return;
        }

        set({
          savedServers: [
            ...state.savedServers,
            {
              url: normalized,
              name: name || normalized,
              logo: logo || null,
              addedAt: new Date().toISOString(),
            },
          ],
        });
      },

      /**
       * Remove a server from the saved list.
       * If the removed server is the currently active one, disconnect.
       */
      removeServer: (url) => {
        const normalized = normalizeUrl(url);
        const state = get();

        set({
          savedServers: state.savedServers.filter(
            (s) => normalizeUrl(s.url) !== normalized,
          ),
        });

        // If removing the active server, clear connection
        if (state.serverUrl === normalized) {
          set({
            serverUrl: null,
            serverName: null,
            serverLogo: null,
            isConnected: false,
          });
        }
      },

      /**
       * Disconnect from the current server without removing it from saved list.
       */
      disconnect: () => {
        set({
          serverUrl: null,
          serverName: null,
          serverLogo: null,
          isConnected: false,
        });
      },

      /**
       * Restore saved servers from AsyncStorage (called on app startup).
       * The persist middleware handles this automatically, but this method
       * ensures the API layer's base URL is also restored if a server
       * was previously connected.
       */
      loadServers: async () => {
        const state = get();
        if (state.serverUrl && state.isConnected) {
          await setBaseURL(state.serverUrl);
        }
      },

      /**
       * Test connectivity to a server URL.
       * Tries GET /health first, falls back to GET /api/branding.
       * Returns an object with { reachable, name, logo }.
       */
      testConnection: async (url) => {
        const normalized = normalizeUrl(url);
        if (!normalized) {
          return { reachable: false, error: 'Invalid URL.' };
        }

        // Try /health endpoint (lightweight, no auth needed)
        try {
          const healthResponse = await axios.get(`${normalized}/health`, {
            timeout: 10000,
            validateStatus: (status) => status < 500,
          });

          if (healthResponse.status >= 200 && healthResponse.status < 400) {
            // Server is reachable. Try to get branding info for name/logo.
            let name = null;
            let logo = null;

            try {
              const brandingResponse = await axios.get(
                `${normalized}/api/branding`,
                { timeout: 8000 },
              );
              const bData = brandingResponse.data?.data || brandingResponse.data;
              name = bData?.company_name || bData?.name || null;
              logo = bData?.logo || bData?.company_logo || null;
              // If logo is relative, make absolute
              if (logo && !logo.startsWith('http')) {
                logo = `${normalized}${logo.startsWith('/') ? '' : '/'}${logo}`;
              }
            } catch {
              // Branding endpoint failed, that is acceptable
            }

            return { reachable: true, name, logo };
          }

          return { reachable: false, error: `Server returned status ${healthResponse.status}.` };
        } catch (err) {
          // /health failed - try /api/branding as fallback
          try {
            const fallbackResponse = await axios.get(
              `${normalized}/api/branding`,
              {
                timeout: 10000,
                validateStatus: (status) => status < 500,
              },
            );

            if (fallbackResponse.status >= 200 && fallbackResponse.status < 400) {
              const bData = fallbackResponse.data?.data || fallbackResponse.data;
              let name = bData?.company_name || bData?.name || null;
              let logo = bData?.logo || bData?.company_logo || null;
              if (logo && !logo.startsWith('http')) {
                logo = `${normalized}${logo.startsWith('/') ? '' : '/'}${logo}`;
              }
              return { reachable: true, name, logo };
            }

            return { reachable: false, error: `Server returned status ${fallbackResponse.status}.` };
          } catch (fallbackErr) {
            const message =
              fallbackErr.message === 'Network Error'
                ? 'Unable to reach the server. Check the URL and your internet connection.'
                : fallbackErr.code === 'ECONNABORTED'
                  ? 'Connection timed out. The server may be offline or unreachable.'
                  : fallbackErr.message || 'Connection test failed.';
            return { reachable: false, error: message };
          }
        }
      },

      /**
       * Update branding info for the currently connected server.
       * Useful after login when branding may be fetched.
       */
      updateBranding: (name, logo) => {
        const state = get();
        const updates = {};
        if (name !== undefined) updates.serverName = name;
        if (logo !== undefined) updates.serverLogo = logo;

        set(updates);

        // Also update in saved servers list
        if (state.serverUrl) {
          set({
            savedServers: state.savedServers.map((s) =>
              normalizeUrl(s.url) === state.serverUrl
                ? {
                    ...s,
                    name: name !== undefined ? name : s.name,
                    logo: logo !== undefined ? logo : s.logo,
                  }
                : s,
            ),
          });
        }
      },
    }),
    {
      name: 'proxpanel-server-store',
      storage: createJSONStorage(() => asyncStorageAdapter),
      // Persist everything
      partialize: (state) => ({
        serverUrl: state.serverUrl,
        serverName: state.serverName,
        serverLogo: state.serverLogo,
        isConnected: state.isConnected,
        savedServers: state.savedServers,
      }),
    },
  ),
);

export default useServerStore;
