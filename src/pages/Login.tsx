import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Truck, ArrowRight, Smartphone } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

export function LoginPage() {
  const navigate = useNavigate()
  const { login, loginWithOTP, isAuthenticated } = useAuth()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [showOTP, setShowOTP] = useState(false)
  const [loading, setLoading] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showLoginForm, setShowLoginForm] = useState(false)

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard')
  }, [isAuthenticated, navigate])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const newErrors: Record<string, string> = {}
    if (!phone || phone.length < 10) newErrors.phone = 'Enter a valid mobile number'
    if (!showOTP && !password) newErrors.password = 'Password is required'
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return }

    setLoading(true)
    setErrors({})
    try {
      if (showOTP) {
        if (!otpSent) { await new Promise((r) => setTimeout(r, 1000)); setOtpSent(true) }
        else { await loginWithOTP(phone, otp); navigate('/dashboard') }
      } else { await login(phone, password); navigate('/dashboard') }
    } catch { setErrors({ form: 'Invalid credentials. Please try again.' }) }
    finally { setLoading(false) }
  }

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-6 bg-cover bg-center bg-no-repeat relative"
      style={{ backgroundImage: 'url(/images/login-bg.jpg)' }}
    >
      {/* Dynamic overlay for contrast */}
      <div className={`absolute inset-0 transition-all duration-1000 ${showLoginForm ? 'bg-black/50 backdrop-blur-[4px]' : 'bg-black/10'}`} />
      
      <AnimatePresence mode="wait">
        {!showLoginForm ? (
          <motion.div 
            key="intro"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20, filter: 'blur(10px)' }}
            transition={{ duration: 0.6 }}
            className="relative z-10 flex flex-col items-center justify-end h-full w-full pb-20 sm:pb-32"
          >
            <div className="text-center mb-10">
              <h1 className="text-5xl sm:text-7xl font-bold text-white tracking-tight drop-shadow-2xl mb-4" style={{ fontFamily: 'var(--font-display)' }}>Deliver with UdrCrafts</h1>
              <p className="text-white text-lg sm:text-xl drop-shadow-lg font-medium">Handcrafted with Heart</p>
            </div>
            <Button 
              size="lg" 
              onClick={() => setShowLoginForm(true)}
              className="bg-[#F9B000] hover:bg-[#E09E00] text-[#111111] rounded-full px-10 py-7 text-lg font-bold shadow-[0_20px_50px_-15px_rgba(249,176,0,0.7)] transition-all hover:scale-105"
            >
              Start your journey <ArrowRight className="ml-3 h-5 w-5" />
            </Button>
          </motion.div>
        ) : (
          <motion.div 
            key="form"
            initial={{ opacity: 0, scale: 0.95, y: 20 }} 
            animate={{ opacity: 1, scale: 1, y: 0 }} 
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.5 }} 
            className="relative z-10 w-full max-w-[440px] bg-white/20 backdrop-blur-2xl border border-white/30 shadow-2xl rounded-[32px] p-8 sm:p-10"
          >
            {/* Close button */}
            <button 
              type="button"
              onClick={() => setShowLoginForm(false)}
              className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>

            {/* Logo */}
            <div className="flex items-center gap-3 mb-8 justify-center">
              <div className="w-12 h-12 rounded-[14px] bg-[#F9B000] flex items-center justify-center shadow-lg">
                <Truck className="h-6 w-6 text-[#111111]" />
              </div>
              <div className="text-left">
                <h1 className="text-xl font-bold text-white tracking-tight">UdrCrafts</h1>
                <p className="text-[11px] text-white/80 uppercase tracking-widest">Partner Portal</p>
              </div>
            </div>

        {/* Heading */}
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-2">{showOTP ? 'Verify OTP' : 'Welcome Back'}</h2>
          <p className="text-white/80 text-sm">
            {showOTP ? (otpSent ? 'Enter the 6-digit OTP sent to your registered mobile number' : 'Enter your mobile number to receive a one-time OTP') : 'Sign in to access your partner dashboard and manage deliveries.'}
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="bg-white/80 backdrop-blur-md rounded-[16px] p-1 shadow-inner">
            <Input 
              label="Mobile Number" 
              type="tel" 
              placeholder="Enter your 10-digit mobile number" 
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} 
              error={errors.phone} 
              required 
              className="bg-transparent border-none focus:ring-0 shadow-none px-4"
            />
          </div>

          <AnimatePresence mode="wait">
            {showOTP ? (
              <motion.div key="otp" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-4">
                {otpSent && (
                  <div className="bg-white/80 backdrop-blur-md rounded-[16px] p-1 shadow-inner">
                    <Input 
                      label="OTP" 
                      type="text" 
                      placeholder="Enter 6-digit OTP" 
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} 
                      error={errors.otp} 
                      required
                      hint={`OTP sent to +91 XXXXX${phone.slice(-4) || 'XXXX'}`} 
                      className="bg-transparent border-none focus:ring-0 shadow-none px-4"
                    />
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div key="password" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <div className="bg-white/80 backdrop-blur-md rounded-[16px] p-1 shadow-inner">
                  <Input 
                    label="Password" 
                    type="password" 
                    placeholder="Enter your password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)} 
                    error={errors.password} 
                    required
                    hint="Must be at least 8 characters" 
                    className="bg-transparent border-none focus:ring-0 shadow-none px-4"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {errors.form && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-sm text-red-800 bg-red-100/90 backdrop-blur-md px-4 py-3 rounded-[14px] border border-red-200">{errors.form}</motion.p>
          )}

          <Button type="submit" fullWidth size="md" loading={loading} className="h-[52px] bg-[#111111] hover:bg-[#111111]/90 text-white rounded-[14px] mt-2">
            {showOTP && otpSent ? 'Verify & Login' : showOTP ? 'Send OTP' : 'Login'}
          </Button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/20" /></div>
            <div className="relative flex justify-center"><span className="bg-transparent px-4 text-xs text-white/60 uppercase font-medium backdrop-blur-md rounded-full">or</span></div>
          </div>

          <Button type="button" variant="ghost" fullWidth size="sm" onClick={() => setShowOTP(!showOTP)} className="bg-transparent hover:bg-white/10 text-white/80 hover:text-white border-transparent rounded-[14px]">
            <Smartphone className="h-4 w-4 mr-2" />
            {showOTP ? 'Use Password Instead' : 'Continue with OTP'}
          </Button>

          {!showOTP && (
            <div className="text-center pt-2">
              <button type="button" className="text-sm text-white/90 hover:text-white hover:underline font-medium transition-colors">Forgot Password?</button>
            </div>
          )}
        </form>

          <div className="mt-8 pt-8 border-t border-white/20">
            <p className="text-sm text-white/80 text-center mb-4">New to UdrCrafts? Join as a delivery partner today.</p>
            <Button type="button" variant="secondary" fullWidth size="md" onClick={() => navigate('/signup')} className="bg-[#F9B000] hover:bg-[#E09E00] text-[#111111] rounded-[14px] font-semibold border-none">
              Create Account <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
