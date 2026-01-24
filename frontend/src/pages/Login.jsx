import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useBrandingStore } from '../store/brandingStore'
import toast from 'react-hot-toast'
import {
  UserIcon,
  LockClosedIcon,
  ShieldCheckIcon,
  WifiIcon,
  ChartBarIcon,
  CogIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [twoFACode, setTwoFACode] = useState('')
  const [requires2FA, setRequires2FA] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const { companyName, companyLogo, fetchBranding, loaded } = useBrandingStore()

  useEffect(() => {
    if (!loaded) {
      fetchBranding()
    }
  }, [loaded, fetchBranding])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    const result = await login(username, password, twoFACode)

    if (result.success) {
      toast.success('Login successful')
      if (result.userType === 'customer') {
        navigate('/portal')
      } else {
        navigate('/')
      }
    } else if (result.requires_2fa) {
      setRequires2FA(true)
      toast('Please enter your 2FA code', { icon: '🔐' })
    } else {
      toast.error(result.message || 'Login failed')
    }

    setLoading(false)
  }

  const handleBack = () => {
    setRequires2FA(false)
    setTwoFACode('')
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Branding & Features */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-12 flex-col justify-between relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full -translate-x-1/2 -translate-y-1/2"></div>
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-white rounded-full translate-x-1/2 translate-y-1/2"></div>
        </div>

        {/* Logo & Name */}
        <div className="relative z-10">
          <div className="flex items-center gap-4">
            {companyLogo ? (
              <img src={companyLogo} alt={companyName} className="h-16 object-contain" />
            ) : (
              <>
                <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
                  <WifiIcon className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-white">{companyName}</h1>
                  <p className="text-blue-200 text-sm">ISP Management System</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Features */}
        <div className="relative z-10 space-y-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center flex-shrink-0">
              <WifiIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-lg">PPPoE Management</h3>
              <p className="text-blue-200 text-sm">Complete subscriber and session management with real-time monitoring</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center flex-shrink-0">
              <ChartBarIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-lg">Bandwidth Control</h3>
              <p className="text-blue-200 text-sm">FUP quotas, time-based speed control, and usage monitoring</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center flex-shrink-0">
              <CogIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-lg">MikroTik Integration</h3>
              <p className="text-blue-200 text-sm">Seamless RADIUS and API integration with MikroTik routers</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10">
          <p className="text-blue-200 text-sm">High Performance ISP Management Solution</p>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center gap-3 mb-4">
              {companyLogo ? (
                <img src={companyLogo} alt={companyName} className="h-12 object-contain" />
              ) : (
                <>
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                    <WifiIcon className="w-7 h-7 text-blue-600" />
                  </div>
                  <h1 className="text-2xl font-bold text-gray-900">{companyName}</h1>
                </>
              )}
            </div>
          </div>

          {/* Login Card */}
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
            {!requires2FA ? (
              <>
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-gray-900">Welcome Back</h2>
                  <p className="text-gray-500 mt-1">Sign in to your account</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1.5">
                      Username
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <UserIcon className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        id="username"
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="block w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        placeholder="Enter your username"
                        autoComplete="username"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <LockClosedIcon className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        id="password"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="block w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        placeholder="Enter your password"
                        autoComplete="current-password"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Signing in...
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </button>
                </form>

                <div className="mt-6 text-center">
                  <p className="text-sm text-gray-500">
                    Admin, Reseller, or PPPoE Customer
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                    <ShieldCheckIcon className="w-8 h-8 text-blue-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900">Two-Factor Authentication</h2>
                  <p className="text-gray-500 mt-1">Enter the 6-digit code from your authenticator app</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="twoFACode" className="block text-sm font-medium text-gray-700 mb-1.5">
                      Authentication Code
                    </label>
                    <input
                      id="twoFACode"
                      type="text"
                      required
                      value={twoFACode}
                      onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="block w-full py-4 text-center text-2xl tracking-[0.5em] font-mono border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="000000"
                      maxLength={6}
                      autoComplete="one-time-code"
                      autoFocus
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || twoFACode.length !== 6}
                    className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Verifying...
                      </>
                    ) : (
                      'Verify & Sign In'
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleBack}
                    className="w-full py-2 text-sm text-gray-600 hover:text-gray-900 flex items-center justify-center gap-1"
                  >
                    <ArrowLeftIcon className="w-4 h-4" />
                    Back to login
                  </button>
                </form>
              </>
            )}
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-sm text-gray-400">
            {companyName} - ISP Management System
          </p>
        </div>
      </div>
    </div>
  )
}
