import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { collectionApi } from '../services/api'
import {
  BanknotesIcon,
  ClipboardDocumentCheckIcon,
  ClockIcon,
  CurrencyDollarIcon,
  CheckCircleIcon,
  XCircleIcon,
  MapPinIcon,
  PhoneIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function CollectorView() {
  const [statusFilter, setStatusFilter] = useState('')
  const [collectModal, setCollectModal] = useState(null)
  const [failModal, setFailModal] = useState(null)
  const queryClient = useQueryClient()

  // Dashboard stats
  const { data: dashboardData } = useQuery({
    queryKey: ['collector-dashboard'],
    queryFn: () => collectionApi.dashboard(),
    select: (res) => res.data?.data,
    refetchInterval: 30000,
  })

  // Assignments
  const { data: assignmentsData, isLoading } = useQuery({
    queryKey: ['my-assignments', statusFilter],
    queryFn: () => collectionApi.listAssignments({ status: statusFilter || undefined }),
    select: (res) => res.data?.data || [],
  })

  const dashboard = dashboardData || {}
  const assignments = assignmentsData || []

  const stats = [
    { label: 'Pending', value: dashboard.pending_count || 0, icon: ClockIcon, color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
    { label: 'Today', value: dashboard.collected_today || 0, icon: ClipboardDocumentCheckIcon, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: 'Total Collected', value: dashboard.total_collected || 0, icon: CheckCircleIcon, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
    { label: 'Total Amount', value: `$${(dashboard.total_amount || 0).toFixed(2)}`, icon: CurrencyDollarIcon, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
  ]

  const filterTabs = [
    { id: '', label: 'All' },
    { id: 'pending', label: 'Pending' },
    { id: 'collected', label: 'Collected' },
    { id: 'failed', label: 'Failed' },
  ]

  const openMap = (lat, lng) => {
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <BanknotesIcon className="h-7 w-7 text-green-600" />
          My Collections
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">View and manage your assigned collections</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className={`${stat.bg} rounded-lg p-4`}>
            <div className="flex items-center gap-3">
              <stat.icon className={`h-8 w-8 ${stat.color}`} />
              <div>
                <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {filterTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStatusFilter(tab.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              statusFilter === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Assignment Cards (mobile-friendly) */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : assignments.length === 0 ? (
        <div className="text-center py-12">
          <BanknotesIcon className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">No assignments found</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {assignments.map((a) => {
            const sub = a.subscriber_info || a.subscriber || {}
            const isPending = a.status === 'pending'
            return (
              <div
                key={a.id}
                className={`bg-white dark:bg-gray-800 rounded-lg shadow border-l-4 p-4 space-y-3 ${
                  a.status === 'pending' ? 'border-l-yellow-500' :
                  a.status === 'collected' ? 'border-l-green-500' :
                  a.status === 'failed' ? 'border-l-red-500' : 'border-l-gray-300'
                }`}
              >
                {/* Subscriber info */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white text-lg">
                      {sub.full_name || 'Unknown'}
                    </h3>
                    {sub.phone && (
                      <a href={`tel:${sub.phone}`} className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 mt-0.5">
                        <PhoneIcon className="h-3.5 w-3.5" />
                        {sub.phone}
                      </a>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    a.status === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                    a.status === 'collected' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                    a.status === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                    'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                  }`}>
                    {a.status}
                  </span>
                </div>

                {/* Address */}
                {(sub.address || sub.region || sub.building) && (
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {[sub.building, sub.address, sub.region].filter(Boolean).join(', ')}
                  </div>
                )}

                {/* Invoice / Amount */}
                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {a.invoice ? `Invoice #${a.invoice.invoice_number}` : 'Amount Due'}
                    </div>
                    <div className="text-xl font-bold text-gray-900 dark:text-white">
                      ${(a.amount || 0).toFixed(2)}
                    </div>
                  </div>
                  {a.auto_renew && (
                    <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full">
                      Auto-Renew
                    </span>
                  )}
                </div>

                {/* Notes */}
                {a.notes && (
                  <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                    {a.notes}
                  </div>
                )}

                {/* Collected at */}
                {a.collected_at && (
                  <div className="text-xs text-gray-400">
                    Collected: {new Date(a.collected_at).toLocaleString()}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 pt-1">
                  {sub.latitude && sub.longitude && sub.latitude !== 0 && (
                    <button
                      onClick={() => openMap(sub.latitude, sub.longitude)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      <MapPinIcon className="h-4 w-4" />
                      Map
                    </button>
                  )}
                  {isPending && (
                    <>
                      <button
                        onClick={() => setCollectModal(a)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700"
                      >
                        <CheckCircleIcon className="h-4 w-4" />
                        Collected
                      </button>
                      <button
                        onClick={() => setFailModal(a)}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
                      >
                        <XCircleIcon className="h-4 w-4" />
                        Failed
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Mark Collected Modal */}
      {collectModal && (
        <CollectModal
          assignment={collectModal}
          onClose={() => setCollectModal(null)}
          onSuccess={() => {
            setCollectModal(null)
            queryClient.invalidateQueries(['my-assignments'])
            queryClient.invalidateQueries(['collector-dashboard'])
          }}
        />
      )}

      {/* Mark Failed Modal */}
      {failModal && (
        <FailModal
          assignment={failModal}
          onClose={() => setFailModal(null)}
          onSuccess={() => {
            setFailModal(null)
            queryClient.invalidateQueries(['my-assignments'])
            queryClient.invalidateQueries(['collector-dashboard'])
          }}
        />
      )}
    </div>
  )
}

function CollectModal({ assignment, onClose, onSuccess }) {
  const [amount, setAmount] = useState(assignment.amount || 0)
  const [notes, setNotes] = useState('')
  const [reference, setReference] = useState('')

  const mutation = useMutation({
    mutationFn: (data) => collectionApi.markCollected(assignment.id, data),
    onSuccess: () => {
      toast.success('Payment collected successfully!')
      onSuccess()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to record collection'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <CheckCircleIcon className="h-5 w-5 text-green-600" />
            Mark as Collected
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="text-sm text-gray-600 dark:text-gray-300">
            Subscriber: <strong>{assignment.subscriber_info?.full_name || assignment.subscriber?.full_name || 'Unknown'}</strong>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount Collected</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reference (optional)</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="input w-full"
              placeholder="Receipt number..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="input w-full"
              placeholder="Additional notes..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button
            onClick={() => mutation.mutate({ amount, notes, reference })}
            disabled={mutation.isLoading || amount <= 0}
            className="btn btn-primary bg-green-600 hover:bg-green-700"
          >
            {mutation.isLoading ? 'Recording...' : 'Confirm Collection'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FailModal({ assignment, onClose, onSuccess }) {
  const [notes, setNotes] = useState('')

  const mutation = useMutation({
    mutationFn: (data) => collectionApi.markFailed(assignment.id, data),
    onSuccess: () => {
      toast.success('Assignment marked as failed')
      onSuccess()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
            Mark as Failed
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="text-sm text-gray-600 dark:text-gray-300">
            Subscriber: <strong>{assignment.subscriber_info?.full_name || assignment.subscriber?.full_name || 'Unknown'}</strong>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason / Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="input w-full"
              placeholder="Why the collection failed..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button
            onClick={() => mutation.mutate({ notes })}
            disabled={mutation.isLoading}
            className="btn bg-red-600 text-white hover:bg-red-700"
          >
            {mutation.isLoading ? 'Updating...' : 'Mark Failed'}
          </button>
        </div>
      </div>
    </div>
  )
}
