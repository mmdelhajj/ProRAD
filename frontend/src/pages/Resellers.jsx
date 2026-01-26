import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { resellerApi, permissionApi, nasApi, serviceApi } from '../services/api'
import { useAuthStore } from '../store/authStore'
import api from '../services/api'
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
  BanknotesIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  UserGroupIcon,
  ArrowRightOnRectangleIcon,
  EyeIcon,
  EyeSlashIcon,
  ServerIcon,
  CubeIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import clsx from 'clsx'

export default function Resellers() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [editingReseller, setEditingReseller] = useState(null)
  const [selectedReseller, setSelectedReseller] = useState(null)
  const [transferAmount, setTransferAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [visiblePasswords, setVisiblePasswords] = useState({})
  const [activeTab, setActiveTab] = useState('general')
  const [assignedNAS, setAssignedNAS] = useState([])
  const [assignedServices, setAssignedServices] = useState([])

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    fullname: '',
    email: '',
    phone: '',
    address: '',
    company: '',
    balance: '0',
    credit_limit: '0',
    discount: '0',
    is_active: true,
    parent_id: '',
    permission_group: '',
    notes: '',
  })

  const { data: resellers, isLoading } = useQuery({
    queryKey: ['resellers'],
    queryFn: () => resellerApi.list().then((r) => r.data.data),
  })

  const { data: permissionGroups } = useQuery({
    queryKey: ['permissionGroups'],
    queryFn: () => permissionApi.listGroups().then((r) => r.data.data || []),
  })

  // Fetch all NAS for assignment (admin view)
  const { data: allNAS } = useQuery({
    queryKey: ['allNAS'],
    queryFn: () => nasApi.list().then((r) => r.data.data || []),
    enabled: showModal && !!editingReseller,
  })

  // Fetch all services for assignment (admin view)
  const { data: allServices } = useQuery({
    queryKey: ['allServices'],
    queryFn: () => serviceApi.list().then((r) => r.data.data || []),
    enabled: showModal && !!editingReseller,
  })

  // Fetch assigned NAS for the reseller
  const { data: resellerAssignedNAS, refetch: refetchAssignedNAS } = useQuery({
    queryKey: ['resellerAssignedNAS', editingReseller?.id],
    queryFn: () => resellerApi.getAssignedNAS(editingReseller.id).then((r) => r.data.data || []),
    enabled: showModal && !!editingReseller,
  })

  // Fetch assigned services for the reseller
  const { data: resellerAssignedServices, refetch: refetchAssignedServices } = useQuery({
    queryKey: ['resellerAssignedServices', editingReseller?.id],
    queryFn: () => resellerApi.getAssignedServices(editingReseller.id).then((r) => r.data.data || []),
    enabled: showModal && !!editingReseller,
  })

  // Update local state when data is fetched
  useEffect(() => {
    if (resellerAssignedNAS) {
      setAssignedNAS(resellerAssignedNAS.filter(n => n.assigned).map(n => n.id))
    }
  }, [resellerAssignedNAS])

  useEffect(() => {
    if (resellerAssignedServices) {
      setAssignedServices(resellerAssignedServices.map(s => ({
        service_id: s.id,
        enabled: s.is_enabled || false,
        custom_price: s.custom_price != null ? String(s.custom_price) : '',
        custom_day_price: s.custom_day_price != null ? String(s.custom_day_price) : '',
      })))
    }
  }, [resellerAssignedServices])

  const saveMutation = useMutation({
    mutationFn: (data) =>
      editingReseller
        ? resellerApi.update(editingReseller.id, data)
        : resellerApi.create(data),
    onSuccess: () => {
      toast.success(editingReseller ? 'Reseller updated' : 'Reseller created')
      queryClient.invalidateQueries(['resellers'])
      closeModal()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => resellerApi.delete(id),
    onSuccess: () => {
      toast.success('Reseller deleted')
      queryClient.invalidateQueries(['resellers'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete'),
  })

  const transferMutation = useMutation({
    mutationFn: ({ id, amount }) => resellerApi.transfer(id, { amount: parseFloat(amount) }),
    onSuccess: () => {
      toast.success('Balance transferred successfully')
      queryClient.invalidateQueries(['resellers'])
      setShowTransferModal(false)
      setTransferAmount('')
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Transfer failed'),
  })

  const withdrawMutation = useMutation({
    mutationFn: ({ id, amount }) => resellerApi.withdraw(id, { amount: parseFloat(amount) }),
    onSuccess: () => {
      toast.success('Balance withdrawn successfully')
      queryClient.invalidateQueries(['resellers'])
      setShowWithdrawModal(false)
      setWithdrawAmount('')
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Withdrawal failed'),
  })

  const saveNASAssignmentsMutation = useMutation({
    mutationFn: ({ id, nasIds }) => resellerApi.updateAssignedNAS(id, nasIds),
    onSuccess: () => {
      toast.success('NAS assignments updated')
      refetchAssignedNAS()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update NAS assignments'),
  })

  const saveServiceAssignmentsMutation = useMutation({
    mutationFn: ({ id, services }) => resellerApi.updateAssignedServices(id, services),
    onSuccess: () => {
      toast.success('Service assignments updated')
      refetchAssignedServices()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update service assignments'),
  })

  const impersonateMutation = useMutation({
    mutationFn: (id) => resellerApi.impersonate(id),
    onSuccess: (response) => {
      const { token, user } = response.data.data
      // Manually update localStorage in Zustand's format
      const authState = {
        state: {
          user: user,
          token: token,
          isAuthenticated: true,
          isCustomer: false,
          customerData: null,
        },
        version: 0
      }
      localStorage.setItem('proisp-auth', JSON.stringify(authState))
      // Also set the API header
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      toast.success(`Logged in as ${user.username}`)
      // Reload to apply new auth
      window.location.href = '/'
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to login as reseller'),
  })

  const togglePasswordVisibility = (id) => {
    setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const openModal = (reseller = null) => {
    if (reseller) {
      setEditingReseller(reseller)
      setFormData({
        username: reseller.user?.username || reseller.username || '',
        password: '',
        fullname: reseller.user?.full_name || reseller.fullname || '',
        email: reseller.user?.email || reseller.email || '',
        phone: reseller.user?.phone || reseller.phone || '',
        address: reseller.address || '',
        company: reseller.name || reseller.company || '',
        balance: reseller.balance || '0',
        credit_limit: reseller.credit || reseller.credit_limit || '0',
        discount: reseller.discount || '0',
        is_active: reseller.is_active ?? true,
        parent_id: reseller.parent_id || '',
        permission_group: reseller.permission_group || '',
        notes: reseller.notes || '',
      })
    } else {
      setEditingReseller(null)
      setFormData({
        username: '',
        password: '',
        fullname: '',
        email: '',
        phone: '',
        address: '',
        company: '',
        balance: '0',
        credit_limit: '0',
        discount: '0',
        is_active: true,
        parent_id: '',
        permission_group: '',
        notes: '',
      })
    }
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingReseller(null)
    setActiveTab('general')
    setAssignedNAS([])
    setAssignedServices([])
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const data = {
      ...formData,
      balance: parseFloat(formData.balance) || 0,
      credit_limit: parseFloat(formData.credit_limit) || 0,
      discount: parseFloat(formData.discount) || 0,
      parent_id: formData.parent_id ? parseInt(formData.parent_id) : null,
      permission_group: formData.permission_group ? parseInt(formData.permission_group) : null,
    }
    if (!data.password && editingReseller) delete data.password
    saveMutation.mutate(data)
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const handleNASToggle = (nasId) => {
    setAssignedNAS(prev =>
      prev.includes(nasId)
        ? prev.filter(id => id !== nasId)
        : [...prev, nasId]
    )
  }

  const handleServiceToggle = (serviceId) => {
    setAssignedServices(prev => {
      const existing = prev.find(s => s.service_id === serviceId)
      if (existing) {
        return prev.map(s =>
          s.service_id === serviceId
            ? { ...s, enabled: !s.enabled }
            : s
        )
      }
      return [...prev, { service_id: serviceId, enabled: true, custom_price: '', custom_day_price: '' }]
    })
  }

  const handleServicePriceChange = (serviceId, field, value) => {
    setAssignedServices(prev => {
      const exists = prev.find(s => s.service_id === serviceId)
      if (exists) {
        return prev.map(s =>
          s.service_id === serviceId
            ? { ...s, [field]: value }
            : s
        )
      }
      // If service doesn't exist in the list, add it
      return [...prev, { service_id: serviceId, enabled: false, custom_price: '', custom_day_price: '', [field]: value }]
    })
  }

  const saveNASAssignments = () => {
    if (editingReseller) {
      saveNASAssignmentsMutation.mutate({ id: editingReseller.id, nasIds: assignedNAS })
    }
  }

  const saveServiceAssignments = () => {
    if (editingReseller) {
      const services = assignedServices
        .filter(s => s.enabled)
        .map(s => ({
          service_id: s.service_id,
          custom_price: s.custom_price ? parseFloat(s.custom_price) : null,
          custom_day_price: s.custom_day_price ? parseFloat(s.custom_day_price) : null,
        }))
      saveServiceAssignmentsMutation.mutate({ id: editingReseller.id, services })
    }
  }

  const columns = useMemo(
    () => [
      {
        accessorKey: 'username',
        header: 'Username',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <UserGroupIcon className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <div className="font-medium">{row.original.user?.username || row.original.username}</div>
              <div className="text-sm text-gray-500">{row.original.name || row.original.company}</div>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'password',
        header: 'Password',
        cell: ({ row }) => {
          const password = row.original.user?.password_plain
          const isVisible = visiblePasswords[row.original.id]
          return (
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">
                {password ? (isVisible ? password : '••••••••') : '-'}
              </span>
              {password && (
                <button
                  onClick={() => togglePasswordVisibility(row.original.id)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                  title={isVisible ? 'Hide password' : 'Show password'}
                >
                  {isVisible ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                </button>
              )}
            </div>
          )
        },
      },
      {
        accessorKey: 'contact',
        header: 'Contact',
        cell: ({ row }) => (
          <div className="text-sm">
            <div>{row.original.user?.email || row.original.email}</div>
            <div className="text-gray-500">{row.original.user?.phone || row.original.phone}</div>
          </div>
        ),
      },
      {
        accessorKey: 'balance',
        header: 'Balance',
        cell: ({ row }) => (
          <div className={clsx('font-semibold', row.original.balance >= 0 ? 'text-green-600' : 'text-red-600')}>
            ${row.original.balance?.toFixed(2)}
          </div>
        ),
      },
      {
        accessorKey: 'credit',
        header: 'Credit',
        cell: ({ row }) => `$${(row.original.credit || 0).toFixed(2)}`,
      },
      {
        accessorKey: 'subscriber_count',
        header: 'Subscribers',
        cell: ({ row }) => row.original.subscriber_count || 0,
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
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                if (confirm(`Login as ${row.original.user?.username || row.original.username}?`)) {
                  impersonateMutation.mutate(row.original.id)
                }
              }}
              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
              title="Login as Reseller"
            >
              <ArrowRightOnRectangleIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setSelectedReseller(row.original)
                setShowTransferModal(true)
              }}
              className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded"
              title="Transfer Balance"
            >
              <ArrowUpIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setSelectedReseller(row.original)
                setShowWithdrawModal(true)
              }}
              className="p-1.5 text-gray-500 hover:text-yellow-600 hover:bg-yellow-50 rounded"
              title="Withdraw Balance"
            >
              <ArrowDownIcon className="w-4 h-4" />
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
                if (confirm('Are you sure you want to delete this reseller?')) {
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
    [deleteMutation, impersonateMutation, visiblePasswords]
  )

  const table = useReactTable({
    data: resellers || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Resellers</h1>
          <p className="text-gray-500">Manage reseller accounts and balances</p>
        </div>
        <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
          <PlusIcon className="w-4 h-4" />
          Add Reseller
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-sm text-gray-500">Total Resellers</div>
          <div className="text-2xl font-bold">{resellers?.length || 0}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-500">Total Balance</div>
          <div className="text-2xl font-bold text-green-600">
            ${resellers?.reduce((sum, r) => sum + (r.balance || 0), 0).toFixed(2)}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-500">Active Resellers</div>
          <div className="text-2xl font-bold">
            {resellers?.filter((r) => r.is_active).length || 0}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-500">Total Subscribers</div>
          <div className="text-2xl font-bold">
            {resellers?.reduce((sum, r) => sum + (r.subscriber_count || 0), 0)}
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
                    No resellers found
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

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black bg-opacity-50" onClick={closeModal} />
            <div className="relative bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b">
                <h2 className="text-xl font-semibold">
                  {editingReseller ? 'Edit Reseller' : 'Add Reseller'}
                </h2>
                <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-lg">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Tabs - only show when editing */}
              {editingReseller && (
                <div className="border-b px-6">
                  <nav className="flex gap-4 -mb-px">
                    <button
                      type="button"
                      onClick={() => setActiveTab('general')}
                      className={clsx(
                        'flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium',
                        activeTab === 'general'
                          ? 'border-primary-500 text-primary-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      )}
                    >
                      <Cog6ToothIcon className="w-4 h-4" />
                      General
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('nas')}
                      className={clsx(
                        'flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium',
                        activeTab === 'nas'
                          ? 'border-primary-500 text-primary-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      )}
                    >
                      <ServerIcon className="w-4 h-4" />
                      Assigned NAS
                      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
                        {assignedNAS.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('services')}
                      className={clsx(
                        'flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium',
                        activeTab === 'services'
                          ? 'border-primary-500 text-primary-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      )}
                    >
                      <CubeIcon className="w-4 h-4" />
                      Assigned Services
                      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
                        {assignedServices.filter(s => s.enabled).length}
                      </span>
                    </button>
                  </nav>
                </div>
              )}

              {/* General Tab */}
              {(activeTab === 'general' || !editingReseller) && (
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Username</label>
                      <input
                        type="text"
                        name="username"
                        value={formData.username}
                        onChange={handleChange}
                        className="input"
                        required
                      />
                    </div>
                    <div>
                      <label className="label">Password</label>
                      <input
                        type="password"
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        className="input"
                        placeholder={editingReseller ? 'Leave blank to keep current' : ''}
                        required={!editingReseller}
                      />
                    </div>
                    <div>
                      <label className="label">Full Name</label>
                      <input
                        type="text"
                        name="fullname"
                        value={formData.fullname}
                        onChange={handleChange}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Company</label>
                      <input
                        type="text"
                        name="company"
                        value={formData.company}
                        onChange={handleChange}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Email</label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Phone</label>
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        className="input"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label">Address</label>
                    <textarea
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      className="input"
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="label">Initial Balance ($)</label>
                      <input
                        type="number"
                        name="balance"
                        value={formData.balance}
                        onChange={handleChange}
                        className="input"
                        step="0.01"
                        disabled={editingReseller}
                      />
                    </div>
                    <div>
                      <label className="label">Credit Limit ($)</label>
                      <input
                        type="number"
                        name="credit_limit"
                        value={formData.credit_limit}
                        onChange={handleChange}
                        className="input"
                        step="0.01"
                      />
                    </div>
                    <div>
                      <label className="label">Discount (%)</label>
                      <input
                        type="number"
                        name="discount"
                        value={formData.discount}
                        onChange={handleChange}
                        className="input"
                        min="0"
                        max="100"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Parent Reseller (Optional)</label>
                      <select
                        name="parent_id"
                        value={formData.parent_id}
                        onChange={handleChange}
                        className="input"
                      >
                        <option value="">No Parent (Direct Reseller)</option>
                        {resellers
                          ?.filter((r) => r.id !== editingReseller?.id)
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.user?.username || r.username} - {r.name || r.company}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div>
                      <label className="label">Permission Group</label>
                      <select
                        name="permission_group"
                        value={formData.permission_group}
                        onChange={handleChange}
                        className="input"
                      >
                        <option value="">No Permission Group</option>
                        {permissionGroups?.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="label">Notes</label>
                    <textarea
                      name="notes"
                      value={formData.notes}
                      onChange={handleChange}
                      className="input"
                      rows={2}
                    />
                  </div>

                  <div className="border-t pt-4">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        name="is_active"
                        checked={formData.is_active}
                        onChange={handleChange}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span>Active Reseller</span>
                    </label>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <button type="button" onClick={closeModal} className="btn-secondary">
                      Cancel
                    </button>
                    <button type="submit" disabled={saveMutation.isLoading} className="btn-primary">
                      {saveMutation.isLoading ? 'Saving...' : editingReseller ? 'Update' : 'Create'}
                    </button>
                  </div>
                </form>
              )}

              {/* NAS Tab */}
              {activeTab === 'nas' && editingReseller && (
                <div className="p-6 space-y-4">
                  <p className="text-sm text-gray-600">
                    Select the NAS devices this reseller can manage. Reseller will only see subscribers on these NAS.
                  </p>
                  <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                    {allNAS?.map((nas) => (
                      <label
                        key={nas.id}
                        className={clsx(
                          'flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors',
                          assignedNAS.includes(nas.id)
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={assignedNAS.includes(nas.id)}
                          onChange={() => handleNASToggle(nas.id)}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <div>
                          <div className="font-medium">{nas.name}</div>
                          <div className="text-sm text-gray-500">{nas.ip_address}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                  {(!allNAS || allNAS.length === 0) && (
                    <div className="text-center py-8 text-gray-500">
                      No NAS devices found
                    </div>
                  )}
                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <button type="button" onClick={closeModal} className="btn-secondary">
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveNASAssignments}
                      disabled={saveNASAssignmentsMutation.isLoading}
                      className="btn-primary"
                    >
                      {saveNASAssignmentsMutation.isLoading ? 'Saving...' : 'Save NAS Assignments'}
                    </button>
                  </div>
                </div>
              )}

              {/* Services Tab */}
              {activeTab === 'services' && editingReseller && (
                <div className="p-6 space-y-4">
                  <p className="text-sm text-gray-600">
                    Select which services this reseller can sell. You can set custom prices for each service.
                  </p>
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2">Service</th>
                          <th className="text-left px-3 py-2">Base Price</th>
                          <th className="text-left px-3 py-2">Custom Price</th>
                          <th className="text-left px-3 py-2">Custom Day Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {allServices?.map((service) => {
                          const assignment = assignedServices.find(s => s.service_id === service.id)
                          const isEnabled = assignment?.enabled || false
                          return (
                            <tr key={service.id} className={clsx(isEnabled && 'bg-primary-50')}>
                              <td className="px-3 py-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isEnabled}
                                    onChange={() => handleServiceToggle(service.id)}
                                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                  />
                                  <span className="font-medium">{service.name}</span>
                                </label>
                              </td>
                              <td className="px-3 py-2 text-gray-600">
                                ${service.price?.toFixed(2)}
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  value={assignment?.custom_price || ''}
                                  onChange={(e) => handleServicePriceChange(service.id, 'custom_price', e.target.value)}
                                  placeholder="Same as base"
                                  className="input w-24 py-1 px-2 text-sm"
                                  step="0.01"
                                  disabled={!isEnabled}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  value={assignment?.custom_day_price || ''}
                                  onChange={(e) => handleServicePriceChange(service.id, 'custom_day_price', e.target.value)}
                                  placeholder="Auto"
                                  className="input w-24 py-1 px-2 text-sm"
                                  step="0.01"
                                  disabled={!isEnabled}
                                />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {(!allServices || allServices.length === 0) && (
                    <div className="text-center py-8 text-gray-500">
                      No services found
                    </div>
                  )}
                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <button type="button" onClick={closeModal} className="btn-secondary">
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveServiceAssignments}
                      disabled={saveServiceAssignmentsMutation.isLoading}
                      className="btn-primary"
                    >
                      {saveServiceAssignmentsMutation.isLoading ? 'Saving...' : 'Save Service Assignments'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {showTransferModal && selectedReseller && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowTransferModal(false)} />
            <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full">
              <div className="flex items-center justify-between p-6 border-b">
                <h2 className="text-xl font-semibold">Transfer Balance</h2>
                <button onClick={() => setShowTransferModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-gray-600">
                  Transfer balance to <span className="font-semibold">{selectedReseller.username}</span>
                </p>
                <p className="text-sm text-gray-500">
                  Current Balance: <span className="font-semibold text-green-600">${selectedReseller.balance?.toFixed(2)}</span>
                </p>
                <div>
                  <label className="label">Amount ($)</label>
                  <input
                    type="number"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    className="input"
                    step="0.01"
                    min="0.01"
                    required
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setShowTransferModal(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button
                    onClick={() => transferMutation.mutate({ id: selectedReseller.id, amount: transferAmount })}
                    disabled={!transferAmount || transferMutation.isLoading}
                    className="btn-primary"
                  >
                    {transferMutation.isLoading ? 'Transferring...' : 'Transfer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && selectedReseller && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowWithdrawModal(false)} />
            <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full">
              <div className="flex items-center justify-between p-6 border-b">
                <h2 className="text-xl font-semibold">Withdraw Balance</h2>
                <button onClick={() => setShowWithdrawModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-gray-600">
                  Withdraw balance from <span className="font-semibold">{selectedReseller.username}</span>
                </p>
                <p className="text-sm text-gray-500">
                  Current Balance: <span className="font-semibold text-green-600">${selectedReseller.balance?.toFixed(2)}</span>
                </p>
                <div>
                  <label className="label">Amount ($)</label>
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="input"
                    step="0.01"
                    min="0.01"
                    max={selectedReseller.balance}
                    required
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setShowWithdrawModal(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button
                    onClick={() => withdrawMutation.mutate({ id: selectedReseller.id, amount: withdrawAmount })}
                    disabled={!withdrawAmount || withdrawMutation.isLoading}
                    className="btn-primary"
                  >
                    {withdrawMutation.isLoading ? 'Withdrawing...' : 'Withdraw'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
