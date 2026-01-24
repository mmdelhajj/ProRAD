import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { formatDate } from '../utils/timezone'

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  refunded: 'bg-gray-100 text-gray-800'
}

export default function Invoices() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', page, status],
    queryFn: () => api.get('/invoices', { params: { page, status } }).then(res => res.data)
  })

  const [formData, setFormData] = useState({
    subscriber_id: '',
    due_date: '',
    notes: '',
    items: [{ description: '', quantity: 1, unit_price: 0 }]
  })

  const [paymentData, setPaymentData] = useState({
    amount: 0,
    method: 'cash',
    reference: '',
    notes: ''
  })

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/invoices', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['invoices'])
      setShowModal(false)
    }
  })

  const paymentMutation = useMutation({
    mutationFn: ({ id, data }) => api.post(`/invoices/${id}/payment`, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['invoices'])
      setShowPaymentModal(false)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/invoices/${id}`),
    onSuccess: () => queryClient.invalidateQueries(['invoices'])
  })

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { description: '', quantity: 1, unit_price: 0 }]
    })
  }

  const removeItem = (index) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    })
  }

  const updateItem = (index, field, value) => {
    const items = [...formData.items]
    items[index][field] = field === 'quantity' || field === 'unit_price' ? parseFloat(value) || 0 : value
    setFormData({ ...formData, items })
  }

  const calculateTotal = () => {
    return formData.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    createMutation.mutate({
      ...formData,
      subscriber_id: parseInt(formData.subscriber_id)
    })
  }

  const handlePayment = (invoice) => {
    setSelectedInvoice(invoice)
    setPaymentData({
      amount: invoice.total - invoice.amount_paid,
      method: 'cash',
      reference: '',
      notes: ''
    })
    setShowPaymentModal(true)
  }

  const submitPayment = (e) => {
    e.preventDefault()
    paymentMutation.mutate({ id: selectedInvoice.id, data: paymentData })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const invoices = data?.data || []
  const meta = data?.meta || {}

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-gray-900">Invoices</h1>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Create Invoice
        </button>
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subscriber</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paid</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {invoices.map(invoice => (
              <tr key={invoice.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {invoice.invoice_number}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {invoice.subscriber?.username || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  ${invoice.total?.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  ${invoice.amount_paid?.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full ${STATUS_COLORS[invoice.status] || 'bg-gray-100'}`}>
                    {invoice.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(invoice.due_date)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  {invoice.status !== 'completed' && (
                    <button
                      onClick={() => handlePayment(invoice)}
                      className="text-green-600 hover:text-green-900 mr-3"
                    >
                      Add Payment
                    </button>
                  )}
                  {invoice.status !== 'completed' && (
                    <button
                      onClick={() => deleteMutation.mutate(invoice.id)}
                      className="text-red-600 hover:text-red-900"
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
          <div className="px-6 py-4 bg-gray-50 flex justify-between items-center">
            <span className="text-sm text-gray-500">
              Page {page} of {meta.totalPages} ({meta.total} total)
            </span>
            <div className="space-x-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= meta.totalPages}
                className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Invoice Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Create Invoice</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Subscriber ID</label>
                  <input
                    type="number"
                    value={formData.subscriber_id}
                    onChange={(e) => setFormData({ ...formData, subscriber_id: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Due Date</label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Items</label>
                {formData.items.map((item, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateItem(index, 'description', e.target.value)}
                      className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                    <input
                      type="number"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                      className="w-20 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Price"
                      value={item.unit_price}
                      onChange={(e) => updateItem(index, 'unit_price', e.target.value)}
                      className="w-24 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                    {formData.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="px-2 text-red-600 hover:text-red-800"
                      >
                        X
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addItem}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  + Add Item
                </button>
              </div>

              <div className="text-right text-lg font-semibold">
                Total: ${calculateTotal().toFixed(2)}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  rows={3}
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  Create Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Add Payment</h2>
            <p className="text-sm text-gray-600 mb-4">
              Invoice: {selectedInvoice.invoice_number} |
              Balance: ${(selectedInvoice.total - selectedInvoice.amount_paid).toFixed(2)}
            </p>
            <form onSubmit={submitPayment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: parseFloat(e.target.value) || 0 })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Method</label>
                <select
                  value={paymentData.method}
                  onChange={(e) => setPaymentData({ ...paymentData, method: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="online">Online</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Reference</label>
                <input
                  type="text"
                  value={paymentData.reference}
                  onChange={(e) => setPaymentData({ ...paymentData, reference: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paymentMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                >
                  Add Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
