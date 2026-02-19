import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cdnApi, nasApi } from '../services/api'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
  ArrowPathIcon,
  BoltIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const DIRECTIONS = [
  { value: 'src', label: 'Source Port Only (src-port)' },
  { value: 'dst', label: 'Destination Port Only (dst-port)' },
  { value: 'both', label: 'Both (src-port + dst-port)' },
]

const defaultForm = {
  name: '',
  port: '',
  direction: 'both',
  speed_mbps: 5,
  nas_id: null,
  is_active: true,
}

export default function CDNPortRules() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [formData, setFormData] = useState(defaultForm)

  const { data: rules, isLoading } = useQuery({
    queryKey: ['cdn-port-rules'],
    queryFn: () => cdnApi.listPortRules().then((r) => r.data.data),
  })

  const { data: nasList } = useQuery({
    queryKey: ['nas'],
    queryFn: () => nasApi.list().then((r) => r.data.data),
  })

  const saveMutation = useMutation({
    mutationFn: (data) =>
      editingRule ? cdnApi.updatePortRule(editingRule.id, data) : cdnApi.createPortRule(data),
    onSuccess: () => {
      toast.success(editingRule ? 'Port rule updated' : 'Port rule created')
      queryClient.invalidateQueries({ queryKey: ['cdn-port-rules'] })
      closeModal()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => cdnApi.deletePortRule(id),
    onSuccess: () => {
      toast.success('Port rule deleted')
      queryClient.invalidateQueries({ queryKey: ['cdn-port-rules'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete'),
  })

  const syncMutation = useMutation({
    mutationFn: (id) => cdnApi.syncPortRule(id),
    onSuccess: (res) => toast.success(res.data?.message || 'Syncing to MikroTik...'),
    onError: (err) => toast.error(err.response?.data?.message || 'Sync failed'),
  })

  const syncAllMutation = useMutation({
    mutationFn: () => cdnApi.syncAllPortRules(),
    onSuccess: (res) => toast.success(res.data?.message || 'Syncing all to MikroTik...'),
    onError: (err) => toast.error(err.response?.data?.message || 'Sync failed'),
  })

  const openModal = (rule = null) => {
    if (rule) {
      setEditingRule(rule)
      setFormData({
        name: rule.name || '',
        port: rule.port || '',
        direction: rule.direction || 'both',
        speed_mbps: rule.speed_mbps || 5,
        nas_id: rule.nas_id || null,
        is_active: rule.is_active ?? true,
      })
    } else {
      setEditingRule(null)
      setFormData(defaultForm)
    }
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingRule(null)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    saveMutation.mutate({
      ...formData,
      speed_mbps: parseInt(formData.speed_mbps) || 5,
      nas_id: formData.nas_id ? parseInt(formData.nas_id) : null,
    })
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const directionLabel = (d) => {
    if (d === 'src') return 'src-port'
    if (d === 'dst') return 'dst-port'
    return 'src + dst'
  }

  const directionColor = (d) => {
    if (d === 'src') return 'bg-blue-100 text-blue-800'
    if (d === 'dst') return 'bg-purple-100 text-purple-800'
    return 'bg-green-100 text-green-800'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">CDN Port Rules</h1>
          <p className="text-gray-500 dark:text-gray-400">Port-based PCQ speed rules applied on MikroTik</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => syncAllMutation.mutate()}
            disabled={syncAllMutation.isPending}
            className="btn-secondary flex items-center gap-2"
          >
            <ArrowPathIcon className={clsx('w-4 h-4', syncAllMutation.isPending && 'animate-spin')} />
            {syncAllMutation.isPending ? 'Syncing...' : 'Sync All to MikroTik'}
          </button>
          <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
            <PlusIcon className="w-4 h-4" />
            Add Port Rule
          </button>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 rounded-lg p-4">
        <div className="flex gap-3">
          <BoltIcon className="w-6 h-6 text-blue-500 flex-shrink-0" />
          <div>
            <h3 className="font-medium text-blue-900 dark:text-blue-200">Port-Based Speed Control</h3>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
              Create PCQ speed rules based on TCP port numbers. Each rule creates a queue type, mangle rules
              (src-port, dst-port, or both), and a simple queue on MikroTik. No IP subnets needed — rules match by port only.
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 font-mono">
              Example: Port 8080 → mark-packet PORT-SP → PCQ queue 5Mbps
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Port</th>
                <th>Direction</th>
                <th>Speed</th>
                <th>NAS</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                    </div>
                  </td>
                </tr>
              ) : !rules || rules.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No port rules found. Click "Add Port Rule" to create one.
                  </td>
                </tr>
              ) : (
                rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-orange-100 rounded-lg">
                          <BoltIcon className="w-4 h-4 text-orange-600" />
                        </div>
                        <span className="font-semibold text-gray-900 dark:text-white">{rule.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className="font-mono text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                        :{rule.port}
                      </span>
                    </td>
                    <td>
                      <span className={clsx('text-xs font-medium px-2 py-1 rounded-full', directionColor(rule.direction))}>
                        {directionLabel(rule.direction)}
                      </span>
                    </td>
                    <td>
                      <span className="font-semibold text-gray-900 dark:text-white">{rule.speed_mbps} Mbps</span>
                    </td>
                    <td>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {rule.nas_id
                          ? nasList?.find((n) => n.id === rule.nas_id)?.name || `NAS #${rule.nas_id}`
                          : 'All NAS'}
                      </span>
                    </td>
                    <td>
                      <span className={clsx('badge', rule.is_active ? 'badge-success' : 'badge-gray')}>
                        {rule.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => syncMutation.mutate(rule.id)}
                          disabled={!rule.is_active || syncMutation.isPending}
                          className={clsx(
                            'p-1.5 rounded',
                            rule.is_active
                              ? 'text-gray-500 hover:text-green-600 hover:bg-green-50'
                              : 'text-gray-300 cursor-not-allowed'
                          )}
                          title={rule.is_active ? 'Sync to MikroTik' : 'Rule is inactive'}
                        >
                          <ArrowPathIcon className={clsx('w-4 h-4', syncMutation.isPending && 'animate-spin')} />
                        </button>
                        <button
                          onClick={() => openModal(rule)}
                          className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded"
                          title="Edit"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Delete this port rule?')) deleteMutation.mutate(rule.id)
                          }}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                          title="Delete"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black bg-opacity-50" onClick={closeModal} />
            <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
              <div className="flex items-center justify-between p-6 border-b dark:border-gray-700">
                <h2 className="text-xl font-semibold dark:text-white">
                  {editingRule ? 'Edit Port Rule' : 'Add Port Rule'}
                </h2>
                <button onClick={closeModal} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="label">Rule Name</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="input"
                    placeholder="e.g. SP, YouTube, Cache"
                    required
                  />
                </div>

                <div>
                  <label className="label">Port</label>
                  <input
                    type="text"
                    name="port"
                    value={formData.port}
                    onChange={handleChange}
                    className="input font-mono"
                    placeholder="e.g. 8080"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">TCP port number to match</p>
                </div>

                <div>
                  <label className="label">Direction</label>
                  <select
                    name="direction"
                    value={formData.direction}
                    onChange={handleChange}
                    className="input"
                  >
                    {DIRECTIONS.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.direction === 'src' && 'Generates: src-port mangle rule only'}
                    {formData.direction === 'dst' && 'Generates: dst-port mangle rule only'}
                    {formData.direction === 'both' && 'Generates: src-port + dst-port mangle rules'}
                  </p>
                </div>

                <div>
                  <label className="label">Speed Limit (Mbps)</label>
                  <input
                    type="number"
                    name="speed_mbps"
                    value={formData.speed_mbps}
                    onChange={handleChange}
                    className="input"
                    min="1"
                    required
                  />
                </div>

                <div>
                  <label className="label">Apply to NAS</label>
                  <select
                    name="nas_id"
                    value={formData.nas_id || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, nas_id: e.target.value || null }))}
                    className="input"
                  >
                    <option value="">All NAS</option>
                    {nasList?.filter((n) => n.is_active).map((nas) => (
                      <option key={nas.id} value={nas.id}>{nas.name} ({nas.ip_address})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      name="is_active"
                      checked={formData.is_active}
                      onChange={handleChange}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="dark:text-white">Active</span>
                  </label>
                </div>

                {/* Preview */}
                {formData.name && formData.port && (
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 font-mono text-xs text-gray-600 dark:text-gray-300 space-y-1">
                    <div className="text-gray-400 mb-1">MikroTik preview:</div>
                    <div>queue type: PORT-{formData.name}-{formData.speed_mbps} ({formData.speed_mbps}M PCQ)</div>
                    {(formData.direction === 'src' || formData.direction === 'both') && (
                      <div>mangle: chain=forward protocol=tcp src-port={formData.port} mark=PORT-{formData.name}</div>
                    )}
                    {(formData.direction === 'dst' || formData.direction === 'both') && (
                      <div>mangle: chain=forward protocol=tcp dst-port={formData.port} mark=PORT-{formData.name}</div>
                    )}
                    <div>queue: PORT-{formData.name}-{formData.speed_mbps}M (packet-mark=PORT-{formData.name})</div>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-700">
                  <button type="button" onClick={closeModal} className="btn-secondary">Cancel</button>
                  <button type="submit" disabled={saveMutation.isPending} className="btn-primary">
                    {saveMutation.isPending ? 'Saving...' : editingRule ? 'Update' : 'Create'}
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
