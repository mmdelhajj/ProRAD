import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { permissionApi } from '../services/api'
import { PlusIcon, ArrowPathIcon, PencilIcon, TrashIcon, ArrowLeftIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function Permissions() {
  const queryClient = useQueryClient()
  const [view, setView] = useState('list') // 'list' or 'edit'
  const [editingGroup, setEditingGroup] = useState(null)
  const [groupForm, setGroupForm] = useState({
    name: '',
    description: '',
    permissions: []
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [permissionSearch, setPermissionSearch] = useState('')

  // Fetch permissions
  const { data: permissionsData, isLoading: permissionsLoading, refetch: refetchPermissions } = useQuery({
    queryKey: ['permissions'],
    queryFn: async () => {
      const res = await permissionApi.list()
      return res.data
    }
  })

  // Fetch permission groups
  const { data: groupsData, isLoading: groupsLoading, refetch: refetchGroups } = useQuery({
    queryKey: ['permission-groups'],
    queryFn: async () => {
      const res = await permissionApi.listGroups()
      return res.data
    }
  })

  // Seed permissions mutation
  const seedMutation = useMutation({
    mutationFn: () => permissionApi.seed(),
    onSuccess: () => {
      queryClient.invalidateQueries(['permissions'])
      toast.success('Default permissions seeded successfully')
    }
  })

  // Create/Update group mutation
  const groupMutation = useMutation({
    mutationFn: (data) => {
      if (editingGroup) {
        return permissionApi.updateGroup(editingGroup.id, data)
      }
      return permissionApi.createGroup(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['permission-groups'])
      toast.success(editingGroup ? 'Permission group updated' : 'Permission group created')
      setView('list')
      setEditingGroup(null)
      setGroupForm({ name: '', description: '', permissions: [] })
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to save permission group')
    }
  })

  // Delete group mutation
  const deleteGroupMutation = useMutation({
    mutationFn: (id) => permissionApi.deleteGroup(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['permission-groups'])
      toast.success('Permission group deleted')
    }
  })

  const permissions = permissionsData?.data || []
  const groups = groupsData?.data || []

  // Filter groups by search term
  const filteredGroups = groups.filter(group =>
    group.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Filter permissions by search term
  const filteredPermissions = permissionSearch
    ? permissions.filter(perm =>
        perm.name?.toLowerCase().includes(permissionSearch.toLowerCase()) ||
        perm.description?.toLowerCase().includes(permissionSearch.toLowerCase())
      )
    : permissions

  // Group permissions by category
  const permissionsByCategory = filteredPermissions.reduce((acc, perm) => {
    const category = perm.name?.split('.')[0] || 'Other'
    if (!acc[category]) acc[category] = []
    acc[category].push(perm)
    return acc
  }, {})

  // Get all categories sorted
  const categories = Object.keys(permissionsByCategory).sort()

  const handleEditGroup = (group) => {
    setEditingGroup(group)
    setGroupForm({
      name: group.name,
      description: group.description || '',
      permissions: group.permissions?.map(p => p.id) || []
    })
    setPermissionSearch('')
    setView('edit')
  }

  const handleAddGroup = () => {
    setEditingGroup(null)
    setGroupForm({ name: '', description: '', permissions: [] })
    setPermissionSearch('')
    setView('edit')
  }

  const handlePermissionToggle = (permId) => {
    setGroupForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permId)
        ? prev.permissions.filter(id => id !== permId)
        : [...prev.permissions, permId]
    }))
  }

  const handleSelectAllCategory = (category, selected) => {
    const categoryPermIds = permissionsByCategory[category].map(p => p.id)
    setGroupForm(prev => ({
      ...prev,
      permissions: selected
        ? [...new Set([...prev.permissions, ...categoryPermIds])]
        : prev.permissions.filter(id => !categoryPermIds.includes(id))
    }))
  }

  const handleSubmitGroup = (e) => {
    e.preventDefault()
    if (!groupForm.name.trim()) {
      toast.error('Group name is required')
      return
    }
    groupMutation.mutate({
      name: groupForm.name,
      description: groupForm.description,
      permission_ids: groupForm.permissions
    })
  }

  const handleRefresh = () => {
    refetchGroups()
    refetchPermissions()
    toast.success('Refreshed')
  }

  if (permissionsLoading || groupsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // Edit View
  if (view === 'edit') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              {editingGroup ? 'EDIT PERMISSIONS' : 'ADD PERMISSION GROUP'}
            </h1>
          </div>

          <form onSubmit={handleSubmitGroup}>
            <div className="p-6 space-y-6">
              {/* Group Name and Search */}
              <div className="flex items-end gap-6">
                <div className="flex-1 max-w-md">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">GroupName*</label>
                  <input
                    type="text"
                    value={groupForm.name}
                    onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter group name"
                    required
                  />
                </div>
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Search Permissions</label>
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500 dark:text-gray-400" />
                    <input
                      type="text"
                      value={permissionSearch}
                      onChange={(e) => setPermissionSearch(e.target.value)}
                      className="pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 w-64"
                      placeholder="Search permissions..."
                    />
                  </div>
                </div>
              </div>

              {/* Search Results Info */}
              {permissionSearch && (
                <div className="text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                  Found {filteredPermissions.length} permission{filteredPermissions.length !== 1 ? 's' : ''} matching "{permissionSearch}"
                  {filteredPermissions.length === 0 && (
                    <span className="text-red-500 ml-2">- No results found</span>
                  )}
                </div>
              )}

              {/* Permissions */}
              <div className="space-y-4">
                <div className="bg-teal-500 text-white px-4 py-2 rounded-t-md font-medium">
                  Permissions
                </div>
                <div className="border border-gray-200 rounded-b-md p-4 space-y-4 max-h-[500px] overflow-y-auto">
                  {categories.length === 0 && (
                    <p className="text-gray-500 dark:text-gray-400 text-sm">No permissions found</p>
                  )}
                  {categories.map(category => (
                    <div key={category} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-gray-900 dark:text-white capitalize text-sm">{category}</h4>
                        <label className="flex items-center text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                          <input
                            type="checkbox"
                            checked={permissionsByCategory[category].every(p => groupForm.permissions.includes(p.id))}
                            onChange={(e) => handleSelectAllCategory(category, e.target.checked)}
                            className="rounded border-gray-300 text-teal-600 mr-1"
                          />
                          All
                        </label>
                      </div>
                      <div className="space-y-1 pl-2">
                        {permissionsByCategory[category].map(perm => (
                          <label key={perm.id} className="flex items-center cursor-pointer py-0.5">
                            <input
                              type="checkbox"
                              checked={groupForm.permissions.includes(perm.id)}
                              onChange={() => handlePermissionToggle(perm.id)}
                              className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                            />
                            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400">
                              {perm.description || perm.name}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={groupMutation.isPending}
                  className="px-6 py-2 bg-teal-500 text-white rounded-md hover:bg-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50"
                >
                  {groupMutation.isPending ? 'Saving...' : (editingGroup ? 'Update' : 'Create')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setView('list')
                    setEditingGroup(null)
                  }}
                  className="px-6 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                >
                  <ArrowLeftIcon className="h-4 w-4 inline mr-1" />
                  Back to List
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // List View
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">PERMISSIONS</h1>
        </div>

        <div className="p-6">
          {/* Action Buttons */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              <button
                onClick={handleRefresh}
                className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white hover:bg-gray-50 dark:bg-gray-700"
              >
                <ArrowPathIcon className="h-4 w-4 mr-2" />
                Refresh
              </button>
              <button
                onClick={handleAddGroup}
                className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white hover:bg-gray-50 dark:bg-gray-700"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Add
              </button>
              {permissions.length === 0 && (
                <button
                  onClick={() => seedMutation.mutate()}
                  disabled={seedMutation.isPending}
                  className="inline-flex items-center px-4 py-2 border border-blue-300 rounded-md shadow-sm text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100"
                >
                  {seedMutation.isPending ? 'Seeding...' : 'Seed Default Permissions'}
                </button>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500 dark:text-gray-400" />
              <input
                type="text"
                placeholder="Search groups..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm w-48"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto border border-gray-200 rounded-md">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                    Permissions
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredGroups.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-8 text-center text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                      No permission groups found
                    </td>
                  </tr>
                ) : (
                  filteredGroups.map((group, index) => (
                    <tr key={group.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {group.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {group.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                        {group.permissions?.length || 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditGroup(group)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Edit"
                          >
                            <PencilIcon className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Delete this permission group?')) {
                                deleteGroupMutation.mutate(group.id)
                              }
                            }}
                            className="text-red-600 hover:text-red-900"
                            title="Delete"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-4 text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
            <span>total: {filteredGroups.length}</span>
            <div className="flex items-center gap-2">
              <span>Page size:</span>
              <select className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm">
                <option>10</option>
                <option>25</option>
                <option>50</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
