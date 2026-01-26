import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Subscribers from './pages/Subscribers'
import SubscriberEdit from './pages/SubscriberEdit'
import SubscriberImport from './pages/SubscriberImport'
import Services from './pages/Services'
import Nas from './pages/Nas'
import Resellers from './pages/Resellers'
import Sessions from './pages/Sessions'
import Transactions from './pages/Transactions'
import Settings from './pages/Settings'
import Users from './pages/Users'
import Invoices from './pages/Invoices'
import Prepaid from './pages/Prepaid'
import Reports from './pages/Reports'
import AuditLogs from './pages/AuditLogs'
import CommunicationRules from './pages/CommunicationRules'
import BandwidthRules from './pages/BandwidthRules'
import FUPCounters from './pages/FUPCounters'
import Tickets from './pages/Tickets'
import Backups from './pages/Backups'
import Permissions from './pages/Permissions'
import ChangeBulk from './pages/ChangeBulk'
import CustomerPortal from './pages/CustomerPortal'
import SharingDetection from './pages/SharingDetection'
import CDNList from './pages/CDNList'
import CDNBandwidthRules from './pages/CDNBandwidthRules'
import ChangePassword from './pages/ChangePassword'

// Admin/Reseller private route - redirects customers to portal
function PrivateRoute({ children }) {
  const { isAuthenticated, isCustomer, refreshUser } = useAuthStore()

  // Refresh user data (including permissions) on mount
  useEffect(() => {
    if (isAuthenticated && !isCustomer) {
      refreshUser()
    }
  }, [isAuthenticated, isCustomer, refreshUser])

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // If logged in as customer, redirect to customer portal
  if (isCustomer) {
    return <Navigate to="/portal" replace />
  }

  return children
}

// Permission-protected route - checks if user has required permission
function PermissionRoute({ children, permission, adminOnly = false }) {
  const { hasPermission, isAdmin } = useAuthStore()

  // Admin-only routes
  if (adminOnly && !isAdmin()) {
    return <AccessDenied />
  }

  // Permission-protected routes
  if (permission && !hasPermission(permission)) {
    return <AccessDenied />
  }

  return children
}

// Access Denied component
function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="text-6xl mb-4">🚫</div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
      <p className="text-gray-600 mb-4">You don't have permission to access this page.</p>
      <a href="/" className="btn btn-primary">Go to Dashboard</a>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/portal" element={<CustomerPortal />} />
      <Route path="/login" element={<Login />} />
      <Route path="/change-password" element={<ChangePassword />} />
      <Route
        path="/*"
        element={
          <PrivateRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/subscribers" element={<PermissionRoute permission="subscribers.view"><Subscribers /></PermissionRoute>} />
                <Route path="/subscribers/new" element={<PermissionRoute permission="subscribers.create"><SubscriberEdit /></PermissionRoute>} />
                <Route path="/subscribers/:id" element={<PermissionRoute permission="subscribers.view"><SubscriberEdit /></PermissionRoute>} />
                <Route path="/subscribers/import" element={<PermissionRoute permission="subscribers.create"><SubscriberImport /></PermissionRoute>} />
                <Route path="/services" element={<PermissionRoute permission="services.view"><Services /></PermissionRoute>} />
                <Route path="/nas" element={<PermissionRoute adminOnly><Nas /></PermissionRoute>} />
                <Route path="/resellers" element={<PermissionRoute permission="resellers.view"><Resellers /></PermissionRoute>} />
                <Route path="/sessions" element={<PermissionRoute permission="sessions.view"><Sessions /></PermissionRoute>} />
                <Route path="/transactions" element={<PermissionRoute permission="transactions.view"><Transactions /></PermissionRoute>} />
                <Route path="/settings" element={<PermissionRoute adminOnly><Settings /></PermissionRoute>} />
                <Route path="/users" element={<PermissionRoute adminOnly><Users /></PermissionRoute>} />
                <Route path="/invoices" element={<PermissionRoute permission="invoices.view"><Invoices /></PermissionRoute>} />
                <Route path="/prepaid" element={<PermissionRoute permission="prepaid.view"><Prepaid /></PermissionRoute>} />
                <Route path="/reports" element={<PermissionRoute permission="reports.view"><Reports /></PermissionRoute>} />
                <Route path="/audit" element={<PermissionRoute adminOnly><AuditLogs /></PermissionRoute>} />
                <Route path="/communication" element={<PermissionRoute adminOnly><CommunicationRules /></PermissionRoute>} />
                <Route path="/bandwidth" element={<PermissionRoute adminOnly><BandwidthRules /></PermissionRoute>} />
                <Route path="/fup" element={<PermissionRoute adminOnly><FUPCounters /></PermissionRoute>} />
                <Route path="/tickets" element={<PermissionRoute permission="tickets.view"><Tickets /></PermissionRoute>} />
                <Route path="/backups" element={<PermissionRoute adminOnly><Backups /></PermissionRoute>} />
                <Route path="/permissions" element={<PermissionRoute adminOnly><Permissions /></PermissionRoute>} />
                <Route path="/change-bulk" element={<PermissionRoute adminOnly><ChangeBulk /></PermissionRoute>} />
                <Route path="/sharing" element={<PermissionRoute adminOnly><SharingDetection /></PermissionRoute>} />
                <Route path="/cdn" element={<PermissionRoute adminOnly><CDNList /></PermissionRoute>} />
                <Route path="/cdn-bandwidth-rules" element={<PermissionRoute adminOnly><CDNBandwidthRules /></PermissionRoute>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </PrivateRoute>
        }
      />
    </Routes>
  )
}

export default App
