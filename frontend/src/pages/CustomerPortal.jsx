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
      <div className="min-h-screen bg-[#c0c0c0] dark:bg-[#2d2d2d] flex items-center justify-center" style={{ fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", fontSize: 11 }}>
        <svg className="animate-spin h-8 w-8 text-[#316AC5]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    )
  }

  // Dashboard
  return (
    <div className="min-h-screen bg-[#c0c0c0] dark:bg-[#2d2d2d]" style={{ fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", fontSize: 11 }}>
      {/* Header */}
      <header className="wb-toolbar justify-between">
        <div className="flex items-center gap-2">
          {companyLogo ? (
            <img src={companyLogo} alt={companyName} className="h-7 object-contain" />
          ) : (
            <div className="w-7 h-7 bg-[#316AC5] flex items-center justify-center" style={{ borderRadius: '2px' }}>
              <WifiIcon className="w-4 h-4 text-white" />
            </div>
          )}
          <div>
            {!companyLogo && <span className="text-[13px] font-semibold text-gray-900 dark:text-[#e0e0e0]">{companyName}</span>}
            <span className="text-[12px] text-gray-500 dark:text-[#aaa] ml-2">{dashboard?.username || customerData?.username}</span>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="btn btn-sm flex items-center gap-1"
        >
          <ArrowRightOnRectangleIcon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </header>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-3 mt-3">
        <div className="flex gap-0 border-b border-[#a0a0a0] dark:border-[#555]">
          {['dashboard', 'sessions', 'usage', 'tickets'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`wb-tab ${activeTab === tab ? 'active' : ''}`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-3 py-3">
        {activeTab === 'dashboard' && dashboard && (
          <div className="space-y-3">
            {/* Status Card */}
            <div className={`card p-3 text-white ${
              dashboard.status === 'active' && dashboard.days_left > 0
                ? 'bg-[#4CAF50] border-[#388E3C]'
                : dashboard.status === 'expired' || dashboard.days_left <= 0
                ? 'bg-[#f44336] border-[#c62828]'
                : 'bg-[#FF9800] border-[#F57C00]'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-[11px]">Account Status</p>
                  <p className="text-[16px] font-bold capitalize mt-0.5">{dashboard.status}</p>
                </div>
                <div className={`w-8 h-8 flex items-center justify-center ${
                  dashboard.is_online ? 'bg-white/20' : 'bg-white/10'
                }`} style={{ borderRadius: '2px' }}>
                  <SignalIcon className={`w-5 h-5 ${dashboard.is_online ? 'text-white' : 'text-white/50'}`} />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-4 text-[12px]">
                <div>
                  <p className="text-white/70 text-[11px]">Expires</p>
                  <p className="font-medium">{formatDate(dashboard.expiry_date)}</p>
                </div>
                <div className="h-6 w-px bg-white/20" />
                <div>
                  <p className="text-white/70 text-[11px]">Days Left</p>
                  <p className="font-medium">{dashboard.days_left} days</p>
                </div>
                <div className="h-6 w-px bg-white/20" />
                <div>
                  <p className="text-white/70 text-[11px]">Connection</p>
                  <p className="font-medium">{dashboard.is_online ? 'Online' : 'Offline'}</p>
                </div>
              </div>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
              {/* Service */}
              <div className="stat-card">
                <div className="flex items-center gap-2">
                  <WifiIcon className="w-4 h-4 text-[#316AC5]" />
                  <div>
                    <p className="text-[11px] text-gray-500 dark:text-[#aaa]">Service Plan</p>
                    <p className="text-[12px] font-bold text-gray-900 dark:text-[#e0e0e0]">{dashboard.service_name}</p>
                  </div>
                </div>
              </div>

              {/* Speed */}
              <div className="stat-card">
                <div className="flex items-center gap-2">
                  <SignalIcon className="w-4 h-4 text-[#4CAF50]" />
                  <div>
                    <p className="text-[11px] text-gray-500 dark:text-[#aaa]">Current Speed</p>
                    <p className="text-[12px] font-bold text-gray-900 dark:text-[#e0e0e0]">
                      {dashboard.current_download_speed}k / {dashboard.current_upload_speed}k
                    </p>
                    {dashboard.fup_level > 0 && (
                      <p className="text-[11px] text-[#FF9800]">FUP Level {dashboard.fup_level}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* IP Address */}
              <div className="stat-card">
                <div className="flex items-center gap-2">
                  <UserCircleIcon className="w-4 h-4 text-[#9C27B0]" />
                  <div>
                    <p className="text-[11px] text-gray-500 dark:text-[#aaa]">IP Address</p>
                    <p className="text-[12px] font-bold text-gray-900 dark:text-[#e0e0e0]">{dashboard.ip_address || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* MAC Address */}
              <div className="stat-card">
                <div className="flex items-center gap-2">
                  <ClockIcon className="w-4 h-4 text-[#FF9800]" />
                  <div>
                    <p className="text-[11px] text-gray-500 dark:text-[#aaa]">MAC Address</p>
                    <p className="text-[11px] font-bold text-gray-900 dark:text-[#e0e0e0]">{dashboard.mac_address || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Monthly Price */}
              {dashboard.price > 0 && (
                <div className="stat-card">
                  <div className="flex items-center gap-2">
                    <BanknotesIcon className="w-4 h-4 text-[#4CAF50]" />
                    <div>
                      <p className="text-[11px] text-gray-500 dark:text-[#aaa]">Monthly Price</p>
                      <p className="text-[12px] font-bold text-gray-900 dark:text-[#e0e0e0]">
                        ${dashboard.price.toFixed(2)}
                        {dashboard.override_price && (
                          <span className="ml-1 text-[11px] text-[#FF9800]" title="Custom price">*</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Usage Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {/* Daily Usage */}
              <div className="wb-group">
                <div className="wb-group-title flex items-center gap-1">
                  <CalendarDaysIcon className="w-4 h-4 text-[#316AC5]" />
                  Daily Usage
                </div>
                <div className="wb-group-body space-y-2">
                  <div>
                    <div className="flex justify-between text-[12px] mb-0.5">
                      <span className="text-gray-500 dark:text-[#aaa]">Download</span>
                      <span className="font-medium text-gray-900 dark:text-[#e0e0e0]">
                        {formatBytes(dashboard.daily_download_used)}
                        {dashboard.daily_quota > 0 && ` / ${formatBytes(dashboard.daily_quota)}`}
                      </span>
                    </div>
                    {dashboard.daily_quota > 0 && (
                      <div className="wb-usage-bar">
                        <div
                          className="wb-usage-bar-fill bg-[#316AC5]"
                          style={{ width: `${Math.min((dashboard.daily_download_used / dashboard.daily_quota) * 100, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex justify-between text-[12px] mb-0.5">
                      <span className="text-gray-500 dark:text-[#aaa]">Upload</span>
                      <span className="font-medium text-gray-900 dark:text-[#e0e0e0]">{formatBytes(dashboard.daily_upload_used)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Monthly Usage */}
              <div className="wb-group">
                <div className="wb-group-title flex items-center gap-1">
                  <ChartBarIcon className="w-4 h-4 text-[#4CAF50]" />
                  Monthly Usage
                </div>
                <div className="wb-group-body space-y-2">
                  <div>
                    <div className="flex justify-between text-[12px] mb-0.5">
                      <span className="text-gray-500 dark:text-[#aaa]">Download</span>
                      <span className="font-medium text-gray-900 dark:text-[#e0e0e0]">
                        {formatBytes(dashboard.monthly_download_used)}
                        {dashboard.monthly_quota > 0 && ` / ${formatBytes(dashboard.monthly_quota)}`}
                      </span>
                    </div>
                    {dashboard.monthly_quota > 0 && (
                      <div className="wb-usage-bar">
                        <div
                          className="wb-usage-bar-fill bg-[#4CAF50]"
                          style={{ width: `${Math.min((dashboard.monthly_download_used / dashboard.monthly_quota) * 100, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex justify-between text-[12px] mb-0.5">
                      <span className="text-gray-500 dark:text-[#aaa]">Upload</span>
                      <span className="font-medium text-gray-900 dark:text-[#e0e0e0]">{formatBytes(dashboard.monthly_upload_used)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Profile Info */}
            <div className="wb-group">
              <div className="wb-group-title">Profile Information</div>
              <div className="wb-group-body">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="label">Full Name</div>
                    <div className="text-[12px] text-gray-900 dark:text-[#e0e0e0]">{dashboard.full_name || '-'}</div>
                  </div>
                  <div>
                    <div className="label">Username</div>
                    <div className="text-[12px] text-gray-900 dark:text-[#e0e0e0]">{dashboard.username}</div>
                  </div>
                  <div>
                    <div className="label">Email</div>
                    <div className="text-[12px] text-gray-900 dark:text-[#e0e0e0]">{dashboard.email || '-'}</div>
                  </div>
                  <div>
                    <div className="label">Phone</div>
                    <div className="text-[12px] text-gray-900 dark:text-[#e0e0e0]">{dashboard.phone || '-'}</div>
                  </div>
                  <div className="md:col-span-2">
                    <div className="label">Address</div>
                    <div className="text-[12px] text-gray-900 dark:text-[#e0e0e0]">{dashboard.address || '-'}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sessions' && (
          <div className="wb-group">
            <div className="wb-group-title">Session History (Last 30 Days)</div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Start Time</th>
                    <th>Duration</th>
                    <th>IP Address</th>
                    <th>Download</th>
                    <th>Upload</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="text-center py-4 text-gray-500 dark:text-[#aaa]">
                        No session history found
                      </td>
                    </tr>
                  ) : (
                    sessions.map((session, idx) => (
                      <tr key={idx}>
                        <td>{session.start_time ? formatDateTime(session.start_time) : '-'}</td>
                        <td>{formatDuration(session.duration)}</td>
                        <td className="font-mono">{session.ip_address || '-'}</td>
                        <td className="text-[#316AC5]">{formatBytes(session.bytes_out)}</td>
                        <td className="text-[#4CAF50]">{formatBytes(session.bytes_in)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'usage' && (
          <div className="wb-group">
            <div className="wb-group-title">Daily Usage History</div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Download</th>
                    <th>Upload</th>
                    <th>Sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {usageHistory.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="text-center py-4 text-gray-500 dark:text-[#aaa]">
                        No usage history found
                      </td>
                    </tr>
                  ) : (
                    usageHistory.map((usage, idx) => (
                      <tr key={idx}>
                        <td className="font-medium">{usage.date}</td>
                        <td className="text-[#316AC5]">{formatBytes(usage.download)}</td>
                        <td className="text-[#4CAF50]">{formatBytes(usage.upload)}</td>
                        <td>{usage.sessions}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'tickets' && (
          <div className="space-y-3">
            {/* Header with Create Button */}
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-gray-900 dark:text-[#e0e0e0]">Support Tickets</span>
              <button
                onClick={() => setShowCreateTicket(true)}
                className="btn btn-primary flex items-center gap-1"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                New Ticket
              </button>
            </div>

            {/* Tickets List */}
            {!selectedTicket ? (
              <div className="wb-group">
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Ticket #</th>
                        <th>Subject</th>
                        <th>Status</th>
                        <th>Category</th>
                        <th>Date</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tickets.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="text-center py-4 text-gray-500 dark:text-[#aaa]">
                            No tickets found. Create your first support ticket!
                          </td>
                        </tr>
                      ) : (
                        tickets.map((ticket) => (
                          <tr key={ticket.id}>
                            <td>
                              <div className="flex items-center gap-1">
                                <span className="font-mono">{ticket.ticket_number}</span>
                                {ticket.has_admin_reply && (
                                  <span className="wb-status-dot bg-[#316AC5]" />
                                )}
                              </div>
                            </td>
                            <td>
                              <div className="flex items-center gap-1">
                                <span className="font-medium">{ticket.subject}</span>
                                {ticket.has_admin_reply && (
                                  <BellAlertIcon className="w-3.5 h-3.5 text-[#316AC5]" title="New reply from support" />
                                )}
                              </div>
                            </td>
                            <td>
                              <span className={
                                ticket.status === 'open' ? 'badge badge-success' :
                                ticket.status === 'pending' ? 'badge badge-warning' :
                                ticket.status === 'closed' ? 'badge badge-gray' :
                                'badge badge-info'
                              }>
                                {ticket.status}
                              </span>
                            </td>
                            <td className="capitalize">{ticket.category}</td>
                            <td>{formatDate(ticket.created_at)}</td>
                            <td>
                              <button
                                onClick={() => fetchTicketDetail(ticket.id)}
                                className="btn btn-sm btn-primary"
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
              <div className="wb-group">
                <div className="wb-group-title flex items-center justify-between">
                  <div>
                    <span className="font-semibold">{selectedTicket.subject}</span>
                    <span className="text-[11px] text-gray-500 dark:text-[#aaa] ml-2">{selectedTicket.ticket_number}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={
                      selectedTicket.status === 'open' ? 'badge badge-success' :
                      selectedTicket.status === 'pending' ? 'badge badge-warning' :
                      selectedTicket.status === 'closed' ? 'badge badge-gray' :
                      'badge badge-info'
                    }>
                      {selectedTicket.status}
                    </span>
                    <button
                      onClick={() => setSelectedTicket(null)}
                      className="btn btn-xs"
                    >
                      <XMarkIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Messages */}
                <div className="p-3 space-y-2 max-h-96 overflow-y-auto bg-white dark:bg-[#3a3a3a]">
                  {/* Original Message */}
                  <div className="p-2 border border-[#2196F3] bg-[#e3f2fd] dark:bg-[#1a2a4a] text-[12px]" style={{ borderRadius: '2px' }}>
                    <div className="text-[11px] text-gray-500 dark:text-[#aaa] mb-1">
                      You - {formatDateTime(selectedTicket.created_at)}
                    </div>
                    <p className="whitespace-pre-wrap text-gray-900 dark:text-[#e0e0e0]">{selectedTicket.description}</p>
                  </div>

                  {/* Replies */}
                  {selectedTicket.replies?.map((reply) => (
                    <div
                      key={reply.id}
                      className={`p-2 border text-[12px] ${reply.is_admin ? 'border-[#a0a0a0] bg-[#f0f0f0] dark:bg-[#444] dark:border-[#555]' : 'border-[#2196F3] bg-[#e3f2fd] dark:bg-[#1a2a4a]'}`}
                      style={{ borderRadius: '2px' }}
                    >
                      <div className="text-[11px] text-gray-500 dark:text-[#aaa] mb-1">
                        {reply.is_admin ? 'Support' : 'You'} - {formatDateTime(reply.created_at)}
                      </div>
                      <p className="whitespace-pre-wrap text-gray-900 dark:text-[#e0e0e0]">{reply.message}</p>
                    </div>
                  ))}
                </div>

                {/* Reply Form */}
                {selectedTicket.status !== 'closed' && (
                  <form onSubmit={handleReplyTicket} className="p-3 border-t border-[#a0a0a0] dark:border-[#555]">
                    <div className="flex gap-1">
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Type your reply..."
                        rows={2}
                        className="input flex-1 resize-none"
                      />
                      <button
                        type="submit"
                        disabled={!replyText.trim()}
                        className="btn btn-primary"
                      >
                        <PaperAirplaneIcon className="w-3.5 h-3.5" />
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
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '480px', width: '100%' }}>
              <div className="modal-header">
                <span>Create Support Ticket</span>
                <button onClick={() => setShowCreateTicket(false)} className="text-white hover:text-gray-200">
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleCreateTicket}>
                <div className="modal-body space-y-3">
                  <div>
                    <label className="label">Subject</label>
                    <input
                      type="text"
                      value={ticketForm.subject}
                      onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })}
                      className="input w-full"
                      placeholder="Brief description of your issue"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Category</label>
                    <select
                      value={ticketForm.category}
                      onChange={(e) => setTicketForm({ ...ticketForm, category: e.target.value })}
                      className="input w-full"
                    >
                      <option value="general">General</option>
                      <option value="billing">Billing</option>
                      <option value="technical">Technical</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Description</label>
                    <textarea
                      value={ticketForm.description}
                      onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })}
                      rows={4}
                      className="input w-full resize-none"
                      placeholder="Detailed description of your issue"
                      required
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    onClick={() => setShowCreateTicket(false)}
                    className="btn"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
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
