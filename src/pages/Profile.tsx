import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'
import { DUMMY_USER } from '@/lib/constants'
import {
  User, Mail, Phone, MapPin, Calendar, Car, PhoneCall,
  Download, Edit3, Truck, Award, Star, Shield, CheckCircle2,
} from 'lucide-react'

export function ProfilePage() {
  const { user, updateUser } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const profileData = { ...DUMMY_USER, ...user }

  const [formData, setFormData] = useState({
    email: profileData.email || '',
    phone: profileData.phone || '',
    currentAddress: profileData.currentAddress || '',
    emergencyContactName: profileData.emergencyContactName || '',
    emergencyContactNumber: profileData.emergencyContactNumber || '',
  })

  const handleSave = () => { updateUser(formData); setIsEditing(false); alert('Profile updated successfully!') }

  const infoSections = [
    {
      title: 'Personal Information', icon: User,
      items: [
        { icon: User, label: 'Full Name', value: profileData.fullName },
        { icon: Award, label: 'Partner ID', value: profileData.partnerId },
        { icon: Mail, label: 'Email Address', value: profileData.email },
        { icon: Phone, label: 'Phone Number', value: profileData.phone },
        { icon: Calendar, label: 'Date of Birth', value: profileData.dateOfBirth || '15 Mar 1995' },
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
    {
      title: 'Vehicle & Emergency', icon: Shield,
      items: [
        { icon: Car, label: 'Vehicle', value: `${profileData.vehicleType} — ${profileData.vehicleNumber}` },
        { icon: Calendar, label: 'Date Joined', value: profileData.dateJoined },
        { icon: PhoneCall, label: 'Emergency Contact', value: `${profileData.emergencyContactName} (${profileData.emergencyContactNumber})` },
      ],
    },
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto space-y-8">
      {/* Profile Card */}
      <Card className="overflow-hidden shadow-xl">
        <div className="bg-gradient-to-br from-[#F9B000] via-[#E09E00] to-[#D09400] p-8 lg:p-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-white/20 rounded-full blur-3xl -mr-32 -mt-32" />
          <div className="absolute bottom-0 left-0 w-72 h-72 bg-white/10 rounded-full blur-3xl -ml-24 -mb-24" />
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 relative z-10">
            <div className="relative">
              <div className="w-28 h-28 rounded-full bg-white/40 backdrop-blur-sm flex items-center justify-center text-4xl font-bold text-[#111111] border-4 border-white/60 shadow-xl">
                {profileData.fullName.split(' ').map((n: string) => n[0]).join('')}
              </div>
              <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#0C831F] border-2 border-white flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-white" />
              </div>
              <button onClick={() => setIsEditing(!isEditing)}
                className="absolute -bottom-1 -left-1 w-8 h-8 rounded-full bg-white flex items-center justify-center text-[#111111] shadow-lg hover:bg-[#FAF8F5] transition-colors border border-[#E2DDD5]">
                <Edit3 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="text-center sm:text-left flex-1">
              <h2 className="text-[28px] font-bold text-[#111111] leading-tight" style={{ fontFamily: 'var(--font-display)' }}>{profileData.fullName}</h2>
              <div className="flex items-center gap-3 justify-center sm:justify-start mt-3 flex-wrap">
                <Badge variant="success" dot className="bg-[#0C831F]/20 text-[#0C831F] border-none">{profileData.status || 'Verified'}</Badge>
                <span className="text-sm text-[#111111]/70 font-semibold">{profileData.partnerId}</span>
                <span className="flex items-center gap-1 text-sm text-[#111111]/70">
                  <Star className="h-3.5 w-3.5 fill-[#F9B000] text-[#F9B000]" /> 4.8★
                </span>
              </div>
              <p className="text-[#111111]/80 text-sm mt-3 flex items-center gap-1.5 justify-center sm:justify-start font-medium">
                <Truck className="h-4 w-4 text-[#111111]" />
                Shipping Partner since {profileData.dateJoined || '15 Jan 2024'}
              </p>
            </div>
          </div>
          {/* Stats mini bar */}
          <div className="mt-6 pt-6 border-t border-white/20 flex items-center justify-center sm:justify-start gap-8">
            {[
              { value: '1,248', label: 'Deliveries' },
              { value: '₹45K', label: 'Earnings' },
              { value: '4.8★', label: 'Rating' },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-lg font-bold text-[#111111]" style={{ fontFamily: 'var(--font-display)' }}>{s.value}</p>
                <p className="text-[10px] text-[#111111]/60 uppercase tracking-wider">{s.label}</p>
              </div>
            ))}
          </div>
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
        <Card>
          <CardHeader><CardTitle>Edit Information</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <Input label="Email Address" value={formData.email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, email: e.target.value })} />
            <Input label="Phone Number" value={formData.phone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, phone: e.target.value })} />
            <Input label="Current Address" value={formData.currentAddress} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, currentAddress: e.target.value })} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Input label="Emergency Contact Name" value={formData.emergencyContactName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, emergencyContactName: e.target.value })} />
              <Input label="Emergency Contact Number" value={formData.emergencyContactNumber} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, emergencyContactNumber: e.target.value })} />
            </div>
          </CardContent>
        </Card>
      ) : (
        infoSections.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-[12px] bg-gradient-to-br from-[#F9B000]/20 to-[#F9B000]/5 flex items-center justify-center">
                  <section.icon className="h-4 w-4 text-[#F9B000]" />
                </div>
                <CardTitle>{section.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="space-y-2">
                {section.items.map((item: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) => (
                  <div key={item.label} className="flex items-center gap-4 p-4 rounded-[14px] hover:bg-[#FAF8F5] transition-colors group">
                    <div className="w-10 h-10 rounded-[12px] bg-[#FAF8F5] group-hover:bg-white border border-[#E2DDD5] flex items-center justify-center flex-shrink-0 transition-all">
                      <item.icon className="h-4 w-4 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-400 font-medium">{item.label}</p>
                      <p className="text-sm font-semibold text-[#111111] mt-0.5">{item.value}</p>
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
