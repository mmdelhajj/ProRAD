import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { formatDate } from '../utils/timezone'

export default function Reports() {
  const [activeTab, setActiveTab] = useState('subscribers')
  const [period, setPeriod] = useState('month')

  const { data: subscriberStats } = useQuery({
    queryKey: ['reports', 'subscribers'],
    queryFn: () => api.get('/reports/subscribers').then(res => res.data.data)
  })

  const { data: revenueStats } = useQuery({
    queryKey: ['reports', 'revenue', period],
    queryFn: () => api.get('/reports/revenue', { params: { period } }).then(res => res.data.data)
  })

  const { data: serviceStats } = useQuery({
    queryKey: ['reports', 'services'],
    queryFn: () => api.get('/reports/services').then(res => res.data.data)
  })

  const { data: resellerStats } = useQuery({
    queryKey: ['reports', 'resellers'],
    queryFn: () => api.get('/reports/resellers').then(res => res.data.data)
  })

  const { data: expiryReport } = useQuery({
    queryKey: ['reports', 'expiry'],
    queryFn: () => api.get('/reports/expiry', { params: { days: 7 } }).then(res => res.data.data)
  })

  const tabs = [
    { id: 'subscribers', label: 'Subscribers' },
    { id: 'revenue', label: 'Revenue' },
    { id: 'services', label: 'Services' },
    { id: 'resellers', label: 'Resellers' },
    { id: 'expiry', label: 'Expiry Report' }
  ]

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div style={{ fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", fontSize: 11 }}>
      <div className="wb-toolbar mb-2">
        <span className="text-[13px] font-semibold">Reports</span>
      </div>

      {/* WinBox Tabs */}
      <div className="flex items-end gap-0 mb-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={
              tab.id === activeTab
                ? 'wb-tab active'
                : 'wb-tab'
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content area */}
      <div className="border border-[#a0a0a0] dark:border-[#555] bg-white dark:bg-[#2b2b2b] p-3" style={{ borderRadius: '0 2px 2px 2px' }}>

        {/* Subscribers Tab */}
        {activeTab === 'subscribers' && subscriberStats && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="wb-group">
                <div className="wb-group-title">Total Subscribers</div>
                <div className="wb-group-body">
                  <div className="text-[20px] font-bold text-gray-900 dark:text-[#e0e0e0]">{subscriberStats.total}</div>
                </div>
              </div>
              <div className="wb-group">
                <div className="wb-group-title">Active</div>
                <div className="wb-group-body">
                  <div className="text-[20px] font-bold text-[#4CAF50]">{subscriberStats.active}</div>
                </div>
              </div>
              <div className="wb-group">
                <div className="wb-group-title">Expired</div>
                <div className="wb-group-body">
                  <div className="text-[20px] font-bold text-[#f44336]">{subscriberStats.expired}</div>
                </div>
              </div>
              <div className="wb-group">
                <div className="wb-group-title">Online Now</div>
                <div className="wb-group-body">
                  <div className="text-[20px] font-bold text-[#2196F3]">{subscriberStats.online}</div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="wb-group">
                <div className="wb-group-title">New This Month</div>
                <div className="wb-group-body">
                  <div className="text-[20px] font-bold text-gray-900 dark:text-[#e0e0e0]">{subscriberStats.newThisMonth}</div>
                </div>
              </div>
              <div className="wb-group">
                <div className="wb-group-title">Expiring Soon (7 days)</div>
                <div className="wb-group-body">
                  <div className="text-[20px] font-bold text-[#FF9800]">{subscriberStats.expiringSoon}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Revenue Tab */}
        {activeTab === 'revenue' && (
          <div className="space-y-3">
            <div className="flex gap-1">
              {['day', 'week', 'month', 'year'].map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={
                    period === p
                      ? 'btn btn-primary btn-sm'
                      : 'btn btn-sm'
                  }
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
            {revenueStats && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="wb-group">
                    <div className="wb-group-title">Total Revenue</div>
                    <div className="wb-group-body">
                      <div className="text-[20px] font-bold text-[#4CAF50]">${revenueStats.totalRevenue?.toFixed(2)}</div>
                    </div>
                  </div>
                  <div className="wb-group">
                    <div className="wb-group-title">Payments Count</div>
                    <div className="wb-group-body">
                      <div className="text-[20px] font-bold text-gray-900 dark:text-[#e0e0e0]">{revenueStats.paymentCount}</div>
                    </div>
                  </div>
                  <div className="wb-group">
                    <div className="wb-group-title">Avg Payment</div>
                    <div className="wb-group-body">
                      <div className="text-[20px] font-bold text-gray-900 dark:text-[#e0e0e0]">
                        ${revenueStats.paymentCount ? (revenueStats.totalRevenue / revenueStats.paymentCount).toFixed(2) : '0.00'}
                      </div>
                    </div>
                  </div>
                </div>
                {revenueStats.byMethod && (
                  <div className="wb-group">
                    <div className="wb-group-title">Revenue by Method</div>
                    <div className="wb-group-body space-y-1">
                      {revenueStats.byMethod.map(m => (
                        <div key={m.payment_method} className="flex justify-between items-center text-[12px]">
                          <span className="text-gray-700 dark:text-[#ccc] capitalize">{m.payment_method || 'Unknown'}</span>
                          <span className="font-semibold text-gray-900 dark:text-[#e0e0e0]">${m.amount?.toFixed(2)} ({m.count} payments)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Services Tab */}
        {activeTab === 'services' && serviceStats && (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Subscribers</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {serviceStats.map(s => (
                  <tr key={s.id}>
                    <td className="font-semibold">{s.name}</td>
                    <td>{s.subscriber_count}</td>
                    <td>${s.revenue?.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Resellers Tab */}
        {activeTab === 'resellers' && resellerStats && (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Reseller</th>
                  <th>Balance</th>
                  <th>Total Subscribers</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {resellerStats.map(r => (
                  <tr key={r.id}>
                    <td className="font-semibold">{r.name}</td>
                    <td>${r.balance?.toFixed(2)}</td>
                    <td>{r.subscriber_count}</td>
                    <td>{r.active_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Expiry Report Tab */}
        {activeTab === 'expiry' && expiryReport && (
          <div className="space-y-3">
            <div className="wb-group">
              <div className="wb-group-title">
                {expiryReport.total} subscribers expiring in the next 7 days
              </div>
              <div className="wb-group-body">
                {expiryReport.byDay && (
                  <div className="grid grid-cols-7 gap-1">
                    {expiryReport.byDay.map(d => (
                      <div key={d.day} className="text-center border border-[#ccc] dark:border-[#555] p-2 bg-[#fff8f0] dark:bg-[#3a3020]" style={{ borderRadius: '2px' }}>
                        <div className="text-[16px] font-bold text-[#FF9800]">{d.count}</div>
                        <div className="text-[11px] text-gray-600 dark:text-[#aaa]">Day {d.day}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {expiryReport.subscribers && expiryReport.subscribers.length > 0 && (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Full Name</th>
                      <th>Service</th>
                      <th>Expiry Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiryReport.subscribers.slice(0, 20).map(s => (
                      <tr key={s.id}>
                        <td className="font-semibold">{s.username}</td>
                        <td>{s.full_name}</td>
                        <td>{s.service?.name}</td>
                        <td>{formatDate(s.expiry_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
