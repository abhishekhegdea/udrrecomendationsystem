import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Lock, Smartphone, Bell, Moon, Globe, ChevronRight, Shield } from 'lucide-react'

export function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [mobileNumber, setMobileNumber] = useState('')
  const [notifications, setNotifications] = useState({ orderUpdates: true, paymentAlerts: true, promotionalEmails: false })
  const [darkMode, setDarkMode] = useState(false)
  const [language] = useState('English')

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault()
    alert('Password changed successfully!')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  const handleMobileChange = (e: React.FormEvent) => {
    e.preventDefault()
    alert('Mobile number change request submitted!')
    setMobileNumber('')
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto space-y-8">
      {/* Page Header */}
      <div>
        <h2 className="display-2 text-[#111111]">Settings</h2>
        <p className="text-gray-500 mt-2">Manage your account preferences</p>
      </div>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-[#F9B000]/20 to-[#F9B000]/10 flex items-center justify-center">
              <Lock className="h-5 w-5 text-[#F9B000]" />
            </div>
            <div>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Update your account password</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-5">
            <Input label="Current Password" type="password" placeholder="Enter current password" value={currentPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrentPassword(e.target.value)} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Input label="New Password" type="password" placeholder="Enter new password" value={newPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)} />
              <Input label="Confirm New Password" type="password" placeholder="Confirm new password" value={confirmPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)} />
            </div>
            <Button type="submit" variant="secondary">Update Password</Button>
          </form>
        </CardContent>
      </Card>

      {/* Change Mobile Number */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-[#F9B000]/20 to-[#F9B000]/10 flex items-center justify-center">
              <Smartphone className="h-5 w-5 text-[#F9B000]" />
            </div>
            <div>
              <CardTitle>Change Mobile Number</CardTitle>
              <CardDescription>Request to update your registered mobile number</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleMobileChange} className="space-y-5">
            <Input label="New Mobile Number" type="tel" placeholder="Enter new mobile number" value={mobileNumber}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMobileNumber(e.target.value)} />
            <Button type="submit" variant="secondary">Request Change</Button>
          </form>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-[#F9B000]/20 to-[#F9B000]/10 flex items-center justify-center">
              <Bell className="h-5 w-5 text-[#F9B000]" />
            </div>
            <div>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose what notifications you receive</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {([
              { key: 'orderUpdates' as const, label: 'Order Updates', desc: 'Get notified about new orders and status changes' },
              { key: 'paymentAlerts' as const, label: 'Payment Alerts', desc: 'Receive payment confirmation and payout alerts' },
              { key: 'promotionalEmails' as const, label: 'Promotional Emails', desc: 'Receive offers, tips, and promotional content' },
            ] as const).map((item) => (
              <div key={item.key} className="flex items-center justify-between p-4 rounded-[14px] hover:bg-[#FAF8F5] transition-colors">
                <div>
                  <p className="text-sm font-semibold text-[#111111]">{item.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                </div>
                <button
                  onClick={() => setNotifications((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
                  className={`relative w-12 h-6 rounded-full transition-all duration-200 flex-shrink-0 ${notifications[item.key] ? 'bg-[#F9B000]' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-200 ${notifications[item.key] ? 'left-[26px]' : 'left-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Appearance & Language */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-[#F9B000]/20 to-[#F9B000]/10 flex items-center justify-center">
              <Moon className="h-5 w-5 text-[#F9B000]" />
            </div>
            <div>
              <CardTitle>Appearance & Language</CardTitle>
              <CardDescription>Customize your experience</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-[14px] hover:bg-[#FAF8F5] transition-colors">
              <div className="flex items-center gap-3">
                <Moon className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-sm font-semibold text-[#111111]">Dark Mode</p>
                  <p className="text-xs text-gray-400 mt-0.5">Toggle dark mode appearance</p>
                </div>
              </div>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`relative w-12 h-6 rounded-full transition-all duration-200 flex-shrink-0 ${darkMode ? 'bg-[#F9B000]' : 'bg-gray-200'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-200 ${darkMode ? 'left-[26px]' : 'left-0.5'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-[14px] hover:bg-[#FAF8F5] transition-colors">
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-sm font-semibold text-[#111111]">Language</p>
                  <p className="text-xs text-gray-400 mt-0.5">{language}</p>
                </div>
              </div>
              <button className="flex items-center gap-2 text-sm text-gray-400 hover:text-[#111111] transition-colors">
                <span className="font-medium">Change</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Security */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-[#F9B000]/20 to-[#F9B000]/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-[#F9B000]" />
            </div>
            <div>
              <CardTitle>Account Security</CardTitle>
              <CardDescription>Manage your account security settings</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { label: 'Two-Factor Authentication', desc: 'Add an extra layer of security to your account', badge: 'Coming Soon' },
              { label: 'Active Sessions', desc: 'View and manage your active login sessions', badge: 'Coming Soon' },
              { label: 'Delete Account', desc: 'Permanently delete your partner account', badge: 'Contact Support' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between p-4 rounded-[14px] hover:bg-[#FAF8F5] transition-colors">
                <div>
                  <p className="text-sm font-semibold text-[#111111]">{item.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                </div>
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{item.badge}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
