import { create } from 'zustand'
import axios from 'axios'

export const useBrandingStore = create((set, get) => ({
  companyName: '',
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
        const name = response.data.data.company_name || ''
        const logo = response.data.data.company_logo || ''
        set({
          companyName: name,
          companyLogo: logo,
          primaryColor: response.data.data.primary_color || '#2563eb',
          loaded: true,
        })
        // Update browser title dynamically
        const title = name ? `${name} - ISP Management` : 'ISP Management System'
        document.title = title
      }
    } catch (error) {
      console.error('Failed to fetch branding:', error)
    } finally {
      set({ loading: false })
    }
  },

  updateBranding: (data) => {
    const name = data.company_name !== undefined ? data.company_name : get().companyName
    const logo = data.company_logo !== undefined ? data.company_logo : get().companyLogo
    set({
      companyName: name,
      companyLogo: logo,
      primaryColor: data.primary_color || get().primaryColor,
    })
    // Update browser title dynamically
    const title = name ? `${name} - ISP Management` : 'ISP Management System'
    document.title = title
  },
}))
