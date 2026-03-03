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

const winStyles = {
  /* ── full-screen wrapper ── */
  page: {
    minHeight: '100vh',
    display: 'flex',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    fontSize: 11,
    margin: 0,
    padding: 0,
    background: '#c0c0c0',
  },

  /* ── left branding panel ── */
  leftPanel: (bg, primaryColor) => ({
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
    padding: '24px',
    ...(bg
      ? { backgroundImage: `url(${bg})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { background: `linear-gradient(135deg, ${primaryColor || '#4a7ab5'} 0%, #2d5a87 100%)` }),
  }),

  leftOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
  },

  /* ── feature rows on the left panel ── */
  featureIcon: {
    width: 36,
    height: 36,
    minWidth: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid rgba(255,255,255,0.35)',
    background: 'rgba(255,255,255,0.12)',
    borderRadius: '2px',
    marginRight: 10,
  },

  /* ── right side wrapper ── */
  rightPanel: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: '#c0c0c0',
  },

  /* ── the dialog box ── */
  dialog: {
    width: '100%',
    maxWidth: 380,
    border: '2px solid',
    borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
    background: '#c0c0c0',
    borderRadius: '0px',
  },

  /* ── title bar ── */
  titleBar: {
    background: 'linear-gradient(to right, #4a7ab5, #2d5a87)',
    padding: '6px 10px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },

  titleText: {
    color: '#fff',
    fontWeight: 600,
    fontSize: '12px',
    letterSpacing: '0.2px',
    flex: 1,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  /* ── body area ── */
  body: {
    padding: '16px 18px 14px',
  },

  /* ── classic label ── */
  label: {
    display: 'block',
    fontSize: '11px',
    color: '#000',
    marginBottom: 3,
    fontWeight: 400,
  },

  /* ── classic input ── */
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '4px 6px',
    fontSize: '12px',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    border: '1px solid #a0a0a0',
    borderRadius: '1px',
    background: '#fff',
    color: '#000',
    outline: 'none',
  },

  inputFocused: {
    borderColor: '#4a7ab5',
  },

  /* ── primary (blue) button ── */
  btnPrimary: (disabled) => ({
    width: '100%',
    padding: '5px 12px',
    fontSize: '12px',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    fontWeight: 600,
    color: '#fff',
    background: disabled
      ? 'linear-gradient(to bottom, #8db4d6, #6c97b9)'
      : 'linear-gradient(to bottom, #5b8ec2, #3a6fa0)',
    border: '1px solid',
    borderColor: disabled ? '#8db4d6 #6c97b9 #6c97b9 #8db4d6' : '#4a7ab5 #2d5a87 #2d5a87 #4a7ab5',
    borderRadius: '1px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    textShadow: '0 1px 1px rgba(0,0,0,0.25)',
  }),

  /* ── secondary (gray) button ── */
  btnSecondary: {
    width: '100%',
    padding: '4px 10px',
    fontSize: '11px',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    color: '#000',
    background: 'linear-gradient(to bottom, #fff, #e8e8e8)',
    border: '1px solid',
    borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
    borderRadius: '1px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },

  /* ── sunken well (status / info) ── */
  infoWell: (type) => ({
    padding: '6px 8px',
    marginBottom: 10,
    fontSize: '11px',
    border: '1px solid',
    borderRadius: '1px',
    ...(type === 'warning'
      ? { borderColor: '#c0a000', background: '#fff8d0', color: '#665200' }
      : { borderColor: '#c00000', background: '#ffd8d8', color: '#600' }),
  }),

  /* ── horizontal separator ── */
  separator: {
    borderTop: '1px solid #808080',
    borderBottom: '1px solid #dfdfdf',
    margin: '10px 0',
  },

  /* ── footer text ── */
  footer: {
    textAlign: 'center',
    fontSize: '11px',
    color: '#555',
    marginTop: 10,
    padding: '0 18px 12px',
  },

  /* ── 2FA section ── */
  twoFAIcon: {
    width: 48,
    height: 48,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid',
    borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
    background: '#d8d8d8',
    borderRadius: '1px',
    margin: '0 auto 8px',
  },

  twoFAInput: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 6px',
    fontSize: '20px',
    fontFamily: "'Consolas', 'Courier New', monospace",
    textAlign: 'center',
    letterSpacing: '0.4em',
    border: '1px solid #a0a0a0',
    borderRadius: '1px',
    background: '#fff',
    color: '#000',
    outline: 'none',
  },
}

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
    <div style={{ ...winStyles.page, flexDirection: 'row' }}>
      {/* ─── Left Side: Branding & Features (desktop only) ─── */}
      <div
        className="hidden lg:flex lg:w-1/2"
        style={winStyles.leftPanel(loginBackground, primaryColor)}
      >
        {loginBackground && <div style={winStyles.leftOverlay} />}

        {/* Logo / Name */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {companyLogo ? (
              <img src={companyLogo} alt={companyName || 'Logo'} style={{ height: 48, objectFit: 'contain' }} />
            ) : (
              <>
                <div style={{
                  width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: '2px',
                }}>
                  <WifiIcon style={{ width: 24, height: 24, color: '#fff' }} />
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>
                    {companyName || 'ISP Management'}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                    ISP Management System
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Features */}
        {showLoginFeatures && (
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {[
              { Icon: WifiIcon, title: loginFeature1Title, desc: loginFeature1Desc },
              { Icon: ChartBarIcon, title: loginFeature2Title, desc: loginFeature2Desc },
              { Icon: CogIcon, title: loginFeature3Title, desc: loginFeature3Desc },
            ].map(({ Icon, title, desc }, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start' }}>
                <div style={winStyles.featureIcon}>
                  <Icon style={{ width: 18, height: 18, color: '#fff' }} />
                </div>
                <div>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>{title}</div>
                  <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tagline */}
        <div style={{ position: 'relative', zIndex: 1, color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>
          {loginTagline}
        </div>
      </div>

      {/* ─── Right Side: Login Dialog ─── */}
      <div className="w-full lg:w-1/2" style={winStyles.rightPanel}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          {/* Mobile logo */}
          <div className="lg:hidden" style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {companyLogo ? (
                <img src={companyLogo} alt={companyName || 'Logo'} style={{ height: 36, objectFit: 'contain' }} />
              ) : (
                <>
                  <div style={{
                    width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
                    background: '#d4d4d4', borderRadius: '1px',
                  }}>
                    <WifiIcon style={{ width: 20, height: 20, color: '#2d5a87' }} />
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#000' }}>
                    {companyName || 'ISP Management'}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* ── Dialog window ── */}
          <div style={winStyles.dialog}>

            {!requires2FA ? (
              <>
                {/* Title bar */}
                <div style={winStyles.titleBar}>
                  <LockClosedIcon style={{ width: 14, height: 14, color: '#fff' }} />
                  <span style={winStyles.titleText}>
                    {companyName ? `${companyName} - Sign In` : 'Sign In'}
                  </span>
                </div>

                {/* Body */}
                <div style={winStyles.body}>
                  {/* Session warnings */}
                  {sessionReason === 'idle' && (
                    <div style={winStyles.infoWell('warning')}>
                      You were logged out due to inactivity. Please sign in again.
                    </div>
                  )}
                  {sessionReason === 'expired' && (
                    <div style={winStyles.infoWell('error')}>
                      Your session has expired. Please sign in again.
                    </div>
                  )}

                  <form onSubmit={handleSubmit}>
                    {/* Username */}
                    <div style={{ marginBottom: 10 }}>
                      <label htmlFor="username" style={winStyles.label}>Username:</label>
                      <div style={{ position: 'relative' }}>
                        <UserIcon style={{
                          position: 'absolute', left: 5, top: '50%', transform: 'translateY(-50%)',
                          width: 14, height: 14, color: '#808080',
                        }} />
                        <input
                          id="username"
                          type="text"
                          required
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          style={{ ...winStyles.input, paddingLeft: 24 }}
                          onFocus={(e) => e.target.style.borderColor = '#4a7ab5'}
                          onBlur={(e) => e.target.style.borderColor = '#a0a0a0'}
                          placeholder="Enter your username"
                          autoComplete="username"
                        />
                      </div>
                    </div>

                    {/* Password */}
                    <div style={{ marginBottom: 14 }}>
                      <label htmlFor="password" style={winStyles.label}>Password:</label>
                      <div style={{ position: 'relative' }}>
                        <LockClosedIcon style={{
                          position: 'absolute', left: 5, top: '50%', transform: 'translateY(-50%)',
                          width: 14, height: 14, color: '#808080',
                        }} />
                        <input
                          id="password"
                          type="password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          style={{ ...winStyles.input, paddingLeft: 24 }}
                          onFocus={(e) => e.target.style.borderColor = '#4a7ab5'}
                          onBlur={(e) => e.target.style.borderColor = '#a0a0a0'}
                          placeholder="Enter your password"
                          autoComplete="current-password"
                        />
                      </div>
                    </div>

                    <div style={winStyles.separator} />

                    {/* Sign In button */}
                    <button
                      type="submit"
                      disabled={loading}
                      style={winStyles.btnPrimary(loading)}
                    >
                      {loading ? (
                        <>
                          <svg style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24">
                            <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Signing in...
                        </>
                      ) : (
                        'Sign In'
                      )}
                    </button>
                  </form>

                  <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: '#666' }}>
                    Admin, Reseller, or PPPoE Customer
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* 2FA Title bar */}
                <div style={winStyles.titleBar}>
                  <ShieldCheckIcon style={{ width: 14, height: 14, color: '#fff' }} />
                  <span style={winStyles.titleText}>Two-Factor Authentication</span>
                </div>

                {/* 2FA Body */}
                <div style={winStyles.body}>
                  <div style={{ textAlign: 'center', marginBottom: 12 }}>
                    <div style={winStyles.twoFAIcon}>
                      <ShieldCheckIcon style={{ width: 24, height: 24, color: '#4a7ab5' }} />
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#000', marginBottom: 2 }}>
                      Verification Required
                    </div>
                    <div style={{ fontSize: 11, color: '#555' }}>
                      Enter the 6-digit code from your authenticator app
                    </div>
                  </div>

                  <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: 10 }}>
                      <label htmlFor="twoFACode" style={winStyles.label}>Authentication Code:</label>
                      <input
                        id="twoFACode"
                        type="text"
                        required
                        value={twoFACode}
                        onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        style={winStyles.twoFAInput}
                        onFocus={(e) => e.target.style.borderColor = '#4a7ab5'}
                        onBlur={(e) => e.target.style.borderColor = '#a0a0a0'}
                        placeholder="000000"
                        maxLength={6}
                        autoComplete="one-time-code"
                        autoFocus
                      />
                    </div>

                    <div style={winStyles.separator} />

                    {/* Verify button */}
                    <button
                      type="submit"
                      disabled={loading || twoFACode.length !== 6}
                      style={winStyles.btnPrimary(loading || twoFACode.length !== 6)}
                    >
                      {loading ? (
                        <>
                          <svg style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24">
                            <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Verifying...
                        </>
                      ) : (
                        'Verify & Sign In'
                      )}
                    </button>

                    <div style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={handleBack}
                        style={winStyles.btnSecondary}
                      >
                        <ArrowLeftIcon style={{ width: 12, height: 12 }} />
                        Back to login
                      </button>
                    </div>
                  </form>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div style={winStyles.footer}>
            {footerText || (companyName ? `${companyName} - ISP Management System` : 'ISP Management System')}
          </div>
        </div>
      </div>

      {/* Keyframe for spinner */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
