import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../store/authStore'
import api from '../services/api'
import toast from 'react-hot-toast'
import {
  DevicePhoneMobileIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  PaperAirplaneIcon,
  UserGroupIcon,
  MagnifyingGlassIcon,
  QrCodeIcon,
} from '@heroicons/react/24/outline'

export default function WhatsAppSettings() {
  const { user } = useAuthStore()

  // Connection state
  const [settings, setSettings] = useState(null)
  const [loadingSettings, setLoadingSettings] = useState(true)

  // QR linking state
  const [linking, setLinking] = useState(false)
  const [qrImageUrl, setQrImageUrl] = useState('')
  const [infoUrl, setInfoUrl] = useState('')
  const pollRef = useRef(null)

  // Subscribers state
  const [subscribers, setSubscribers] = useState([])
  const [loadingSubs, setLoadingSubs] = useState(false)
  const [subSearch, setSubSearch] = useState('')
  const [selectedIDs, setSelectedIDs] = useState([])
  const [sendAll, setSendAll] = useState(false)

  // Message state
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testSending, setTestSending] = useState(false)

  // Load settings on mount
  useEffect(() => {
    fetchSettings()
    fetchSubscribers()
  }, [])

  const fetchSettings = async () => {
    setLoadingSettings(true)
    try {
      const res = await api.get('/reseller/whatsapp/settings')
      if (res.data.success) setSettings(res.data)
    } catch (e) {
      console.error(e)
    }
    setLoadingSettings(false)
  }

  const fetchSubscribers = async (search = '') => {
    setLoadingSubs(true)
    try {
      const res = await api.get('/reseller/whatsapp/subscribers', { params: { search } })
      if (res.data.success) setSubscribers(res.data.subscribers || [])
    } catch (e) {
      console.error(e)
    }
    setLoadingSubs(false)
  }

  // ── QR Linking ──────────────────────────────────────────────
  const handleCreateLink = async () => {
    setLinking(true)
    setQrImageUrl('')
    setInfoUrl('')
    try {
      const res = await api.get('/reseller/whatsapp/proxrad/create-link')
      if (res.data.success) {
        setQrImageUrl(res.data.qr_image_url)
        setInfoUrl(res.data.info_url)
        // Start polling
        pollRef.current = setInterval(() => pollLinkStatus(res.data.info_url), 3000)
      } else {
        toast.error(res.data.message || 'Failed to create link')
        setLinking(false)
      }
    } catch (e) {
      toast.error('Failed to create WhatsApp link')
      setLinking(false)
    }
  }

  const pollLinkStatus = async (url) => {
    try {
      const res = await api.get('/reseller/whatsapp/proxrad/link-status', { params: { info_url: url } })
      if (res.data.connected) {
        clearInterval(pollRef.current)
        setLinking(false)
        setQrImageUrl('')
        toast.success('WhatsApp connected successfully! 🎉')
        fetchSettings()
      }
    } catch (e) {
      console.error('Poll error:', e)
    }
  }

  const handleCancelLink = () => {
    clearInterval(pollRef.current)
    setLinking(false)
    setQrImageUrl('')
    setInfoUrl('')
  }

  const handleUnlink = async () => {
    if (!confirm('Disconnect your WhatsApp account?')) return
    try {
      const res = await api.delete('/reseller/whatsapp/proxrad/unlink')
      if (res.data.success) {
        toast.success('WhatsApp disconnected')
        fetchSettings()
      }
    } catch (e) {
      toast.error('Failed to unlink')
    }
  }

  // ── Test Send ────────────────────────────────────────────────
  const handleTestSend = async () => {
    if (!testPhone.trim()) { toast.error('Enter a phone number'); return }
    setTestSending(true)
    try {
      const res = await api.post('/reseller/whatsapp/proxrad/test-send', { test_phone: testPhone.trim() })
      if (res.data.success) toast.success(res.data.message)
      else toast.error(res.data.message)
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to send test')
    }
    setTestSending(false)
  }

  // ── Subscriber selection ─────────────────────────────────────
  const toggleSubscriber = (id) => {
    setSelectedIDs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleSearchChange = (v) => {
    setSubSearch(v)
    fetchSubscribers(v)
  }

  // ── Send Message ─────────────────────────────────────────────
  const handleSend = async () => {
    if (!message.trim()) { toast.error('Enter a message'); return }
    if (!sendAll && selectedIDs.length === 0) { toast.error('Select at least one subscriber'); return }

    const count = sendAll ? subscribers.length : selectedIDs.length
    if (!confirm(`Send message to ${count} subscriber${count !== 1 ? 's' : ''}?`)) return

    setSending(true)
    try {
      const res = await api.post('/reseller/whatsapp/send', {
        message: message.trim(),
        send_all: sendAll,
        subscriber_ids: sendAll ? [] : selectedIDs,
      })
      if (res.data.success) {
        toast.success(`✅ Sent to ${res.data.sent} subscribers${res.data.failed > 0 ? `, ${res.data.failed} failed` : ''}`)
        if (res.data.failed === 0) {
          setMessage('')
          setSelectedIDs([])
          setSendAll(false)
        }
      } else {
        toast.error(res.data.message || 'Send failed')
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to send')
    }
    setSending(false)
  }

  // ── Render ───────────────────────────────────────────────────
  const connected = settings?.connected
  const phone = settings?.phone

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <DevicePhoneMobileIcon className="w-7 h-7 text-green-500" />
          WhatsApp Notifications
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Connect your WhatsApp number and send messages to your subscribers
        </p>
      </div>

      {/* Connection Card */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <QrCodeIcon className="w-5 h-5 text-green-600" />
            WhatsApp Connection
          </h2>
          {connected && (
            <span className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full">
              <CheckCircleIcon className="w-4 h-4" /> Connected
            </span>
          )}
        </div>

        {loadingSettings ? (
          <div className="flex items-center gap-2 text-gray-500"><ArrowPathIcon className="w-4 h-4 animate-spin" /> Loading...</div>
        ) : connected ? (
          <div className="space-y-4">
            {/* Connected info */}
            <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <DevicePhoneMobileIcon className="w-8 h-8 text-green-600 dark:text-green-400 flex-shrink-0" />
              <div>
                <p className="font-medium text-green-800 dark:text-green-200">Connected</p>
                {phone && <p className="text-sm text-green-600 dark:text-green-400">{phone}</p>}
              </div>
            </div>

            {/* Test Send */}
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Send Test Message</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value)}
                  placeholder="Phone number (e.g. 96170123456)"
                  className="input flex-1"
                />
                <button
                  onClick={handleTestSend}
                  disabled={testSending}
                  className="btn-primary whitespace-nowrap"
                >
                  {testSending ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : 'Test Send'}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Include country code, no + sign (e.g. 96170123456)</p>
            </div>

            {/* Disconnect */}
            <button onClick={handleUnlink} className="btn-secondary text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm">
              <XCircleIcon className="w-4 h-4 mr-1" /> Disconnect WhatsApp
            </button>
          </div>
        ) : linking ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Scan the QR code below with your WhatsApp app to connect your number.
            </p>
            {qrImageUrl ? (
              <div className="flex flex-col items-center gap-3">
                <img src={qrImageUrl} alt="WhatsApp QR Code" className="w-48 h-48 border rounded-lg" />
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  Waiting for scan...
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-gray-500"><ArrowPathIcon className="w-4 h-4 animate-spin" /> Generating QR code...</div>
            )}
            <button onClick={handleCancelLink} className="btn-secondary text-sm">Cancel</button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Link your WhatsApp number via <strong>ProxRad</strong> (proxsms.com). Scan the QR code to connect your number.
            </p>
            <button onClick={handleCreateLink} className="btn-primary flex items-center gap-2">
              <QrCodeIcon className="w-4 h-4" />
              Connect WhatsApp
            </button>
          </div>
        )}
      </div>

      {/* Send Message (only if connected) */}
      {connected && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Subscriber Selector */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <UserGroupIcon className="w-5 h-5 text-blue-500" />
                Select Subscribers
              </h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {subscribers.length} with phone
              </span>
            </div>

            {/* Send All toggle */}
            <label className="flex items-center gap-2 mb-3 cursor-pointer">
              <div
                onClick={() => { setSendAll(!sendAll); setSelectedIDs([]) }}
                className={`relative w-10 h-5 rounded-full transition-colors ${sendAll ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${sendAll ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Send to all subscribers ({subscribers.length})
              </span>
            </label>

            {!sendAll && (
              <>
                {/* Search */}
                <div className="relative mb-2">
                  <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={subSearch}
                    onChange={e => handleSearchChange(e.target.value)}
                    placeholder="Search subscribers..."
                    className="input pl-8 w-full text-sm"
                  />
                </div>

                {/* Select/Deselect all visible */}
                <div className="flex gap-2 mb-2">
                  <button onClick={() => setSelectedIDs(subscribers.map(s => s.id))} className="text-xs text-blue-600 hover:underline">Select all</button>
                  <span className="text-gray-300">|</span>
                  <button onClick={() => setSelectedIDs([])} className="text-xs text-gray-500 hover:underline">Clear</button>
                  {selectedIDs.length > 0 && <span className="text-xs text-green-600 font-medium">{selectedIDs.length} selected</span>}
                </div>

                {/* List */}
                <div className="max-h-64 overflow-y-auto space-y-1 border border-gray-200 dark:border-gray-700 rounded-lg p-2">
                  {loadingSubs ? (
                    <div className="text-center py-4 text-gray-400 text-sm"><ArrowPathIcon className="w-4 h-4 animate-spin inline" /></div>
                  ) : subscribers.length === 0 ? (
                    <p className="text-center py-4 text-gray-400 text-sm">No subscribers with phone numbers</p>
                  ) : (
                    subscribers.map(sub => (
                      <label key={sub.id} className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 ${selectedIDs.includes(sub.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selectedIDs.includes(sub.id)}
                          onChange={() => toggleSubscriber(sub.id)}
                          className="rounded border-gray-300"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{sub.username}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{sub.phone}</p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* Message Composer */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
              <PaperAirplaneIcon className="w-5 h-5 text-green-500" />
              Compose Message
            </h3>

            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={8}
              placeholder={`Type your message here...\n\nYou can use:\n{username} — subscriber username\n{full_name} — subscriber full name\n{reseller_name} — your name`}
              className="input w-full resize-none text-sm mb-2"
            />

            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-400">{message.length} characters</p>
              <p className="text-xs text-gray-400">
                Recipients: {sendAll ? `All (${subscribers.length})` : selectedIDs.length}
              </p>
            </div>

            {/* Variable hints */}
            <div className="flex flex-wrap gap-1 mb-3">
              {['{username}', '{full_name}', '{reseller_name}'].map(v => (
                <button
                  key={v}
                  onClick={() => setMessage(m => m + v)}
                  className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  {v}
                </button>
              ))}
            </div>

            <button
              onClick={handleSend}
              disabled={sending || !message.trim() || (!sendAll && selectedIDs.length === 0)}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {sending ? (
                <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Sending...</>
              ) : (
                <><PaperAirplaneIcon className="w-4 h-4" /> Send Message</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
