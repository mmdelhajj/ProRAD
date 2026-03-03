import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { formatDate } from '../utils/timezone'

const STATUS_BADGE = {
  pending: 'badge-warning',
  completed: 'badge-success',
  failed: 'badge-danger',
  refunded: 'badge-gray'
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
        <div className="animate-spin h-5 w-5 border-2 border-[#316AC5] border-t-transparent" style={{ borderRadius: '50%' }}></div>
      </div>
    )
  }

  const invoices = data?.data || []
  const meta = data?.meta || {}

  return (
    <div className="space-y-2" style={{ fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", fontSize: 11 }}>
      {/* Toolbar */}
      <div className="wb-toolbar justify-between">
        <span className="text-[13px] font-semibold">Invoices</span>
        <button
          onClick={() => setShowModal(true)}
          className="btn btn-primary"
        >
          Create Invoice
        </button>
      </div>

      {/* Filter */}
      <div className="wb-toolbar">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          className="input"
          style={{ width: 'auto', minWidth: 140 }}
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Subscriber</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Status</th>
              <th>Due Date</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map(invoice => (
              <tr key={invoice.id}>
                <td className="font-semibold">{invoice.invoice_number}</td>
                <td>{invoice.subscriber?.username || 'N/A'}</td>
                <td>${invoice.total?.toFixed(2)}</td>
                <td>${invoice.amount_paid?.toFixed(2)}</td>
                <td>
                  <span className={STATUS_BADGE[invoice.status] || 'badge-gray'}>
                    {invoice.status}
                  </span>
                </td>
                <td>{formatDate(invoice.due_date)}</td>
                <td style={{ textAlign: 'right' }}>
                  {invoice.status !== 'completed' && (
                    <button
                      onClick={() => handlePayment(invoice)}
                      className="btn btn-success btn-xs mr-1"
                    >
                      Add Payment
                    </button>
                  )}
                  {invoice.status !== 'completed' && (
                    <button
                      onClick={() => deleteMutation.mutate(invoice.id)}
                      className="btn btn-danger btn-xs"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="wb-statusbar">
          <span>
            Page {page} of {meta.totalPages} ({meta.total} total)
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn btn-sm"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= meta.totalPages}
              className="btn btn-sm"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Create Invoice Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal modal-lg">
            <div className="modal-header">
              <span>Create Invoice</span>
              <button onClick={() => setShowModal(false)} className="text-white hover:text-gray-200 text-[13px] leading-none">&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Subscriber ID</label>
                    <input
                      type="number"
                      value={formData.subscriber_id}
                      onChange={(e) => setFormData({ ...formData, subscriber_id: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Due Date</label>
                    <input
                      type="date"
                      value={formData.due_date}
                      onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Items</label>
                  {formData.items.map((item, index) => (
                    <div key={index} className="flex gap-1 mb-1">
                      <input
                        type="text"
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => updateItem(index, 'description', e.target.value)}
                        className="input flex-1"
                      />
                      <input
                        type="number"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                        className="input"
                        style={{ width: 60 }}
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Price"
                        value={item.unit_price}
                        onChange={(e) => updateItem(index, 'unit_price', e.target.value)}
                        className="input"
                        style={{ width: 80 }}
                      />
                      {formData.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="btn btn-danger btn-xs"
                        >
                          X
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addItem}
                    className="btn btn-sm mt-1"
                  >
                    + Add Item
                  </button>
                </div>

                <div className="text-right text-[13px] font-semibold">
                  Total: ${calculateTotal().toFixed(2)}
                </div>

                <div>
                  <label className="label">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="input"
                    rows={3}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="btn btn-primary"
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
        <div className="modal-overlay">
          <div className="modal" style={{ width: 400 }}>
            <div className="modal-header">
              <span>Add Payment</span>
              <button onClick={() => setShowPaymentModal(false)} className="text-white hover:text-gray-200 text-[13px] leading-none">&times;</button>
            </div>
            <form onSubmit={submitPayment}>
              <div className="modal-body space-y-2">
                <p className="text-[11px] text-gray-600 dark:text-gray-400">
                  Invoice: {selectedInvoice.invoice_number} |
                  Balance: ${(selectedInvoice.total - selectedInvoice.amount_paid).toFixed(2)}
                </p>
                <div>
                  <label className="label">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={paymentData.amount}
                    onChange={(e) => setPaymentData({ ...paymentData, amount: parseFloat(e.target.value) || 0 })}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="label">Method</label>
                  <select
                    value={paymentData.method}
                    onChange={(e) => setPaymentData({ ...paymentData, method: e.target.value })}
                    className="input"
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="online">Online</option>
                  </select>
                </div>
                <div>
                  <label className="label">Reference</label>
                  <input
                    type="text"
                    value={paymentData.reference}
                    onChange={(e) => setPaymentData({ ...paymentData, reference: e.target.value })}
                    className="input"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="btn"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paymentMutation.isPending}
                  className="btn btn-success"
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
