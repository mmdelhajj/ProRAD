import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Token refresh state
let isRefreshing = false
let refreshSubscribers = []

const onRefreshed = (token) => {
  refreshSubscribers.forEach((callback) => callback(token))
  refreshSubscribers = []
}

const addRefreshSubscriber = (callback) => {
  refreshSubscribers.push(callback)
}

// Parse JWT to get expiration
const parseJwt = (token) => {
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(jsonPayload)
  } catch (e) {
    return null
  }
}

// Check if token needs refresh (within 1 hour of expiry)
const shouldRefreshToken = (token) => {
  if (!token) return false
  const payload = parseJwt(token)
  if (!payload || !payload.exp) return false
  const expiresAt = payload.exp * 1000 // Convert to milliseconds
  const now = Date.now()
  const oneHour = 60 * 60 * 1000
  return expiresAt - now < oneHour && expiresAt > now
}

// Request interceptor - auto refresh token if needed
api.interceptors.request.use(
  async (config) => {
    // Skip refresh for auth endpoints
    if (config.url?.includes('/auth/')) {
      return config
    }

    const authData = localStorage.getItem('proisp-auth')
    if (!authData) return config

    try {
      const { state } = JSON.parse(authData)
      const token = state?.token

      if (token && shouldRefreshToken(token)) {
        if (!isRefreshing) {
          isRefreshing = true
          try {
            const response = await axios.post('/api/auth/refresh', null, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (response.data.success && response.data.token) {
              const newToken = response.data.token
              // Update stored token
              state.token = newToken
              localStorage.setItem('proisp-auth', JSON.stringify({ state }))
              api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
              config.headers['Authorization'] = `Bearer ${newToken}`
              onRefreshed(newToken)
            } else {
              // Refresh didn't return new token, use old token
              config.headers['Authorization'] = `Bearer ${token}`
              onRefreshed(token)
            }
          } catch (err) {
            // Refresh failed, continue with old token and notify subscribers
            config.headers['Authorization'] = `Bearer ${token}`
            onRefreshed(token)
          } finally {
            isRefreshing = false
          }
        } else {
          // Wait for ongoing refresh with timeout
          return new Promise((resolve) => {
            const timeout = setTimeout(() => {
              // Timeout after 10 seconds, continue with old token
              config.headers['Authorization'] = `Bearer ${token}`
              resolve(config)
            }, 10000)
            addRefreshSubscriber((newToken) => {
              clearTimeout(timeout)
              config.headers['Authorization'] = `Bearer ${newToken}`
              resolve(config)
            })
          })
        }
      } else if (token) {
        // Token doesn't need refresh, just add it to the request
        config.headers['Authorization'] = `Bearer ${token}`
      }
    } catch (e) {
      // Parse error, continue without refresh
    }

    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - only logout if not already on login page
      if (!window.location.pathname.includes('/login')) {
        localStorage.removeItem('proisp-auth')
        window.location.href = '/login'
      }
    }

    // Handle license-related errors
    if (error.response?.status === 403) {
      const code = error.response.data?.code
      if (code === 'LICENSE_READONLY') {
        // System is in read-only mode - enhance error message
        error.licenseReadOnly = true
        error.response.data.message = 'System is in read-only mode due to expired license. Please renew your license to make changes.'
      } else if (code === 'LICENSE_GRACE_PERIOD') {
        // Grace period - can't create new records
        error.licenseGracePeriod = true
        error.response.data.message = 'License expired. Creating new records is disabled during grace period. Please renew your license.'
      } else if (code === 'LICENSE_INVALID') {
        // License is blocked
        error.licenseBlocked = true
      }
    }

    // Handle 402 Payment Required (license blocked)
    if (error.response?.status === 402) {
      error.licenseBlocked = true
      error.response.data.message = 'License expired or invalid. Please contact support.'
    }

    return Promise.reject(error)
  }
)

export default api

// API helper functions
export const subscriberApi = {
  list: (params) => api.get('/subscribers', { params }),
  listArchived: (params) => api.get('/subscribers/archived', { params }),
  get: (id) => api.get(`/subscribers/${id}`),
  create: (data) => api.post('/subscribers', data),
  update: (id, data) => api.put(`/subscribers/${id}`, data),
  delete: (id) => api.delete(`/subscribers/${id}`),
  renew: (id, data) => api.post(`/subscribers/${id}/renew`, data),
  disconnect: (id) => api.post(`/subscribers/${id}/disconnect`),
  resetFup: (id) => api.post(`/subscribers/${id}/reset-fup`),
  resetMac: (id, data) => api.post(`/subscribers/${id}/reset-mac`, data),
  restore: (id) => api.post(`/subscribers/${id}/restore`),
  permanentDelete: (id) => api.delete(`/subscribers/${id}/permanent`),
  // New action endpoints
  rename: (id, data) => api.post(`/subscribers/${id}/rename`, data),
  addDays: (id, data) => api.post(`/subscribers/${id}/add-days`, data),
  calculateChangeServicePrice: (id, serviceId) => api.get(`/subscribers/${id}/calculate-change-service-price?service_id=${serviceId}`),
  changeService: (id, data) => api.post(`/subscribers/${id}/change-service`, data),
  activate: (id) => api.post(`/subscribers/${id}/activate`),
  deactivate: (id) => api.post(`/subscribers/${id}/deactivate`),
  refill: (id, data) => api.post(`/subscribers/${id}/refill`, data),
  ping: (id) => api.post(`/subscribers/${id}/ping`),
  getPassword: (id) => api.get(`/subscribers/${id}/password`),
  getBandwidth: (id) => api.get(`/subscribers/${id}/bandwidth`),
  getTorch: (id, duration = 3) => api.get(`/subscribers/${id}/torch?duration=${duration}`),
  bulkImport: (formData) => api.post('/subscribers/bulk-import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  importExcel: (data) => api.post('/subscribers/import-excel', data),
  bulkUpdate: (data) => api.post('/subscribers/bulk-update', data),
  bulkAction: (data) => api.post('/subscribers/bulk-action', data),
  // Bandwidth rules
  getBandwidthRules: (id) => api.get(`/subscribers/${id}/bandwidth-rules`),
  createBandwidthRule: (id, data) => api.post(`/subscribers/${id}/bandwidth-rules`, data),
  updateBandwidthRule: (id, ruleId, data) => api.put(`/subscribers/${id}/bandwidth-rules/${ruleId}`, data),
  deleteBandwidthRule: (id, ruleId) => api.delete(`/subscribers/${id}/bandwidth-rules/${ruleId}`),
  getCDNUpgrades: (id) => api.get(`/subscribers/${id}/cdn-upgrades`),
}

export const serviceApi = {
  list: (params) => api.get('/services', { params }),
  get: (id) => api.get(`/services/${id}`),
  create: (data) => api.post('/services', data),
  update: (id, data) => api.put(`/services/${id}`, data),
  delete: (id) => api.delete(`/services/${id}`),
}

export const nasApi = {
  list: () => api.get('/nas'),
  get: (id) => api.get(`/nas/${id}`),
  create: (data) => api.post('/nas', data),
  update: (id, data) => api.put(`/nas/${id}`, data),
  delete: (id) => api.delete(`/nas/${id}`),
  sync: (id) => api.post(`/nas/${id}/sync`),
  test: (id) => api.post(`/nas/${id}/test`),
  getPools: (id) => api.get(`/nas/${id}/pools`),
  updatePools: (id, data) => api.put(`/nas/${id}/pools`, data),
}

export const resellerApi = {
  list: (params) => api.get('/resellers', { params }),
  get: (id) => api.get(`/resellers/${id}`),
  create: (data) => api.post('/resellers', data),
  update: (id, data) => api.put(`/resellers/${id}`, data),
  delete: (id) => api.delete(`/resellers/${id}`),
  permanentDelete: (id) => api.delete(`/resellers/${id}/permanent`),
  transfer: (id, data) => api.post(`/resellers/${id}/transfer`, data),
  withdraw: (id, data) => api.post(`/resellers/${id}/withdraw`, data),
  impersonate: (id) => api.post(`/resellers/${id}/impersonate`),
  getImpersonateToken: (id) => api.post(`/resellers/${id}/impersonate-token`), // Get temp token for new tab
  // NAS and Service assignments
  getAssignedNAS: (id) => api.get(`/resellers/${id}/assigned-nas`),
  updateAssignedNAS: (id, nasIds) => api.put(`/resellers/${id}/assigned-nas`, { nas_ids: nasIds }),
  getAssignedServices: (id) => api.get(`/resellers/${id}/assigned-services`),
  updateAssignedServices: (id, services) => api.put(`/resellers/${id}/assigned-services`, { services }),
}

export const dashboardApi = {
  stats: () => api.get('/dashboard/stats'),
  chart: (params) => api.get('/dashboard/chart', { params }),
  transactions: (params) => api.get('/dashboard/transactions', { params }),
  resellers: (params) => api.get('/dashboard/resellers', { params }),
  sessions: (params) => api.get('/dashboard/sessions', { params }),
  systemMetrics: () => api.get('/dashboard/system-metrics'),
  systemCapacity: () => api.get('/dashboard/system-capacity'),
  systemInfo: () => api.get('/dashboard/system-info'),
}

export const sessionApi = {
  list: (params) => api.get('/sessions', { params }),
  get: (id) => api.get(`/sessions/${id}`),
  disconnect: (id) => api.post(`/sessions/${id}/disconnect`),
}

export const sharingApi = {
  list: (params) => api.get('/sharing', { params }),
  stats: () => api.get('/sharing/stats'),
  getSubscriberDetails: (id) => api.get(`/sharing/subscriber/${id}`),
  getNasRuleStatus: () => api.get('/sharing/nas-rules'),
  generateTTLRules: (nasId) => api.post(`/sharing/nas/${nasId}/rules`),
  removeTTLRules: (nasId) => api.delete(`/sharing/nas/${nasId}/rules`),
  getHistory: (params) => api.get('/sharing/history', { params }),
  getTrends: (params) => api.get('/sharing/trends', { params }),
  getRepeatOffenders: (params) => api.get('/sharing/repeat-offenders', { params }),
  getSettings: () => api.get('/sharing/settings'),
  updateSettings: (data) => api.put('/sharing/settings', data),
  runManualScan: () => api.post('/sharing/scan'),
}

export const ticketApi = {
  list: (params) => api.get('/tickets', { params }),
  stats: () => api.get('/tickets/stats'),
  get: (id) => api.get(`/tickets/${id}`),
  create: (data) => api.post('/tickets', data),
  update: (id, data) => api.put(`/tickets/${id}`, data),
  delete: (id) => api.delete(`/tickets/${id}`),
  addReply: (id, data) => api.post(`/tickets/${id}/reply`, data),
}

export const backupApi = {
  list: () => api.get('/backups'),
  create: (data) => api.post('/backups', data),
  upload: (formData) => api.post('/backups/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  download: (filename) => api.get(`/backups/${filename}/download`, { responseType: 'blob' }),
  getDownloadToken: (filename) => api.get(`/backups/${filename}/token`),
  restore: (filename) => api.post(`/backups/${filename}/restore`),
  delete: (filename) => api.delete(`/backups/${filename}`),
  // Schedules
  listSchedules: () => api.get('/backups/schedules'),
  getSchedule: (id) => api.get(`/backups/schedules/${id}`),
  createSchedule: (data) => api.post('/backups/schedules', data),
  updateSchedule: (id, data) => api.put(`/backups/schedules/${id}`, data),
  deleteSchedule: (id) => api.delete(`/backups/schedules/${id}`),
  toggleSchedule: (id) => api.post(`/backups/schedules/${id}/toggle`),
  runScheduleNow: (id) => api.post(`/backups/schedules/${id}/run`),
  testFTP: (data) => api.post('/backups/test-ftp', data),
  listLogs: (params) => api.get('/backups/logs', { params }),
}

export const permissionApi = {
  list: () => api.get('/permissions'),
  seed: () => api.post('/permissions/seed'),
  listGroups: () => api.get('/permissions/groups'),
  getGroup: (id) => api.get(`/permissions/groups/${id}`),
  createGroup: (data) => api.post('/permissions/groups', data),
  updateGroup: (id, data) => api.put(`/permissions/groups/${id}`, data),
  deleteGroup: (id) => api.delete(`/permissions/groups/${id}`),
}

export const settingsApi = {
  list: () => api.get('/settings'),
  get: (key) => api.get(`/settings/${key}`),
  update: (key, value) => api.put(`/settings/${key}`, { key, value }),
  bulkUpdate: (settings) => api.put('/settings/bulk', { settings }),
  getTimezones: () => api.get('/settings/timezones'),
  uploadLogo: (formData) => api.post('/settings/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  deleteLogo: () => api.delete('/settings/logo'),
  uploadLoginBackground: (formData) => api.post('/settings/login-background', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  deleteLoginBackground: () => api.delete('/settings/login-background'),
  uploadFavicon: (formData) => api.post('/settings/favicon', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  deleteFavicon: () => api.delete('/settings/favicon'),
  restartServices: (services) => api.post('/system/restart-services', { services }),
}

export const clusterApi = {
  getConfig: () => api.get('/cluster/config'),
  getStatus: () => api.get('/cluster/status'),
  setupMain: (data) => api.post('/cluster/setup-main', data),
  setupSecondary: (data) => api.post('/cluster/setup-secondary', data),
  joinCluster: (data) => api.post('/cluster/join', data),
  leaveCluster: () => api.post('/cluster/leave'),
  removeNode: (id) => api.delete(`/cluster/nodes/${id}`),
  manualFailover: (targetNodeId) => api.post('/cluster/failover', { target_node_id: targetNodeId }),
  testConnection: (data) => api.post('/cluster/test-connection', data),
  checkMainStatus: () => api.get('/cluster/check-main-status'),
  promoteToMain: () => api.post('/cluster/promote-to-main'),
  testSourceConnection: (data) => api.post('/cluster/test-source-connection', data),
  recoverFromServer: (data) => api.post('/cluster/recover-from-server', data),
}

export const cdnApi = {
  list: (params) => api.get('/cdns', { params }),
  get: (id) => api.get(`/cdns/${id}`),
  getSpeeds: () => api.get('/cdns/speeds'), // Get all CDN speeds from services
  create: (data) => api.post('/cdns', data),
  update: (id, data) => api.put(`/cdns/${id}`, data),
  delete: (id) => api.delete(`/cdns/${id}`),
  syncToNAS: (id) => api.post(`/cdns/${id}/sync`),
  syncAllToNAS: () => api.post('/cdns/sync-all'),
  // Service CDN configurations
  listServiceCDNs: (serviceId) => api.get(`/services/${serviceId}/cdns`),
  updateServiceCDNs: (serviceId, data) => api.put(`/services/${serviceId}/cdns`, data),
  addServiceCDN: (serviceId, data) => api.post(`/services/${serviceId}/cdns`, data),
  deleteServiceCDN: (serviceId, cdnId) => api.delete(`/services/${serviceId}/cdns/${cdnId}`),
}

// Public API - no auth required
export const publicApi = {
  getBranding: () => axios.get('/api/branding'),
  exchangeImpersonateToken: (token) => axios.post('/api/auth/impersonate-exchange', { token }),
}
