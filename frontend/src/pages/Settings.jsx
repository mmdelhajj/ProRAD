import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import api, { settingsApi } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { useBrandingStore } from '../store/brandingStore'
import { setTimezone } from '../utils/timezone'
import toast from 'react-hot-toast'
import { PhotoIcon, TrashIcon, SwatchIcon, CpuChipIcon, ServerIcon, ExclamationTriangleIcon, CheckCircleIcon, InformationCircleIcon } from '@heroicons/react/24/outline'
import ClusterTab from '../components/ClusterTab'
import { dashboardApi } from '../services/api'

export default function Settings() {
  const queryClient = useQueryClient()
  const { user, refreshUser } = useAuthStore()
  const { companyName, companyLogo, loginBackground, favicon, footerText, primaryColor, fetchBranding, updateBranding } = useBrandingStore()
  const [searchParams, setSearchParams] = useSearchParams()

  // All valid tab IDs
  const validTabs = ['branding', 'general', 'billing', 'service_change', 'radius', 'notifications', 'security', 'account', 'license', 'cluster', 'system']

  // Check if we should open a specific tab (from URL params)
  const urlTab = searchParams.get('tab')
  const initialTab = (urlTab && validTabs.includes(urlTab)) ? urlTab : 'branding'
  const [activeTab, setActiveTab] = useState(initialTab)

  // Update URL when tab changes (keeps tab in URL for refresh)
  const handleTabChange = (tabId) => {
    setActiveTab(tabId)
    setSearchParams({ tab: tabId }, { replace: true })
  }

  // Sync tab from URL on mount/URL change
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && validTabs.includes(tab) && tab !== activeTab) {
      setActiveTab(tab)
    }
  }, [searchParams])
  const [formData, setFormData] = useState({})
  const [hasChanges, setHasChanges] = useState(false)
  const fileInputRef = useRef(null)
  const backgroundInputRef = useRef(null)
  const faviconInputRef = useRef(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingBackground, setUploadingBackground] = useState(false)
  const [uploadingFavicon, setUploadingFavicon] = useState(false)

  // 2FA state
  const [twoFASetup, setTwoFASetup] = useState(null)
  const [twoFACode, setTwoFACode] = useState('')
  const [disablePassword, setDisablePassword] = useState('')
  const [disableCode, setDisableCode] = useState('')

  // Notification test state
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [testingSms, setTestingSms] = useState(false)
  const [testingWhatsapp, setTestingWhatsapp] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [testPhone, setTestPhone] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then(res => res.data.items || [])
  })

  // Fetch available timezones
  const { data: timezones } = useQuery({
    queryKey: ['timezones'],
    queryFn: () => api.get('/settings/timezones').then(res => res.data.data || [])
  })

  // Initialize form data when settings load
  useEffect(() => {
    if (data) {
      const initialData = {}
      data.forEach(s => {
        initialData[s.key] = s.value
      })
      setFormData(initialData)
      setHasChanges(false)
    }
  }, [data])

  const updateMutation = useMutation({
    mutationFn: (settings) => api.put('/settings/bulk', { settings }),
    onSuccess: () => {
      queryClient.invalidateQueries(['settings'])
      setHasChanges(false)
      // Update timezone in the app if it was changed
      if (formData.system_timezone) {
        setTimezone(formData.system_timezone)
      }
      toast.success('Settings saved successfully')
    }
  })

  // 2FA queries and mutations
  const { data: twoFAStatus, refetch: refetchTwoFA } = useQuery({
    queryKey: ['2fa-status'],
    queryFn: () => api.get('/auth/2fa/status').then(res => res.data.data),
    enabled: activeTab === 'account'
  })

  const setupTwoFAMutation = useMutation({
    mutationFn: () => api.post('/auth/2fa/setup'),
    onSuccess: (res) => {
      setTwoFASetup(res.data.data)
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to setup 2FA')
    }
  })

  const verifyTwoFAMutation = useMutation({
    mutationFn: (code) => api.post('/auth/2fa/verify', { code }),
    onSuccess: () => {
      toast.success('2FA enabled successfully!')
      setTwoFASetup(null)
      setTwoFACode('')
      refetchTwoFA()
      refreshUser()
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Invalid code')
    }
  })

  const disableTwoFAMutation = useMutation({
    mutationFn: (data) => api.post('/auth/2fa/disable', data),
    onSuccess: () => {
      toast.success('2FA disabled successfully')
      setDisablePassword('')
      setDisableCode('')
      refetchTwoFA()
      refreshUser()
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to disable 2FA')
    }
  })

  const handleChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  const handleSave = () => {
    const settings = Object.entries(formData).map(([key, value]) => ({
      key,
      value: String(value)
    }))
    updateMutation.mutate(settings)
  }

  const handleReset = () => {
    if (data) {
      const initialData = {}
      data.forEach(s => {
        initialData[s.key] = s.value
      })
      setFormData(initialData)
      setHasChanges(false)
    }
  }

  // License query
  const { data: licenseData, isLoading: licenseLoading, refetch: refetchLicense } = useQuery({
    queryKey: ['license', activeTab],
    queryFn: () => api.get('/license').then(res => res.data.data),
    enabled: activeTab === 'license',
    staleTime: 0,
    refetchOnMount: 'always'
  })

  // License status query (for WHMCS-style status)
  const { data: licenseStatus, refetch: refetchLicenseStatus } = useQuery({
    queryKey: ['license-status-detail', activeTab],
    queryFn: () => api.get('/license/status').then(res => res.data),
    enabled: activeTab === 'license',
    staleTime: 0,
    refetchOnMount: 'always'
  })

  // Revalidate license mutation
  const revalidateMutation = useMutation({
    mutationFn: () => api.post('/license/revalidate'),
    onSuccess: (res) => {
      if (res.data.success) {
        toast.success('License validated successfully')
      } else {
        toast.error(res.data.message || 'License validation failed')
      }
      refetchLicense()
      refetchLicenseStatus()
      queryClient.invalidateQueries(['license-status'])
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to validate license')
    }
  })

  // Check for updates query
  const { data: updateData, refetch: refetchUpdate, isLoading: updateLoading } = useQuery({
    queryKey: ['system-update-check', activeTab],
    queryFn: () => api.get('/system/update/check').then(res => res.data),
    enabled: activeTab === 'license',
    staleTime: 0,
    refetchOnMount: 'always'
  })

  // Check for updates mutation (manual refresh)
  const checkUpdateMutation = useMutation({
    mutationFn: () => api.get('/system/update/check').then(res => res.data),
    onSuccess: (data) => {
      if (data.update_available) {
        toast.success(`Update available: v${data.new_version}`)
      } else {
        toast.success('You are running the latest version')
      }
      queryClient.invalidateQueries(['system-update-check'])
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to check for updates')
    }
  })

  // System Info query
  const { data: systemInfo, isLoading: systemInfoLoading, refetch: refetchSystemInfo } = useQuery({
    queryKey: ['system-info', activeTab],
    queryFn: () => dashboardApi.systemInfo().then(res => res.data.data),
    enabled: activeTab === 'system',
    staleTime: 30000,
    refetchOnMount: 'always'
  })

  // Test SMTP configuration
  const handleTestSmtp = async () => {
    setTestingSmtp(true)
    try {
      const res = await api.post('/notifications/test-smtp', {
        smtp_host: formData.smtp_host,
        smtp_port: formData.smtp_port,
        smtp_username: formData.smtp_username,
        smtp_password: formData.smtp_password,
        smtp_from_name: formData.smtp_from_name,
        smtp_from_email: formData.smtp_from_email,
        test_email: testEmail || formData.notification_email
      })
      toast.success(res.data.message || 'SMTP test successful!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'SMTP test failed')
    } finally {
      setTestingSmtp(false)
    }
  }

  // Test SMS configuration
  const handleTestSms = async () => {
    setTestingSms(true)
    try {
      const res = await api.post('/notifications/test-sms', {
        sms_provider: formData.sms_provider,
        sms_twilio_sid: formData.sms_twilio_sid,
        sms_twilio_token: formData.sms_twilio_token,
        sms_twilio_from: formData.sms_twilio_from,
        sms_vonage_key: formData.sms_vonage_key,
        sms_vonage_secret: formData.sms_vonage_secret,
        sms_vonage_from: formData.sms_vonage_from,
        sms_custom_url: formData.sms_custom_url,
        sms_custom_method: formData.sms_custom_method,
        sms_custom_body: formData.sms_custom_body,
        test_phone: testPhone
      })
      toast.success(res.data.message || 'SMS test successful!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'SMS test failed')
    } finally {
      setTestingSms(false)
    }
  }

  // Test WhatsApp configuration
  const handleTestWhatsapp = async () => {
    setTestingWhatsapp(true)
    try {
      const res = await api.post('/notifications/test-whatsapp', {
        whatsapp_instance_id: formData.whatsapp_instance_id,
        whatsapp_token: formData.whatsapp_token,
        test_phone: testPhone
      })
      toast.success(res.data.message || 'WhatsApp test successful!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'WhatsApp test failed')
    } finally {
      setTestingWhatsapp(false)
    }
  }

  const tabs = [
    { id: 'branding', label: 'Branding' },
    { id: 'general', label: 'General' },
    { id: 'billing', label: 'Billing' },
    { id: 'service_change', label: 'Service Change' },
    { id: 'radius', label: 'RADIUS' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'security', label: 'Security' },
    { id: 'account', label: 'My Account' },
    { id: 'license', label: 'License' },
    { id: 'cluster', label: 'HA Cluster' },
    { id: 'system', label: 'System Info' },
  ]

  // Logo upload handler
  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp']
    if (!validTypes.includes(file.type)) {
      toast.error('Invalid file type. Use PNG, JPG, SVG, or WEBP')
      return
    }

    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 2MB')
      return
    }

    setUploadingLogo(true)
    const formData = new FormData()
    formData.append('logo', file)

    try {
      const response = await settingsApi.uploadLogo(formData)
      if (response.data.success) {
        toast.success('Logo uploaded successfully')
        updateBranding({ company_logo: response.data.data.url })
        queryClient.invalidateQueries(['settings'])
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to upload logo')
    } finally {
      setUploadingLogo(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Logo delete handler
  const handleLogoDelete = async () => {
    if (!companyLogo) return

    try {
      await settingsApi.deleteLogo()
      toast.success('Logo deleted')
      updateBranding({ company_logo: '' })
      queryClient.invalidateQueries(['settings'])
    } catch (error) {
      toast.error('Failed to delete logo')
    }
  }

  // Background upload handler
  const handleBackgroundUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 5MB')
      return
    }

    setUploadingBackground(true)
    const formData = new FormData()
    formData.append('background', file)

    try {
      const response = await settingsApi.uploadLoginBackground(formData)
      if (response.data.success) {
        toast.success('Login background uploaded successfully')
        updateBranding({ login_background: response.data.data.url })
        queryClient.invalidateQueries(['settings'])
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to upload background')
    } finally {
      setUploadingBackground(false)
      if (backgroundInputRef.current) {
        backgroundInputRef.current.value = ''
      }
    }
  }

  // Background delete handler
  const handleBackgroundDelete = async () => {
    if (!loginBackground) return

    try {
      await settingsApi.deleteLoginBackground()
      toast.success('Login background deleted')
      updateBranding({ login_background: '' })
      queryClient.invalidateQueries(['settings'])
    } catch (error) {
      toast.error('Failed to delete background')
    }
  }

  // Favicon upload handler
  const handleFaviconUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file size (max 500KB)
    if (file.size > 500 * 1024) {
      toast.error('File too large. Maximum size is 500KB')
      return
    }

    setUploadingFavicon(true)
    const formData = new FormData()
    formData.append('favicon', file)

    try {
      const response = await settingsApi.uploadFavicon(formData)
      if (response.data.success) {
        toast.success('Favicon uploaded successfully')
        updateBranding({ favicon: response.data.data.url })
        queryClient.invalidateQueries(['settings'])
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to upload favicon')
    } finally {
      setUploadingFavicon(false)
      if (faviconInputRef.current) {
        faviconInputRef.current.value = ''
      }
    }
  }

  // Favicon delete handler
  const handleFaviconDelete = async () => {
    if (!favicon) return

    try {
      await settingsApi.deleteFavicon()
      toast.success('Favicon deleted')
      updateBranding({ favicon: '' })
      queryClient.invalidateQueries(['settings'])
    } catch (error) {
      toast.error('Failed to delete favicon')
    }
  }

  const settingGroups = {
    general: [
      { key: 'company_name', label: 'Company Name', type: 'text', placeholder: 'Your Company Name' },
      { key: 'company_address', label: 'Company Address', type: 'textarea', placeholder: 'Full address' },
      { key: 'company_phone', label: 'Phone Number', type: 'text', placeholder: '+1 234 567 890' },
      { key: 'company_email', label: 'Email', type: 'email', placeholder: 'info@company.com' },
      { key: 'system_timezone', label: 'System Timezone', type: 'timezone', description: 'Used for FUP reset, bandwidth rules, and all time-based features' },
      { key: 'date_format', label: 'Date Format', type: 'select', options: [
        'YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD-MM-YYYY'
      ]},
    ],
    billing: [
      { key: 'currency', label: 'Currency Code', type: 'text', placeholder: 'USD' },
      { key: 'currency_symbol', label: 'Currency Symbol', type: 'text', placeholder: '$' },
      { key: 'tax_rate', label: 'Tax Rate (%)', type: 'number', placeholder: '0' },
      { key: 'invoice_prefix', label: 'Invoice Prefix', type: 'text', placeholder: 'INV-' },
      { key: 'payment_methods', label: 'Payment Methods', type: 'text', placeholder: 'cash,bank,mpesa' },
      { key: 'auto_generate_invoice', label: 'Auto Generate Invoice', type: 'toggle' },
      { key: 'invoice_due_days', label: 'Invoice Due Days', type: 'number', placeholder: '7' },
    ],
    service_change: [
      { key: 'upgrade_change_service_fee', label: 'Upgrade Fee ($)', type: 'number', placeholder: '0', description: 'Fee charged when subscriber upgrades to a higher-priced service' },
      { key: 'downgrade_change_service_fee', label: 'Downgrade Fee ($)', type: 'number', placeholder: '0', description: 'Fee charged when subscriber downgrades to a lower-priced service' },
      { key: 'allow_downgrade', label: 'Allow Downgrade', type: 'toggle', description: 'Allow subscribers to change to a lower-priced service' },
      { key: 'downgrade_refund', label: 'Refund on Downgrade', type: 'toggle', description: 'Refund the difference when downgrading (prorate credit)' },
    ],
    radius: [
      { key: 'daily_quota_reset_time', label: 'Daily Quota Reset Time', type: 'time', placeholder: '00:00' },
      { key: 'default_session_timeout', label: 'Default Session Timeout (sec)', type: 'number', placeholder: '86400' },
      { key: 'max_sessions_per_user', label: 'Max Sessions Per User', type: 'number', placeholder: '1' },
      { key: 'accounting_interval', label: 'Accounting Interval (sec)', type: 'number', placeholder: '300' },
      { key: 'idle_timeout', label: 'Idle Timeout (sec)', type: 'number', placeholder: '600' },
      { key: 'simultaneous_use', label: 'Allow Simultaneous Use', type: 'toggle' },
      { key: 'mac_auth_enabled', label: 'MAC Authentication', type: 'toggle' },
      { key: 'block_on_daily_quota_exceeded', label: 'Block Internet on Daily Quota Exceeded', type: 'toggle', description: 'When enabled, users will lose internet completely when daily quota is exceeded. When disabled, users get reduced FUP speed.' },
      { key: 'block_on_monthly_quota_exceeded', label: 'Block Internet on Monthly Quota Exceeded', type: 'toggle', description: 'When enabled, users will lose internet completely when monthly quota is exceeded. When disabled, users get reduced FUP speed.' },
    ],
    notifications: [], // Custom rendering below
    security: [
      { key: 'session_timeout', label: 'Admin Session Timeout (min)', type: 'number', placeholder: '60' },
      { key: 'max_login_attempts', label: 'Max Login Attempts', type: 'number', placeholder: '5' },
      { key: 'password_min_length', label: 'Min Password Length', type: 'number', placeholder: '8' },
      { key: 'api_rate_limit', label: 'API Rate Limit (req/min)', type: 'number', placeholder: '100' },
      { key: 'allowed_ips', label: 'Allowed Admin IPs', type: 'text', placeholder: 'Leave empty for all' },
      { key: 'remote_support_enabled', label: 'Remote Support Access', type: 'toggle', description: 'Allow ProxPanel support team to access your server for troubleshooting. After enabling, run: proxpanel-support enable' },
    ],
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const renderField = (field) => {
    const value = formData[field.key] || ''

    if (field.type === 'toggle') {
      const isChecked = value === 'true' || value === '1' || value === true
      return (
        <div>
          <button
            type="button"
            onClick={() => handleChange(field.key, isChecked ? 'false' : 'true')}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              isChecked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-800 shadow ring-0 transition duration-200 ease-in-out ${
                isChecked ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          {field.description && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.description}</p>
          )}
        </div>
      )
    }

    if (field.type === 'timezone') {
      return (
        <div>
          <select
            value={value}
            onChange={(e) => handleChange(field.key, e.target.value)}
            className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          >
            <option value="">Select timezone...</option>
            {(timezones || []).map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
          {field.description && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.description}</p>
          )}
        </div>
      )
    }

    if (field.type === 'select') {
      return (
        <select
          value={value}
          onChange={(e) => handleChange(field.key, e.target.value)}
          className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
        >
          <option value="">Select...</option>
          {field.options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )
    }

    if (field.type === 'textarea') {
      return (
        <textarea
          value={value}
          onChange={(e) => handleChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
        />
      )
    }

    return (
      <div>
        <input
          type={field.type}
          value={value}
          onChange={(e) => handleChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          step={field.type === 'number' ? '0.01' : undefined}
          className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
        />
        {field.description && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.description}</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Settings</h1>
        <div className="flex space-x-3">
          {hasChanges && (
            <button
              onClick={handleReset}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:bg-gray-700"
            >
              Reset
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!hasChanges || updateMutation.isPending}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md ${
              hasChanges
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {updateMutation.isSuccess && (
        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 text-green-700 px-4 py-3 rounded">
          Settings saved successfully!
        </div>
      )}

      {updateMutation.isError && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 text-red-700 px-4 py-3 rounded">
          Failed to save settings. Please try again.
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex -mb-px">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`px-6 py-4 text-sm font-medium border-b-2 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Form Fields */}
        <div className="p-6">
          {activeTab === 'branding' ? (
            <div className="space-y-8">
              {/* Company Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Company Name
                </label>
                <input
                  type="text"
                  value={formData.company_name || ''}
                  onChange={(e) => handleChange('company_name', e.target.value)}
                  placeholder="Your Company Name"
                  className="block w-full max-w-md rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">This name appears in the sidebar and login page</p>
              </div>

              {/* Logo Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Company Logo
                </label>
                <div className="flex items-start gap-6">
                  <div className="flex-shrink-0">
                    <div className="w-32 h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center bg-gray-50 dark:bg-gray-700 overflow-hidden">
                      {companyLogo ? (
                        <img src={companyLogo} alt="Company Logo" className="max-w-full max-h-full object-contain" />
                      ) : (
                        <PhotoIcon className="w-12 h-12 text-gray-400" />
                      )}
                    </div>
                  </div>
                  <div className="flex-1">
                    <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp" onChange={handleLogoUpload} className="hidden" />
                    <div className="flex flex-col gap-2">
                      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingLogo} className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 w-fit">
                        <PhotoIcon className="w-4 h-4 mr-2" />
                        {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                      </button>
                      {companyLogo && (
                        <button type="button" onClick={handleLogoDelete} className="inline-flex items-center px-4 py-2 text-sm font-medium text-red-600 bg-white dark:bg-gray-700 border border-red-300 dark:border-red-500 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 w-fit">
                          <TrashIcon className="w-4 h-4 mr-2" />
                          Remove Logo
                        </button>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Recommended: <strong>180 x 36 pixels</strong> (horizontal logo). PNG with transparent background, max 2MB.
                    </p>
                  </div>
                </div>
              </div>

              {/* Primary Color */}
              <div className="border-t dark:border-gray-700 pt-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <SwatchIcon className="w-4 h-4 inline mr-1" />
                  Primary Color
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="color"
                    value={formData.primary_color || '#2563eb'}
                    onChange={(e) => handleChange('primary_color', e.target.value)}
                    className="w-16 h-10 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.primary_color || '#2563eb'}
                    onChange={(e) => handleChange('primary_color', e.target.value)}
                    placeholder="#2563eb"
                    className="w-32 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  />
                  <div className="flex gap-2">
                    {['#2563eb', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'].map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => handleChange('primary_color', color)}
                        className="w-8 h-8 rounded-full border-2 border-white dark:border-gray-600 shadow-sm hover:scale-110 transition-transform"
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Used for buttons, links, and accent elements throughout the app</p>
              </div>

              {/* Login Background Image */}
              <div className="border-t dark:border-gray-700 pt-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Login Page Background
                </label>
                <div className="flex items-start gap-6">
                  <div className="flex-shrink-0">
                    <div className="w-48 h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-800 overflow-hidden">
                      {loginBackground ? (
                        <img src={loginBackground} alt="Login Background" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white text-xs">Default Gradient</span>
                      )}
                    </div>
                  </div>
                  <div className="flex-1">
                    <input ref={backgroundInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={handleBackgroundUpload} className="hidden" />
                    <div className="flex flex-col gap-2">
                      <button type="button" onClick={() => backgroundInputRef.current?.click()} disabled={uploadingBackground} className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 w-fit">
                        <PhotoIcon className="w-4 h-4 mr-2" />
                        {uploadingBackground ? 'Uploading...' : 'Upload Background'}
                      </button>
                      {loginBackground && (
                        <button type="button" onClick={handleBackgroundDelete} className="inline-flex items-center px-4 py-2 text-sm font-medium text-red-600 bg-white dark:bg-gray-700 border border-red-300 dark:border-red-500 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 w-fit">
                          <TrashIcon className="w-4 h-4 mr-2" />
                          Use Default Gradient
                        </button>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Recommended: <strong>1920 x 1080 pixels</strong>. JPG or PNG, max 5MB.<br />
                      This image appears on the left side of the login page.
                    </p>
                  </div>
                </div>
              </div>

              {/* Favicon */}
              <div className="border-t dark:border-gray-700 pt-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Favicon (Browser Tab Icon)
                </label>
                <div className="flex items-start gap-6">
                  <div className="flex-shrink-0">
                    <div className="w-16 h-16 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center bg-gray-50 dark:bg-gray-700 overflow-hidden">
                      {favicon ? (
                        <img src={favicon} alt="Favicon" className="w-8 h-8 object-contain" />
                      ) : (
                        <span className="text-gray-400 text-xl">🌐</span>
                      )}
                    </div>
                  </div>
                  <div className="flex-1">
                    <input ref={faviconInputRef} type="file" accept="image/png,image/x-icon,image/svg+xml" onChange={handleFaviconUpload} className="hidden" />
                    <div className="flex flex-col gap-2">
                      <button type="button" onClick={() => faviconInputRef.current?.click()} disabled={uploadingFavicon} className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 w-fit">
                        <PhotoIcon className="w-4 h-4 mr-2" />
                        {uploadingFavicon ? 'Uploading...' : 'Upload Favicon'}
                      </button>
                      {favicon && (
                        <button type="button" onClick={handleFaviconDelete} className="inline-flex items-center px-4 py-2 text-sm font-medium text-red-600 bg-white dark:bg-gray-700 border border-red-300 dark:border-red-500 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 w-fit">
                          <TrashIcon className="w-4 h-4 mr-2" />
                          Remove Favicon
                        </button>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Recommended: <strong>32 x 32 pixels</strong>. PNG, ICO, or SVG, max 500KB.
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer Text */}
              <div className="border-t dark:border-gray-700 pt-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Footer Copyright Text
                </label>
                <input
                  type="text"
                  value={formData.footer_text || ''}
                  onChange={(e) => handleChange('footer_text', e.target.value)}
                  placeholder="© 2026 Your Company Name. All rights reserved."
                  className="block w-full max-w-lg rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Appears at the bottom of the login page</p>
              </div>

              {/* Login Page Features Section */}
              <div className="border-t dark:border-gray-700 pt-6">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Login Page Features</h3>

                {/* Tagline */}
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Tagline (bottom of left panel)
                  </label>
                  <input
                    type="text"
                    value={formData.login_tagline || ''}
                    onChange={(e) => handleChange('login_tagline', e.target.value)}
                    placeholder="High Performance ISP Management Solution"
                    className="block w-full max-w-lg rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  />
                </div>

                {/* Show/Hide Features Toggle */}
                <div className="mb-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={formData.show_login_features !== 'false'}
                        onChange={(e) => handleChange('show_login_features', e.target.checked ? 'true' : 'false')}
                        className="sr-only"
                      />
                      <div className={`w-10 h-6 rounded-full transition-colors ${formData.show_login_features !== 'false' ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${formData.show_login_features !== 'false' ? 'translate-x-5' : 'translate-x-1'}`}></div>
                      </div>
                    </div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">Show feature boxes on login page</span>
                  </label>
                </div>

                {/* Feature 1 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Feature 1 Title</label>
                    <input
                      type="text"
                      value={formData.login_feature_1_title || ''}
                      onChange={(e) => handleChange('login_feature_1_title', e.target.value)}
                      placeholder="PPPoE Management"
                      className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Feature 1 Description</label>
                    <input
                      type="text"
                      value={formData.login_feature_1_desc || ''}
                      onChange={(e) => handleChange('login_feature_1_desc', e.target.value)}
                      placeholder="Complete subscriber and session management..."
                      className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                </div>

                {/* Feature 2 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Feature 2 Title</label>
                    <input
                      type="text"
                      value={formData.login_feature_2_title || ''}
                      onChange={(e) => handleChange('login_feature_2_title', e.target.value)}
                      placeholder="Bandwidth Control"
                      className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Feature 2 Description</label>
                    <input
                      type="text"
                      value={formData.login_feature_2_desc || ''}
                      onChange={(e) => handleChange('login_feature_2_desc', e.target.value)}
                      placeholder="FUP quotas, time-based speed control..."
                      className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                </div>

                {/* Feature 3 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Feature 3 Title</label>
                    <input
                      type="text"
                      value={formData.login_feature_3_title || ''}
                      onChange={(e) => handleChange('login_feature_3_title', e.target.value)}
                      placeholder="MikroTik Integration"
                      className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Feature 3 Description</label>
                    <input
                      type="text"
                      value={formData.login_feature_3_desc || ''}
                      onChange={(e) => handleChange('login_feature_3_desc', e.target.value)}
                      placeholder="Seamless RADIUS and API integration..."
                      className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Sidebar Preview */}
              <div className="border-t dark:border-gray-700 pt-6">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Sidebar Preview</h3>
                <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 max-w-xs">
                    <div className="flex items-center gap-3">
                      {companyLogo ? (
                        <img src={companyLogo} alt="Logo" className="h-10 object-contain" />
                      ) : (
                        <span className="text-lg font-bold" style={{ color: formData.primary_color || '#2563eb' }}>
                          {formData.company_name || 'Your Company Name'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'account' ? (
            <div className="space-y-8">
              {/* User Info */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Account Information</h3>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Username</p>
                      <p className="font-medium">{user?.username}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Email</p>
                      <p className="font-medium">{user?.email || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Full Name</p>
                      <p className="font-medium">{user?.full_name || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Role</p>
                      <p className="font-medium capitalize">{user?.user_type}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Two-Factor Authentication */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Two-Factor Authentication</h3>

                {twoFAStatus?.enabled ? (
                  <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center mb-4">
                      <svg className="w-5 h-5 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      <span className="font-medium text-green-800">2FA is enabled</span>
                    </div>
                    <p className="text-sm text-green-700 mb-4">Your account is protected with two-factor authentication.</p>

                    <div className="border-t border-green-200 pt-4 mt-4">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Disable 2FA</p>
                      <div className="space-y-3">
                        <input
                          type="password"
                          placeholder="Current password"
                          value={disablePassword}
                          onChange={(e) => setDisablePassword(e.target.value)}
                          className="block w-full max-w-xs rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                        />
                        <input
                          type="text"
                          placeholder="2FA code"
                          value={disableCode}
                          onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          maxLength={6}
                          className="block w-full max-w-xs rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                        />
                        <button
                          onClick={() => disableTwoFAMutation.mutate({ password: disablePassword, code: disableCode })}
                          disabled={disableTwoFAMutation.isPending || !disablePassword || disableCode.length !== 6}
                          className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
                        >
                          {disableTwoFAMutation.isPending ? 'Disabling...' : 'Disable 2FA'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : twoFASetup ? (
                  <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-900 mb-4">Setup Two-Factor Authentication</h4>

                    <div className="flex flex-col md:flex-row gap-6">
                      <div className="flex-shrink-0">
                        <p className="text-sm text-blue-800 mb-2">1. Scan this QR code with your authenticator app</p>
                        <img src={twoFASetup.qr_code} alt="2FA QR Code" className="w-48 h-48 border rounded" />
                      </div>

                      <div className="flex-1">
                        <p className="text-sm text-blue-800 mb-2">Or enter this code manually:</p>
                        <code className="block bg-white px-3 py-2 rounded border text-sm font-mono mb-4 break-all">
                          {twoFASetup.secret}
                        </code>

                        <p className="text-sm text-blue-800 mb-2">2. Enter the 6-digit code from your app:</p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="000000"
                            value={twoFACode}
                            onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            maxLength={6}
                            className="block w-32 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 text-center text-lg tracking-widest"
                          />
                          <button
                            onClick={() => verifyTwoFAMutation.mutate(twoFACode)}
                            disabled={verifyTwoFAMutation.isPending || twoFACode.length !== 6}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                          >
                            {verifyTwoFAMutation.isPending ? 'Verifying...' : 'Verify & Enable'}
                          </button>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => { setTwoFASetup(null); setTwoFACode('') }}
                      className="mt-4 text-sm text-blue-600 hover:text-blue-800"
                    >
                      Cancel setup
                    </button>
                  </div>
                ) : (
                  <div className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                    <div className="flex items-center mb-4">
                      <svg className="w-5 h-5 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span className="font-medium text-gray-700 dark:text-gray-300 dark:text-gray-400">2FA is not enabled</span>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">
                      Add an extra layer of security to your account by enabling two-factor authentication.
                      You'll need an authenticator app like Google Authenticator or Authy.
                    </p>
                    <button
                      onClick={() => setupTwoFAMutation.mutate()}
                      disabled={setupTwoFAMutation.isPending}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      {setupTwoFAMutation.isPending ? 'Setting up...' : 'Enable 2FA'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'notifications' ? (
            <div className="space-y-8">
              {/* Email/SMTP Settings */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Email Notifications (SMTP)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SMTP Host</label>
                    <input
                      type="text"
                      value={formData.smtp_host || ''}
                      onChange={(e) => handleChange('smtp_host', e.target.value)}
                      placeholder="smtp.gmail.com"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SMTP Port</label>
                    <input
                      type="number"
                      value={formData.smtp_port || ''}
                      onChange={(e) => handleChange('smtp_port', e.target.value)}
                      placeholder="587"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SMTP Username</label>
                    <input
                      type="text"
                      value={formData.smtp_username || ''}
                      onChange={(e) => handleChange('smtp_username', e.target.value)}
                      placeholder="user@gmail.com"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SMTP Password</label>
                    <input
                      type="password"
                      value={formData.smtp_password || ''}
                      onChange={(e) => handleChange('smtp_password', e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">From Name</label>
                    <input
                      type="text"
                      value={formData.smtp_from_name || ''}
                      onChange={(e) => handleChange('smtp_from_name', e.target.value)}
                      placeholder="Company Name"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">From Email</label>
                    <input
                      type="email"
                      value={formData.smtp_from_email || ''}
                      onChange={(e) => handleChange('smtp_from_email', e.target.value)}
                      placeholder="noreply@company.com"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Test Email Address</label>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        placeholder="test@example.com"
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                      />
                      <button
                        onClick={handleTestSmtp}
                        disabled={testingSmtp || !formData.smtp_host}
                        className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {testingSmtp ? 'Testing...' : 'Test SMTP'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* SMS Settings */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">SMS Notifications</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SMS Provider</label>
                    <select
                      value={formData.sms_provider || ''}
                      onChange={(e) => handleChange('sms_provider', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                    >
                      <option value="">Select Provider</option>
                      <option value="twilio">Twilio</option>
                      <option value="vonage">Vonage (Nexmo)</option>
                      <option value="custom">Custom API</option>
                    </select>
                  </div>

                  {formData.sms_provider === 'twilio' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Twilio Account SID</label>
                        <input
                          type="text"
                          value={formData.sms_twilio_sid || ''}
                          onChange={(e) => handleChange('sms_twilio_sid', e.target.value)}
                          placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Twilio Auth Token</label>
                        <input
                          type="password"
                          value={formData.sms_twilio_token || ''}
                          onChange={(e) => handleChange('sms_twilio_token', e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Twilio Phone Number</label>
                        <input
                          type="text"
                          value={formData.sms_twilio_from || ''}
                          onChange={(e) => handleChange('sms_twilio_from', e.target.value)}
                          placeholder="+1234567890"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                        />
                      </div>
                    </>
                  )}

                  {formData.sms_provider === 'vonage' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vonage API Key</label>
                        <input
                          type="text"
                          value={formData.sms_vonage_key || ''}
                          onChange={(e) => handleChange('sms_vonage_key', e.target.value)}
                          placeholder="API Key"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vonage API Secret</label>
                        <input
                          type="password"
                          value={formData.sms_vonage_secret || ''}
                          onChange={(e) => handleChange('sms_vonage_secret', e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sender Name/Number</label>
                        <input
                          type="text"
                          value={formData.sms_vonage_from || ''}
                          onChange={(e) => handleChange('sms_vonage_from', e.target.value)}
                          placeholder="CompanyName or +1234567890"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                        />
                      </div>
                    </>
                  )}

                  {formData.sms_provider === 'custom' && (
                    <>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API URL</label>
                        <input
                          type="text"
                          value={formData.sms_custom_url || ''}
                          onChange={(e) => handleChange('sms_custom_url', e.target.value)}
                          placeholder="https://api.provider.com/sms/send"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">HTTP Method</label>
                        <select
                          value={formData.sms_custom_method || 'POST'}
                          onChange={(e) => handleChange('sms_custom_method', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                        >
                          <option value="POST">POST</option>
                          <option value="GET">GET</option>
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Request Body (JSON)</label>
                        <textarea
                          value={formData.sms_custom_body || ''}
                          onChange={(e) => handleChange('sms_custom_body', e.target.value)}
                          placeholder='{"to": "{{to}}", "message": "{{message}}"}'
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white font-mono text-sm"
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Use {'{{to}}'} and {'{{message}}'} as placeholders</p>
                      </div>
                    </>
                  )}

                  {formData.sms_provider && (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Test Phone Number</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={testPhone}
                          onChange={(e) => setTestPhone(e.target.value)}
                          placeholder="+1234567890"
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                        />
                        <button
                          onClick={handleTestSms}
                          disabled={testingSms || !testPhone}
                          className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {testingSms ? 'Testing...' : 'Test SMS'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* WhatsApp Settings */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">WhatsApp Notifications (Ultramsg)</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Get your Instance ID and Token from <a href="https://ultramsg.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">ultramsg.com</a>
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Instance ID</label>
                    <input
                      type="text"
                      value={formData.whatsapp_instance_id || ''}
                      onChange={(e) => handleChange('whatsapp_instance_id', e.target.value)}
                      placeholder="instanceXXXXX"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Token</label>
                    <input
                      type="password"
                      value={formData.whatsapp_token || ''}
                      onChange={(e) => handleChange('whatsapp_token', e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Test Phone Number</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={testPhone}
                        onChange={(e) => setTestPhone(e.target.value)}
                        placeholder="+1234567890 (with country code)"
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                      />
                      <button
                        onClick={handleTestWhatsapp}
                        disabled={testingWhatsapp || !formData.whatsapp_instance_id || !formData.whatsapp_token}
                        className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {testingWhatsapp ? 'Testing...' : 'Test WhatsApp'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={!hasChanges || updateMutation.isPending}
                  className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save Notification Settings'}
                </button>
              </div>
            </div>
          ) : activeTab === 'license' ? (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">License Information</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => checkUpdateMutation.mutate()}
                    disabled={checkUpdateMutation.isPending}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                  >
                    {checkUpdateMutation.isPending ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-700 dark:text-gray-300 dark:text-gray-400" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Checking...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Check for Updates
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => revalidateMutation.mutate()}
                    disabled={revalidateMutation.isPending}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {revalidateMutation.isPending ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Checking...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Check License
                      </>
                    )}
                  </button>
                </div>
              </div>

              {licenseLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* License Status Card */}
                  {(() => {
                    const status = licenseStatus?.license_status || (licenseData?.valid ? 'active' : 'blocked')
                    const statusConfig = {
                      active: { bg: 'bg-green-50 dark:bg-green-900/30 border-green-200', text: 'text-green-800', subtext: 'text-green-700', icon: 'text-green-600', label: 'License Active', desc: 'Your license is valid and active' },
                      warning: { bg: 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200', text: 'text-yellow-800', subtext: 'text-yellow-700', icon: 'text-yellow-600', label: 'License Expiring Soon', desc: licenseStatus?.warning_message || 'Please renew soon' },
                      grace: { bg: 'bg-orange-50 border-orange-200', text: 'text-orange-800', subtext: 'text-orange-700', icon: 'text-orange-600', label: 'Grace Period', desc: 'License expired - renew now to avoid service interruption' },
                      readonly: { bg: 'bg-red-50 dark:bg-red-900/30 border-red-200', text: 'text-red-800', subtext: 'text-red-700', icon: 'text-red-600', label: 'Read-Only Mode', desc: 'License expired - system is read-only. Renew immediately!' },
                      blocked: { bg: 'bg-red-50 dark:bg-red-900/30 border-red-200', text: 'text-red-800', subtext: 'text-red-700', icon: 'text-red-600', label: 'License Blocked', desc: licenseData?.message || 'License invalid or expired' },
                      unknown: { bg: 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600', text: 'text-gray-800', subtext: 'text-gray-700', icon: 'text-gray-600', label: 'Unknown Status', desc: 'Unable to determine license status' }
                    }
                    const config = statusConfig[status] || statusConfig.unknown

                    return (
                      <div className={`rounded-lg p-4 border ${config.bg}`}>
                        <div className="flex items-start">
                          <div className={`flex-shrink-0 ${config.icon}`}>
                            {status === 'active' ? (
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                              </svg>
                            ) : status === 'warning' ? (
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            ) : (
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                            )}
                          </div>
                          <div className="ml-3 flex-1">
                            <div className="flex items-center gap-2">
                              <p className={`font-medium ${config.text}`}>{config.label}</p>
                              {licenseStatus?.read_only && (
                                <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 rounded">READ-ONLY</span>
                              )}
                            </div>
                            <p className={`text-sm ${config.subtext}`}>{config.desc}</p>
                            {licenseStatus?.days_until_expiry !== undefined && licenseStatus?.days_until_expiry !== 0 && (
                              <p className={`text-sm mt-1 font-medium ${config.subtext}`}>
                                {licenseStatus.days_until_expiry > 0
                                  ? `${licenseStatus.days_until_expiry} days remaining`
                                  : `${Math.abs(licenseStatus.days_until_expiry)} days overdue`
                                }
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* System Update Card */}
                  {updateData && (
                    <div className={`rounded-lg p-4 border ${updateData.update_available ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start">
                          <div className={`flex-shrink-0 ${updateData.update_available ? 'text-blue-600' : 'text-gray-500'}`}>
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </div>
                          <div className="ml-3">
                            <p className={`font-medium ${updateData.update_available ? 'text-blue-800' : 'text-gray-800'}`}>
                              {updateData.update_available ? 'Update Available' : 'System Up to Date'}
                            </p>
                            <p className={`text-sm ${updateData.update_available ? 'text-blue-700' : 'text-gray-600'}`}>
                              Current version: v{updateData.current_version || '1.0.0'}
                              {updateData.update_available && ` → v${updateData.new_version}`}
                            </p>
                            {updateData.update_available && updateData.release_notes && (
                              <p className="text-sm text-blue-600 mt-1">{updateData.release_notes}</p>
                            )}
                          </div>
                        </div>
                        {updateData.update_available && (
                          <button
                            onClick={() => {
                              // Already on license tab, just trigger the update
                              window.location.href = '/settings?tab=license'
                            }}
                            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                          >
                            Update Now
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Service Management Card */}
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                      <h4 className="font-medium text-gray-900 dark:text-white">Service Management</h4>
                    </div>
                    <div className="p-4">
                      <p className="text-sm text-gray-600 mb-4">
                        Restart services if you experience issues after updates or configuration changes.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={async () => {
                            toast.loading('Restarting API service...', { id: 'restart' })
                            try {
                              await settingsApi.restartServices(['api'])
                            } catch (err) {
                              // 502/network error is expected - API restarts before responding
                              // This is actually success, not failure
                            }
                            toast.success('API service is restarting. Page will reload in 10 seconds.', { id: 'restart' })
                            setTimeout(() => window.location.reload(), 10000)
                          }}
                          className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700"
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Restart API
                        </button>
                        <button
                          onClick={async () => {
                            toast.loading('Restarting all services...', { id: 'restart' })
                            try {
                              await settingsApi.restartServices(['all'])
                            } catch (err) {
                              // 502/network error is expected - API restarts before responding
                              // This is actually success, not failure
                            }
                            toast.success('All services are restarting. Page will reload in 15 seconds.', { id: 'restart' })
                            setTimeout(() => window.location.reload(), 15000)
                          }}
                          className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Restart All Services
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* License Details */}
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                      <h4 className="font-medium text-gray-900 dark:text-white">License Details</h4>
                    </div>
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                      <div className="px-4 py-3 flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">License Key</span>
                        <span className="font-mono text-sm">{licenseData?.license_key || '-'}</span>
                      </div>
                      <div className="px-4 py-3 flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Customer Name</span>
                        <span className="font-medium">{licenseData?.customer_name || '-'}</span>
                      </div>
                      <div className="px-4 py-3 flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Plan / Tier</span>
                        <span className="font-medium capitalize">{licenseData?.tier || '-'}</span>
                      </div>
                      <div className="px-4 py-3 flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Max Subscribers</span>
                        <span className="font-medium">{licenseData?.max_subscribers?.toLocaleString() || '-'}</span>
                      </div>
                      <div className="px-4 py-3 flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">License Type</span>
                        <span className="font-medium">{licenseData?.is_lifetime ? 'Lifetime' : 'Subscription'}</span>
                      </div>
                      {!licenseData?.is_lifetime && (
                        <>
                          <div className="px-4 py-3 flex justify-between">
                            <span className="text-gray-500 dark:text-gray-400">Expires At</span>
                            <span className="font-medium">
                              {licenseData?.expires_at ? new Date(licenseData.expires_at).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              }) : '-'}
                            </span>
                          </div>
                          <div className="px-4 py-3 flex justify-between">
                            <span className="text-gray-500 dark:text-gray-400">Days Remaining</span>
                            <span className={`font-medium ${
                              (licenseStatus?.days_until_expiry || licenseData?.days_remaining || 0) <= 0 ? 'text-red-600' :
                              (licenseStatus?.days_until_expiry || licenseData?.days_remaining || 0) <= 7 ? 'text-red-600' :
                              (licenseStatus?.days_until_expiry || licenseData?.days_remaining || 0) <= 14 ? 'text-yellow-600' :
                              'text-green-600'
                            }`}>
                              {licenseStatus?.days_until_expiry !== undefined
                                ? (licenseStatus.days_until_expiry > 0 ? `${licenseStatus.days_until_expiry} days` : `${Math.abs(licenseStatus.days_until_expiry)} days overdue`)
                                : (licenseData?.days_remaining !== undefined ? `${licenseData.days_remaining} days` : '-')
                              }
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Support Contact */}
                  <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-900 mb-2">Need to upgrade or renew?</h4>
                    <p className="text-sm text-blue-700">
                      Contact support to upgrade your plan or renew your license.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'cluster' ? (
            <ClusterTab />
          ) : activeTab === 'system' ? (
            <div className="space-y-6">
              {/* Environment Warning */}
              {systemInfo?.environment?.warning && (
                <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <ExclamationTriangleIcon className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-medium text-yellow-800 dark:text-yellow-200">Environment Warning</h3>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">{systemInfo.environment.warning}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* System Info Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">System Information</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Hardware specifications and system health</p>
                </div>
                <button
                  onClick={() => refetchSystemInfo()}
                  disabled={systemInfoLoading}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
                >
                  {systemInfoLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>

              {systemInfoLoading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                </div>
              ) : systemInfo ? (
                <>
                  {/* Environment Card */}
                  <div className={`rounded-lg p-6 ${
                    systemInfo.environment?.is_production
                      ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700'
                      : 'bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700'
                  }`}>
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-full ${
                        systemInfo.environment?.is_production
                          ? 'bg-green-100 dark:bg-green-800'
                          : 'bg-yellow-100 dark:bg-yellow-800'
                      }`}>
                        <ServerIcon className={`w-8 h-8 ${
                          systemInfo.environment?.is_production
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-yellow-600 dark:text-yellow-400'
                        }`} />
                      </div>
                      <div>
                        <h4 className={`text-lg font-semibold ${
                          systemInfo.environment?.is_production
                            ? 'text-green-800 dark:text-green-200'
                            : 'text-yellow-800 dark:text-yellow-200'
                        }`}>
                          {systemInfo.environment?.details}
                        </h4>
                        <p className={`text-sm ${
                          systemInfo.environment?.is_production
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-yellow-600 dark:text-yellow-400'
                        }`}>
                          {systemInfo.environment?.is_production ? '✓ Production Ready' : '⚠ Not Recommended for Production'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Hardware Specs Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* CPU */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                          <CpuChipIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <h4 className="font-medium text-gray-900 dark:text-white">CPU</h4>
                      </div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{systemInfo.cpu?.cores} Cores</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate" title={systemInfo.cpu?.model}>{systemInfo.cpu?.model}</p>
                      <div className="mt-2">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-500 dark:text-gray-400">Usage</span>
                          <span className="font-medium text-gray-900 dark:text-white">{systemInfo.cpu?.usage}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              systemInfo.cpu?.usage > 80 ? 'bg-red-500' :
                              systemInfo.cpu?.usage > 60 ? 'bg-yellow-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(systemInfo.cpu?.usage || 0, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    {/* Memory */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                          <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                          </svg>
                        </div>
                        <h4 className="font-medium text-gray-900 dark:text-white">Memory</h4>
                      </div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{systemInfo.memory?.total_gb} GB</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {Math.round(systemInfo.memory?.used_mb / 1024 * 10) / 10} GB used
                      </p>
                      <div className="mt-2">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-500 dark:text-gray-400">Usage</span>
                          <span className="font-medium text-gray-900 dark:text-white">{systemInfo.memory?.usage}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              systemInfo.memory?.usage > 80 ? 'bg-red-500' :
                              systemInfo.memory?.usage > 60 ? 'bg-yellow-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(systemInfo.memory?.usage || 0, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    {/* Disk */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-orange-100 dark:bg-orange-900/50 rounded-lg">
                          <svg className="w-5 h-5 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                          </svg>
                        </div>
                        <h4 className="font-medium text-gray-900 dark:text-white">Storage</h4>
                      </div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{systemInfo.disk?.total_gb} GB</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {systemInfo.disk?.type?.toUpperCase()} • {systemInfo.disk?.free_gb} GB free
                      </p>
                      <div className="mt-2">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-500 dark:text-gray-400">Usage</span>
                          <span className="font-medium text-gray-900 dark:text-white">{systemInfo.disk?.usage}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              systemInfo.disk?.usage > 80 ? 'bg-red-500' :
                              systemInfo.disk?.usage > 60 ? 'bg-yellow-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(systemInfo.disk?.usage || 0, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    {/* Capacity */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg">
                          <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                        </div>
                        <h4 className="font-medium text-gray-900 dark:text-white">Capacity</h4>
                      </div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {systemInfo.capacity?.current_subscribers?.toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        of {systemInfo.capacity?.estimated_max?.toLocaleString()} max subscribers
                      </p>
                      <div className="mt-2">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-500 dark:text-gray-400">Usage</span>
                          <span className={`font-medium ${
                            systemInfo.capacity?.status === 'critical' ? 'text-red-600' :
                            systemInfo.capacity?.status === 'warning' ? 'text-yellow-600' :
                            'text-green-600'
                          }`}>{systemInfo.capacity?.usage_percent}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              systemInfo.capacity?.status === 'critical' ? 'bg-red-500' :
                              systemInfo.capacity?.status === 'warning' ? 'bg-yellow-500' :
                              systemInfo.capacity?.status === 'moderate' ? 'bg-blue-500' :
                              'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(systemInfo.capacity?.usage_percent || 0, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* OS Info */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                    <h4 className="font-medium text-gray-900 dark:text-white mb-4">Operating System</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">OS</p>
                        <p className="font-medium text-gray-900 dark:text-white">{systemInfo.os?.name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Version</p>
                        <p className="font-medium text-gray-900 dark:text-white">{systemInfo.os?.version}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Uptime</p>
                        <p className="font-medium text-gray-900 dark:text-white">{systemInfo.os?.uptime}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">CPU Speed</p>
                        <p className="font-medium text-gray-900 dark:text-white">{systemInfo.cpu?.speed || 'N/A'} MHz</p>
                      </div>
                    </div>
                  </div>

                  {/* Recommendations */}
                  {systemInfo.recommendations && systemInfo.recommendations.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-medium text-gray-900 dark:text-white">Recommendations</h4>
                      {systemInfo.recommendations.map((rec, index) => (
                        <div
                          key={index}
                          className={`rounded-lg p-4 flex items-start gap-3 ${
                            rec.type === 'critical' ? 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700' :
                            rec.type === 'warning' ? 'bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700' :
                            rec.type === 'info' ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700' :
                            'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700'
                          }`}
                        >
                          {rec.type === 'critical' || rec.type === 'warning' ? (
                            <ExclamationTriangleIcon className={`w-5 h-5 flex-shrink-0 ${
                              rec.type === 'critical' ? 'text-red-500' : 'text-yellow-500'
                            }`} />
                          ) : rec.type === 'success' ? (
                            <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                          ) : (
                            <InformationCircleIcon className="w-5 h-5 text-blue-500 flex-shrink-0" />
                          )}
                          <div>
                            <h5 className={`font-medium ${
                              rec.type === 'critical' ? 'text-red-800 dark:text-red-200' :
                              rec.type === 'warning' ? 'text-yellow-800 dark:text-yellow-200' :
                              rec.type === 'info' ? 'text-blue-800 dark:text-blue-200' :
                              'text-green-800 dark:text-green-200'
                            }`}>{rec.title}</h5>
                            <p className={`text-sm ${
                              rec.type === 'critical' ? 'text-red-600 dark:text-red-300' :
                              rec.type === 'warning' ? 'text-yellow-600 dark:text-yellow-300' :
                              rec.type === 'info' ? 'text-blue-600 dark:text-blue-300' :
                              'text-green-600 dark:text-green-300'
                            }`}>{rec.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Minimum Requirements Info */}
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-6">
                    <h4 className="font-medium text-gray-900 dark:text-white mb-4">Minimum System Requirements</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Deployment</span>
                        <span className="text-gray-900 dark:text-white font-medium">Physical Server or VM</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">CPU</span>
                        <span className="text-gray-900 dark:text-white font-medium">4+ cores (8+ recommended)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Memory</span>
                        <span className="text-gray-900 dark:text-white font-medium">8 GB minimum (16+ recommended)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Storage</span>
                        <span className="text-gray-900 dark:text-white font-medium">100 GB SSD (NVMe recommended)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Network</span>
                        <span className="text-gray-900 dark:text-white font-medium">1 Gbps minimum</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">OS</span>
                        <span className="text-gray-900 dark:text-white font-medium">Ubuntu 22.04 LTS or Debian 12</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  Failed to load system information
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {settingGroups[activeTab]?.map(field => (
                <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {field.label}
                  </label>
                  {renderField(field)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {data?.length || 0} settings configured •
          {hasChanges ? ' Unsaved changes' : ' All changes saved'}
        </p>
      </div>
    </div>
  )
}
