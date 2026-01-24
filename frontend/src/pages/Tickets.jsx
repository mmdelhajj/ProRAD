import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { formatDate, formatDateTime } from '../utils/timezone'
import {
  PlusIcon,
  TicketIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  XMarkIcon,
  BellAlertIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

const priorityColors = {
  low: 'bg-gray-100 text-gray-800',
  normal: 'bg-blue-100 text-blue-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800',
}

const statusColors = {
  open: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  resolved: 'bg-purple-100 text-purple-800',
  closed: 'bg-gray-100 text-gray-800',
}

const statusIcons = {
  open: ExclamationCircleIcon,
  pending: ClockIcon,
  in_progress: ClockIcon,
  resolved: CheckCircleIcon,
  closed: CheckCircleIcon,
}

export default function Tickets() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    priority: 'normal',
    category: 'general',
  })
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
  })

  // Fetch tickets
  const { data: ticketsData, isLoading } = useQuery({
    queryKey: ['tickets', filters],
    queryFn: () => api.get('/tickets', { params: filters }).then(res => res.data),
  })

  // Fetch stats
  const { data: statsData } = useQuery({
    queryKey: ['ticket-stats'],
    queryFn: () => api.get('/tickets/stats').then(res => res.data.data),
  })

  // Create ticket
  const createMutation = useMutation({
    mutationFn: (data) => api.post('/tickets', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['tickets'])
      queryClient.invalidateQueries(['ticket-stats'])
      setShowModal(false)
      setFormData({ subject: '', description: '', priority: 'normal', category: 'general' })
    },
  })

  // Update ticket
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/tickets/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['tickets'])
      queryClient.invalidateQueries(['ticket-stats'])
    },
  })

  // Add reply
  const replyMutation = useMutation({
    mutationFn: ({ id, message }) => api.post(`/tickets/${id}/reply`, { message }),
    onSuccess: () => {
      queryClient.invalidateQueries(['tickets'])
      setReplyText('')
      // Refresh ticket detail
      if (selectedTicket) {
        api.get(`/tickets/${selectedTicket.id}`).then(res => {
          setSelectedTicket(res.data.data)
        })
      }
    },
  })

  const handleViewTicket = async (ticket) => {
    const res = await api.get(`/tickets/${ticket.id}`)
    setSelectedTicket(res.data.data)
    setShowDetailModal(true)
  }

  const stats = statsData || { open: 0, pending: 0, closed: 0, total: 0 }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support Tickets</h1>
          <p className="text-gray-500">Manage support tickets and customer inquiries</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <PlusIcon className="w-5 h-5 mr-2" />
          New Ticket
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4 border">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <ExclamationCircleIcon className="w-6 h-6 text-green-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-gray-500">Open</p>
              <p className="text-xl font-bold text-green-600">{stats.open}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <ClockIcon className="w-6 h-6 text-yellow-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-xl font-bold text-yellow-600">{stats.pending}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border">
          <div className="flex items-center">
            <div className="p-2 bg-gray-100 rounded-lg">
              <CheckCircleIcon className="w-6 h-6 text-gray-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-gray-500">Closed</p>
              <p className="text-xl font-bold text-gray-600">{stats.closed}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <TicketIcon className="w-6 h-6 text-blue-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-gray-500">Total</p>
              <p className="text-xl font-bold">{stats.total}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4">
        <div className="flex gap-4">
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All Status</option>
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <select
            value={filters.priority}
            onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All Priority</option>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </div>

      {/* Tickets List */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ticket</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subject</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">Loading...</td>
              </tr>
            ) : ticketsData?.data?.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No tickets found</td>
              </tr>
            ) : (
              ticketsData?.data?.map((ticket) => {
                const StatusIcon = statusIcons[ticket.status] || ExclamationCircleIcon
                return (
                  <tr key={ticket.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-gray-600">{ticket.ticket_number}</span>
                        {ticket.has_customer_reply && (
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="font-medium">{ticket.subject}</div>
                        {ticket.has_customer_reply && (
                          <BellAlertIcon className="w-4 h-4 text-red-500" title="New customer reply" />
                        )}
                      </div>
                      {ticket.subscriber && (
                        <div className="text-xs text-gray-500">{ticket.subscriber.username}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx(
                        'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                        statusColors[ticket.status]
                      )}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {ticket.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx(
                        'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                        priorityColors[ticket.priority]
                      )}>
                        {ticket.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{ticket.category}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDate(ticket.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleViewTicket(ticket)}
                        className="text-primary-600 hover:text-primary-800 text-sm font-medium"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Create New Ticket</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="Brief description of the issue"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="Detailed description of the issue"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="general">General</option>
                    <option value="billing">Billing</option>
                    <option value="technical">Technical</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-700 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate(formData)}
                disabled={createMutation.isPending || !formData.subject || !formData.description}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Ticket'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="text-lg font-semibold">{selectedTicket.subject}</h3>
                <p className="text-sm text-gray-500">{selectedTicket.ticket_number}</p>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Status and Actions */}
              <div className="flex items-center gap-2">
                <span className={clsx(
                  'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                  statusColors[selectedTicket.status]
                )}>
                  {selectedTicket.status}
                </span>
                <span className={clsx(
                  'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                  priorityColors[selectedTicket.priority]
                )}>
                  {selectedTicket.priority}
                </span>
                <div className="flex-1" />
                <select
                  value={selectedTicket.status}
                  onChange={(e) => {
                    updateMutation.mutate({ id: selectedTicket.id, data: { status: e.target.value } })
                    setSelectedTicket({ ...selectedTicket, status: e.target.value })
                  }}
                  className="px-2 py-1 text-sm border rounded"
                >
                  <option value="open">Open</option>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              {/* Original Description */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-2">
                  Created on {formatDateTime(selectedTicket.created_at)}
                </div>
                <p className="whitespace-pre-wrap">{selectedTicket.description}</p>
              </div>

              {/* Replies */}
              {selectedTicket.replies?.map((reply) => (
                <div key={reply.id} className={clsx(
                  'rounded-lg p-4',
                  reply.is_internal ? 'bg-yellow-50 border border-yellow-200' : 'bg-blue-50'
                )}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium text-sm">{reply.user?.username || 'User'}</span>
                    {reply.is_internal && (
                      <span className="text-xs bg-yellow-200 text-yellow-800 px-1 rounded">Internal</span>
                    )}
                    <span className="text-xs text-gray-500">
                      {formatDateTime(reply.created_at)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{reply.message}</p>
                </div>
              ))}
            </div>

            {/* Reply Form */}
            <div className="p-4 border-t">
              <div className="flex gap-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={2}
                  className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="Type your reply..."
                />
                <button
                  onClick={() => replyMutation.mutate({ id: selectedTicket.id, message: replyText })}
                  disabled={replyMutation.isPending || !replyText}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  <ChatBubbleLeftRightIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
