import { create } from 'zustand'
import axios from 'axios'

export const useBrandingStore = create((set, get) => ({
  companyName: 'ProISP',
  companyLogo: '',
  primaryColor: '#2563eb',
  loaded: false,
  loading: false,

  fetchBranding: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const response = await axios.get('/api/branding')
      if (response.data.success) {
        set({
          companyName: response.data.data.company_name || 'ProISP',
          companyLogo: response.data.data.company_logo || '',
          primaryColor: response.data.data.primary_color || '#2563eb',
          loaded: true,
        })
      }
    } catch (error) {
      console.error('Failed to fetch branding:', error)
    } finally {
      set({ loading: false })
    }
  },

  updateBranding: (data) => {
    set({
      companyName: data.company_name || get().companyName,
      companyLogo: data.company_logo || get().companyLogo,
      primaryColor: data.primary_color || get().primaryColor,
    })
  },
}))
