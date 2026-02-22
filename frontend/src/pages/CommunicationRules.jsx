import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'

export default function CommunicationRules() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    trigger_event: 'expiry_warning',
    channel: 'sms',
    days_before: 3,
    template: '',
    enabled: true,
    send_to_reseller: false,
    fup_levels: ['1', '2', '3'],
  })

  const { data, isLoading } = useQuery({
    queryKey: ['communication-rules'],
    queryFn: () => api.get('/communication/rules').then(res => res.data.data || [])
  })

  const { data: templates } = useQuery({
    queryKey: ['communication-templates'],
    queryFn: () => api.get('/communication/templates').then(res => res.data.data || [])
  })

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/communication/rules', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['communication-rules'])
      closeModal()
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/communication/rules/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['communication-rules'])
      closeModal()
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/communication/rules/${id}`),
    onSuccess: () => queryClient.invalidateQueries(['communication-rules'])
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }) => api.put(`/communication/rules/${id}`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries(['communication-rules'])
  })

  const triggerEvents = [
    { value: 'expiry_warning', label: 'Expiry Warning', description: 'Send X days before expiry' },
    { value: 'expired', label: 'Account Expired', description: 'When subscription expires' },
    { value: 'quota_warning', label: 'Quota Warning', description: 'When quota reaches threshold' },
    { value: 'quota_exceeded', label: 'Quota Exceeded', description: 'When quota is fully used' },
    { value: 'payment_received', label: 'Payment Received', description: 'After successful payment' },
    { value: 'account_created', label: 'Account Created', description: 'When new account is created' },
    { value: 'account_renewed', label: 'Account Renewed', description: 'When subscription is renewed' },
    { value: 'password_changed', label: 'Password Changed', description: 'When password is updated' },
    { value: 'session_started', label: 'Session Started', description: 'When user connects' },
    { value: 'fup_applied', label: 'FUP Applied', description: 'When FUP limit is reached' },
  ]

  const channels = [
    { value: 'sms', label: 'SMS' },
    { value: 'email', label: 'Email' },
    { value: 'whatsapp', label: 'WhatsApp' },
  ]

  const closeModal = () => {
    setShowModal(false)
    setEditingRule(null)
    setFormData({
      name: '',
      trigger_event: 'expiry_warning',
      channel: 'sms',
      days_before: 3,
      template: '',
      enabled: true,
      send_to_reseller: false,
      fup_levels: ['1', '2', '3'],
    })
  }

  const openEdit = (rule) => {
    setEditingRule(rule)
    setFormData({
      name: rule.name,
      trigger_event: rule.trigger_event,
      channel: rule.channel,
      days_before: rule.days_before || 0,
      template: rule.template,
      enabled: rule.enabled,
      send_to_reseller: rule.send_to_reseller || false,
      fup_levels: rule.fup_levels ? rule.fup_levels.split(',') : ['1', '2', '3'],
    })
    setShowModal(true)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const data = {
      ...formData,
      fup_levels: Array.isArray(formData.fup_levels) ? formData.fup_levels.join(',') : formData.fup_levels,
    }
    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, ...data })
    } else {
      createMutation.mutate(data)
    }
  }

  const getChannelBadge = (channel) => {
    const colors = {
      sms: 'bg-green-100 text-green-800',
      email: 'bg-blue-100 text-blue-800',
      whatsapp: 'bg-emerald-100 text-emerald-800',
    }
    return colors[channel] || 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
  }

  const getTriggerLabel = (trigger) => {
    const event = triggerEvents.find(e => e.value === trigger)
    return event ? event.label : trigger
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Communication Rules</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">Configure automated SMS, Email, and WhatsApp notifications</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Add Rule
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{(data || []).length}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Total Rules</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-green-600">
            {(data || []).filter(r => r.enabled).length}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Active Rules</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-blue-600">
            {(data || []).filter(r => r.channel === 'sms').length}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">SMS Rules</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-purple-600">
            {(data || []).filter(r => r.channel === 'email').length}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Email Rules</div>
        </div>
      </div>

      {/* Rules Table */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Trigger</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Channel</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Days Before</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {(data || []).map(rule => (
              <tr key={rule.id} className="hover:bg-gray-50 dark:bg-gray-700">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{rule.name}</div>
                  {rule.send_to_reseller && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">+ Send to Reseller</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900 dark:text-white">{getTriggerLabel(rule.trigger_event)}</div>
                  {rule.trigger_event === 'fup_applied' && rule.fup_levels && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Levels: {rule.fup_levels.split(',').map(l => `FUP ${l}`).join(', ')}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full capitalize ${getChannelBadge(rule.channel)}`}>
                    {rule.channel}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                  {rule.trigger_event === 'quota_warning'
                    ? (rule.days_before > 0 ? `${rule.days_before}%` : '-')
                    : (rule.days_before > 0 ? `${rule.days_before} days` : '-')
                  }
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <button
                    onClick={() => toggleMutation.mutate({ id: rule.id, enabled: !rule.enabled })}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                      rule.enabled ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-800 shadow transition duration-200 ${
                        rule.enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button
                    onClick={() => openEdit(rule)}
                    className="text-blue-600 hover:text-blue-900 mr-3"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Delete this rule?')) {
                        deleteMutation.mutate(rule.id)
                      }
                    }}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {(data || []).length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
            No communication rules configured. Click "Add Rule" to create one.
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={closeModal}></div>
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                {editingRule ? 'Edit Rule' : 'Add Communication Rule'}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400">Rule Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400">Trigger Event</label>
                  <select
                    value={formData.trigger_event}
                    onChange={(e) => {
                      const newTrigger = e.target.value
                      const updates = { trigger_event: newTrigger }
                      if (newTrigger === 'quota_warning') updates.days_before = 80
                      else if (newTrigger === 'expiry_warning') updates.days_before = 3
                      setFormData({ ...formData, ...updates })
                    }}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
                  >
                    {triggerEvents.map(event => (
                      <option key={event.value} value={event.value}>
                        {event.label} - {event.description}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400">Channel</label>
                  <select
                    value={formData.channel}
                    onChange={(e) => setFormData({ ...formData, channel: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
                  >
                    {channels.map(ch => (
                      <option key={ch.value} value={ch.value}>{ch.label}</option>
                    ))}
                  </select>
                </div>

                {formData.trigger_event === 'expiry_warning' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400">Days Before Expiry</label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={formData.days_before}
                      onChange={(e) => setFormData({ ...formData, days_before: parseInt(e.target.value) })}
                      className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Send notification this many days before expiry</p>
                  </div>
                )}

                {formData.trigger_event === 'quota_warning' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400">Quota Threshold (%)</label>
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={formData.days_before}
                      onChange={(e) => setFormData({ ...formData, days_before: parseInt(e.target.value) })}
                      className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Send when monthly quota usage reaches this % (e.g. 80 = notify at 80% used)</p>
                  </div>
                )}

                {formData.trigger_event === 'fup_applied' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Trigger on FUP Level
                    </label>
                    <div className="mt-2 flex space-x-6">
                      {[
                        { value: '1', label: 'FUP 1' },
                        { value: '2', label: 'FUP 2' },
                        { value: '3', label: 'FUP 3' },
                      ].map(({ value, label }) => (
                        <label key={value} className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.fup_levels.includes(value)}
                            onChange={(e) => {
                              const newLevels = e.target.checked
                                ? [...formData.fup_levels, value].sort()
                                : formData.fup_levels.filter(l => l !== value)
                              setFormData({ ...formData, fup_levels: newLevels })
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-400"
                          />
                          <span className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
                        </label>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Select which FUP levels trigger this rule. You can create separate rules for each level.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400">Message Template</label>
                  <textarea
                    value={formData.template}
                    onChange={(e) => setFormData({ ...formData, template: e.target.value })}
                    rows={4}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
                    placeholder="Use variables: {username}, {full_name}, {expiry_date}, {service_name}, {balance}"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                    Available variables: {'{username}'}, {'{full_name}'}, {'{service_name}'}, {'{balance}'}
                    {['expiry_warning', 'expired'].includes(formData.trigger_event) && <>, {'{expiry_date}'}, <strong>{'{days_before}'}</strong> (days until expiry)</>}
                    {formData.trigger_event === 'fup_applied' && <>, {'{quota_used}'}, {'{quota_total}'}, <strong>{'{fup_level}'}</strong> (1, 2, or 3)</>}
                    {formData.trigger_event === 'quota_warning' && <>, <strong>{'{quota_used}'}</strong> (GB used), <strong>{'{quota_total}'}</strong> (GB total), <strong>{'{quota_percent}'}</strong> (% used)</>}
                  </p>
                </div>

                <div className="flex items-center space-x-6">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.enabled}
                      onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-400"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400">Enabled</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.send_to_reseller}
                      onChange={(e) => setFormData({ ...formData, send_to_reseller: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-400"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400">Also notify Reseller</span>
                  </label>
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-sm text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-600 rounded-md hover:bg-gray-200 dark:bg-gray-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
                  >
                    {editingRule ? 'Update' : 'Create'} Rule
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
