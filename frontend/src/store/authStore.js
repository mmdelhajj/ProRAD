import { create } from 'zustand'
import api from '../services/api'

// Storage keys
const AUTH_KEY = 'proisp-auth'
const IMPERSONATE_KEY = 'proisp-impersonate'

// Check if this is an impersonated session
const impersonateData = sessionStorage.getItem(IMPERSONATE_KEY)
const isImpersonatedTab = !!impersonateData

// Helper to get storage based on session type
const getStorage = () => isImpersonatedTab ? sessionStorage : localStorage
const getStorageKey = () => isImpersonatedTab ? IMPERSONATE_KEY : AUTH_KEY

// Read initial state from storage IMMEDIATELY
const loadInitialState = () => {
  try {
    const stored = getStorage().getItem(getStorageKey())
    if (stored) {
      const data = JSON.parse(stored)
      if (data.token) {
        // Set token on axios immediately
        api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`
        return {
          user: data.user || null,
          token: data.token,
          isAuthenticated: true,
          isCustomer: data.isCustomer || false,
          customerData: data.customerData || null,
        }
      }
    }
  } catch (e) {
    console.error('Failed to load auth state:', e)
  }
  return {
    user: null,
    token: null,
    isAuthenticated: false,
    isCustomer: false,
    customerData: null,
  }
}

// Get initial state
const initialState = loadInitialState()

// Helper to save state to storage
const saveToStorage = (state) => {
  try {
    const data = {
      user: state.user,
      token: state.token,
      isCustomer: state.isCustomer,
      customerData: state.customerData,
    }
    getStorage().setItem(getStorageKey(), JSON.stringify(data))
  } catch (e) {
    console.error('Failed to save auth state:', e)
  }
}

export const useAuthStore = create((set, get) => ({
  // Initialize from storage
  ...initialState,
  isImpersonated: isImpersonatedTab,

  // Login function
  login: async (username, password, twoFACode = '') => {
    // Try admin/reseller login first
    try {
      const payload = { username, password }
      if (twoFACode) {
        payload.two_fa_code = twoFACode
      }
      const response = await api.post('/auth/login', payload)
      if (response.data.success) {
        const newState = {
          user: response.data.user,
          token: response.data.token,
          isAuthenticated: true,
          isCustomer: false,
          customerData: null,
        }
        set(newState)
        saveToStorage(newState)
        api.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`
        return {
          success: true,
          userType: 'admin',
          force_password_change: response.data.force_password_change || response.data.user?.force_password_change
        }
      }
      if (response.data.requires_2fa) {
        return { success: false, requires_2fa: true, message: response.data.message }
      }
    } catch (error) {
      if (error.response?.data?.requires_2fa) {
        return { success: false, requires_2fa: true, message: error.response.data.message }
      }
    }

    // Try customer login
    try {
      const response = await api.post('/customer/login', { username, password })
      if (response.data.success) {
        const newState = {
          user: null,
          token: response.data.token,
          isAuthenticated: true,
          isCustomer: true,
          customerData: response.data.customer,
        }
        set(newState)
        saveToStorage(newState)
        api.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`
        return { success: true, userType: 'customer' }
      }
      return { success: false, message: response.data.message }
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Invalid username or password'
      }
    }
  },

  logout: () => {
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      isCustomer: false,
      customerData: null,
    })
    delete api.defaults.headers.common['Authorization']
    getStorage().removeItem(getStorageKey())
    localStorage.removeItem('customer_token') // Legacy cleanup
  },

  refreshUser: async () => {
    const { isCustomer, token } = get()
    if (isCustomer) {
      try {
        const response = await api.get('/customer/dashboard')
        if (response.data.success) {
          set({ customerData: response.data.data })
        }
      } catch (error) {
        console.error('Failed to refresh customer data:', error)
      }
    } else {
      try {
        const response = await api.get('/auth/me')
        if (response.data.success) {
          const newState = { user: response.data.user }
          set(newState)
          // Also save to storage so permissions persist across page refreshes
          saveToStorage({ user: response.data.user, token, isCustomer: false, customerData: null })
        }
      } catch (error) {
        console.error('Failed to refresh user data:', error)
      }
    }
  },

  initAuth: () => {
    const token = get().token
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    }
  },

  hasPermission: (permission) => {
    const user = get().user
    if (!user) return false
    // Check for admin (user_type can be 'admin' or 4)
    if (user.user_type === 'admin' || user.user_type === 4) return true
    // Resellers with no permission group have all permissions (backward compatibility)
    const isReseller = user.user_type === 'reseller' || user.user_type === 2
    if (isReseller && (!user.permissions || user.permissions.length === 0)) return true
    // Check specific permission
    if (!user.permissions || user.permissions.length === 0) return false
    return user.permissions.includes(permission)
  },

  hasAnyPermission: (permissions) => {
    const user = get().user
    if (!user) return false
    // Check for admin (user_type can be 'admin' or 4)
    if (user.user_type === 'admin' || user.user_type === 4) return true
    // Resellers with no permission group have all permissions (backward compatibility)
    const isReseller = user.user_type === 'reseller' || user.user_type === 2
    if (isReseller && (!user.permissions || user.permissions.length === 0)) return true
    // Check specific permissions
    if (!user.permissions || user.permissions.length === 0) return false
    return permissions.some(p => user.permissions.includes(p))
  },

  isAdmin: () => {
    const user = get().user
    return user?.user_type === 'admin' || user?.user_type === 4
  },

  isReseller: () => {
    const user = get().user
    return user?.user_type === 'reseller' || user?.user_type === 2
  },
}))
