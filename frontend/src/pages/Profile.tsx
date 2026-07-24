import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'
import {
  User, Mail, Phone, MapPin, Calendar, Car, PhoneCall,
  Download, Edit3, Truck, Award, Star, CheckCircle2, Shield, ShoppingBag
} from 'lucide-react'

export function ProfilePage() {
  const { user, updateUser } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  
  // Construct dynamic profile data without falling back to a dummy delivery partner
  const profileData = {
    fullName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'User',
    email: user?.email || '',
    phone: user?.phone || 'Not Provided',
    currentAddress: user?.currentAddress || 'Not Provided',
    city: user?.city || 'Not Provided',
    state: user?.state || 'Not Provided',
    pincode: user?.pincode || 'Not Provided',
    vehicleType: user?.vehicleType || 'Not Provided',
    vehicleNumber: user?.vehicleNumber || 'Not Provided',
    emergencyContactName: user?.emergencyContactName || 'Not Provided',
    emergencyContactNumber: user?.emergencyContactNumber || 'Not Provided',
    dateJoined: user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Recently',
    partnerId: user?.id ? `ID-${user.id.substring(0, 6).toUpperCase()}` : 'N/A',
    status: user?.status || 'Verified',
    rating: user?.rating || 4.5,
    earnings: user?.earnings || 0,
    deliveries: user?.deliveries || 0,
    orders: user?.orders || 0,
  }

  const [formData, setFormData] = useState({
    email: profileData.email || '',
    phone: profileData.phone || '',
    currentAddress: profileData.currentAddress || '',
    city: profileData.city || '',
    state: profileData.state || '',
    pincode: profileData.pincode || '',
    vehicleType: profileData.vehicleType || '',
    vehicleNumber: profileData.vehicleNumber || '',
    emergencyContactName: profileData.emergencyContactName || '',
    emergencyContactNumber: profileData.emergencyContactNumber || '',
  })

  const handleSave = () => { 
    updateUser(formData)
    setIsEditing(false)
    alert('Profile updated successfully!') 
  }

  const infoSections = [
    {
      title: 'Personal Information', icon: User,
      items: [
        { icon: User, label: 'Full Name', value: profileData.fullName },
        ...(user?.role !== 'CUSTOMER' ? [{ icon: Award, label: 'Profile ID', value: profileData.partnerId }] : []),
        { icon: Mail, label: 'Email Address', value: profileData.email },
        { icon: Phone, label: 'Phone Number', value: profileData.phone },
      ],
    },
    {
      title: 'Address & Location', icon: MapPin,
      items: [
        { icon: MapPin, label: 'Current Address', value: profileData.currentAddress },
        { icon: MapPin, label: 'City', value: profileData.city },
        { icon: MapPin, label: 'State', value: profileData.state },
        { icon: MapPin, label: 'Pincode', value: profileData.pincode },
      ],
    },
    ...(user?.role === 'DELIVERY' ? [{
      title: 'Vehicle & Emergency', icon: Shield,
      items: [
        { icon: Car, label: 'Vehicle', value: `${profileData.vehicleType} — ${profileData.vehicleNumber}` },
        { icon: PhoneCall, label: 'Emergency Contact', value: `${profileData.emergencyContactName} (${profileData.emergencyContactNumber})` },
      ],
    }] : [])
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto space-y-8">
      {/* Profile Card */}
      <Card className="overflow-hidden shadow-xl border-border">
        <div className="bg-gradient-to-br from-saffron to-saffron/80 p-8 lg:p-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-white/20 rounded-full blur-3xl -mr-32 -mt-32" />
          <div className="absolute bottom-0 left-0 w-72 h-72 bg-white/10 rounded-full blur-3xl -ml-24 -mb-24" />
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 relative z-10">
            <div className="relative">
              <div className="w-28 h-28 rounded-full bg-white/40 backdrop-blur-sm flex items-center justify-center text-4xl font-bold text-ink border-4 border-white/60 shadow-xl">
                {profileData.fullName.split(' ').map((n: string) => n[0]).join('')}
              </div>
              <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#0C831F] border-2 border-white flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-white" />
              </div>
              <button onClick={() => setIsEditing(!isEditing)}
                className="absolute -bottom-1 -left-1 w-8 h-8 rounded-full bg-white flex items-center justify-center text-ink shadow-lg hover:bg-cream transition-colors border border-white">
                <Edit3 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="text-center sm:text-left flex-1">
              <h2 className="text-[28px] font-bold text-ink leading-tight" style={{ fontFamily: 'var(--font-display)' }}>{profileData.fullName}</h2>
              <div className="flex items-center gap-3 justify-center sm:justify-start mt-3 flex-wrap">
                <Badge variant="success" dot className="bg-[#0C831F]/20 text-[#0C831F] border-none">{profileData.status || 'Verified'}</Badge>
                <span className="text-sm text-ink/70 font-semibold">{profileData.partnerId}</span>
                <span className="flex items-center gap-1 text-sm text-ink/70">
                  <Star className="h-3.5 w-3.5 fill-white text-white" /> {profileData.rating ?? 0}★
                </span>
              </div>
              <p className="text-ink/80 text-sm mt-3 flex items-center gap-1.5 justify-center sm:justify-start font-medium">
                {user?.role === 'SELLER' && <><Award className="h-4 w-4 text-ink" /> Artisan Seller since {profileData.dateJoined}</>}
                {user?.role === 'DELIVERY' && <><Truck className="h-4 w-4 text-ink" /> Shipping Partner since {profileData.dateJoined}</>}
                {user?.role === 'CUSTOMER' && <><ShoppingBag className="h-4 w-4 text-ink" /> Member since {profileData.dateJoined}</>}
                {user?.role === 'ADMIN' && <><Shield className="h-4 w-4 text-ink" /> System Administrator</>}
              </p>
            </div>
          </div>
          {/* Stats mini bar (Only for Sellers/Delivery) */}
          {user?.role !== 'CUSTOMER' && user?.role !== 'ADMIN' && (
            <div className="mt-6 pt-6 border-t border-white/20 flex items-center justify-center sm:justify-start gap-8">
              {[
                ...(user?.role === 'DELIVERY' ? [{ value: (profileData.deliveries ?? 0).toLocaleString(), label: 'Deliveries' }] : []),
                ...(user?.role === 'SELLER' ? [{ value: (profileData.orders ?? 0).toLocaleString(), label: 'Orders' }] : []),
                { value: '₹' + (profileData.earnings ?? 0).toLocaleString(), label: 'Earnings' },
                { value: (profileData.rating ?? 0) + '★', label: 'Rating' },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <p className="text-lg font-bold text-ink" style={{ fontFamily: 'var(--font-display)' }}>{s.value}</p>
                  <p className="text-[10px] text-ink/70 uppercase tracking-wider">{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <CardContent className="p-6 lg:p-8">
          <div className="flex flex-col sm:flex-row gap-4">
            {isEditing ? (
              <>
                <Button variant="secondary" className="flex-1 h-[52px]" onClick={handleSave}>Save Changes</Button>
                <Button variant="outline" className="flex-1 h-[52px]" onClick={() => setIsEditing(false)}>Cancel</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" className="flex-1 h-[52px]" onClick={() => setIsEditing(true)}>
                  <Edit3 className="h-4 w-4" /> Edit Profile
                </Button>
                <Button variant="outline" className="flex-1 h-[52px]" onClick={() => window.print()}>
                  <Download className="h-4 w-4" /> Download ID Card
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Info Sections */}
      {isEditing ? (
        <Card className="border-border">
          <CardHeader><CardTitle className="text-foreground">Edit Information</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Input label="Email Address" value={formData.email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, email: e.target.value })} />
              <Input label="Phone Number" value={formData.phone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, phone: e.target.value })} />
            </div>

            <h3 className="text-sm font-semibold text-foreground border-b border-border pb-2 mt-6">Address & Location</h3>
            <Input label="Current Address" value={formData.currentAddress} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, currentAddress: e.target.value })} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <Input label="City" value={formData.city} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, city: e.target.value })} />
              <Input label="State" value={formData.state} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, state: e.target.value })} />
              <Input label="Pincode" value={formData.pincode} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, pincode: e.target.value })} />
            </div>

            {user?.role !== 'SELLER' && (
              <>
                <h3 className="text-sm font-semibold text-foreground border-b border-border pb-2 mt-6">Vehicle Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                   <div className="space-y-2">
                     <label className="text-[13px] font-medium text-muted-foreground ml-1">Vehicle Type</label>
                     <select 
                       value={formData.vehicleType}
                       onChange={(e) => setFormData({ ...formData, vehicleType: e.target.value })}
                       className="flex h-[52px] w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
                     >
                       <option value="Bike">Bike</option>
                       <option value="Scooter">Scooter</option>
                       <option value="Bicycle">Bicycle</option>
                       <option value="Electric Vehicle">Electric Vehicle</option>
                       <option value="Car">Car</option>
                     </select>
                   </div>
                   <Input label="Vehicle Number" value={formData.vehicleNumber} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, vehicleNumber: e.target.value })} />
                </div>
              </>
            )}

            <h3 className="text-sm font-semibold text-foreground border-b border-border pb-2 mt-6">Emergency Contact</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Input label="Contact Name" value={formData.emergencyContactName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, emergencyContactName: e.target.value })} />
              <Input label="Contact Number" value={formData.emergencyContactNumber} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, emergencyContactNumber: e.target.value })} />
            </div>
          </CardContent>
        </Card>
      ) : (
        infoSections.map((section) => (
          <Card key={section.title} className="border-border">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-[12px] bg-saffron/20 flex items-center justify-center">
                  <section.icon className="h-4 w-4 text-saffron" />
                </div>
                <CardTitle className="text-foreground">{section.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="space-y-2">
                {section.items.map((item: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) => (
                  <div key={item.label} className="flex items-center gap-4 p-4 rounded-[14px] hover:bg-muted transition-colors group">
                    <div className="w-10 h-10 rounded-[12px] bg-muted group-hover:bg-background border border-border flex items-center justify-center flex-shrink-0 transition-all">
                      <item.icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground font-medium">{item.label}</p>
                      <p className="text-sm font-semibold text-foreground mt-0.5">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </motion.div>
  )
}
