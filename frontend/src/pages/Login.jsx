import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
  const [searchParams] = useSearchParams()
  const sessionReason = searchParams.get('reason')
  const { login } = useAuthStore()
  const {
    companyName, companyLogo, loginBackground, footerText, primaryColor,
    loginTagline, showLoginFeatures,
    loginFeature1Title, loginFeature1Desc,
    loginFeature2Title, loginFeature2Desc,
    loginFeature3Title, loginFeature3Desc,
    fetchBranding, loaded
  } = useBrandingStore()

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
      if (result.force_password_change) {
        toast('Please change your password to continue', { icon: '🔐' })
        navigate('/change-password')
      } else if (result.userType === 'customer') {
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
      <div
        className="hidden lg:flex lg:w-1/2 p-12 flex-col justify-between relative overflow-hidden"
        style={loginBackground ? {
          backgroundImage: `url(${loginBackground})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : {
          background: `linear-gradient(to bottom right, ${primaryColor || '#2563eb'}, #4338ca)`,
        }}
      >
        {/* Background Overlay for text readability */}
        {loginBackground && <div className="absolute inset-0 bg-black/40"></div>}
        {/* Background Pattern (only show if no custom background) */}
        {!loginBackground && (
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full -translate-x-1/2 -translate-y-1/2"></div>
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-white rounded-full translate-x-1/2 translate-y-1/2"></div>
          </div>
        )}

        {/* Logo & Name - show logo OR name, not both */}
        <div className="relative z-10">
          <div className="flex items-center gap-4">
            {companyLogo ? (
              <img src={companyLogo} alt={companyName || 'Logo'} className="h-16 object-contain" />
            ) : (
              <>
                <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
                  <WifiIcon className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-white">{companyName || 'ISP Management'}</h1>
                  <p className="text-blue-200 text-sm">ISP Management System</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Features */}
        {showLoginFeatures && (
          <div className="relative z-10 space-y-8">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center flex-shrink-0">
                <WifiIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-lg">{loginFeature1Title}</h3>
                <p className="text-white/70 text-sm">{loginFeature1Desc}</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center flex-shrink-0">
                <ChartBarIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-lg">{loginFeature2Title}</h3>
                <p className="text-white/70 text-sm">{loginFeature2Desc}</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center flex-shrink-0">
                <CogIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-lg">{loginFeature3Title}</h3>
                <p className="text-white/70 text-sm">{loginFeature3Desc}</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer/Tagline */}
        <div className="relative z-10">
          <p className="text-white/70 text-sm">{loginTagline}</p>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gray-50 dark:bg-gray-900">
        <div className="w-full max-w-md">
          {/* Mobile Logo - show logo OR name, not both */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center gap-3 mb-4">
              {companyLogo ? (
                <img src={companyLogo} alt={companyName || 'Logo'} className="h-12 object-contain" />
              ) : (
                <>
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/50 rounded-xl flex items-center justify-center">
                    <WifiIcon className="w-7 h-7 text-blue-600" />
                  </div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{companyName || 'ISP Management'}</h1>
                </>
              )}
            </div>
          </div>

          {/* Login Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-100 dark:border-gray-700">
            {!requires2FA ? (
              <>
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome Back</h2>
                  <p className="text-gray-500 dark:text-gray-400 mt-1">Sign in to your account</p>
                </div>

                {sessionReason === 'idle' && (
                  <div className="mb-5 px-4 py-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg text-sm text-yellow-800 dark:text-yellow-300">
                    You were logged out due to inactivity. Please sign in again.
                  </div>
                )}
                {sessionReason === 'expired' && (
                  <div className="mb-5 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-800 dark:text-red-300">
                    Your session has expired. Please sign in again.
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Username
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <UserIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                      </div>
                      <input
                        id="username"
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="block w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        placeholder="Enter your username"
                        autoComplete="username"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <LockClosedIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                      </div>
                      <input
                        id="password"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="block w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        placeholder="Enter your password"
                        autoComplete="current-password"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 text-white font-semibold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ backgroundColor: primaryColor || '#2563eb' }}
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
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Admin, Reseller, or PPPoE Customer
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ backgroundColor: `${primaryColor || '#2563eb'}20` }}>
                    <ShieldCheckIcon className="w-8 h-8" style={{ color: primaryColor || '#2563eb' }} />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Two-Factor Authentication</h2>
                  <p className="text-gray-500 dark:text-gray-400 mt-1">Enter the 6-digit code from your authenticator app</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="twoFACode" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Authentication Code
                    </label>
                    <input
                      id="twoFACode"
                      type="text"
                      required
                      value={twoFACode}
                      onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="block w-full py-4 text-center text-2xl tracking-[0.5em] font-mono border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:border-blue-500"
                      style={{ '--tw-ring-color': primaryColor || '#2563eb' }}
                      placeholder="000000"
                      maxLength={6}
                      autoComplete="one-time-code"
                      autoFocus
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || twoFACode.length !== 6}
                    className="w-full py-3 px-4 text-white font-semibold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ backgroundColor: primaryColor || '#2563eb' }}
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
                    className="w-full py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center justify-center gap-1"
                  >
                    <ArrowLeftIcon className="w-4 h-4" />
                    Back to login
                  </button>
                </form>
              </>
            )}
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-sm text-gray-400 dark:text-gray-500">
            {footerText || (companyName ? `${companyName} - ISP Management System` : 'ISP Management System')}
          </p>
        </div>
      </div>
    </div>
  )
}
