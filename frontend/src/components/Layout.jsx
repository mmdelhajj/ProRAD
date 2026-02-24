import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useBrandingStore } from '../store/brandingStore'
import { useThemeStore } from '../store/themeStore'
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
  Bars2Icon,
  CheckIcon,
  ArrowUturnLeftIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  EyeIcon,
  EyeSlashIcon,
  WrenchScrewdriverIcon,
  BoltIcon,
  BanknotesIcon,
  DevicePhoneMobileIcon,
  PaintBrushIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

// Navigation items with permission requirements
const allNavigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon, permission: 'dashboard.view' },
  { name: 'Subscribers', href: '/subscribers', icon: UsersIcon, permission: 'subscribers.view' },
  { name: 'Services', href: '/services', icon: CogIcon, permission: 'services.view' },
  { name: 'CDN List', href: '/cdn', icon: GlobeAltIcon, permission: 'admin' },
  { name: 'CDN Bandwidth Rules', href: '/cdn-bandwidth-rules', icon: AdjustmentsHorizontalIcon, permission: 'admin' },
  { name: 'CDN Port Rules', href: '/cdn-port-rules', icon: BoltIcon, permission: 'admin' },
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
  { name: 'WhatsApp', href: '/whatsapp', icon: DevicePhoneMobileIcon, permission: 'notifications.whatsapp', resellerOnly: true },
  { name: 'Branding', href: '/reseller-branding', icon: PaintBrushIcon, permission: null, resellerOnly: true, rebrandOnly: true },
  { name: 'Users', href: '/users', icon: UserGroupIcon, permission: 'users.view' },
  { name: 'Permissions', href: '/permissions', icon: ShieldCheckIcon, permission: 'permissions.view' },
  { name: 'Audit Logs', href: '/audit', icon: ClipboardDocumentListIcon, permission: 'audit.view' },
  { name: 'Backups', href: '/backups', icon: CloudArrowUpIcon, permission: 'backups.view' },
  { name: 'Settings', href: '/settings', icon: CogIcon, permission: 'settings.view' },
  { name: 'Change Bulk', href: '/change-bulk', icon: QueueListIcon, permission: 'subscribers.change_bulk' },
  { name: 'Sharing Detection', href: '/sharing', icon: ShieldExclamationIcon, permission: 'admin' },
  { name: 'Diagnostic Tools', href: '/diagnostic-tools', icon: WrenchScrewdriverIcon, permission: 'admin' },
]

// Get saved menu order from localStorage
const getSavedMenuOrder = () => {
  try {
    const saved = localStorage.getItem('menuOrder')
    if (saved) {
      return JSON.parse(saved)
    }
  } catch (e) {
    console.error('Failed to load menu order:', e)
  }
  return null
}

// Save menu order to localStorage
const saveMenuOrder = (order) => {
  try {
    localStorage.setItem('menuOrder', JSON.stringify(order))
  } catch (e) {
    console.error('Failed to save menu order:', e)
  }
}

// Get saved hidden items from localStorage
const getSavedHiddenItems = () => {
  try {
    const saved = localStorage.getItem('menuHidden')
    if (saved) {
      return new Set(JSON.parse(saved))
    }
  } catch (e) {
    console.error('Failed to load hidden items:', e)
  }
  return new Set()
}

// Save hidden items to localStorage
const saveHiddenItems = (hiddenSet) => {
  try {
    localStorage.setItem('menuHidden', JSON.stringify([...hiddenSet]))
  } catch (e) {
    console.error('Failed to save hidden items:', e)
  }
}

// Apply saved order to navigation
const applyMenuOrder = (navigation, savedOrder) => {
  if (!savedOrder || savedOrder.length === 0) return navigation

  const orderMap = new Map(savedOrder.map((href, index) => [href, index]))
  const sorted = [...navigation].sort((a, b) => {
    const orderA = orderMap.has(a.href) ? orderMap.get(a.href) : 999
    const orderB = orderMap.has(b.href) ? orderMap.get(b.href) : 999
    return orderA - orderB
  })
  return sorted
}

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [orderedNav, setOrderedNav] = useState([])
  const [hiddenItems, setHiddenItems] = useState(() => getSavedHiddenItems())

  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout, hasPermission, isAdmin, isReseller, refreshUser } = useAuthStore()
  const { companyName, companyLogo, fetchBranding, loaded } = useBrandingStore()
  const { theme, toggleTheme } = useThemeStore()

  // Fetch branding on mount
  useEffect(() => {
    if (!loaded) {
      fetchBranding()
    }
  }, [loaded, fetchBranding])

  // Refresh reseller balance periodically
  useEffect(() => {
    if (!isReseller()) return
    const interval = setInterval(() => {
      refreshUser()
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  // Filter and order navigation
  useEffect(() => {
    const filtered = allNavigation.filter((item) => {
      if (item.rebrandOnly) return isReseller() && user?.reseller?.rebrand_enabled
      if (item.permission === null) return true
      if (item.permission === 'admin') return isAdmin()
      if (item.resellerOnly) return isReseller() && hasPermission(item.permission)
      return hasPermission(item.permission)
    })
    const savedOrder = getSavedMenuOrder()
    const ordered = applyMenuOrder(filtered, savedOrder)
    setOrderedNav(ordered)
  }, [hasPermission, isAdmin, isReseller, user])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // Move item up
  const moveUp = useCallback((index) => {
    if (index <= 0) return
    setOrderedNav(prev => {
      const newNav = [...prev]
      const temp = newNav[index]
      newNav[index] = newNav[index - 1]
      newNav[index - 1] = temp
      // Save to localStorage
      const newOrder = newNav.map(item => item.href)
      saveMenuOrder(newOrder)
      return newNav
    })
  }, [])

  // Move item down
  const moveDown = useCallback((index) => {
    setOrderedNav(prev => {
      if (index >= prev.length - 1) return prev
      const newNav = [...prev]
      const temp = newNav[index]
      newNav[index] = newNav[index + 1]
      newNav[index + 1] = temp
      // Save to localStorage
      const newOrder = newNav.map(item => item.href)
      saveMenuOrder(newOrder)
      return newNav
    })
  }, [])

  // Toggle item visibility
  const toggleHidden = useCallback((href) => {
    setHiddenItems(prev => {
      const next = new Set(prev)
      if (next.has(href)) {
        next.delete(href)
      } else {
        next.add(href)
      }
      saveHiddenItems(next)
      return next
    })
  }, [])

  // Show all hidden items
  const handleShowAll = useCallback(() => {
    setHiddenItems(new Set())
    saveHiddenItems(new Set())
  }, [])

  const handleResetOrder = () => {
    localStorage.removeItem('menuOrder')
    localStorage.removeItem('menuHidden')
    setHiddenItems(new Set())
    // Re-filter and use default order
    const filtered = allNavigation.filter((item) => {
      if (item.rebrandOnly) return isReseller() && user?.reseller?.rebrand_enabled
      if (item.permission === null) return true
      if (item.permission === 'admin') return isAdmin()
      if (item.resellerOnly) return isReseller() && hasPermission(item.permission)
      return hasPermission(item.permission)
    })
    setOrderedNav(filtered)
  }

  const toggleEditMode = () => {
    setEditMode(!editMode)
  }

  // Edit mode controls
  const EditModeControls = () => (
    <div className="flex items-center gap-1 px-2 py-2 border-b dark:border-gray-700 bg-amber-50 dark:bg-amber-900/30">
      <button
        onClick={handleResetOrder}
        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded"
        title="Reset order and show all"
      >
        <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
        Reset
      </button>
      {hiddenItems.size > 0 && (
        <button
          onClick={handleShowAll}
          className="flex items-center gap-1 px-2 py-1 text-xs text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded"
          title="Show all hidden items"
        >
          <EyeIcon className="w-3.5 h-3.5" />
          Show All
        </button>
      )}
      <div className="flex-1" />
      <button
        onClick={toggleEditMode}
        className="flex items-center gap-1 px-2 py-1 text-xs text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/50 hover:bg-green-200 dark:hover:bg-green-900/70 rounded font-medium"
      >
        <CheckIcon className="w-3.5 h-3.5" />
        Done
      </button>
    </div>
  )

  // Render navigation items
  const renderNavItems = (isMobile = false) => {
    return orderedNav
      .filter(item => editMode || !hiddenItems.has(item.href))
      .map((item, index) => {
        const isActive = location.pathname === item.href
        const Icon = item.icon
        const isHidden = hiddenItems.has(item.href)

        if (editMode) {
          return (
            <div
              key={item.href}
              className={clsx(
                'flex items-center gap-1 px-1 py-0.5 text-xs font-medium rounded-md',
                isHidden
                  ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 line-through'
                  : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200'
              )}
            >
              <div className="flex flex-col">
                <button
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-500 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronUpIcon className="w-3 h-3" />
                </button>
                <button
                  onClick={() => moveDown(index)}
                  disabled={index === orderedNav.length - 1}
                  className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-500 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronDownIcon className="w-3 h-3" />
                </button>
              </div>
              <button
                onClick={() => toggleHidden(item.href)}
                className={clsx(
                  'p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-500',
                  isHidden ? 'text-red-400 dark:text-red-500' : 'text-gray-500 dark:text-gray-400'
                )}
                title={isHidden ? 'Show item' : 'Hide item'}
              >
                {isHidden ? <EyeSlashIcon className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5" />}
              </button>
              <Icon className={clsx('w-4 h-4 flex-shrink-0', isHidden ? 'text-gray-400 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400')} />
              <span className="truncate flex-1">{item.name}</span>
            </div>
          )
        }

        return (
          <Link
            key={item.href}
            to={item.href}
            onClick={isMobile ? () => setSidebarOpen(false) : undefined}
            className={clsx(
              'flex items-center px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors',
              isActive
                ? 'bg-primary-50 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            )}
          >
            <Icon className="w-4 h-4 mr-2 flex-shrink-0" />
            <span className="truncate">{item.name}</span>
          </Link>
        )
      })
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-80 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <div
        className={clsx(
          'fixed inset-y-0 left-0 z-50 w-56 bg-white dark:bg-gray-800 shadow-xl transform transition-transform lg:hidden flex flex-col',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between h-12 px-3 border-b dark:border-gray-700 flex-shrink-0 dark:bg-gray-800">
          <div
            className="flex items-center gap-2 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={toggleTheme}
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {companyLogo ? (
              <img src={companyLogo} alt={companyName} className="h-8 object-contain flex-shrink-0" />
            ) : (
              <span className="text-base font-bold text-primary-600 dark:text-primary-400 truncate">{companyName}</span>
            )}
          </div>
          <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0 dark:text-gray-300">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        {editMode && <EditModeControls />}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {renderNavItems(true)}
        </nav>
        <div className="p-2 border-t dark:border-gray-700 flex-shrink-0 bg-gray-50 dark:bg-gray-900">
          {(isAdmin() || isReseller()) && !editMode && (
            <button
              onClick={toggleEditMode}
              className="flex items-center w-full px-2.5 py-1.5 mb-1 text-xs font-medium text-gray-600 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <Bars2Icon className="w-4 h-4 mr-2" />
              Customize Menu
            </button>
          )}
          <div className="flex items-center px-2 py-1.5 text-xs text-gray-600 dark:text-gray-300">
            <UserCircleIcon className="w-6 h-6 mr-2 text-gray-400 dark:text-gray-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{user?.username}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">
                {user?.user_type === 4 ? 'Admin' : user?.user_type === 2 ? 'Reseller' : 'User'}
              </p>
            </div>
          </div>
          <Link
            to="/profile"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center w-full px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <UserCircleIcon className="w-4 h-4 mr-2" />
            My Profile
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
          >
            <ArrowRightOnRectangleIcon className="w-4 h-4 mr-2" />
            Logout
          </button>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-52 lg:flex-col">
        <div className="flex flex-col flex-1 bg-white dark:bg-gray-800 border-r dark:border-gray-700">
          <div className="flex items-center h-12 px-3 border-b dark:border-gray-700 flex-shrink-0">
            <div
              className="flex items-center gap-2 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={toggleTheme}
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            >
              {companyLogo ? (
                <img src={companyLogo} alt={companyName} className="h-8 object-contain flex-shrink-0" />
              ) : (
                <span className="text-base font-bold text-primary-600 dark:text-primary-400 truncate">{companyName}</span>
              )}
            </div>
          </div>
          {editMode && <EditModeControls />}
          <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
            {renderNavItems(false)}
          </nav>
          <div className="p-2 border-t dark:border-gray-700 flex-shrink-0 bg-gray-50 dark:bg-gray-900">
            {(isAdmin() || isReseller()) && !editMode && (
              <button
                onClick={toggleEditMode}
                className="flex items-center w-full px-2.5 py-1.5 mb-1 text-xs font-medium text-gray-600 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Bars2Icon className="w-4 h-4 mr-2" />
                Customize Menu
              </button>
            )}
            <div className="flex items-center px-2 py-1.5 text-xs text-gray-600 dark:text-gray-300">
              <UserCircleIcon className="w-6 h-6 mr-2 text-gray-400 dark:text-gray-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{user?.username}</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                  {user?.user_type === 4 ? 'Admin' : user?.user_type === 2 ? 'Reseller' : 'User'}
                </p>
              </div>
            </div>
            <Link
              to="/profile"
              className="flex items-center w-full px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <UserCircleIcon className="w-4 h-4 mr-2" />
              My Profile
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center w-full px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
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
        <header className="sticky top-0 z-30 flex items-center h-12 px-3 bg-white dark:bg-gray-800 border-b dark:border-gray-700 lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 -ml-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 lg:hidden dark:text-gray-300"
          >
            <Bars3Icon className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <UpdateNotification />
            {isReseller() && (
              <>
                <div className="hidden sm:flex items-center gap-1.5 text-sm">
                  <BanknotesIcon className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <span className={clsx(
                    'font-semibold',
                    (user?.reseller?.balance ?? 0) >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  )}>
                    ${parseFloat(user?.reseller?.balance ?? 0).toFixed(2)}
                  </span>
                </div>
                <div className="hidden sm:block text-gray-300 dark:text-gray-600">|</div>
              </>
            )}
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
