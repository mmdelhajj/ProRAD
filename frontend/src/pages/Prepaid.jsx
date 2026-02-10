import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'

export default function Prepaid() {
  const queryClient = useQueryClient()
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [showRedeemModal, setShowRedeemModal] = useState(false)
  const [page, setPage] = useState(1)
  const [isUsed, setIsUsed] = useState('')
  const [batchFilter, setBatchFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['prepaid', page, isUsed, batchFilter],
    queryFn: () => api.get('/prepaid', { params: { page, is_used: isUsed, batch_id: batchFilter } }).then(res => res.data)
  })

  const { data: batches } = useQuery({
    queryKey: ['prepaid-batches'],
    queryFn: () => api.get('/prepaid/batches').then(res => res.data.data)
  })

  const { data: services } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.get('/services').then(res => res.data.data)
  })

  const [generateForm, setGenerateForm] = useState({
    service_id: '',
    count: 10,
    value: 0,
    days: 30,
    quota_refill: 0,
    prefix: '',
    code_length: 12,
    pin_length: 4
  })

  const [redeemForm, setRedeemForm] = useState({
    code: '',
    pin: '',
    subscriber_id: ''
  })

  const generateMutation = useMutation({
    mutationFn: (data) => api.post('/prepaid/generate', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['prepaid'])
      queryClient.invalidateQueries(['prepaid-batches'])
      setShowGenerateModal(false)
    }
  })

  const redeemMutation = useMutation({
    mutationFn: (data) => api.post('/prepaid/use', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['prepaid'])
      setShowRedeemModal(false)
      alert('Card redeemed successfully!')
    },
    onError: (error) => {
      alert(error.response?.data?.message || 'Failed to redeem card')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/prepaid/${id}`),
    onSuccess: () => queryClient.invalidateQueries(['prepaid'])
  })

  const deleteBatchMutation = useMutation({
    mutationFn: (batchId) => api.delete(`/prepaid/batch/${batchId}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['prepaid'])
      queryClient.invalidateQueries(['prepaid-batches'])
    }
  })

  const handleGenerate = (e) => {
    e.preventDefault()
    generateMutation.mutate({
      ...generateForm,
      service_id: parseInt(generateForm.service_id) || 0
    })
  }

  const handleRedeem = (e) => {
    e.preventDefault()
    redeemMutation.mutate({
      ...redeemForm,
      subscriber_id: parseInt(redeemForm.subscriber_id)
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const cards = data?.data || []
  const meta = data?.meta || {}

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Prepaid Cards</h1>
        <div className="space-x-2">
          <button
            onClick={() => setShowRedeemModal(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Redeem Card
          </button>
          <button
            onClick={() => setShowGenerateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Generate Cards
          </button>
        </div>
      </div>

      {/* Batches Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {(batches || []).slice(0, 4).map(batch => (
          <div key={batch.batch_id} className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">{batch.batch_id}</h3>
            <div className="mt-2 flex justify-between">
              <span className="text-2xl font-semibold text-green-600 dark:text-green-400">{batch.active}</span>
              <span className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">/ {batch.total} total</span>
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Used: {batch.used}</span>
              {batch.active > 0 && (
                <button
                  onClick={() => {
                    if (confirm(`Delete all ${batch.active} unused cards from ${batch.batch_id}?`)) {
                      deleteBatchMutation.mutate(batch.batch_id)
                    }
                  }}
                  className="text-red-600 hover:text-red-800"
                >
                  Delete Unused
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow flex gap-4">
        <select
          value={isUsed}
          onChange={(e) => { setIsUsed(e.target.value); setPage(1) }}
          className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
        >
          <option value="">All Cards</option>
          <option value="false">Available</option>
          <option value="true">Used</option>
        </select>
        <select
          value={batchFilter}
          onChange={(e) => { setBatchFilter(e.target.value); setPage(1) }}
          className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
        >
          <option value="">All Batches</option>
          {(batches || []).map(b => (
            <option key={b.batch_id} value={b.batch_id}>{b.batch_id}</option>
          ))}
        </select>
      </div>

      {/* Cards Table */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Code</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">PIN</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Value</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Days</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Service</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Batch</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {cards.map(card => (
              <tr key={card.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono dark:text-gray-200">{card.code}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono dark:text-gray-200">{card.pin}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm dark:text-gray-200">${card.value?.toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm dark:text-gray-200">{card.days}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm dark:text-gray-200">{card.service?.name || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full ${card.is_used ? 'bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300' : 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300'}`}>
                    {card.is_used ? 'Used' : 'Available'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">{card.batch_id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                  {!card.is_used && (
                    <button
                      onClick={() => deleteMutation.mutate(card.id)}
                      className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {meta.totalPages > 1 && (
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 flex justify-between items-center">
            <span className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Page {page} of {meta.totalPages}</span>
            <div className="space-x-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 bg-gray-200 dark:bg-gray-600 dark:text-white rounded disabled:opacity-50">Previous</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= meta.totalPages} className="px-3 py-1 bg-gray-200 dark:bg-gray-600 dark:text-white rounded disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Generate Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4 dark:text-white">Generate Prepaid Cards</h2>
            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400">Count</label>
                  <input
                    type="number"
                    value={generateForm.count}
                    onChange={(e) => setGenerateForm({ ...generateForm, count: parseInt(e.target.value) || 0 })}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
                    min="1" max="1000" required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400">Days</label>
                  <input
                    type="number"
                    value={generateForm.days}
                    onChange={(e) => setGenerateForm({ ...generateForm, days: parseInt(e.target.value) || 0 })}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400">Service</label>
                <select
                  value={generateForm.service_id}
                  onChange={(e) => setGenerateForm({ ...generateForm, service_id: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
                >
                  <option value="">No service change</option>
                  {(services || []).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400">Prefix (optional)</label>
                <input
                  type="text"
                  value={generateForm.prefix}
                  onChange={(e) => setGenerateForm({ ...generateForm, prefix: e.target.value.toUpperCase() })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
                  maxLength="6"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={() => setShowGenerateModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600">Cancel</button>
                <button type="submit" disabled={generateMutation.isPending} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
                  Generate {generateForm.count} Cards
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Redeem Modal */}
      {showRedeemModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4 dark:text-white">Redeem Prepaid Card</h2>
            <form onSubmit={handleRedeem} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400">Card Code</label>
                <input
                  type="text"
                  value={redeemForm.code}
                  onChange={(e) => setRedeemForm({ ...redeemForm, code: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400">PIN</label>
                <input
                  type="text"
                  value={redeemForm.pin}
                  onChange={(e) => setRedeemForm({ ...redeemForm, pin: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400">Subscriber ID</label>
                <input
                  type="number"
                  value={redeemForm.subscriber_id}
                  onChange={(e) => setRedeemForm({ ...redeemForm, subscriber_id: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
                  required
                />
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={() => setShowRedeemModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600">Cancel</button>
                <button type="submit" disabled={redeemMutation.isPending} className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700">Redeem</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
