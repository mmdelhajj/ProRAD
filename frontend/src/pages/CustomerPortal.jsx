import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useBrandingStore } from '../store/brandingStore'
import { formatDate, formatDateTime } from '../utils/timezone'
import {
  WifiIcon,
  ClockIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  CalendarDaysIcon,
  SignalIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  PlusIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  BellAlertIcon,
  BanknotesIcon
} from '@heroicons/react/24/outline'
import api from '../services/api'

// Format bytes to human readable
function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Format duration
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

export default function CustomerPortal() {
  const navigate = useNavigate()
  const { isAuthenticated, isCustomer, customerData, logout, refreshUser } = useAuthStore()
  const { companyName, companyLogo, fetchBranding, loaded } = useBrandingStore()
  const [dashboard, setDashboard] = useState(null)
  const [sessions, setSessions] = useState([])
  const [usageHistory, setUsageHistory] = useState([])
  const [tickets, setTickets] = useState([])
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [showCreateTicket, setShowCreateTicket] = useState(false)
  const [ticketForm, setTicketForm] = useState({ subject: '', description: '', category: 'general' })
  const [replyText, setReplyText] = useState('')
  const [activeTab, setActiveTab] = useState('dashboard')
  const [loading, setLoading] = useState(true)

  // Fetch branding
  useEffect(() => {
    if (!loaded) {
      fetchBranding()
    }
  }, [loaded, fetchBranding])

  // Redirect if not authenticated as customer
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    if (!isCustomer) {
      // If logged in as admin/reseller, redirect to admin dashboard
      navigate('/')
      return
    }
    fetchDashboard()
  }, [isAuthenticated, isCustomer, navigate])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const fetchDashboard = async () => {
    setLoading(true)
    try {
      const res = await api.get('/customer/dashboard')
      if (res.data.success) {
        setDashboard(res.data.data)
      }
    } catch (err) {
      if (err.response?.status === 401) {
        handleLogout()
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchSessions = async () => {
    try {
      const res = await api.get('/customer/sessions')
      if (res.data.success) {
        setSessions(res.data.data)
      }
    } catch (err) {
      console.error('Failed to fetch sessions', err)
    }
  }

  const fetchUsageHistory = async () => {
    try {
      const res = await api.get('/customer/usage')
      if (res.data.success) {
        setUsageHistory(res.data.data)
      }
    } catch (err) {
      console.error('Failed to fetch usage history', err)
    }
  }

  const fetchTickets = async () => {
    try {
      const res = await api.get('/customer/tickets')
      if (res.data.success) {
        setTickets(res.data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch tickets', err)
    }
  }

  const fetchTicketDetail = async (ticketId) => {
    try {
      const res = await api.get(`/customer/tickets/${ticketId}`)
      if (res.data.success) {
        setSelectedTicket(res.data.data)
      }
    } catch (err) {
      console.error('Failed to fetch ticket', err)
    }
  }

  const handleCreateTicket = async (e) => {
    e.preventDefault()
    try {
      const res = await api.post('/customer/tickets', ticketForm)
      if (res.data.success) {
        setShowCreateTicket(false)
        setTicketForm({ subject: '', description: '', category: 'general' })
        fetchTickets()
      }
    } catch (err) {
      console.error('Failed to create ticket', err)
    }
  }

  const handleReplyTicket = async (e) => {
    e.preventDefault()
    if (!replyText.trim() || !selectedTicket) return
    try {
      const res = await api.post(`/customer/tickets/${selectedTicket.id}/reply`, { message: replyText })
      if (res.data.success) {
        setReplyText('')
        fetchTicketDetail(selectedTicket.id)
      }
    } catch (err) {
      console.error('Failed to reply', err)
    }
  }

  useEffect(() => {
    if (isCustomer && activeTab === 'sessions') {
      fetchSessions()
    } else if (isCustomer && activeTab === 'usage') {
      fetchUsageHistory()
    } else if (isCustomer && activeTab === 'tickets') {
      fetchTickets()
    }
  }, [isCustomer, activeTab])

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // Dashboard
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 dark:bg-gray-700">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm dark:shadow-gray-900">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {companyLogo ? (
              <img src={companyLogo} alt={companyName} className="h-10 object-contain" />
            ) : (
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                <WifiIcon className="w-5 h-5 text-white" />
              </div>
            )}
            <div>
              {!companyLogo && <h1 className="font-bold text-gray-900 dark:text-white">{companyName}</h1>}
              <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">{dashboard?.username || customerData?.username}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-gray-600 hover:text-red-600"
          >
            <ArrowRightOnRectangleIcon className="w-5 h-5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 mt-4">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {['dashboard', 'sessions', 'usage', 'tickets'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition ${
                activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'dashboard' && dashboard && (
          <div className="space-y-6">
            {/* Status Card */}
            <div className={`rounded-2xl p-6 ${
              dashboard.status === 'active' && dashboard.days_left > 0
                ? 'bg-gradient-to-r from-green-500 to-green-600'
                : dashboard.status === 'expired' || dashboard.days_left <= 0
                ? 'bg-gradient-to-r from-red-500 to-red-600'
                : 'bg-gradient-to-r from-yellow-500 to-yellow-600'
            } text-white`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm">Account Status</p>
                  <p className="text-2xl font-bold capitalize mt-1">{dashboard.status}</p>
                </div>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  dashboard.is_online ? 'bg-white/20' : 'bg-white/10'
                }`}>
                  <SignalIcon className={`w-6 h-6 ${dashboard.is_online ? 'text-white' : 'text-white/50'}`} />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-4">
                <div>
                  <p className="text-white/80 text-xs">Expires</p>
                  <p className="font-medium">{formatDate(dashboard.expiry_date)}</p>
                </div>
                <div className="h-8 w-px bg-white/20" />
                <div>
                  <p className="text-white/80 text-xs">Days Left</p>
                  <p className="font-medium">{dashboard.days_left} days</p>
                </div>
                <div className="h-8 w-px bg-white/20" />
                <div>
                  <p className="text-white/80 text-xs">Connection</p>
                  <p className="font-medium">{dashboard.is_online ? 'Online' : 'Offline'}</p>
                </div>
              </div>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Service */}
              <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm dark:shadow-gray-900">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <WifiIcon className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Service Plan</p>
                    <p className="font-bold text-gray-900 dark:text-white">{dashboard.service_name}</p>
                  </div>
                </div>
              </div>

              {/* Speed */}
              <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm dark:shadow-gray-900">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <SignalIcon className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Current Speed</p>
                    <p className="font-bold text-gray-900 dark:text-white">
                      {dashboard.current_download_speed}k / {dashboard.current_upload_speed}k
                    </p>
                    {dashboard.fup_level > 0 && (
                      <p className="text-xs text-orange-600">FUP Level {dashboard.fup_level}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* IP Address */}
              <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm dark:shadow-gray-900">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/50 rounded-lg flex items-center justify-center">
                    <UserCircleIcon className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">IP Address</p>
                    <p className="font-bold text-gray-900 dark:text-white">{dashboard.ip_address || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* MAC Address */}
              <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm dark:shadow-gray-900">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/50 rounded-lg flex items-center justify-center">
                    <ClockIcon className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">MAC Address</p>
                    <p className="font-bold text-gray-900 dark:text-white text-xs">{dashboard.mac_address || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Monthly Price */}
              {dashboard.price > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm dark:shadow-gray-900">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 dark:bg-green-900/50 rounded-lg flex items-center justify-center">
                      <BanknotesIcon className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-gray-500 dark:text-gray-400 text-sm">Monthly Price</p>
                      <p className="font-bold text-gray-900 dark:text-white">
                        ${dashboard.price.toFixed(2)}
                        {dashboard.override_price && (
                          <span className="ml-1 text-xs text-orange-500" title="Custom price">★</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Usage Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Daily Usage */}
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm dark:shadow-gray-900">
                <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <CalendarDaysIcon className="w-5 h-5 text-blue-600" />
                  Daily Usage
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Download</span>
                      <span className="font-medium">
                        {formatBytes(dashboard.daily_download_used)}
                        {dashboard.daily_quota > 0 && ` / ${formatBytes(dashboard.daily_quota)}`}
                      </span>
                    </div>
                    {dashboard.daily_quota > 0 && (
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full"
                          style={{ width: `${Math.min((dashboard.daily_download_used / dashboard.daily_quota) * 100, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Upload</span>
                      <span className="font-medium">{formatBytes(dashboard.daily_upload_used)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Monthly Usage */}
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm dark:shadow-gray-900">
                <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <ChartBarIcon className="w-5 h-5 text-green-600" />
                  Monthly Usage
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Download</span>
                      <span className="font-medium">
                        {formatBytes(dashboard.monthly_download_used)}
                        {dashboard.monthly_quota > 0 && ` / ${formatBytes(dashboard.monthly_quota)}`}
                      </span>
                    </div>
                    {dashboard.monthly_quota > 0 && (
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-600 rounded-full"
                          style={{ width: `${Math.min((dashboard.monthly_download_used / dashboard.monthly_quota) * 100, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Upload</span>
                      <span className="font-medium">{formatBytes(dashboard.monthly_upload_used)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Profile Info */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm dark:shadow-gray-900">
              <h3 className="font-bold text-gray-900 dark:text-white mb-4">Profile Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Full Name</p>
                  <p className="font-medium">{dashboard.full_name || '-'}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Username</p>
                  <p className="font-medium">{dashboard.username}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Email</p>
                  <p className="font-medium">{dashboard.email || '-'}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Phone</p>
                  <p className="font-medium">{dashboard.phone || '-'}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Address</p>
                  <p className="font-medium">{dashboard.address || '-'}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sessions' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b">
              <h3 className="font-bold text-gray-900 dark:text-white">Session History (Last 30 Days)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Start Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Duration</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">IP Address</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Download</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Upload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {sessions.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                        No session history found
                      </td>
                    </tr>
                  ) : (
                    sessions.map((session, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 dark:bg-gray-700">
                        <td className="px-4 py-3 text-sm">
                          {session.start_time ? formatDateTime(session.start_time) : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm">{formatDuration(session.duration)}</td>
                        <td className="px-4 py-3 text-sm font-mono">{session.ip_address || '-'}</td>
                        <td className="px-4 py-3 text-sm text-blue-600">{formatBytes(session.bytes_out)}</td>
                        <td className="px-4 py-3 text-sm text-green-600">{formatBytes(session.bytes_in)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'usage' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b">
              <h3 className="font-bold text-gray-900 dark:text-white">Daily Usage History</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Download</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Upload</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Sessions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {usageHistory.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                        No usage history found
                      </td>
                    </tr>
                  ) : (
                    usageHistory.map((usage, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 dark:bg-gray-700">
                        <td className="px-4 py-3 text-sm font-medium">{usage.date}</td>
                        <td className="px-4 py-3 text-sm text-blue-600">{formatBytes(usage.download)}</td>
                        <td className="px-4 py-3 text-sm text-green-600">{formatBytes(usage.upload)}</td>
                        <td className="px-4 py-3 text-sm">{usage.sessions}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'tickets' && (
          <div className="space-y-4">
            {/* Header with Create Button */}
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-white">Support Tickets</h3>
              <button
                onClick={() => setShowCreateTicket(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <PlusIcon className="w-5 h-5" />
                New Ticket
              </button>
            </div>

            {/* Tickets List */}
            {!selectedTicket ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Ticket #</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Subject</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Category</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {tickets.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                            No tickets found. Create your first support ticket!
                          </td>
                        </tr>
                      ) : (
                        tickets.map((ticket) => (
                          <tr key={ticket.id} className="hover:bg-gray-50 dark:bg-gray-700">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-mono">{ticket.ticket_number}</span>
                                {ticket.has_admin_reply && (
                                  <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{ticket.subject}</span>
                                {ticket.has_admin_reply && (
                                  <BellAlertIcon className="w-4 h-4 text-blue-500" title="New reply from support" />
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                ticket.status === 'open' ? 'bg-green-100 text-green-800' :
                                ticket.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                ticket.status === 'closed' ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200' :
                                'bg-blue-100 text-blue-800'
                              }`}>
                                {ticket.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500 capitalize">{ticket.category}</td>
                            <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                              {formatDate(ticket.created_at)}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => fetchTicketDetail(ticket.id)}
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* Ticket Detail View */
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 border-b flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white">{selectedTicket.subject}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">{selectedTicket.ticket_number}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      selectedTicket.status === 'open' ? 'bg-green-100 text-green-800' :
                      selectedTicket.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      selectedTicket.status === 'closed' ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {selectedTicket.status}
                    </span>
                    <button
                      onClick={() => setSelectedTicket(null)}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                    >
                      <XMarkIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Messages */}
                <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
                  {/* Original Message */}
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      You • {formatDateTime(selectedTicket.created_at)}
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{selectedTicket.description}</p>
                  </div>

                  {/* Replies */}
                  {selectedTicket.replies?.map((reply) => (
                    <div
                      key={reply.id}
                      className={`rounded-lg p-4 ${reply.is_admin ? 'bg-gray-100' : 'bg-blue-50'}`}
                    >
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        {reply.is_admin ? 'Support' : 'You'} • {formatDateTime(reply.created_at)}
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{reply.message}</p>
                    </div>
                  ))}
                </div>

                {/* Reply Form */}
                {selectedTicket.status !== 'closed' && (
                  <form onSubmit={handleReplyTicket} className="p-4 border-t">
                    <div className="flex gap-2">
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Type your reply..."
                        rows={2}
                        className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <button
                        type="submit"
                        disabled={!replyText.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        <PaperAirplaneIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        )}

        {/* Create Ticket Modal */}
        {showCreateTicket && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg mx-4">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold">Create Support Ticket</h3>
                <button onClick={() => setShowCreateTicket(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleCreateTicket}>
                <div className="p-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
                    <input
                      type="text"
                      value={ticketForm.subject}
                      onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                      placeholder="Brief description of your issue"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                    <select
                      value={ticketForm.category}
                      onChange={(e) => setTicketForm({ ...ticketForm, category: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                    >
                      <option value="general">General</option>
                      <option value="billing">Billing</option>
                      <option value="technical">Technical</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                    <textarea
                      value={ticketForm.description}
                      onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })}
                      rows={4}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                      placeholder="Detailed description of your issue"
                      required
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 p-4 border-t">
                  <button
                    type="button"
                    onClick={() => setShowCreateTicket(false)}
                    className="px-4 py-2 text-gray-700 border rounded-lg hover:bg-gray-50 dark:bg-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Create Ticket
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
