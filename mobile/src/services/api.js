import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Storage keys
const STORAGE_KEYS = {
  BASE_URL: 'proxpanel_server_url',
  TOKEN: 'proxpanel_auth_token',
};

// Event emitter for auth events (simple pub/sub)
const authEventListeners = new Map();
let listenerIdCounter = 0;

export const authEvents = {
  subscribe(event, callback) {
    const id = ++listenerIdCounter;
    if (!authEventListeners.has(event)) {
      authEventListeners.set(event, new Map());
    }
    authEventListeners.get(event).set(id, callback);
    return () => {
      const listeners = authEventListeners.get(event);
      if (listeners) {
        listeners.delete(id);
      }
    };
  },
  emit(event, data) {
    const listeners = authEventListeners.get(event);
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback(data);
        } catch (err) {
          console.error(`Error in auth event listener for "${event}":`, err);
        }
      });
    }
  },
};

// In-memory cache for base URL and token to avoid async lookups on every request
let cachedBaseURL = null;
let cachedToken = null;

// Create axios instance with defaults
const apiClient = axios.create({
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// ---------- Token storage (SecureStore) ----------

async function saveTokenSecure(token) {
  try {
    if (Platform.OS === 'web') {
      // SecureStore is not available on web; fall back to AsyncStorage
      await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, token);
    } else {
      await SecureStore.setItemAsync(STORAGE_KEYS.TOKEN, token);
    }
    cachedToken = token;
  } catch (err) {
    console.error('Failed to save token to SecureStore:', err);
    // Fallback to AsyncStorage if SecureStore fails (e.g. simulator without keychain)
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, token);
      cachedToken = token;
    } catch (fallbackErr) {
      console.error('Failed to save token to AsyncStorage fallback:', fallbackErr);
    }
  }
}

async function loadTokenSecure() {
  try {
    let token = null;
    if (Platform.OS === 'web') {
      token = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);
    } else {
      token = await SecureStore.getItemAsync(STORAGE_KEYS.TOKEN);
    }
    // Fallback: if SecureStore returned nothing, check AsyncStorage
    if (!token) {
      token = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);
    }
    cachedToken = token;
    return token;
  } catch (err) {
    console.error('Failed to load token from SecureStore:', err);
    try {
      const token = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);
      cachedToken = token;
      return token;
    } catch (fallbackErr) {
      console.error('Failed to load token from AsyncStorage fallback:', fallbackErr);
      return null;
    }
  }
}

async function clearTokenSecure() {
  try {
    if (Platform.OS !== 'web') {
      await SecureStore.deleteItemAsync(STORAGE_KEYS.TOKEN);
    }
    await AsyncStorage.removeItem(STORAGE_KEYS.TOKEN);
    cachedToken = null;
  } catch (err) {
    console.error('Failed to clear token:', err);
    cachedToken = null;
  }
}

// ---------- Base URL storage (AsyncStorage) ----------

async function saveBaseURL(url) {
  try {
    // Normalize: remove trailing slash
    const normalized = url ? url.replace(/\/+$/, '') : '';
    await AsyncStorage.setItem(STORAGE_KEYS.BASE_URL, normalized);
    cachedBaseURL = normalized;
    apiClient.defaults.baseURL = normalized;
  } catch (err) {
    console.error('Failed to save base URL:', err);
  }
}

async function loadBaseURL() {
  try {
    const url = await AsyncStorage.getItem(STORAGE_KEYS.BASE_URL);
    cachedBaseURL = url;
    if (url) {
      apiClient.defaults.baseURL = url;
    }
    return url;
  } catch (err) {
    console.error('Failed to load base URL:', err);
    return null;
  }
}

// ---------- Public helpers ----------

export async function setBaseURL(url) {
  await saveBaseURL(url);
}

export async function getBaseURL() {
  if (cachedBaseURL) return cachedBaseURL;
  return loadBaseURL();
}

export async function setToken(token) {
  await saveTokenSecure(token);
}

export async function getToken() {
  if (cachedToken) return cachedToken;
  return loadTokenSecure();
}

export async function clearToken() {
  await clearTokenSecure();
}

/**
 * Initialize the API layer. Call once on app startup to restore
 * the base URL and token from persistent storage into memory.
 */
export async function initializeApi() {
  await loadBaseURL();
  await loadTokenSecure();
}

// ---------- Request interceptor ----------

apiClient.interceptors.request.use(
  async (config) => {
    // Ensure base URL is set
    if (!config.baseURL && !cachedBaseURL) {
      await loadBaseURL();
    }
    if (!config.baseURL && cachedBaseURL) {
      config.baseURL = cachedBaseURL;
    }

    // Attach token
    let token = cachedToken;
    if (!token) {
      token = await loadTokenSecure();
    }
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// ---------- Response interceptor ----------

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Network error (no response from server)
    if (!error.response) {
      const enhancedError = new Error(
        error.message === 'Network Error'
          ? 'Unable to connect to the server. Please check your internet connection and server URL.'
          : error.message || 'An unexpected network error occurred.',
      );
      enhancedError.isNetworkError = true;
      enhancedError.originalError = error;
      return Promise.reject(enhancedError);
    }

    const { status, data } = error.response;

    // 401 Unauthorized - session expired or invalid token
    if (status === 401) {
      // Avoid infinite loop on login endpoints
      const requestUrl = error.config?.url || '';
      const isLoginRequest =
        requestUrl.includes('/auth/login') ||
        requestUrl.includes('/customer/login');

      if (!isLoginRequest) {
        // Clear stored token and notify listeners
        await clearTokenSecure();
        authEvents.emit('auth:expired', {
          message: data?.message || 'Session expired. Please log in again.',
        });
      }
    }

    // 403 Forbidden
    if (status === 403) {
      const enhancedError = new Error(
        data?.message || 'You do not have permission to perform this action.',
      );
      enhancedError.status = 403;
      enhancedError.originalError = error;
      return Promise.reject(enhancedError);
    }

    // 429 Rate limited
    if (status === 429) {
      const enhancedError = new Error(
        'Too many requests. Please wait a moment and try again.',
      );
      enhancedError.status = 429;
      enhancedError.originalError = error;
      return Promise.reject(enhancedError);
    }

    // 500+ Server error
    if (status >= 500) {
      const enhancedError = new Error(
        data?.message || 'A server error occurred. Please try again later.',
      );
      enhancedError.status = status;
      enhancedError.isServerError = true;
      enhancedError.originalError = error;
      return Promise.reject(enhancedError);
    }

    // All other errors - pass through with improved message
    const message =
      data?.message || data?.error || error.message || 'Request failed.';
    const enhancedError = new Error(message);
    enhancedError.status = status;
    enhancedError.data = data;
    enhancedError.originalError = error;
    return Promise.reject(enhancedError);
  },
);

// ---------- Convenience HTTP methods ----------

const get = (url, config) => apiClient.get(url, config);
const post = (url, data, config) => apiClient.post(url, data, config);
const put = (url, data, config) => apiClient.put(url, data, config);
const patch = (url, data, config) => apiClient.patch(url, data, config);
const del = (url, config) => apiClient.delete(url, config);

// ---------- API method groups ----------

export const authApi = {
  login: (username, password) =>
    post('/api/auth/login', { username, password }),
  customerLogin: (username, password) =>
    post('/api/customer/login', { username, password }),
  logout: () => post('/api/auth/logout'),
  me: () => get('/api/auth/me'),
  refreshToken: () => post('/api/auth/refresh'),
  changePassword: (data) => put('/api/auth/password', data),
};

export const dashboardApi = {
  stats: () => get('/api/dashboard/stats'),
  systemMetrics: () => get('/api/dashboard/system-metrics'),
  systemInfo: () => get('/api/dashboard/system-info'),
};

export const subscriberApi = {
  list: (params) => get('/api/subscribers', { params }),
  get: (id) => get(`/api/subscribers/${id}`),
  create: (data) => post('/api/subscribers', data),
  update: (id, data) => put(`/api/subscribers/${id}`, data),
  delete: (id) => del(`/api/subscribers/${id}`),
  renew: (id) => post(`/api/subscribers/${id}/renew`),
  disconnect: (id) => post(`/api/subscribers/${id}/disconnect`),
  resetFUP: (id) => post(`/api/subscribers/${id}/reset-fup`),
  resetMAC: (id) => post(`/api/subscribers/${id}/reset-mac`),
  resetQuota: (id) => post(`/api/subscribers/${id}/reset-quota`),
  addDays: (id, days) => post(`/api/subscribers/${id}/add-days`, { days }),
  changeService: (id, serviceId) =>
    post(`/api/subscribers/${id}/change-service`, { service_id: serviceId }),
  activate: (id) => post(`/api/subscribers/${id}/activate`),
  deactivate: (id) => post(`/api/subscribers/${id}/deactivate`),
  ping: (id) => post(`/api/subscribers/${id}/ping`),
  bandwidth: (id) => get(`/api/subscribers/${id}/bandwidth`),
  torch: (id) => get(`/api/subscribers/${id}/torch`),
  bulkAction: (data) => post('/api/subscribers/bulk-action', data),
  getPassword: (id) => get(`/api/subscribers/${id}/password`),
};

export const serviceApi = {
  list: () => get('/api/services'),
  get: (id) => get(`/api/services/${id}`),
  create: (data) => post('/api/services', data),
  update: (id, data) => put(`/api/services/${id}`, data),
  delete: (id) => del(`/api/services/${id}`),
};

export const nasApi = {
  list: () => get('/api/nas'),
  get: (id) => get(`/api/nas/${id}`),
  create: (data) => post('/api/nas', data),
  update: (id, data) => put(`/api/nas/${id}`, data),
  delete: (id) => del(`/api/nas/${id}`),
  test: (id) => post(`/api/nas/${id}/test`),
  sync: (id) => post(`/api/nas/${id}/sync`),
  getPools: (id) => get(`/api/nas/${id}/pools`),
};

export const sessionApi = {
  list: (params) => get('/api/sessions', { params }),
  disconnect: (id) => post(`/api/sessions/${id}/disconnect`),
};

export const resellerApi = {
  list: (params) => get('/api/resellers', { params }),
  get: (id) => get(`/api/resellers/${id}`),
  create: (data) => post('/api/resellers', data),
  update: (id, data) => put(`/api/resellers/${id}`, data),
  addBalance: (id, amount) => post(`/api/resellers/${id}/transfer`, { amount }),
  deductBalance: (id, amount) => post(`/api/resellers/${id}/withdraw`, { amount }),
  impersonate: (id) => post(`/api/resellers/${id}/impersonate`),
};

export const customerApi = {
  dashboard: () => get('/api/customer/dashboard'),
  sessions: () => get('/api/customer/sessions'),
  usage: () => get('/api/customer/usage'),
  tickets: () => get('/api/customer/tickets'),
  getTicket: (id) => get(`/api/customer/tickets/${id}`),
  createTicket: (data) => post('/api/customer/tickets', data),
  replyTicket: (id, message) =>
    post(`/api/customer/tickets/${id}/reply`, { message }),
};

export const userApi = {
  list: () => get('/api/users'),
  get: (id) => get(`/api/users/${id}`),
  create: (data) => post('/api/users', data),
  update: (id, data) => put(`/api/users/${id}`, data),
  delete: (id) => del(`/api/users/${id}`),
};

export const auditApi = {
  list: (params) => get('/api/audit', { params }),
};

export const systemApi = {
  settings: () => get('/api/system/settings'),
  checkUpdate: () => get('/api/system/update/check'),
};

export const settingsApi = {
  get: () => get('/api/settings'),
  update: (data) => put('/api/settings', data),
  getLicense: () => get('/api/license/status'),
  checkUpdate: () => get('/api/system/update/check'),
};

export const ticketApi = {
  list: (params) => get('/api/tickets', { params }),
  get: (id) => get(`/api/tickets/${id}`),
  reply: (id, message) => post(`/api/tickets/${id}/reply`, { message }),
  updateStatus: (id, status) => put(`/api/tickets/${id}`, { status }),
};

export const reportApi = {
  subscribers: (params) => get('/api/reports/subscribers', { params }),
  revenue: (params) => get('/api/reports/revenue', { params }),
  usage: (params) => get('/api/reports/usage', { params }),
  services: (params) => get('/api/reports/services', { params }),
  expiry: (params) => get('/api/reports/expiry', { params }),
  nas: (params) => get('/api/reports/nas', { params }),
};

export const backupApi = {
  list: () => get('/api/backups'),
  create: () => post('/api/backups'),
  delete: (filename) => del(`/api/backups/${encodeURIComponent(filename)}`),
  restore: (filename) => post(`/api/backups/${encodeURIComponent(filename)}/restore`),
  schedules: () => get('/api/backups/schedules'),
};

export const cdnApi = {
  list: () => get('/api/cdns'),
  get: (id) => get(`/api/cdns/${id}`),
  create: (data) => post('/api/cdns', data),
  update: (id, data) => put(`/api/cdns/${id}`, data),
  delete: (id) => del(`/api/cdns/${id}`),
  sync: (id) => post(`/api/cdns/${id}/sync`),
  syncAll: () => post('/api/cdns/sync-all'),
  portRules: () => get('/api/cdn-port-rules'),
  getPortRule: (id) => get(`/api/cdn-port-rules/${id}`),
  createPortRule: (data) => post('/api/cdn-port-rules', data),
  updatePortRule: (id, data) => put(`/api/cdn-port-rules/${id}`, data),
  deletePortRule: (id) => del(`/api/cdn-port-rules/${id}`),
};

export const bandwidthApi = {
  list: () => get('/api/bandwidth/rules'),
  get: (id) => get(`/api/bandwidth/rules/${id}`),
  create: (data) => post('/api/bandwidth/rules', data),
  update: (id, data) => put(`/api/bandwidth/rules/${id}`, data),
  delete: (id) => del(`/api/bandwidth/rules/${id}`),
  apply: (id) => post(`/api/bandwidth/rules/${id}/apply`),
};

export const permissionApi = {
  listAll: () => get('/api/permissions'),
  listGroups: () => get('/api/permissions/groups'),
  getGroup: (id) => get(`/api/permissions/groups/${id}`),
  createGroup: (data) => post('/api/permissions/groups', data),
  updateGroup: (id, data) => put(`/api/permissions/groups/${id}`, data),
  deleteGroup: (id) => del(`/api/permissions/groups/${id}`),
};

export const brandingApi = {
  get: () => get('/api/branding'),
};

// Server connection via license server (resolve short code to server URL)
export const resolveApi = {
  byCode: (code) =>
    axios.get('https://license.proxrad.com/api/v1/app/resolve', {
      params: { code },
      timeout: 15000,
    }),
};

// ---------- Default export ----------

const api = {
  client: apiClient,

  // Storage helpers
  setBaseURL,
  getBaseURL,
  setToken,
  getToken,
  clearToken,
  initializeApi,

  // Event system
  events: authEvents,

  // Grouped endpoints
  auth: authApi,
  dashboard: dashboardApi,
  subscribers: subscriberApi,
  services: serviceApi,
  nas: nasApi,
  sessions: sessionApi,
  resellers: resellerApi,
  users: userApi,
  audit: auditApi,
  customer: customerApi,
  system: systemApi,
  settings: settingsApi,
  tickets: ticketApi,
  reports: reportApi,
  backups: backupApi,
  branding: brandingApi,
  cdn: cdnApi,
  bandwidth: bandwidthApi,
  permissions: permissionApi,
  resolve: resolveApi,

  // Raw HTTP methods (for custom calls)
  get,
  post,
  put,
  patch,
  delete: del,
};

export default api;
