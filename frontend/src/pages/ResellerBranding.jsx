import { useState, useEffect, useRef } from 'react'
import { resellerBrandingApi } from '../services/api'
import { useBrandingStore } from '../store/brandingStore'
import toast from 'react-hot-toast'
import {
  PhotoIcon,
  TrashIcon,
  PaintBrushIcon,
  BuildingOfficeIcon,
  CheckIcon,
  GlobeAltIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline'

const PRESET_COLORS = [
  { color: '#2563eb', name: 'Blue' },
  { color: '#16a34a', name: 'Green' },
  { color: '#7c3aed', name: 'Purple' },
  { color: '#d97706', name: 'Amber' },
  { color: '#dc2626', name: 'Red' },
  { color: '#0891b2', name: 'Cyan' },
]

export default function ResellerBranding() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [formData, setFormData] = useState({
    company_name: '',
    primary_color: '#2563eb',
    footer_text: '',
    tagline: '',
  })
  const [logoUrl, setLogoUrl] = useState('')
  const [domain, setDomain] = useState('')
  const [domainSaving, setDomainSaving] = useState(false)
  const [sslRequesting, setSslRequesting] = useState(false)
  const [sslLog, setSslLog] = useState([])
  const [serverIp, setServerIp] = useState('')
  const [serverHasPublicIp, setServerHasPublicIp] = useState(true)
  const logoRef = useRef()
  const { fetchBranding } = useBrandingStore()

  useEffect(() => {
    loadBranding()
  }, [])

  const loadBranding = async () => {
    try {
      const res = await resellerBrandingApi.get()
      const d = res.data
      setFormData({
        company_name: d.company_name || '',
        primary_color: d.primary_color || '#2563eb',
        footer_text: d.footer_text || '',
        tagline: d.tagline || '',
      })
      setLogoUrl(d.logo_path || '')
      setServerIp(d.server_ip || '')
      setServerHasPublicIp(d.server_has_public_ip !== false)
      // Load domain from auth/me
      try {
        const meRes = await resellerBrandingApi.get()
        // domain comes back from reseller context via /auth/me
        const authRaw = localStorage.getItem('proisp-auth')
        if (authRaw) {
          const auth = JSON.parse(authRaw)
          const reseller = auth?.state?.user?.reseller
          if (reseller?.custom_domain !== undefined) {
            setDomain(reseller.custom_domain || '')
          }
        }
      } catch {}
    } catch (e) {
      toast.error('Failed to load branding')
    } finally {
      setLoading(false)
    }
  }

  const saveDomain = async () => {
    setDomainSaving(true)
    try {
      await resellerBrandingApi.updateDomain(domain.toLowerCase().trim())
      toast.success('Domain saved!')
    } catch (e) {
      toast.error('Failed to save domain')
    } finally {
      setDomainSaving(false)
    }
  }

  const requestSSL = async () => {
    setSslRequesting(true)
    setSslLog(['🚀 Starting SSL certificate request...'])
    try {
      const response = await fetch('/api/reseller/branding/ssl', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (JSON.parse(localStorage.getItem('proisp-auth') || '{}')?.state?.token || '')
        },
        body: JSON.stringify({ email: '' })
      })
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        const lines = text.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6))
        setSslLog(prev => [...prev, ...lines])
        if (lines.some(l => l === 'DONE')) break
      }
    } catch (e) {
      setSslLog(prev => [...prev, '❌ Error: ' + e.message])
    } finally {
      setSslRequesting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await resellerBrandingApi.update(formData)
      toast.success('Branding saved!')
      fetchBranding() // Re-apply branding immediately
    } catch (e) {
      toast.error('Failed to save branding')
    } finally {
      setSaving(false)
    }
  }

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const fd = new FormData()
    fd.append('logo', file)
    setUploadingLogo(true)
    try {
      const res = await resellerBrandingApi.uploadLogo(fd)
      setLogoUrl(res.data.logo_url)
      toast.success('Logo uploaded!')
      fetchBranding()
    } catch (e) {
      toast.error('Failed to upload logo')
    } finally {
      setUploadingLogo(false)
      e.target.value = ''
    }
  }

  const handleDeleteLogo = async () => {
    try {
      await resellerBrandingApi.deleteLogo()
      setLogoUrl('')
      toast.success('Logo removed')
      fetchBranding()
    } catch (e) {
      toast.error('Failed to delete logo')
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"/></div>

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <PaintBrushIcon className="h-7 w-7 text-blue-600" />
          Branding
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Customize how your brand appears in the panel
        </p>
      </div>

      {/* Company Logo */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <PhotoIcon className="h-5 w-5 text-gray-500" /> Company Logo
        </h2>
        <div className="flex items-center gap-4">
          <div className="h-16 w-40 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center bg-gray-50 dark:bg-gray-700 overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="max-h-14 max-w-full object-contain" />
            ) : (
              <span className="text-xs text-gray-400">No logo</span>
            )}
          </div>
          <div className="flex gap-2">
            <input ref={logoRef} type="file" accept=".png,.jpg,.jpeg,.svg,.webp" className="hidden" onChange={handleLogoUpload} />
            <button
              onClick={() => logoRef.current.click()}
              disabled={uploadingLogo}
              className="btn btn-secondary text-sm"
            >
              {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
            </button>
            {logoUrl && (
              <button onClick={handleDeleteLogo} className="btn text-sm bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400">
                <TrashIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">PNG, JPG, SVG or WEBP — max 2MB — recommended 180×36px</p>
      </div>

      {/* Company Name */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <BuildingOfficeIcon className="h-5 w-5 text-gray-500" /> Company Name
        </h2>
        <input
          type="text"
          value={formData.company_name}
          onChange={e => setFormData(p => ({ ...p, company_name: e.target.value }))}
          placeholder="Your Company Name"
          className="input w-full"
        />
        <p className="text-xs text-gray-400 mt-1">Shown in the sidebar when no logo is uploaded</p>
      </div>

      {/* Primary Color */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <PaintBrushIcon className="h-5 w-5 text-gray-500" /> Primary Color
        </h2>
        <div className="flex items-center gap-3 mb-3">
          <input
            type="color"
            value={formData.primary_color}
            onChange={e => setFormData(p => ({ ...p, primary_color: e.target.value }))}
            className="h-10 w-10 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
          />
          <input
            type="text"
            value={formData.primary_color}
            onChange={e => setFormData(p => ({ ...p, primary_color: e.target.value }))}
            placeholder="#2563eb"
            className="input w-32 font-mono text-sm"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {PRESET_COLORS.map(({ color, name }) => (
            <button
              key={color}
              title={name}
              onClick={() => setFormData(p => ({ ...p, primary_color: color }))}
              className="h-8 w-8 rounded-full border-2 flex items-center justify-center transition-transform hover:scale-110"
              style={{ backgroundColor: color, borderColor: formData.primary_color === color ? '#000' : 'transparent' }}
            >
              {formData.primary_color === color && <CheckIcon className="h-4 w-4 text-white" />}
            </button>
          ))}
        </div>
      </div>

      {/* Tagline & Footer */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-white">Additional Text</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tagline</label>
          <input
            type="text"
            value={formData.tagline}
            onChange={e => setFormData(p => ({ ...p, tagline: e.target.value }))}
            placeholder="Fast & Reliable Internet"
            className="input w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Footer Text</label>
          <input
            type="text"
            value={formData.footer_text}
            onChange={e => setFormData(p => ({ ...p, footer_text: e.target.value }))}
            placeholder="© 2026 Your Company"
            className="input w-full"
          />
        </div>
      </div>

      {/* Custom Domain */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <GlobeAltIcon className="h-5 w-5 text-gray-500" /> Custom Domain
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={domain}
            onChange={e => setDomain(e.target.value.toLowerCase().trim())}
            placeholder="portal.myisp.com"
            className="input flex-1 font-mono text-sm"
          />
          <button onClick={saveDomain} disabled={domainSaving} className="btn btn-secondary whitespace-nowrap">
            {domainSaving ? 'Saving...' : 'Save Domain'}
          </button>
        </div>
        {domain && (
          <>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-sm space-y-1">
              <p className="font-medium text-blue-800 dark:text-blue-300">📋 DNS Setup Instructions</p>
              <p className="text-blue-700 dark:text-blue-400">Add this A record to your domain's DNS:</p>
              <div className="font-mono bg-white dark:bg-gray-900 rounded p-2 text-xs border border-blue-200 dark:border-blue-800">
                <span className="text-gray-500">Type:</span> A &nbsp;&nbsp;
                <span className="text-gray-500">Name:</span> {domain.split('.').slice(0, -2).join('.') || '@'} &nbsp;&nbsp;
                <span className="text-gray-500">Value:</span> <span className={`font-bold ${serverHasPublicIp ? 'text-green-600' : 'text-red-600'}`}>
                  {serverIp || 'YOUR_SERVER_IP'}
                </span> &nbsp;&nbsp;
                <span className="text-gray-500">TTL:</span> 3600
              </div>
              <p className="text-blue-600 dark:text-blue-400 text-xs">After DNS propagates (up to 24h), your portal will be available at <strong>http://{domain}</strong></p>
            </div>
            {serverIp && !serverHasPublicIp && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm">
                <p className="font-medium text-red-700 dark:text-red-400">⚠️ This server does not have a public IP</p>
                <p className="text-red-600 dark:text-red-400 text-xs mt-1">
                  Custom domains require a public IP address. Your server IP ({serverIp}) is a private/internal IP.
                  Contact your hosting provider to assign a public IP.
                </p>
              </div>
            )}
          </>
        )}
        {domain && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h3 className="font-medium text-gray-900 dark:text-white flex items-center gap-2 mb-2">
              <LockClosedIcon className="h-4 w-4 text-green-600" /> SSL Certificate (HTTPS)
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              After your DNS is set up, click below to automatically install a free Let's Encrypt SSL certificate.
              Make sure your domain is reachable on port 80 first.
            </p>
            <button
              onClick={requestSSL}
              disabled={sslRequesting}
              className="btn btn-secondary text-sm flex items-center gap-2"
            >
              <LockClosedIcon className="h-4 w-4" />
              {sslRequesting ? 'Requesting certificate...' : 'Request SSL Certificate'}
            </button>
            {sslLog.length > 0 && (
              <div className="mt-3 bg-gray-900 rounded-lg p-3 font-mono text-xs text-green-400 max-h-48 overflow-y-auto space-y-0.5">
                {sslLog.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Live Preview */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Sidebar Preview</h2>
        <div className="rounded-lg overflow-hidden w-48 border border-gray-200 dark:border-gray-700" style={{ background: formData.primary_color }}>
          <div className="p-3 flex items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt="logo" className="h-7 max-w-[120px] object-contain" />
            ) : (
              <span className="text-white font-bold text-sm truncate">{formData.company_name || 'Your Company'}</span>
            )}
          </div>
          <div className="bg-white/10 p-2 space-y-1">
            {['Dashboard', 'Subscribers', 'Services'].map(item => (
              <div key={item} className="text-white/80 text-xs px-2 py-1 rounded">{item}</div>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn btn-primary w-full"
      >
        {saving ? 'Saving...' : 'Save Branding'}
      </button>
    </div>
  )
}
