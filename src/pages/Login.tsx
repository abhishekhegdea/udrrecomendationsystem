import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Truck, ArrowRight, Smartphone, Shield, Clock, IndianRupee, Star } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

const benefits = [
  { icon: IndianRupee, title: 'Flexible Earnings', desc: 'Earn up to ₹25,000/month with performance bonuses and incentives.' },
  { icon: Clock, title: 'Flexible Hours', desc: 'Choose your own schedule. Work when it suits you best, part-time or full-time.' },
  { icon: Shield, title: 'Insurance Cover', desc: '100% coverage with medical, accident, and liability protection included.' },
  { icon: Star, title: '5★ Customer Rating', desc: 'Join our top-rated partners averaging 4.8★ across thousands of deliveries.' },
]

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
    <div className="min-h-screen bg-[#FFFDF7]">
      <div className="flex min-h-screen">
        {/* Left Side — Premium Visual */}
        <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#FFF9ED] via-[#FFFDF7] to-[#FAF8F5] relative overflow-hidden items-center">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-20 left-20 w-[500px] h-[500px] bg-[#F9B000]/8 rounded-full blur-[120px]" />
            <div className="absolute bottom-32 right-16 w-72 h-72 bg-[#C4663A]/5 rounded-full blur-[100px]" />
            <div className="absolute top-1/3 right-1/3 w-56 h-56 bg-[#6B7F3A]/5 rounded-full blur-[80px]" />
          </div>

          <div className="relative z-10 w-full max-w-[560px] mx-auto px-16">
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              {/* Brand */}
              <div className="flex items-center gap-4 mb-12">
                <div className="w-14 h-14 rounded-[16px] bg-gradient-to-br from-[#F9B000] to-[#E09E00] flex items-center justify-center shadow-lg shadow-[#F9B000]/30">
                  <Truck className="h-8 w-8 text-[#111111]" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-[#111111]" style={{ fontFamily: 'var(--font-display)' }}>UdrCrafts</h1>
                  <p className="text-sm text-gray-400">Partner Portal</p>
                </div>
              </div>

              {/* Premium Visual Frame */}
              <div className="mb-10">
                <div className="w-full aspect-[4/3] bg-white/60 backdrop-blur-sm rounded-[32px] flex items-center justify-center border border-[#E2DDD5]/40 shadow-lg relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#F9B000]/5 to-transparent" />
                  <div className="absolute top-0 right-0 w-48 h-48 bg-[#F9B000]/10 rounded-full blur-2xl -mr-16 -mt-16" />
                  <div className="relative z-10 text-center p-10">
                    <div className="w-36 h-36 mx-auto mb-8 bg-gradient-to-br from-[#F9B000] to-[#E09E00] rounded-[32px] flex items-center justify-center shadow-2xl shadow-[#F9B000]/30">
                      <Truck className="h-20 w-20 text-[#111111]" />
                    </div>
                    <h2 className="display-2 text-[#111111] mb-4 leading-tight">
                      Become a <span className="text-[#F9B000]">Shipping Partner</span>
                    </h2>
                    <p className="text-gray-500 body-lg max-w-md mx-auto leading-relaxed">
                      Deliver handcrafted products across India and earn with flexible working hours. Average partner earnings: ₹18,000/month.
                    </p>
                    <div className="flex items-center justify-center gap-6 mt-6 pt-6 border-t border-[#E2DDD5]/50">
                      <div className="text-center">
                        <p className="text-xl font-bold text-[#111111]" style={{ fontFamily: 'var(--font-display)' }}>10K+</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Active Partners</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-bold text-[#111111]" style={{ fontFamily: 'var(--font-display)' }}>4.8★</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Avg Rating</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-bold text-[#111111]" style={{ fontFamily: 'var(--font-display)' }}>5 L+</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Deliveries</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Benefits Grid */}
              <div className="grid grid-cols-2 gap-4">
                {benefits.map((benefit, index) => (
                  <motion.div
                    key={benefit.title}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
                    className="flex items-start gap-4 p-5 rounded-[24px] bg-white border border-[#E2DDD5]/60 hover:shadow-lg hover:border-[#F9B000]/30 transition-all group"
                  >
                    <div className="w-11 h-11 rounded-[14px] bg-gradient-to-br from-[#F9B000]/20 to-[#F9B000]/5 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                      <benefit.icon className="h-5 w-5 text-[#F9B000]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#111111]">{benefit.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{benefit.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>

        {/* Right Side - Login */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-10 lg:p-16">
          <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.2 }} className="w-full max-w-[440px]">
            {/* Mobile Logo */}
            <div className="flex lg:hidden items-center gap-3 mb-10">
              <div className="w-11 h-11 rounded-[14px] bg-gradient-to-br from-[#F9B000] to-[#E09E00] flex items-center justify-center shadow-lg">
                <Truck className="h-6 w-6 text-[#111111]" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-[#111111]" style={{ fontFamily: 'var(--font-display)' }}>UdrCrafts</h1>
                <p className="text-[10px] text-gray-400">Partner Portal</p>
              </div>
            </div>

            {/* Heading */}
            <div className="mb-10">
              <h2 className="display-2 text-[#111111] mb-3">{showOTP ? 'Verify OTP' : 'Welcome Back'}</h2>
              <p className="text-gray-500">
                {showOTP ? (otpSent ? 'Enter the 6-digit OTP sent to your registered mobile number' : 'Enter your mobile number to receive a one-time OTP') : 'Sign in to access your partner dashboard and manage deliveries.'}
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
              <Input label="Mobile Number" type="tel" placeholder="Enter your 10-digit mobile number" value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} error={errors.phone} required />

              <AnimatePresence mode="wait">
                {showOTP ? (
                  <motion.div key="otp" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-4">
                    {otpSent && (
                      <Input label="OTP" type="text" placeholder="Enter 6-digit OTP" value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} error={errors.otp} required
                        hint="OTP sent to +91 XXXXX{phone.slice(-4)}" />
                    )}
                  </motion.div>
                ) : (
                  <motion.div key="password" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <Input label="Password" type="password" placeholder="Enter your password" value={password}
                      onChange={(e) => setPassword(e.target.value)} error={errors.password} required
                      hint="Must be at least 8 characters" />
                  </motion.div>
                )}
              </AnimatePresence>

              {errors.form && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-sm text-[#EF4444] bg-red-50/80 px-4 py-3 rounded-[14px] border border-red-100">{errors.form}</motion.p>
              )}

              <Button type="submit" fullWidth size="md" loading={loading} className="h-[52px]">
                {showOTP && otpSent ? 'Verify & Login' : showOTP ? 'Send OTP' : 'Login'}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#E2DDD5]" /></div>
                <div className="relative flex justify-center"><span className="bg-[#FFFDF7] px-4 text-xs text-gray-400 uppercase font-medium">or</span></div>
              </div>

              <Button type="button" variant="outline" fullWidth size="md" onClick={() => setShowOTP(!showOTP)}>
                <Smartphone className="h-4 w-4" />
                {showOTP ? 'Use Password Instead' : 'Continue with OTP'}
              </Button>

              {!showOTP && (
                <div className="text-center">
                  <button type="button" className="text-sm text-[#F9B000] hover:underline font-semibold">Forgot Password?</button>
                </div>
              )}
            </form>

            {/* Create Account */}
            <div className="mt-10 pt-8 border-t border-[#E2DDD5]">
              <p className="text-sm text-gray-500 text-center mb-4">New to UdrCrafts? Join as a delivery partner today.</p>
              <Button type="button" variant="secondary" fullWidth size="md" onClick={() => navigate('/signup')}>
                Create Account <ArrowRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-8 flex items-center justify-center gap-8 text-xs text-gray-400">
              <button type="button" className="hover:text-[#111111] transition-colors font-medium">Privacy Policy</button>
              <button type="button" className="hover:text-[#111111] transition-colors font-medium">Terms of Service</button>
              <button type="button" className="hover:text-[#111111] transition-colors font-medium">Contact Support</button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
