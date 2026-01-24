import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { settingsApi } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { useBrandingStore } from '../store/brandingStore'
import { setTimezone } from '../utils/timezone'
import toast from 'react-hot-toast'
import { PhotoIcon, TrashIcon } from '@heroicons/react/24/outline'

export default function Settings() {
  const queryClient = useQueryClient()
  const { user, refreshUser } = useAuthStore()
  const { companyName, companyLogo, fetchBranding, updateBranding } = useBrandingStore()
  // Check if we should open the license tab (from LicenseBanner link)
  const initialTab = sessionStorage.getItem('settings-tab') || 'branding'
  const [activeTab, setActiveTab] = useState(initialTab)

  // Clear the sessionStorage after reading
  useEffect(() => {
    sessionStorage.removeItem('settings-tab')
  }, [])
  const [formData, setFormData] = useState({})
  const [hasChanges, setHasChanges] = useState(false)
  const fileInputRef = useRef(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // 2FA state
  const [twoFASetup, setTwoFASetup] = useState(null)
  const [twoFACode, setTwoFACode] = useState('')
  const [disablePassword, setDisablePassword] = useState('')
  const [disableCode, setDisableCode] = useState('')

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
  const { data: licenseData, isLoading: licenseLoading } = useQuery({
    queryKey: ['license'],
    queryFn: () => api.get('/license').then(res => res.data.data),
    enabled: activeTab === 'license'
  })

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
    ],
    notifications: [
      { key: 'sms_enabled', label: 'SMS Notifications', type: 'toggle' },
      { key: 'sms_provider', label: 'SMS Provider', type: 'select', options: ['disabled', 'twilio', 'africas_talking', 'nexmo'] },
      { key: 'sms_api_key', label: 'SMS API Key', type: 'password', placeholder: 'API Key' },
      { key: 'email_enabled', label: 'Email Notifications', type: 'toggle' },
      { key: 'smtp_host', label: 'SMTP Host', type: 'text', placeholder: 'smtp.gmail.com' },
      { key: 'smtp_port', label: 'SMTP Port', type: 'number', placeholder: '587' },
      { key: 'smtp_user', label: 'SMTP Username', type: 'text', placeholder: 'user@gmail.com' },
      { key: 'smtp_password', label: 'SMTP Password', type: 'password', placeholder: 'Password' },
      { key: 'notification_email', label: 'Notification Email', type: 'email', placeholder: 'alerts@company.com' },
      { key: 'whatsapp_enabled', label: 'WhatsApp Notifications', type: 'toggle' },
    ],
    security: [
      { key: 'session_timeout', label: 'Admin Session Timeout (min)', type: 'number', placeholder: '60' },
      { key: 'max_login_attempts', label: 'Max Login Attempts', type: 'number', placeholder: '5' },
      { key: 'password_min_length', label: 'Min Password Length', type: 'number', placeholder: '8' },
      { key: 'api_rate_limit', label: 'API Rate Limit (req/min)', type: 'number', placeholder: '100' },
      { key: 'allowed_ips', label: 'Allowed Admin IPs', type: 'text', placeholder: 'Leave empty for all' },
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
              isChecked ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                isChecked ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          {field.description && (
            <p className="mt-1 text-xs text-gray-500">{field.description}</p>
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
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          >
            <option value="">Select timezone...</option>
            {(timezones || []).map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
          {field.description && (
            <p className="mt-1 text-xs text-gray-500">{field.description}</p>
          )}
        </div>
      )
    }

    if (field.type === 'select') {
      return (
        <select
          value={value}
          onChange={(e) => handleChange(field.key, e.target.value)}
          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
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
          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
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
          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
        />
        {field.description && (
          <p className="mt-1 text-xs text-gray-500">{field.description}</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <div className="flex space-x-3">
          {hasChanges && (
            <button
              onClick={handleReset}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
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
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
          Settings saved successfully!
        </div>
      )}

      {updateMutation.isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          Failed to save settings. Please try again.
        </div>
      )}

      <div className="bg-white shadow rounded-lg">
        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-4 text-sm font-medium border-b-2 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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
            <div className="space-y-6">
              {/* Company Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company Name
                </label>
                <input
                  type="text"
                  value={formData.company_name || ''}
                  onChange={(e) => handleChange('company_name', e.target.value)}
                  placeholder="Your Company Name"
                  className="block w-full max-w-md rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">This name appears in the sidebar and login page</p>
              </div>

              {/* Logo Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company Logo
                </label>
                <div className="flex items-start gap-6">
                  {/* Current Logo Preview */}
                  <div className="flex-shrink-0">
                    <div className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50 overflow-hidden">
                      {companyLogo ? (
                        <img
                          src={companyLogo}
                          alt="Company Logo"
                          className="max-w-full max-h-full object-contain"
                        />
                      ) : (
                        <PhotoIcon className="w-12 h-12 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Upload Controls */}
                  <div className="flex-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingLogo}
                        className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 w-fit"
                      >
                        <PhotoIcon className="w-4 h-4 mr-2" />
                        {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                      </button>
                      {companyLogo && (
                        <button
                          type="button"
                          onClick={handleLogoDelete}
                          className="inline-flex items-center px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-300 rounded-md hover:bg-red-50 w-fit"
                        >
                          <TrashIcon className="w-4 h-4 mr-2" />
                          Remove Logo
                        </button>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      Recommended: 240 x 64 pixels, PNG with transparent background<br />
                      Maximum size: 2MB
                    </p>
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="border-t pt-6">
                <h3 className="text-sm font-medium text-gray-700 mb-4">Preview</h3>
                <div className="bg-gray-100 rounded-lg p-4">
                  <div className="bg-white rounded-lg shadow p-4 max-w-xs">
                    <div className="flex items-center gap-3">
                      {companyLogo ? (
                        <img src={companyLogo} alt="Logo" className="h-10 object-contain" />
                      ) : (
                        <span className="text-lg font-bold text-blue-600">
                          {formData.company_name || 'ProISP'}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    {companyLogo
                      ? 'Logo only - company name is hidden when logo is set'
                      : 'Company name shown - upload a logo to replace text with image'
                    }
                  </p>
                </div>
              </div>
            </div>
          ) : activeTab === 'account' ? (
            <div className="space-y-8">
              {/* User Info */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Account Information</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Username</p>
                      <p className="font-medium">{user?.username}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Email</p>
                      <p className="font-medium">{user?.email || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Full Name</p>
                      <p className="font-medium">{user?.full_name || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Role</p>
                      <p className="font-medium capitalize">{user?.user_type}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Two-Factor Authentication */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Two-Factor Authentication</h3>

                {twoFAStatus?.enabled ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center mb-4">
                      <svg className="w-5 h-5 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      <span className="font-medium text-green-800">2FA is enabled</span>
                    </div>
                    <p className="text-sm text-green-700 mb-4">Your account is protected with two-factor authentication.</p>

                    <div className="border-t border-green-200 pt-4 mt-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">Disable 2FA</p>
                      <div className="space-y-3">
                        <input
                          type="password"
                          placeholder="Current password"
                          value={disablePassword}
                          onChange={(e) => setDisablePassword(e.target.value)}
                          className="block w-full max-w-xs rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                        />
                        <input
                          type="text"
                          placeholder="2FA code"
                          value={disableCode}
                          onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          maxLength={6}
                          className="block w-full max-w-xs rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
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
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
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
                            className="block w-32 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-center text-lg tracking-widest"
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
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center mb-4">
                      <svg className="w-5 h-5 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span className="font-medium text-gray-700">2FA is not enabled</span>
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
          ) : activeTab === 'license' ? (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-gray-900">License Information</h3>

              {licenseLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : licenseData ? (
                <div className="space-y-6">
                  {/* License Status */}
                  <div className={`rounded-lg p-4 ${licenseData.valid ? (licenseData.grace_period ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200') : 'bg-red-50 border border-red-200'}`}>
                    <div className="flex items-center">
                      {licenseData.valid ? (
                        licenseData.grace_period ? (
                          <>
                            <svg className="w-6 h-6 text-yellow-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <div>
                              <p className="font-medium text-yellow-800">License in Grace Period</p>
                              <p className="text-sm text-yellow-700">Please renew your license to continue using all features</p>
                            </div>
                          </>
                        ) : (
                          <>
                            <svg className="w-6 h-6 text-green-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            <div>
                              <p className="font-medium text-green-800">License Active</p>
                              <p className="text-sm text-green-700">{licenseData.message}</p>
                            </div>
                          </>
                        )
                      ) : (
                        <>
                          <svg className="w-6 h-6 text-red-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div>
                            <p className="font-medium text-red-800">License Invalid</p>
                            <p className="text-sm text-red-700">{licenseData.message}</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* License Details */}
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                      <h4 className="font-medium text-gray-900">License Details</h4>
                    </div>
                    <div className="divide-y divide-gray-200">
                      <div className="px-4 py-3 flex justify-between">
                        <span className="text-gray-500">License Key</span>
                        <span className="font-mono text-sm">{licenseData.license_key || '-'}</span>
                      </div>
                      <div className="px-4 py-3 flex justify-between">
                        <span className="text-gray-500">Customer Name</span>
                        <span className="font-medium">{licenseData.customer_name || '-'}</span>
                      </div>
                      <div className="px-4 py-3 flex justify-between">
                        <span className="text-gray-500">Plan / Tier</span>
                        <span className="font-medium capitalize">{licenseData.tier || '-'}</span>
                      </div>
                      <div className="px-4 py-3 flex justify-between">
                        <span className="text-gray-500">Max Subscribers</span>
                        <span className="font-medium">{licenseData.max_subscribers?.toLocaleString() || '-'}</span>
                      </div>
                      <div className="px-4 py-3 flex justify-between">
                        <span className="text-gray-500">License Type</span>
                        <span className="font-medium">{licenseData.is_lifetime ? 'Lifetime' : 'Subscription'}</span>
                      </div>
                      {!licenseData.is_lifetime && (
                        <>
                          <div className="px-4 py-3 flex justify-between">
                            <span className="text-gray-500">Expires At</span>
                            <span className="font-medium">
                              {licenseData.expires_at ? new Date(licenseData.expires_at).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              }) : '-'}
                            </span>
                          </div>
                          <div className="px-4 py-3 flex justify-between">
                            <span className="text-gray-500">Days Remaining</span>
                            <span className={`font-medium ${licenseData.days_remaining <= 7 ? 'text-red-600' : licenseData.days_remaining <= 30 ? 'text-yellow-600' : 'text-green-600'}`}>
                              {licenseData.days_remaining !== undefined ? `${licenseData.days_remaining} days` : '-'}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Support Contact */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-900 mb-2">Need to upgrade or renew?</h4>
                    <p className="text-sm text-blue-700">
                      Contact support to upgrade your plan or renew your license.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
                  <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-gray-500">No license information available</p>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {settingGroups[activeTab]?.map(field => (
                <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
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
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-sm text-gray-500">
          {data?.length || 0} settings configured •
          {hasChanges ? ' Unsaved changes' : ' All changes saved'}
        </p>
      </div>
    </div>
  )
}
