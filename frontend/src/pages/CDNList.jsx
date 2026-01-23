import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cdnApi, nasApi } from '../services/api'
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
  GlobeAltIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import clsx from 'clsx'

export default function CDNList() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editingCDN, setEditingCDN] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    subnets: '',
    color: '#EF4444',
    nas_ids: '',
    is_active: true,
  })

  // Predefined colors for CDN (excluding blue #3B82F6 and green #22C55E used for download/upload)
  const presetColors = [
    '#EF4444', // Red
    '#F97316', // Orange
    '#F59E0B', // Amber
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#84CC16', // Lime
    '#6366F1', // Indigo
    '#14B8A6', // Teal
    '#D946EF', // Fuchsia
  ]

  const { data: cdns, isLoading } = useQuery({
    queryKey: ['cdns'],
    queryFn: () => cdnApi.list().then((r) => r.data.data),
  })

  const { data: nasList } = useQuery({
    queryKey: ['nas'],
    queryFn: () => nasApi.list().then((r) => r.data.data),
  })

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      console.log('Mutation starting with data:', data)
      try {
        const response = editingCDN
          ? await cdnApi.update(editingCDN.id, data)
          : await cdnApi.create(data)
        console.log('API response:', response)
        return response
      } catch (err) {
        console.error('API error:', err)
        throw err
      }
    },
    onSuccess: () => {
      console.log('Mutation success')
      toast.success(editingCDN ? 'CDN updated' : 'CDN created')
      queryClient.invalidateQueries({ queryKey: ['cdns'] })
      closeModal()
    },
    onError: (err) => {
      console.error('Mutation error:', err)
      toast.error(err.response?.data?.message || 'Failed to save')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => cdnApi.delete(id),
    onSuccess: () => {
      toast.success('CDN deleted')
      queryClient.invalidateQueries({ queryKey: ['cdns'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete'),
  })

  const syncMutation = useMutation({
    mutationFn: (id) => cdnApi.syncToNAS(id),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'CDN synced to all NAS devices')
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to sync'),
  })

  const syncAllMutation = useMutation({
    mutationFn: () => cdnApi.syncAllToNAS(),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'All CDNs synced to NAS devices')
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to sync'),
  })

  const openModal = (cdn = null) => {
    if (cdn) {
      setEditingCDN(cdn)
      setFormData({
        name: cdn.name || '',
        description: cdn.description || '',
        subnets: cdn.subnets || '',
        color: cdn.color || '#EF4444',
        nas_ids: cdn.nas_ids || '',
        is_active: cdn.is_active ?? true,
      })
    } else {
      setEditingCDN(null)
      setFormData({
        name: '',
        description: '',
        subnets: '',
        color: '#EF4444',
        nas_ids: '',
        is_active: true,
      })
    }
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingCDN(null)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    console.log('CDN Form Submit:', formData)
    saveMutation.mutate(formData)
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  // Parse subnets (handles comma, newline, or mixed separators)
  const parseSubnets = (subnets) => {
    if (!subnets) return []
    // Replace newlines with commas, then split by comma
    return subnets.replace(/\r?\n/g, ',').split(',').map(s => s.trim()).filter(s => s)
  }

  // Count subnets
  const countSubnets = (subnets) => {
    return parseSubnets(subnets).length
  }

  const columns = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div
              className="w-4 h-4 rounded-full flex-shrink-0 ring-2 ring-white shadow"
              style={{ backgroundColor: row.original.color || '#EF4444' }}
              title={`Graph color: ${row.original.color || '#EF4444'}`}
            />
            <div className="p-2 bg-indigo-100 rounded-lg">
              <GlobeAltIcon className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <div className="font-semibold text-gray-900">{row.original.name}</div>
              <div className="text-sm text-gray-500">{row.original.description}</div>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'subnets',
        header: 'Subnets',
        cell: ({ row }) => {
          const subnets = row.original.subnets
          const subnetList = parseSubnets(subnets)
          const count = subnetList.length
          const displayList = subnetList.slice(0, 3)
          return (
            <div>
              <div className="text-sm font-medium text-gray-900">{count} subnet{count !== 1 ? 's' : ''}</div>
              <div className="text-xs text-gray-500 font-mono">
                {displayList.join(', ')}
                {count > 3 && ` +${count - 3} more`}
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: 'nas_ids',
        header: 'Target NAS',
        cell: ({ row }) => {
          const nasIds = row.original.nas_ids
          if (!nasIds) {
            return <span className="text-sm text-gray-500">All NAS</span>
          }
          const idList = nasIds.split(',').map(id => id.trim()).filter(id => id)
          const nasNames = idList.map(id => {
            const nas = nasList?.find(n => n.id === parseInt(id))
            return nas?.name || `NAS #${id}`
          })
          return (
            <div>
              <div className="text-sm text-gray-900">{nasNames.slice(0, 2).join(', ')}</div>
              {nasNames.length > 2 && (
                <div className="text-xs text-gray-500">+{nasNames.length - 2} more</div>
              )}
            </div>
          )
        },
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) => (
          <span className={clsx('badge', row.original.is_active ? 'badge-success' : 'badge-gray')}>
            {row.original.is_active ? 'Active' : 'Inactive'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <button
              onClick={() => syncMutation.mutate(row.original.id)}
              disabled={!row.original.is_active || syncMutation.isPending}
              className={clsx(
                "p-1.5 rounded",
                row.original.is_active
                  ? "text-gray-500 hover:text-green-600 hover:bg-green-50"
                  : "text-gray-300 cursor-not-allowed"
              )}
              title={row.original.is_active ? "Sync to MikroTik" : "CDN is inactive"}
            >
              <ArrowPathIcon className={clsx("w-4 h-4", syncMutation.isPending && "animate-spin")} />
            </button>
            <button
              onClick={() => openModal(row.original)}
              className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded"
              title="Edit"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                if (confirm('Are you sure you want to delete this CDN?')) {
                  deleteMutation.mutate(row.original.id)
                }
              }}
              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
              title="Delete"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        ),
      },
    ],
    [deleteMutation, syncMutation, nasList]
  )

  const table = useReactTable({
    data: cdns || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CDN List</h1>
          <p className="text-gray-500">Manage Content Delivery Network configurations</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => syncAllMutation.mutate()}
            disabled={syncAllMutation.isPending}
            className="btn-secondary flex items-center gap-2"
          >
            <ArrowPathIcon className={clsx("w-4 h-4", syncAllMutation.isPending && "animate-spin")} />
            {syncAllMutation.isPending ? 'Syncing...' : 'Sync All to MikroTik'}
          </button>
          <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
            <PlusIcon className="w-4 h-4" />
            Add CDN
          </button>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex gap-3">
          <GlobeAltIcon className="w-6 h-6 text-blue-500 flex-shrink-0" />
          <div>
            <h3 className="font-medium text-blue-900">CDN Configuration</h3>
            <p className="text-sm text-blue-700 mt-1">
              Add CDN providers (GGC, Akamai, Cloudflare, etc.) with their IP subnets.
              Then assign them to services with custom speed limits and bypass options.
            </p>
          </div>
        </div>
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
            <tbody className="divide-y divide-gray-200">
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
                  <td colSpan={columns.length} className="text-center py-8 text-gray-500">
                    No CDNs found. Click "Add CDN" to create one.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
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
            <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full">
              <div className="flex items-center justify-between p-6 border-b">
                <h2 className="text-xl font-semibold">
                  {editingCDN ? 'Edit CDN' : 'Add CDN'}
                </h2>
                <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-lg">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="label">CDN Name</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="input"
                    placeholder="e.g., GGC, Akamai, Cloudflare"
                    required
                  />
                </div>

                <div>
                  <label className="label">Description</label>
                  <input
                    type="text"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    className="input"
                    placeholder="e.g., Google Global Cache"
                  />
                </div>

                <div>
                  <label className="label">Subnets</label>
                  <textarea
                    name="subnets"
                    value={formData.subnets}
                    onChange={handleChange}
                    className="input font-mono text-sm"
                    rows={5}
                    placeholder="Enter subnets separated by commas or new lines:
185.82.96.0/24
185.82.97.0/24
34.104.35.0/24"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter IP subnets in CIDR notation, separated by commas or new lines
                  </p>
                </div>

                <div>
                  <label className="label">Sync to NAS</label>
                  <p className="text-xs text-gray-500 mb-2">
                    Select which NAS devices to sync this CDN address list to (leave empty for all NAS)
                  </p>
                  <div className="border rounded-lg p-3 max-h-40 overflow-y-auto bg-gray-50">
                    {nasList && nasList.length > 0 ? (
                      <div className="space-y-2">
                        {nasList.filter(nas => nas.is_active).map((nas) => {
                          const selectedIds = formData.nas_ids ? formData.nas_ids.split(',').map(id => id.trim()) : []
                          const isSelected = selectedIds.includes(String(nas.id))
                          return (
                            <label key={nas.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  let newIds = selectedIds.filter(id => id !== '')
                                  if (e.target.checked) {
                                    newIds.push(String(nas.id))
                                  } else {
                                    newIds = newIds.filter(id => id !== String(nas.id))
                                  }
                                  setFormData(prev => ({ ...prev, nas_ids: newIds.join(',') }))
                                }}
                                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                              />
                              <span className="text-sm">{nas.name}</span>
                              <span className="text-xs text-gray-400">({nas.ip_address})</span>
                            </label>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">No NAS devices available</p>
                    )}
                  </div>
                  {formData.nas_ids && (
                    <p className="text-xs text-gray-500 mt-1">
                      Selected: {formData.nas_ids.split(',').filter(id => id).length} NAS device(s)
                    </p>
                  )}
                </div>

                <div>
                  <label className="label">Graph Color</label>
                  <p className="text-xs text-gray-500 mb-2">
                    Choose a color for the live bandwidth graph (blue and green are reserved for download/upload)
                  </p>
                  <div className="flex items-center gap-4">
                    <div className="flex flex-wrap gap-2">
                      {presetColors.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, color }))}
                          className={clsx(
                            'w-8 h-8 rounded-full transition-all',
                            formData.color === color
                              ? 'ring-2 ring-offset-2 ring-gray-900 scale-110'
                              : 'hover:scale-105'
                          )}
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        name="color"
                        value={formData.color}
                        onChange={handleChange}
                        className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                        title="Custom color"
                      />
                      <span className="text-sm text-gray-500 font-mono">{formData.color}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      name="is_active"
                      checked={formData.is_active}
                      onChange={handleChange}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span>Active</span>
                  </label>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button type="button" onClick={closeModal} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={saveMutation.isPending} className="btn-primary">
                    {saveMutation.isPending ? 'Saving...' : editingCDN ? 'Update' : 'Create'}
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
