import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
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
  WrenchScrewdriverIcon,
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
      const apiStatus = data.api_auth ? '+ API' : '- API'
      const radiusStatus = data.secret_valid ? '+ RADIUS' : '- RADIUS'

      if (data.api_auth && data.secret_valid) {
        toast.success(`${identity ? identity + ' - ' : ''}${apiStatus} | ${radiusStatus}`)
      } else if (data.api_auth || data.secret_valid) {
        toast.error(`${apiStatus} | ${radiusStatus}\n${data.api_error || ''} ${data.radius_error || ''}`.trim())
      } else if (data.is_online) {
        toast.error(`${apiStatus} | ${radiusStatus}\nAPI: ${data.api_error || 'Auth failed'}\nRADIUS: ${data.radius_error || 'Secret invalid'}`)
      } else {
        toast.error(`Cannot reach router\n${data.api_error || 'Check IP address'}`)
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
          <div className="flex items-center gap-1.5">
            <ServerIcon className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
            <div>
              <div className="text-[11px] font-medium text-gray-900 dark:text-white">{row.original.name || row.original.short_name}</div>
              {row.original.description && <div className="text-[10px] text-gray-500 dark:text-gray-400">{row.original.description}</div>}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'ip_address',
        header: 'IP Address',
        cell: ({ row }) => (
          <code className="text-[11px] text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 px-1 py-0.5 border border-[#a0a0a0] dark:border-gray-600" style={{ borderRadius: '2px' }}>
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
          <div className="text-[11px] text-gray-900 dark:text-gray-100">
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
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <span className={`wb-status-dot ${row.original.is_active ? 'bg-green-500' : 'bg-gray-400'}`}></span>
              <span className="text-[11px]">{row.original.is_active ? 'Active' : 'Inactive'}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className={`wb-status-dot ${row.original.is_online ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span className="text-[11px]">{row.original.is_online ? 'Online' : 'Offline'}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className={`wb-status-dot ${row.original.has_secret ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
              <span className="text-[11px]">{row.original.has_secret ? 'Secret OK' : 'No Secret'}</span>
            </div>
            {row.original.type === 'mikrotik' && (
              <div className="flex items-center gap-1">
                <span className={`wb-status-dot ${row.original.has_api_password ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                <span className="text-[11px]">{row.original.has_api_password ? 'API OK' : 'No API'}</span>
              </div>
            )}
          </div>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <button
              onClick={() => testMutation.mutate(row.original.id)}
              className="btn-xs btn-ghost"
              title="Test Connection"
            >
              <WifiIcon className="w-3.5 h-3.5" />
            </button>
            {row.original.type === 'mikrotik' && (
              <button
                onClick={() => syncMutation.mutate(row.original.id)}
                className="btn-xs btn-ghost"
                title="Sync with router"
              >
                <ArrowPathIcon className="w-3.5 h-3.5" />
              </button>
            )}
            <Link
              to={`/diagnostic-tools?nas_id=${row.original.id}`}
              className="btn-xs btn-ghost inline-flex"
              title="Diagnostic Tools"
            >
              <WrenchScrewdriverIcon className="w-3.5 h-3.5" />
            </Link>
            <button
              onClick={() => openModal(row.original)}
              className="btn-xs btn-ghost"
              title="Edit"
            >
              <PencilIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                if (confirm('Are you sure you want to delete this NAS?')) {
                  deleteMutation.mutate(row.original.id)
                }
              }}
              className="btn-xs btn-ghost text-red-600"
              title="Delete"
            >
              <TrashIcon className="w-3.5 h-3.5" />
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
    <div className="space-y-2" style={{ fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", fontSize: 11 }}>
      <div className="wb-toolbar justify-between">
        <div>
          <span className="text-[13px] font-semibold text-gray-900 dark:text-white">NAS / Routers</span>
          <span className="text-[11px] text-gray-500 dark:text-gray-400 ml-2">Manage RADIUS clients and routers</span>
        </div>
        <button onClick={() => openModal()} className="btn btn-primary flex items-center gap-1">
          <PlusIcon className="w-3.5 h-3.5" />
          Add NAS
        </button>
      </div>

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
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-6">
                  <div className="flex items-center justify-center">
                    <div className="animate-spin h-5 w-5 border-b-2 border-[#316AC5]" style={{ borderRadius: '50%' }}></div>
                  </div>
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-6 text-gray-500 dark:text-gray-400">
                  No NAS devices found
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
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

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '480px', width: '100%' }}>
            <div className="modal-header">
              <span>{editingNas ? 'Edit NAS' : 'Add NAS'}</span>
              <button onClick={closeModal} className="text-white hover:text-gray-200">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body space-y-2" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                {/* General Settings Group */}
                <div className="wb-group">
                  <div className="wb-group-title">General</div>
                  <div className="wb-group-body space-y-2">
                    <div>
                      <label className="label">IP Address / Hostname</label>
                      <input type="text" name="ip_address" value={formData.ip_address} onChange={handleChange} className="input" placeholder="192.168.1.1" required />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="label">Name</label>
                        <input type="text" name="name" value={formData.name} onChange={handleChange} className="input" placeholder="Main Router" required />
                      </div>
                      <div>
                        <label className="label">Short Name</label>
                        <input type="text" name="short_name" value={formData.short_name} onChange={handleChange} className="input" placeholder="Router1" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="label">Type</label>
                        <select name="type" value={formData.type} onChange={handleChange} className="input">
                          {nasTypes.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label">RADIUS Port</label>
                        <input type="number" name="auth_port" value={formData.auth_port} onChange={handleChange} className="input" />
                      </div>
                    </div>

                    <div>
                      <label className="label">Description</label>
                      <textarea name="description" value={formData.description} onChange={handleChange} className="input" rows={2} />
                    </div>
                  </div>
                </div>

                {/* RADIUS Secret Group */}
                <div className="wb-group">
                  <div className="wb-group-title">RADIUS Secret</div>
                  <div className="wb-group-body space-y-2">
                    <div>
                      <label className="label">Secret</label>
                      <div className="relative">
                        <input type={showSecret ? 'text' : 'password'} name="secret" value={formData.secret} onChange={handleChange} className="input pr-8" placeholder={editingNas ? '--------' : 'Enter secret'} required={!editingNas} />
                        <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                          {showSecret ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                        </button>
                      </div>
                      {editingNas && (
                        <p className="text-[10px] text-green-600 dark:text-green-400 mt-0.5 flex items-center gap-0.5">
                          <CheckCircleIcon className="w-3 h-3" />
                          Secret is set. Leave blank to keep current.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Allowed Realms Group */}
                <div className="wb-group">
                  <div className="wb-group-title">Allowed Realms</div>
                  <div className="wb-group-body space-y-1">
                    <div>
                      <label className="label">Realms (for RADIUS)</label>
                      <input type="text" name="allowed_realms" value={formData.allowed_realms} onChange={handleChange} className="input" placeholder="e.g., test.mes.net.lb, other.domain.com" />
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                        Comma-separated list of realms. Users logging in as user@realm will have the realm stripped if it's in this list.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Mikrotik API Settings Group */}
                {formData.type === 'mikrotik' && (
                  <div className="wb-group">
                    <div className="wb-group-title">Mikrotik API Settings</div>
                    <div className="wb-group-body space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="label">API Port</label>
                          <input type="text" name="api_port" value={formData.api_port} onChange={handleChange} className="input" />
                        </div>
                        <div>
                          <label className="label">CoA Port</label>
                          <input type="text" name="coa_port" value={formData.coa_port} onChange={handleChange} className="input" />
                        </div>
                      </div>
                      <div>
                        <label className="label">API Username</label>
                        <input type="text" name="api_username" value={formData.api_username} onChange={handleChange} className="input" />
                      </div>
                      <div>
                        <label className="label">API Password</label>
                        <div className="relative">
                          <input type={showApiPassword ? 'text' : 'password'} name="api_password" value={formData.api_password} onChange={handleChange} className="input pr-8" placeholder={editingNas ? '--------' : 'Enter password'} />
                          <button type="button" onClick={() => setShowApiPassword(!showApiPassword)} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                            {showApiPassword ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                          </button>
                        </div>
                        {editingNas && (
                          <p className="text-[10px] text-green-600 dark:text-green-400 mt-0.5 flex items-center gap-0.5">
                            <CheckCircleIcon className="w-3 h-3" />
                            Password is set. Leave blank to keep current.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Active Checkbox */}
                <div className="wb-group">
                  <div className="wb-group-body">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="is_active" checked={formData.is_active} onChange={handleChange} className="w-3.5 h-3.5 border-[#a0a0a0]" style={{ borderRadius: '2px' }} />
                      <span className="text-[11px] text-gray-900 dark:text-gray-100">Active NAS</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={closeModal} className="btn">Cancel</button>
                <button type="submit" disabled={saveMutation.isLoading} className="btn btn-primary">
                  {saveMutation.isLoading ? 'Saving...' : editingNas ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
