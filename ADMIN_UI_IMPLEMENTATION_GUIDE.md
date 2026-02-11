# License Server Admin UI Implementation Guide

## Overview

This guide provides the exact code needed to add notification functionality to the license server admin panel.

## Location

All changes are made in: `/opt/proxpanel-license/web/admin/src/`

## Files to Create/Modify

### 1. Update Updates.jsx - Add "Notify Customers" Button

**File:** `/opt/proxpanel-license/web/admin/src/pages/Updates.jsx`

**Add after the "Unpublish" button (around line 150):**

```jsx
{update.is_published && (
  <button
    onClick={() => openNotifyModal(update)}
    className="ml-2 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
  >
    Notify Customers
  </button>
)}
```

**Add state at top of component:**

```jsx
const [showNotifyModal, setShowNotifyModal] = useState(false)
const [selectedUpdate, setSelectedUpdate] = useState(null)
const [showStatusModal, setShowStatusModal] = useState(false)
```

**Add functions:**

```jsx
const openNotifyModal = (update) => {
  setSelectedUpdate(update)
  setShowNotifyModal(true)
}

const closeNotifyModal = () => {
  setShowNotifyModal(false)
  setSelectedUpdate(null)
}

const openStatusModal = (update) => {
  setSelectedUpdate(update)
  setShowStatusModal(true)
}

const closeStatusModal = () => {
  setShowStatusModal(false)
  setSelectedUpdate(null)
}
```

**Add modal components at end of return statement:**

```jsx
{showNotifyModal && (
  <NotifyModal
    update={selectedUpdate}
    onClose={closeNotifyModal}
    onSuccess={() => {
      closeNotifyModal()
      openStatusModal(selectedUpdate)
    }}
  />
)}

{showStatusModal && (
  <NotificationStatusModal
    update={selectedUpdate}
    onClose={closeStatusModal}
  />
)}
```

### 2. Create NotifyModal Component

**File:** `/opt/proxpanel-license/web/admin/src/components/NotifyModal.jsx`

```jsx
import { useState } from 'react'
import api from '../services/api'

export default function NotifyModal({ update, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [formData, setFormData] = useState({
    priority: 'important',
    subject: `Update Available - ${update.version}`,
    message: update.description || '',
    filter: 'all',
    filterValue: '',
    channels: ['email', 'in-app'],
    autoSend: true
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await api.post(
        `/admin/updates/${update.version}/notify`,
        formData
      )

      if (response.data.success) {
        onSuccess()
      } else {
        setError(response.data.message || 'Failed to send notifications')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send notifications')
    } finally {
      setLoading(false)
    }
  }

  const toggleChannel = (channel) => {
    if (formData.channels.includes(channel)) {
      setFormData({
        ...formData,
        channels: formData.channels.filter(c => c !== channel)
      })
    } else {
      setFormData({
        ...formData,
        channels: [...formData.channels, channel]
      })
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              Send Update Notification - {update.version}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-800">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Priority */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Priority
              </label>
              <div className="flex space-x-4">
                {['critical', 'important', 'info'].map(priority => (
                  <label key={priority} className="flex items-center">
                    <input
                      type="radio"
                      name="priority"
                      value={priority}
                      checked={formData.priority === priority}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                      className="mr-2"
                    />
                    <span className="capitalize">{priority}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Subject */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subject
              </label>
              <input
                type="text"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {/* Message */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Message
              </label>
              <textarea
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                rows={5}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {/* Filter */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Customers
              </label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="filter"
                    value="all"
                    checked={formData.filter === 'all'}
                    onChange={(e) => setFormData({ ...formData, filter: e.target.value })}
                    className="mr-2"
                  />
                  All Active Customers
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="filter"
                    value="outdated"
                    checked={formData.filter === 'outdated'}
                    onChange={(e) => setFormData({ ...formData, filter: e.target.value })}
                    className="mr-2"
                  />
                  Outdated Versions Only (older than:
                  <input
                    type="text"
                    value={formData.filterValue}
                    onChange={(e) => setFormData({ ...formData, filterValue: e.target.value, filter: 'outdated' })}
                    placeholder="v1.0.180"
                    className="ml-2 px-2 py-1 border border-gray-300 rounded"
                  />
                  )
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="filter"
                    value="tier"
                    checked={formData.filter === 'tier'}
                    onChange={(e) => setFormData({ ...formData, filter: e.target.value })}
                    className="mr-2"
                  />
                  Specific Tier:
                  <input
                    type="text"
                    value={formData.filterValue}
                    onChange={(e) => setFormData({ ...formData, filterValue: e.target.value, filter: 'tier' })}
                    placeholder="enterprise"
                    className="ml-2 px-2 py-1 border border-gray-300 rounded"
                  />
                </label>
              </div>
            </div>

            {/* Channels */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notification Channels
              </label>
              <div className="flex space-x-4">
                {['email', 'sms', 'in-app'].map(channel => (
                  <label key={channel} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.channels.includes(channel)}
                      onChange={() => toggleChannel(channel)}
                      className="mr-2"
                    />
                    <span className="capitalize">{channel}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Buttons */}
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                disabled={loading || formData.channels.length === 0}
              >
                {loading ? 'Sending...' : 'Send Notifications'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
```

### 3. Create NotificationStatusModal Component

**File:** `/opt/proxpanel-license/web/admin/src/components/NotificationStatusModal.jsx`

```jsx
import { useState, useEffect } from 'react'
import api from '../services/api'

export default function NotificationStatusModal({ update, onClose }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchStatus()
  }, [])

  const fetchStatus = async () => {
    try {
      const response = await api.get(
        `/admin/updates/${update.version}/notification-status`
      )

      if (response.data.success) {
        setData(response.data)
      } else {
        setError('Failed to fetch notification status')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch notification status')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'sent': return 'text-green-600'
      case 'pending': return 'text-yellow-600'
      case 'failed': return 'text-red-600'
      case 'read': return 'text-blue-600'
      default: return 'text-gray-600'
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              Notification Status - {update.version}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          {loading && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading status...</p>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-800 mb-4">
              {error}
            </div>
          )}

          {data && !loading && (
            <>
              {/* Statistics */}
              <div className="grid grid-cols-5 gap-4 mb-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{data.stats.total}</div>
                  <div className="text-sm text-gray-600">Total</div>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">{data.stats.pending}</div>
                  <div className="text-sm text-yellow-700">Pending</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{data.stats.sent}</div>
                  <div className="text-sm text-green-700">Sent</div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{data.stats.failed}</div>
                  <div className="text-sm text-red-700">Failed</div>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{data.stats.read}</div>
                  <div className="text-sm text-blue-700">Read</div>
                </div>
              </div>

              {/* Notifications Table */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Sent At
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {data.notifications.map((notification) => (
                      <tr key={notification.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {notification.customer_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {notification.customer_email}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 uppercase">
                          {notification.notification_type}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${getStatusColor(notification.status)}`}>
                          {notification.status}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {notification.sent_at
                            ? new Date(notification.sent_at).toLocaleString()
                            : '-'
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {data.notifications.filter(n => n.status === 'failed').length > 0 && (
                <div className="mt-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed Notifications</h3>
                  {data.notifications.filter(n => n.status === 'failed').map((notification) => (
                    <div key={notification.id} className="p-3 bg-red-50 border border-red-200 rounded mb-2">
                      <div className="font-medium text-red-900">{notification.customer_name}</div>
                      <div className="text-sm text-red-700">{notification.error_message}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

### 4. Update API Service

**File:** `/opt/proxpanel-license/web/admin/src/services/api.js`

**Add to exports:**

```javascript
export const notificationApi = {
  sendUpdateNotification: (version, data) =>
    api.post(`/admin/updates/${version}/notify`, data),
  getNotificationStatus: (version) =>
    api.get(`/admin/updates/${version}/notification-status`),
  testNotification: (data) =>
    api.post(`/admin/notifications/test`, data),
}
```

### 5. Import Components in Updates.jsx

**Add to top of Updates.jsx:**

```jsx
import NotifyModal from '../components/NotifyModal'
import NotificationStatusModal from '../components/NotificationStatusModal'
```

## Testing Steps

### 1. Test Modal Opens

```javascript
// In browser console on Updates page
console.log('Test modal open')
```

### 2. Test API Connection

```bash
# From license server
curl -X POST http://localhost:8080/api/v1/admin/notifications/test \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","type":"email"}'
```

### 3. Test End-to-End Flow

1. Log in to license server admin panel
2. Go to Updates page
3. Click "Notify Customers" on a published update
4. Fill out form
5. Click "Send Notifications"
6. Verify status modal appears
7. Check email inbox for test email

## Deployment Checklist

- [ ] Copy NotifyModal.jsx to license server
- [ ] Copy NotificationStatusModal.jsx to license server
- [ ] Update Updates.jsx with button and modals
- [ ] Update api.js with notification functions
- [ ] Rebuild admin panel: `npm run build`
- [ ] Restart license server
- [ ] Test modal opens
- [ ] Test form submission
- [ ] Test email delivery
- [ ] Test status view

## Quick Deploy Script

```bash
#!/bin/bash
# Deploy notification UI to license server

# SSH to license server
ssh root@109.110.185.33 << 'EOF'
cd /opt/proxpanel-license/web/admin

# Create components directory if not exists
mkdir -p src/components

# Copy files (paste content manually or scp)
# NotifyModal.jsx
# NotificationStatusModal.jsx
# Update Updates.jsx
# Update api.js

# Rebuild
npm run build

# Restart
cd /opt/proxpanel-license
docker compose restart license-server

echo "Admin UI deployed successfully!"
EOF
```

## Success Criteria

UI is ready when:
- ✅ "Notify Customers" button appears on Updates page
- ✅ Clicking button opens NotifyModal
- ✅ Form validates all fields
- ✅ Submit sends notifications
- ✅ Status modal shows delivery statistics
- ✅ Failed notifications show error messages
- ✅ Modal can be closed without breaking page

---

**Estimated Time:** 2-3 hours to implement and test
**Complexity:** Medium
**Priority:** High (required for system to be usable)
