import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Subscribers from './pages/Subscribers'
import SubscriberEdit from './pages/SubscriberEdit'
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
  const { isAuthenticated, isCustomer } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // If logged in as customer, redirect to customer portal
  if (isCustomer) {
    return <Navigate to="/portal" replace />
  }

  return children
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
                <Route path="/subscribers" element={<Subscribers />} />
                <Route path="/subscribers/new" element={<SubscriberEdit />} />
                <Route path="/subscribers/:id" element={<SubscriberEdit />} />
                <Route path="/services" element={<Services />} />
                <Route path="/nas" element={<Nas />} />
                <Route path="/resellers" element={<Resellers />} />
                <Route path="/sessions" element={<Sessions />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/users" element={<Users />} />
                <Route path="/invoices" element={<Invoices />} />
                <Route path="/prepaid" element={<Prepaid />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/audit" element={<AuditLogs />} />
                <Route path="/communication" element={<CommunicationRules />} />
                <Route path="/bandwidth" element={<BandwidthRules />} />
                <Route path="/fup" element={<FUPCounters />} />
                <Route path="/tickets" element={<Tickets />} />
                <Route path="/backups" element={<Backups />} />
                <Route path="/permissions" element={<Permissions />} />
                <Route path="/change-bulk" element={<ChangeBulk />} />
                <Route path="/sharing" element={<SharingDetection />} />
                <Route path="/cdn" element={<CDNList />} />
                <Route path="/cdn-bandwidth-rules" element={<CDNBandwidthRules />} />
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
