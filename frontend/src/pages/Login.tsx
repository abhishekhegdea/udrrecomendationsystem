import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { User, ShieldCheck, Truck, ArrowLeft, ShoppingBag } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

type Role = 'customer' | 'seller' | 'admin' | 'delivery' | null

export function LoginPage() {
  const navigate = useNavigate()
  const { login, signup } = useAuth()
  
  const [role, setRole] = useState<Role>(null)
  const [isLogin, setIsLogin] = useState(true)
  
  // Form State
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', email: '', phone: '', password: '',
    // Seller
    businessName: '', gstNumber: '',
    // Partner
    dateOfBirth: '', address: '', vehicleType: '', vehicleNumber: '', rcBook: '', drivingLicense: '', vehicleInsurance: '', emergencyContactName: '', emergencyContactNumber: '',
    // Shared Financials & KYC
    bankAccount: '', ifscCode: '', upiId: '', panNumber: '', aadhaarNumber: '',
    // Location
    stateId: '', cityId: ''
  })

  const [states, setStates] = useState<any[]>([])
  const [cities, setCities] = useState<any[]>([])

  useEffect(() => {
    fetch('http://localhost:3001/api/locations/states')
      .then(res => res.json())
      .then(data => setStates(data))
      .catch(err => console.error(err))
  }, [])

  const handleStateChange = (stateId: string) => {
    setFormData(prev => ({ ...prev, stateId, cityId: '' }))
    if (stateId) {
      fetch(`http://localhost:3001/api/locations/cities/${stateId}`)
        .then(res => res.json())
        .then(data => setCities(data))
        .catch(err => console.error(err))
    } else {
      setCities([])
    }
  }

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }
  
  if (!role) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <Link to="/" className="absolute top-8 left-8 flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Store
        </Link>
        
        <div className="text-center mb-12">
          <h1 className="text-4xl font-display font-bold text-primary mb-3">Welcome to UdrCrafts</h1>
          <p className="text-muted-foreground">Select how you want to continue</p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl w-full">
          <button 
            onClick={() => { setRole('customer'); setIsLogin(true); setError(''); }}
            className="flex flex-col items-center gap-4 p-8 rounded-3xl bg-card border-2 border-transparent hover:border-primary hover:shadow-xl transition-all group"
          >
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors text-primary">
              <User className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold">Shopper</h2>
            <p className="text-sm text-muted-foreground text-center">Discover and buy handcrafted artisanal products.</p>
          </button>
          
          <button 
            onClick={() => { setRole('seller'); setIsLogin(true); setError(''); }}
            className="flex flex-col items-center gap-4 p-8 rounded-3xl bg-card border-2 border-transparent hover:border-accent hover:shadow-xl transition-all group"
          >
            <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center group-hover:bg-accent group-hover:text-accent-foreground transition-colors text-accent">
              <ShoppingBag className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold">Artisan / Seller</h2>
            <p className="text-sm text-muted-foreground text-center">Manage your storefront and fulfill orders.</p>
          </button>
          
          <button 
            onClick={() => { setRole('delivery'); setIsLogin(true); setError(''); }}
            className="flex flex-col items-center gap-4 p-8 rounded-3xl bg-card border-2 border-transparent hover:border-saffron hover:shadow-xl transition-all group"
          >
            <div className="w-16 h-16 rounded-full bg-saffron/10 flex items-center justify-center group-hover:bg-saffron group-hover:text-primary-foreground transition-colors text-saffron">
              <Truck className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold">Delivery Partner</h2>
            <p className="text-sm text-muted-foreground text-center">Fulfill orders and manage your routes.</p>
          </button>

          <button 
            onClick={() => { setRole('admin'); setIsLogin(true); setError(''); }}
            className="flex flex-col items-center gap-4 p-8 rounded-3xl bg-card border-2 border-transparent hover:border-forest hover:shadow-xl transition-all group"
          >
            <div className="w-16 h-16 rounded-full bg-forest/10 flex items-center justify-center group-hover:bg-forest group-hover:text-primary-foreground transition-colors text-forest">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold">Administrator</h2>
            <p className="text-sm text-muted-foreground text-center">Manage platform operations.</p>
          </button>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isLogin) {
        const identifier = role === 'delivery' ? formData.phone : formData.email
        await login(identifier, formData.password, role)
      } else {
        await signup(formData, role)
      }
      
      if (role === 'admin') navigate('/admin')
      else if (role === 'seller') navigate('/seller')
      else if (role === 'delivery') navigate('/delivery')
      else navigate('/') 
      
    } catch (err: any) {
      setError(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-10 px-6 overflow-y-auto">
      <button 
        onClick={() => setRole(null)} 
        className="absolute top-8 left-8 flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Change Role
      </button>

      <div className={`w-full ${isLogin ? 'max-w-md' : 'max-w-4xl'} bg-card border border-border shadow-2xl rounded-[32px] p-10 mt-10`}>
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-foreground capitalize">{role} {isLogin ? 'Login' : 'Registration'}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isLogin ? 'Enter your credentials to access your account' : 'Provide your details to register as a ' + role}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm font-medium">
            {error}
          </div>
        )}

        <form className="space-y-6" onSubmit={handleSubmit}>
          
          {/* LOGIN VIEW */}
          {isLogin && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground ml-1">
                  {role === 'delivery' ? 'Phone Number' : 'Email'}
                </label>
                <input 
                  type={role === 'delivery' ? 'tel' : 'email'} 
                  name={role === 'delivery' ? 'phone' : 'email'} 
                  required 
                  value={role === 'delivery' ? formData.phone : formData.email} 
                  onChange={handleInputChange} 
                  className="w-full h-12 bg-muted border border-border rounded-xl px-4 focus:ring-2 focus:ring-primary outline-none" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground ml-1">Password</label>
                <input type="password" name="password" required value={formData.password} onChange={handleInputChange} className="w-full h-12 bg-muted border border-border rounded-xl px-4 focus:ring-2 focus:ring-primary outline-none" />
              </div>
            </div>
          )}

          {/* SIGNUP VIEW */}
          {!isLogin && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* Common Details (All Roles) */}
              <div className="space-y-4">
                <h3 className="font-bold border-b border-border pb-2">Personal Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1"><label className="text-xs font-medium">First Name</label><input type="text" name="firstName" required value={formData.firstName} onChange={handleInputChange} className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none" /></div>
                  <div className="space-y-1"><label className="text-xs font-medium">Last Name</label><input type="text" name="lastName" required value={formData.lastName} onChange={handleInputChange} className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none" /></div>
                </div>
                <div className="space-y-1"><label className="text-xs font-medium">Email</label><input type="email" name="email" required value={formData.email} onChange={handleInputChange} className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none" /></div>
                <div className="space-y-1"><label className="text-xs font-medium">Phone</label><input type="tel" name="phone" required value={formData.phone} onChange={handleInputChange} className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none" /></div>
                <div className="space-y-1"><label className="text-xs font-medium">Password</label><input type="password" name="password" required value={formData.password} onChange={handleInputChange} className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none" /></div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">State (Optional)</label>
                    <select 
                      name="stateId"
                      value={formData.stateId} 
                      onChange={(e) => handleStateChange(e.target.value)}
                      className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none"
                    >
                      <option value="">Select State</option>
                      {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">City (Optional)</label>
                    <select 
                      name="cityId"
                      value={formData.cityId} 
                      onChange={handleInputChange}
                      disabled={!formData.stateId}
                      className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none disabled:opacity-50"
                    >
                      <option value="">Select City</option>
                      {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                
                {(role === 'seller' || role === 'delivery') && (
                  <>
                    <h3 className="font-bold border-b border-border pb-2 pt-4">Financial Details</h3>
                    <div className="space-y-1"><label className="text-xs font-medium">Bank Account Number</label><input type="text" name="bankAccount" required value={formData.bankAccount} onChange={handleInputChange} className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none" /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1"><label className="text-xs font-medium">IFSC Code</label><input type="text" name="ifscCode" required value={formData.ifscCode} onChange={handleInputChange} className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">UPI ID</label><input type="text" name="upiId" required value={formData.upiId} onChange={handleInputChange} className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none" /></div>
                    </div>
                  </>
                )}
              </div>

              {/* Role Specific Columns */}
              <div className="space-y-4">
                {role === 'customer' && (
                  <div className="bg-primary/5 rounded-xl p-6 text-center text-muted-foreground flex flex-col items-center justify-center h-full">
                    <User className="h-12 w-12 text-primary opacity-50 mb-4" />
                    <p>Join UdrCrafts to support local artisans and purchase beautiful handcrafted products directly from the source.</p>
                  </div>
                )}

                {role === 'seller' && (
                  <>
                    <h3 className="font-bold border-b border-border pb-2">Business & KYC</h3>
                    <div className="space-y-1"><label className="text-xs font-medium">Shop / Business Name</label><input type="text" name="businessName" required value={formData.businessName} onChange={handleInputChange} className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none" /></div>
                    <div className="space-y-1"><label className="text-xs font-medium">GST Number (Optional)</label><input type="text" name="gstNumber" value={formData.gstNumber} onChange={handleInputChange} className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none" /></div>
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div className="space-y-1"><label className="text-xs font-medium">PAN Number</label><input type="text" name="panNumber" required value={formData.panNumber} onChange={handleInputChange} className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Aadhaar Number</label><input type="text" name="aadhaarNumber" required value={formData.aadhaarNumber} onChange={handleInputChange} className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none" /></div>
                    </div>
                  </>
                )}

                {role === 'delivery' && (
                  <>
                    <h3 className="font-bold border-b border-border pb-2">Vehicle & KYC</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Vehicle Type</label>
                        <select name="vehicleType" required value={formData.vehicleType} onChange={handleInputChange} className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none">
                          <option value="">Select...</option>
                          <option value="Bike">Two Wheeler</option>
                          <option value="Scooter">Scooter</option>
                          <option value="Van">Delivery Van</option>
                        </select>
                      </div>
                      <div className="space-y-1"><label className="text-xs font-medium">Vehicle Reg Number</label><input type="text" name="vehicleNumber" required value={formData.vehicleNumber} onChange={handleInputChange} className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none" /></div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div className="space-y-1"><label className="text-xs font-medium">PAN Number</label><input type="text" name="panNumber" required value={formData.panNumber} onChange={handleInputChange} className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Aadhaar Number</label><input type="text" name="aadhaarNumber" required value={formData.aadhaarNumber} onChange={handleInputChange} className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none" /></div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div className="space-y-1"><label className="text-xs font-medium">Driving License No.</label><input type="text" name="drivingLicense" required value={formData.drivingLicense} onChange={handleInputChange} className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">RC Book No.</label><input type="text" name="rcBook" required value={formData.rcBook} onChange={handleInputChange} className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none" /></div>
                    </div>
                  </>
                )}
              </div>

            </div>
          )}
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full h-12 mt-4 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-70"
          >
            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Complete Registration')}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button 
            onClick={() => setIsLogin(!isLogin)} 
            className="text-primary font-semibold hover:underline"
          >
            {isLogin ? 'Sign up here' : 'Sign in here'}
          </button>
        </div>
      </div>
    </div>
  )
}
