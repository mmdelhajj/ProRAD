import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useBrandingStore } from '../store/brandingStore'
import Clock from './Clock'
import LicenseBanner from './LicenseBanner'
import UpdateBanner from './UpdateBanner'
import UpdateNotification from './UpdateNotification'
import {
  HomeIcon,
  UsersIcon,
  ServerIcon,
  CogIcon,
  ChartBarIcon,
  CreditCardIcon,
  SignalIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  UserCircleIcon,
  BuildingOfficeIcon,
  DocumentTextIcon,
  TicketIcon,
  ClipboardDocumentListIcon,
  UserGroupIcon,
  BellAlertIcon,
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  CloudArrowUpIcon,
  ShieldCheckIcon,
  QueueListIcon,
  ShieldExclamationIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

// Navigation items with permission requirements
// permission: null = visible to all, 'admin' = admin only, string = specific permission required
const allNavigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon, permission: 'dashboard.view' },
  { name: 'Subscribers', href: '/subscribers', icon: UsersIcon, permission: 'subscribers.view' },
  { name: 'Services', href: '/services', icon: CogIcon, permission: 'services.view' },
  { name: 'CDN List', href: '/cdn', icon: GlobeAltIcon, permission: 'admin' },
  { name: 'CDN Bandwidth Rules', href: '/cdn-bandwidth-rules', icon: AdjustmentsHorizontalIcon, permission: 'admin' },
  { name: 'NAS/Routers', href: '/nas', icon: ServerIcon, permission: 'nas.view' },
  { name: 'Resellers', href: '/resellers', icon: BuildingOfficeIcon, permission: 'resellers.view' },
  { name: 'Sessions', href: '/sessions', icon: SignalIcon, permission: 'sessions.view' },
  { name: 'Bandwidth Rules', href: '/bandwidth', icon: AdjustmentsHorizontalIcon, permission: 'bandwidth.view' },
  { name: 'Communication', href: '/communication', icon: BellAlertIcon, permission: 'communication.access_module' },
  { name: 'Transactions', href: '/transactions', icon: CreditCardIcon, permission: 'transactions.view' },
  { name: 'Invoices', href: '/invoices', icon: DocumentTextIcon, permission: 'invoices.view' },
  { name: 'Prepaid Cards', href: '/prepaid', icon: TicketIcon, permission: 'prepaid.view' },
  { name: 'Reports', href: '/reports', icon: ChartBarIcon, permission: 'reports.view' },
  { name: 'Tickets', href: '/tickets', icon: ChatBubbleLeftRightIcon, permission: 'tickets.view' },
  { name: 'Users', href: '/users', icon: UserGroupIcon, permission: 'users.view' },
  { name: 'Permissions', href: '/permissions', icon: ShieldCheckIcon, permission: 'permissions.view' },
  { name: 'Audit Logs', href: '/audit', icon: ClipboardDocumentListIcon, permission: 'audit.view' },
  { name: 'Backups', href: '/backups', icon: CloudArrowUpIcon, permission: 'backups.view' },
  { name: 'Settings', href: '/settings', icon: CogIcon, permission: 'settings.view' },
  { name: 'Change Bulk', href: '/change-bulk', icon: QueueListIcon, permission: 'subscribers.change_bulk' },
  { name: 'Sharing Detection', href: '/sharing', icon: ShieldExclamationIcon, permission: 'admin' },
]

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout, hasPermission, isAdmin } = useAuthStore()
  const { companyName, companyLogo, fetchBranding, loaded } = useBrandingStore()

  // Fetch branding on mount
  useEffect(() => {
    if (!loaded) {
      fetchBranding()
    }
  }, [loaded, fetchBranding])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // Filter navigation based on permissions
  const navigation = allNavigation.filter((item) => {
    // No permission required - visible to all
    if (item.permission === null) return true
    // Admin only items
    if (item.permission === 'admin') return isAdmin()
    // Check specific permission
    return hasPermission(item.permission)
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <div
        className={clsx(
          'fixed inset-y-0 left-0 z-50 w-56 bg-white shadow-xl transform transition-transform lg:hidden flex flex-col',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between h-12 px-3 border-b flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {companyLogo ? (
              <img src={companyLogo} alt={companyName} className="h-8 object-contain flex-shrink-0" />
            ) : (
              <span className="text-base font-bold text-primary-600 truncate">{companyName}</span>
            )}
          </div>
          <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 flex-shrink-0">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {navigation.map((item) => (
            <Link
              key={item.name}
              to={item.href}
              onClick={() => setSidebarOpen(false)}
              className={clsx(
                'flex items-center px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors',
                location.pathname === item.href
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              <item.icon className="w-4 h-4 mr-2 flex-shrink-0" />
              <span className="truncate">{item.name}</span>
            </Link>
          ))}
        </nav>
        <div className="p-2 border-t flex-shrink-0 bg-gray-50">
          <div className="flex items-center px-2 py-1.5 text-xs text-gray-600">
            <UserCircleIcon className="w-6 h-6 mr-2 text-gray-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{user?.username}</p>
              <p className="text-[10px] text-gray-400">
                {user?.user_type === 4 ? 'Admin' : user?.user_type === 2 ? 'Reseller' : 'User'}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-2.5 py-1.5 text-xs font-medium text-red-600 rounded-md hover:bg-red-50 transition-colors"
          >
            <ArrowRightOnRectangleIcon className="w-4 h-4 mr-2" />
            Logout
          </button>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-52 lg:flex-col">
        <div className="flex flex-col flex-1 bg-white border-r">
          <div className="flex items-center h-12 px-3 border-b flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {companyLogo ? (
                <img src={companyLogo} alt={companyName} className="h-8 object-contain flex-shrink-0" />
              ) : (
                <span className="text-base font-bold text-primary-600 truncate">{companyName}</span>
              )}
            </div>
          </div>
          <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={clsx(
                  'flex items-center px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors',
                  location.pathname === item.href
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                <item.icon className="w-4 h-4 mr-2 flex-shrink-0" />
                <span className="truncate">{item.name}</span>
              </Link>
            ))}
          </nav>
          <div className="p-2 border-t flex-shrink-0 bg-gray-50">
            <div className="flex items-center px-2 py-1.5 text-xs text-gray-600">
              <UserCircleIcon className="w-6 h-6 mr-2 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{user?.username}</p>
                <p className="text-[10px] text-gray-400">
                  {user?.user_type === 4 ? 'Admin' : user?.user_type === 2 ? 'Reseller' : 'User'}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center w-full px-2.5 py-1.5 text-xs font-medium text-red-600 rounded-md hover:bg-red-50 transition-colors"
            >
              <ArrowRightOnRectangleIcon className="w-4 h-4 mr-2" />
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-52">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center h-12 px-3 bg-white border-b lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 -ml-1 rounded-lg hover:bg-gray-100 lg:hidden"
          >
            <Bars3Icon className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <UpdateNotification />
            <Clock />
          </div>
        </header>

        {/* License warning banner */}
        <LicenseBanner />

        {/* Update available banner */}
        <UpdateBanner />

        {/* Page content */}
        <main className="p-3 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
