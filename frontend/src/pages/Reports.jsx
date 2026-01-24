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
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
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

      {/* Subscribers Tab */}
      {activeTab === 'subscribers' && subscriberStats && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500">Total Subscribers</h3>
              <p className="text-3xl font-semibold text-gray-900">{subscriberStats.total}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500">Active</h3>
              <p className="text-3xl font-semibold text-green-600">{subscriberStats.active}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500">Expired</h3>
              <p className="text-3xl font-semibold text-red-600">{subscriberStats.expired}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500">Online Now</h3>
              <p className="text-3xl font-semibold text-blue-600">{subscriberStats.online}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500">New This Month</h3>
              <p className="text-3xl font-semibold text-gray-900">{subscriberStats.newThisMonth}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500">Expiring Soon (7 days)</h3>
              <p className="text-3xl font-semibold text-orange-600">{subscriberStats.expiringSoon}</p>
            </div>
          </div>
        </div>
      )}

      {/* Revenue Tab */}
      {activeTab === 'revenue' && (
        <div className="space-y-6">
          <div className="flex gap-2">
            {['day', 'week', 'month', 'year'].map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-md text-sm ${period === p ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          {revenueStats && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-lg shadow">
                  <h3 className="text-sm font-medium text-gray-500">Total Revenue</h3>
                  <p className="text-3xl font-semibold text-green-600">${revenueStats.totalRevenue?.toFixed(2)}</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow">
                  <h3 className="text-sm font-medium text-gray-500">Payments Count</h3>
                  <p className="text-3xl font-semibold text-gray-900">{revenueStats.paymentCount}</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow">
                  <h3 className="text-sm font-medium text-gray-500">Avg Payment</h3>
                  <p className="text-3xl font-semibold text-gray-900">
                    ${revenueStats.paymentCount ? (revenueStats.totalRevenue / revenueStats.paymentCount).toFixed(2) : '0.00'}
                  </p>
                </div>
              </div>
              {revenueStats.byMethod && (
                <div className="bg-white p-6 rounded-lg shadow">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Revenue by Method</h3>
                  <div className="space-y-3">
                    {revenueStats.byMethod.map(m => (
                      <div key={m.payment_method} className="flex justify-between items-center">
                        <span className="text-gray-600 capitalize">{m.payment_method || 'Unknown'}</span>
                        <span className="font-medium">${m.amount?.toFixed(2)} ({m.count} payments)</span>
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
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Service</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subscribers</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Revenue</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {serviceStats.map(s => (
                <tr key={s.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{s.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{s.subscriber_count}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${s.revenue?.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Resellers Tab */}
      {activeTab === 'resellers' && resellerStats && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reseller</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Subscribers</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Active</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {resellerStats.map(r => (
                <tr key={r.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{r.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${r.balance?.toFixed(2)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.subscriber_count}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.active_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Expiry Report Tab */}
      {activeTab === 'expiry' && expiryReport && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {expiryReport.total} subscribers expiring in the next 7 days
            </h3>
            {expiryReport.byDay && (
              <div className="grid grid-cols-7 gap-2">
                {expiryReport.byDay.map(d => (
                  <div key={d.day} className="text-center p-3 bg-orange-50 rounded">
                    <div className="text-lg font-semibold text-orange-600">{d.count}</div>
                    <div className="text-xs text-gray-500">Day {d.day}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {expiryReport.subscribers && expiryReport.subscribers.length > 0 && (
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Full Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Service</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expiry Date</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {expiryReport.subscribers.slice(0, 20).map(s => (
                    <tr key={s.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{s.username}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{s.full_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{s.service?.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(s.expiry_date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
