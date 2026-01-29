import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../services/api'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      // Customer-specific state
      isCustomer: false,
      customerData: null,

      // Unified login - tries admin first, then customer
      login: async (username, password, twoFACode = '') => {
        // First try admin/reseller login
        try {
          const payload = { username, password }
          if (twoFACode) {
            payload.two_fa_code = twoFACode
          }
          const response = await api.post('/auth/login', payload)
          if (response.data.success) {
            set({
              user: response.data.user,
              token: response.data.token,
              isAuthenticated: true,
              isCustomer: false,
              customerData: null,
            })
            api.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`
            return {
              success: true,
              userType: 'admin',
              force_password_change: response.data.force_password_change || response.data.user?.force_password_change
            }
          }
          // Check if 2FA is required
          if (response.data.requires_2fa) {
            return { success: false, requires_2fa: true, message: response.data.message }
          }
        } catch (error) {
          // Check if 2FA is required from error response
          if (error.response?.data?.requires_2fa) {
            return { success: false, requires_2fa: true, message: error.response.data.message }
          }
          // Admin login failed, try customer login
        }

        // Try customer login (PPPoE credentials)
        try {
          const response = await api.post('/customer/login', { username, password })
          if (response.data.success) {
            set({
              user: null,
              token: response.data.token,
              isAuthenticated: true,
              isCustomer: true,
              customerData: response.data.customer,
            })
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
        // Also clear customer token from localStorage (legacy)
        localStorage.removeItem('customer_token')
      },

      refreshUser: async () => {
        const { isCustomer } = get()
        if (isCustomer) {
          // Refresh customer data
          try {
            const response = await api.get('/customer/dashboard')
            if (response.data.success) {
              set({ customerData: response.data.data })
            }
          } catch (error) {
            get().logout()
          }
        } else {
          // Refresh admin/reseller data
          try {
            const response = await api.get('/auth/me')
            if (response.data.success) {
              set({ user: response.data.user })
            }
          } catch (error) {
            get().logout()
          }
        }
      },

      initAuth: () => {
        const token = get().token
        if (token) {
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`
        }
      },

      // Check if user has a specific permission
      hasPermission: (permission) => {
        const user = get().user
        if (!user) return false
        // Admin has all permissions
        if (user.user_type === 'admin') return true
        // Reseller with no permission group has all permissions (backward compatibility)
        if (user.user_type === 'reseller' && (!user.permissions || user.permissions.length === 0)) return true
        // Other users (support, collector, readonly) with no permissions array = no access
        if (!user.permissions || user.permissions.length === 0) return false
        // Check if permission exists in user's permissions
        return user.permissions.includes(permission)
      },

      // Check if user has any of the specified permissions
      hasAnyPermission: (permissions) => {
        const user = get().user
        if (!user) return false
        if (user.user_type === 'admin') return true
        // Reseller with no permission group has all permissions (backward compatibility)
        if (user.user_type === 'reseller' && (!user.permissions || user.permissions.length === 0)) return true
        // Other users (support, collector, readonly) with no permissions array = no access
        if (!user.permissions || user.permissions.length === 0) return false
        return permissions.some(p => user.permissions.includes(p))
      },

      // Check if user is admin
      isAdmin: () => {
        const user = get().user
        return user?.user_type === 'admin'
      },

      // Check if user is reseller
      isReseller: () => {
        const user = get().user
        return user?.user_type === 'reseller'
      },
    }),
    {
      name: 'proisp-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        isCustomer: state.isCustomer,
        customerData: state.customerData,
      }),
    }
  )
)

// Initialize auth on app load
useAuthStore.getState().initAuth()
