import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlayIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import toast from 'react-hot-toast'

export default function BandwidthRules() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    trigger_type: 'time',
    start_time: '00:00',
    end_time: '06:00',
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    upload_multiplier: 100,
    download_multiplier: 100,
    service_ids: [],
    priority: 10,
    enabled: true,
    auto_apply: true,
  })

  const { data: rules, isLoading } = useQuery({
    queryKey: ['bandwidth-rules'],
    queryFn: () => api.get('/bandwidth/rules').then(res => res.data.data || [])
  })

  const { data: services } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.get('/services').then(res => res.data.data || [])
  })

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/bandwidth/rules', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['bandwidth-rules'])
      closeModal()
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/bandwidth/rules/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['bandwidth-rules'])
      closeModal()
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/bandwidth/rules/${id}`),
    onSuccess: () => queryClient.invalidateQueries(['bandwidth-rules'])
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }) => api.put(`/bandwidth/rules/${id}`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries(['bandwidth-rules'])
  })

  const applyNowMutation = useMutation({
    mutationFn: (id) => api.post(`/bandwidth/rules/${id}/apply`),
    onSuccess: (res) => {
      toast.success(`Rule applied to ${res.data.applied_count} subscribers`)
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to apply rule')
    }
  })

  const daysOfWeek = [
    { value: 0, label: 'Sun' },
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' },
  ]

  const closeModal = () => {
    setShowModal(false)
    setEditingRule(null)
    setFormData({
      name: '',
      trigger_type: 'time',
      start_time: '00:00',
      end_time: '06:00',
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
      upload_multiplier: 100,
      download_multiplier: 100,
      service_ids: [],
      priority: 10,
      enabled: true,
      auto_apply: false,
    })
  }

  const openEdit = (rule) => {
    setEditingRule(rule)
    setFormData({
      name: rule.name,
      trigger_type: rule.trigger_type,
      start_time: rule.start_time || '00:00',
      end_time: rule.end_time || '06:00',
      days_of_week: rule.days_of_week || [0, 1, 2, 3, 4, 5, 6],
      upload_multiplier: rule.upload_multiplier || 100,
      download_multiplier: rule.download_multiplier || 100,
      service_ids: rule.service_ids || [],
      priority: rule.priority || 10,
      enabled: rule.enabled,
      auto_apply: rule.auto_apply || false,
    })
    setShowModal(true)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, ...formData })
    } else {
      createMutation.mutate(formData)
    }
  }

  const toggleDay = (day) => {
    const days = formData.days_of_week.includes(day)
      ? formData.days_of_week.filter(d => d !== day)
      : [...formData.days_of_week, day].sort()
    setFormData({ ...formData, days_of_week: days })
  }

  const getDaysLabel = (days) => {
    if (!days || days.length === 0) return 'Never'
    if (days.length === 7) return 'Every day'
    if (JSON.stringify(days.sort()) === JSON.stringify([1, 2, 3, 4, 5])) return 'Weekdays'
    if (JSON.stringify(days.sort()) === JSON.stringify([0, 6])) return 'Weekends'
    return days.map(d => daysOfWeek.find(dw => dw.value === d)?.label).join(', ')
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
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Bandwidth Rules</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">Configure time-based bandwidth adjustments</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Add Rule
        </button>
      </div>

      {/* Info Card */}
      <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
        <h3 className="font-medium text-blue-900">Time-Based Bandwidth Rules</h3>
        <p className="text-sm text-blue-700 mt-1">
          Create rules to adjust bandwidth during specific hours (e.g., night boost). Enable Auto Apply to have rules activate automatically on schedule.
        </p>
      </div>

      {/* Rules Table */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Schedule</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Speed Adjustment</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {(rules || []).map(rule => (
              <tr key={rule.id} className="hover:bg-gray-50 dark:bg-gray-700">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{rule.name}</div>
                  {rule.service_ids?.length > 0 && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                      {rule.service_ids.length} service(s)
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                  <div>
                    <div>{rule.start_time} - {rule.end_time}</div>
                    <div className="text-xs">{getDaysLabel(rule.days_of_week)}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <div className="flex items-center space-x-2">
                    <span className={rule.upload_multiplier > 100 ? 'text-green-600' : rule.upload_multiplier < 100 ? 'text-red-600' : 'text-gray-600'}>
                      {rule.upload_multiplier > 100 ? '+' : ''}{rule.upload_multiplier - 100}% UP
                    </span>
                    <span className="text-gray-400 dark:text-gray-500 dark:text-gray-400">|</span>
                    <span className={rule.download_multiplier > 100 ? 'text-green-600' : rule.download_multiplier < 100 ? 'text-red-600' : 'text-gray-600'}>
                      {rule.download_multiplier > 100 ? '+' : ''}{rule.download_multiplier - 100}% DN
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
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
                    {rule.auto_apply && (
                      <span className="px-1.5 py-0.5 text-[10px] bg-green-100 text-green-700 rounded font-medium">AUTO</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button
                    onClick={() => applyNowMutation.mutate(rule.id)}
                    disabled={applyNowMutation.isPending}
                    className="inline-flex items-center px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded hover:bg-green-200 mr-2"
                    title="Apply Now"
                  >
                    <PlayIcon className="w-3 h-3 mr-1" />
                    Apply
                  </button>
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

        {(rules || []).length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
            No bandwidth rules configured. Click "Add Rule" to create one.
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={closeModal}></div>
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                {editingRule ? 'Edit Rule' : 'Add Bandwidth Rule'}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400">Rule Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
                    placeholder="e.g., Night Boost, FUP Limit"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400">Start Time</label>
                    <input
                      type="time"
                      value={formData.start_time}
                      onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400">End Time</label>
                    <input
                      type="time"
                      value={formData.end_time}
                      onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Days of Week</label>
                  <div className="flex flex-wrap gap-2">
                    {daysOfWeek.map(day => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleDay(day.value)}
                        className={`px-3 py-1 text-sm rounded-md ${
                          formData.days_of_week.includes(day.value)
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400">
                      Upload Speed: <span className={`font-bold ${formData.upload_multiplier > 100 ? 'text-green-600' : formData.upload_multiplier < 100 ? 'text-red-600' : 'text-gray-600'}`}>{formData.upload_multiplier}%</span>
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="300"
                      step="10"
                      value={formData.upload_multiplier}
                      onChange={(e) => setFormData({ ...formData, upload_multiplier: parseInt(e.target.value) })}
                      className="mt-2 w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-1">
                      <span>10%</span>
                      <span>50%</span>
                      <span>100%</span>
                      <span>200%</span>
                      <span>300%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400">
                      Download Speed: <span className={`font-bold ${formData.download_multiplier > 100 ? 'text-green-600' : formData.download_multiplier < 100 ? 'text-red-600' : 'text-gray-600'}`}>{formData.download_multiplier}%</span>
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="300"
                      step="10"
                      value={formData.download_multiplier}
                      onChange={(e) => setFormData({ ...formData, download_multiplier: parseInt(e.target.value) })}
                      className="mt-2 w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-1">
                      <span>10%</span>
                      <span>50%</span>
                      <span>100%</span>
                      <span>200%</span>
                      <span>300%</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Apply to Services</label>
                  <div className="max-h-32 overflow-y-auto border rounded-md p-2">
                    {(services || []).map(service => (
                      <label key={service.id} className="flex items-center py-1">
                        <input
                          type="checkbox"
                          checked={formData.service_ids.includes(service.id)}
                          onChange={(e) => {
                            const ids = e.target.checked
                              ? [...formData.service_ids, service.id]
                              : formData.service_ids.filter(id => id !== service.id)
                            setFormData({ ...formData, service_ids: ids })
                          }}
                          className="rounded border-gray-300 text-blue-600"
                        />
                        <span className="ml-2 text-sm text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400">{service.name}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">Leave empty to apply to all services</p>
                </div>

                <div className="space-y-2">
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
                      checked={formData.auto_apply}
                      onChange={(e) => setFormData({ ...formData, auto_apply: e.target.checked })}
                      className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400">Auto Apply (apply automatically on schedule)</span>
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
