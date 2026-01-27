import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { nasApi } from '../services/api'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
  ArrowPathIcon,
  ServerIcon,
  CheckCircleIcon,
  XCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  WifiIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const nasTypes = [
  { value: 'mikrotik', label: 'Mikrotik RouterOS' },
  { value: 'cisco', label: 'Cisco' },
  { value: 'juniper', label: 'Juniper' },
  { value: 'ubiquiti', label: 'Ubiquiti' },
  { value: 'other', label: 'Other' },
]

export default function Nas() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editingNas, setEditingNas] = useState(null)
  const [showSecret, setShowSecret] = useState(false)
  const [showApiPassword, setShowApiPassword] = useState(false)
  const [availablePools, setAvailablePools] = useState([])
  const [loadingPools, setLoadingPools] = useState(false)
  const [formData, setFormData] = useState({
    ip_address: '',
    name: '',
    short_name: '',
    type: 'mikrotik',
    secret: '',
    auth_port: 1812,
    description: '',
    api_port: 8728,
    api_username: '',
    api_password: '',
    coa_port: 1700,
    is_active: true,
    subscriber_pools: '',
    allowed_realms: '',
  })

  const { data: nasList, isLoading } = useQuery({
    queryKey: ['nas'],
    queryFn: () => nasApi.list().then((r) => r.data.data),
  })

  const saveMutation = useMutation({
    mutationFn: (data) =>
      editingNas ? nasApi.update(editingNas.id, data) : nasApi.create(data),
    onSuccess: () => {
      toast.success(editingNas ? 'NAS updated' : 'NAS created')
      queryClient.invalidateQueries(['nas'])
      closeModal()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => nasApi.delete(id),
    onSuccess: () => {
      toast.success('NAS deleted')
      queryClient.invalidateQueries(['nas'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete'),
  })

  const syncMutation = useMutation({
    mutationFn: (id) => nasApi.sync(id),
    onSuccess: () => {
      toast.success('NAS sync started')
      queryClient.invalidateQueries(['nas'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to sync'),
  })

  const testMutation = useMutation({
    mutationFn: (id) => nasApi.test(id),
    onSuccess: (res) => {
      const data = res.data
      const identity = data.router_info?.identity || ''

      // Build status message
      const apiStatus = data.api_auth ? '✓ API' : '✗ API'
      const radiusStatus = data.secret_valid ? '✓ RADIUS' : '✗ RADIUS'

      if (data.api_auth && data.secret_valid) {
        // Both OK
        toast.success(`${identity ? identity + ' - ' : ''}${apiStatus} | ${radiusStatus}`)
      } else if (data.api_auth || data.secret_valid) {
        // Partial success
        toast.error(`${apiStatus} | ${radiusStatus}\n${data.api_error || ''} ${data.radius_error || ''}`.trim())
      } else if (data.is_online) {
        // Port reachable but both failed
        toast.error(`${apiStatus} | ${radiusStatus}\nAPI: ${data.api_error || 'Auth failed'}\nRADIUS: ${data.radius_error || 'Secret invalid'}`)
      } else {
        // Cannot reach router
        toast.error(`✗ Cannot reach router\n${data.api_error || 'Check IP address'}`)
      }
      queryClient.invalidateQueries(['nas'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Test failed'),
  })

  const openModal = (nas = null) => {
    if (nas) {
      setEditingNas(nas)
      setFormData({
        ip_address: nas.ip_address || '',
        name: nas.name || '',
        short_name: nas.short_name || '',
        type: nas.type || 'mikrotik',
        secret: nas.secret || '',
        auth_port: nas.auth_port || 1812,
        description: nas.description || '',
        api_port: nas.api_port || 8728,
        api_username: nas.api_username || '',
        api_password: nas.api_password || '',
        coa_port: nas.coa_port || 3799,
        is_active: nas.is_active ?? true,
        subscriber_pools: nas.subscriber_pools || '',
        allowed_realms: nas.allowed_realms || '',
      })
    } else {
      setEditingNas(null)
      setFormData({
        ip_address: '',
        name: '',
        short_name: '',
        type: 'mikrotik',
        secret: '',
        auth_port: 1812,
        description: '',
        api_port: 8728,
        api_username: '',
        api_password: '',
        coa_port: 1700,
        is_active: true,
        subscriber_pools: '',
        allowed_realms: '',
      })
    }
    setAvailablePools([])
    setShowModal(true)
  }

  const fetchPools = async () => {
    if (!editingNas) {
      toast.error('Save NAS first, then fetch pools')
      return
    }
    setLoadingPools(true)
    try {
      const res = await nasApi.getPools(editingNas.id)
      if (res.data.success) {
        setAvailablePools(res.data.data || [])
        if (res.data.data?.length === 0) {
          toast.error('No IP pools found on router')
        } else {
          toast.success(`Found ${res.data.data.length} pools`)
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to fetch pools')
    } finally {
      setLoadingPools(false)
    }
  }

  const togglePool = (poolName) => {
    const currentPools = formData.subscriber_pools ? formData.subscriber_pools.split(',').map(p => p.trim()) : []
    const isSelected = currentPools.includes(poolName)

    let newPools
    if (isSelected) {
      newPools = currentPools.filter(p => p !== poolName)
    } else {
      newPools = [...currentPools, poolName]
    }

    setFormData(prev => ({
      ...prev,
      subscriber_pools: newPools.join(',')
    }))
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingNas(null)
    setShowSecret(false)
    setShowApiPassword(false)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const data = { ...formData }
    if (!data.secret && editingNas) delete data.secret
    if (!data.api_password && editingNas) delete data.api_password
    saveMutation.mutate(data)
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const columns = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <ServerIcon className="w-5 h-5 text-gray-600 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400" />
            </div>
            <div>
              <div className="font-medium">{row.original.name || row.original.short_name}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">{row.original.description}</div>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'ip_address',
        header: 'IP Address',
        cell: ({ row }) => (
          <code className="px-2 py-1 bg-gray-100 rounded text-sm">
            {row.original.ip_address}
          </code>
        ),
      },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => (
          <span className="badge badge-info capitalize">{row.original.type}</span>
        ),
      },
      {
        accessorKey: 'auth_port',
        header: 'Ports',
        cell: ({ row }) => (
          <div className="text-sm">
            <div>RADIUS: {row.original.auth_port}</div>
            {row.original.type === 'mikrotik' && (
              <div>API: {row.original.api_port}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              {row.original.is_active ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  <span className="text-xs text-green-600">Active</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Inactive</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {row.original.is_online ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                  <span className="text-xs text-green-600">Online</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  <span className="text-xs text-red-500">Offline</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {row.original.secret ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  <span className="text-xs text-green-600">Secret ✓</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                  <span className="text-xs text-yellow-600">No Secret</span>
                </>
              )}
            </div>
            {row.original.type === 'mikrotik' && (
              <div className="flex items-center gap-2">
                {row.original.api_password ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    <span className="text-xs text-green-600">API ✓</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                    <span className="text-xs text-yellow-600">No API</span>
                  </>
                )}
              </div>
            )}
          </div>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <button
              onClick={() => testMutation.mutate(row.original.id)}
              className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded"
              title="Test Connection"
            >
              <WifiIcon className="w-4 h-4" />
            </button>
            {row.original.type === 'mikrotik' && (
              <button
                onClick={() => syncMutation.mutate(row.original.id)}
                className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                title="Sync with router"
              >
                <ArrowPathIcon className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => openModal(row.original)}
              className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded"
              title="Edit"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                if (confirm('Are you sure you want to delete this NAS?')) {
                  deleteMutation.mutate(row.original.id)
                }
              }}
              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
              title="Delete"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        ),
      },
    ],
    [deleteMutation, syncMutation, testMutation]
  )

  const table = useReactTable({
    data: nasList || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">NAS / Routers</h1>
          <p className="text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Manage RADIUS clients and routers</p>
        </div>
        <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
          <PlusIcon className="w-4 h-4" />
          Add NAS
        </button>
      </div>

      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan={columns.length} className="text-center py-8">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                    </div>
                  </td>
                </tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="text-center py-8 text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                    No NAS devices found
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 dark:bg-gray-700">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
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
            <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b">
                <h2 className="text-xl font-semibold">
                  {editingNas ? 'Edit NAS' : 'Add NAS'}
                </h2>
                <button onClick={closeModal} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="label">IP Address / Hostname</label>
                  <input
                    type="text"
                    name="ip_address"
                    value={formData.ip_address}
                    onChange={handleChange}
                    className="input"
                    placeholder="192.168.1.1"
                    required
                  />
                </div>

                <div>
                  <label className="label">Name</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="input"
                    placeholder="Main Router"
                    required
                  />
                </div>

                <div>
                  <label className="label">Short Name</label>
                  <input
                    type="text"
                    name="short_name"
                    value={formData.short_name}
                    onChange={handleChange}
                    className="input"
                    placeholder="Router1"
                  />
                </div>

                <div>
                  <label className="label">Type</label>
                  <select
                    name="type"
                    value={formData.type}
                    onChange={handleChange}
                    className="input"
                  >
                    {nasTypes.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">RADIUS Secret</label>
                  <div className="relative">
                    <input
                      type={showSecret ? 'text' : 'password'}
                      name="secret"
                      value={formData.secret}
                      onChange={handleChange}
                      className="input pr-10"
                      placeholder={editingNas ? '••••••••' : 'Enter secret'}
                      required={!editingNas}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400"
                    >
                      {showSecret ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                    </button>
                  </div>
                  {editingNas && (
                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                      <CheckCircleIcon className="w-3 h-3" />
                      Secret is set. Leave blank to keep current.
                    </p>
                  )}
                </div>

                <div>
                  <label className="label">RADIUS Port</label>
                  <input
                    type="number"
                    name="auth_port"
                    value={formData.auth_port}
                    onChange={handleChange}
                    className="input"
                  />
                </div>

                <div>
                  <label className="label">Description</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    className="input"
                    rows={2}
                  />
                </div>

                {/* Allowed Realms for RADIUS */}
                <div className="border-t pt-4">
                  <label className="label">Allowed Realms (for RADIUS)</label>
                  <input
                    type="text"
                    name="allowed_realms"
                    value={formData.allowed_realms}
                    onChange={handleChange}
                    className="input"
                    placeholder="e.g., test.mes.net.lb, other.domain.com"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">
                    Comma-separated list of realms. Users logging in as user@realm will have the realm stripped if it's in this list.
                  </p>
                </div>

                {formData.type === 'mikrotik' && (
                  <div className="border-t pt-4 space-y-4">
                    <h3 className="font-medium">Mikrotik API Settings</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="label">API Port</label>
                        <input
                          type="text"
                          name="api_port"
                          value={formData.api_port}
                          onChange={handleChange}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="label">CoA Port</label>
                        <input
                          type="text"
                          name="coa_port"
                          value={formData.coa_port}
                          onChange={handleChange}
                          className="input"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="label">API Username</label>
                      <input
                        type="text"
                        name="api_username"
                        value={formData.api_username}
                        onChange={handleChange}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">API Password</label>
                      <div className="relative">
                        <input
                          type={showApiPassword ? 'text' : 'password'}
                          name="api_password"
                          value={formData.api_password}
                          onChange={handleChange}
                          className="input pr-10"
                          placeholder={editingNas ? '••••••••' : 'Enter password'}
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiPassword(!showApiPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400"
                        >
                          {showApiPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                        </button>
                      </div>
                      {editingNas && (
                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                          <CheckCircleIcon className="w-3 h-3" />
                          Password is set. Leave blank to keep current.
                        </p>
                      )}
                    </div>

                  </div>
                )}

                <div className="border-t pt-4">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      name="is_active"
                      checked={formData.is_active}
                      onChange={handleChange}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span>Active NAS</span>
                  </label>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button type="button" onClick={closeModal} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={saveMutation.isLoading} className="btn-primary">
                    {saveMutation.isLoading ? 'Saving...' : editingNas ? 'Update' : 'Create'}
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
