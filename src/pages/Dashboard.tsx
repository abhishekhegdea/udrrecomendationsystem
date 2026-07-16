import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { DASHBOARD_STATS, RECENT_ACTIVITY, DOCUMENT_STATUS } from '@/lib/constants'
import type { User } from '@/contexts/AuthContext'
import {
  Package, IndianRupee, CheckCircle2, Star, Clock, Truck,
  ChevronRight, FileText, BanknoteIcon, Car, User as UserIcon,
  TrendingUp, Zap, MapPin,
} from 'lucide-react'

const statCards = (user: User | null) => [
  { icon: Package, label: 'Total Deliveries', value: (user?.deliveries ?? DASHBOARD_STATS.totalDeliveries).toLocaleString(), color: 'from-[#F9B000]/20 to-[#F9B000]/5', iconColor: 'text-[#F9B000]', badge: '↑ 12% this month' },
  { icon: TrendingUp, label: 'Current Earnings', value: `₹${(user?.earnings ?? 45280).toLocaleString()}`, color: 'from-green-100/80 to-green-50/50', iconColor: 'text-[#0C831F]', badge: '↑ 8% vs last month' },
  { icon: CheckCircle2, label: 'Completed Orders', value: (user?.deliveries ?? DASHBOARD_STATS.completedOrders).toLocaleString(), color: 'from-blue-100/80 to-blue-50/50', iconColor: 'text-[#3B82F6]', badge: '96% success rate' },
  { icon: Star, label: 'Customer Rating', value: `${user?.rating ?? DASHBOARD_STATS.customerRating}/5`, color: 'from-[#C4663A]/20 to-[#C4663A]/5', iconColor: 'text-[#C4663A]', badge: '★ Top rated partner' },
]

const documentItems = [
  { label: 'Aadhaar', status: DOCUMENT_STATUS.aadhaar, icon: FileText, date: 'Verified on 12 Jan' },
  { label: 'PAN', status: DOCUMENT_STATUS.pan, icon: FileText, date: 'Verified on 12 Jan' },
  { label: 'Driving License', status: DOCUMENT_STATUS.drivingLicense, icon: FileText, date: 'Verified on 15 Jan' },
  { label: 'Bank Details', status: DOCUMENT_STATUS.bank, icon: BanknoteIcon, date: 'Pending verification' },
  { label: 'Vehicle', status: DOCUMENT_STATUS.vehicle, icon: Car, date: 'Verified on 16 Jan' },
]

const statusVariant: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  Verified: 'success', Pending: 'warning', Rejected: 'error',
}

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }

const activityIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  delivery: Truck, payment: IndianRupee, order: Package, document: FileText, achievement: Zap,
}

const activityColors: Record<string, string> = {
  delivery: 'bg-[#F9B000]/15 text-[#F9B000]',
  payment: 'bg-green-50 text-[#0C831F]',
  order: 'bg-blue-50 text-[#3B82F6]',
  document: 'bg-[#C4663A]/15 text-[#C4663A]',
  achievement: 'bg-purple-50 text-[#7C3AED]',
}

export function DashboardPage() {
  const { user } = useAuth()

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">
      {/* Welcome Card */}
      <motion.div variants={item}>
        <Card className="bg-gradient-to-br from-saffron to-saffron/80 text-ink border-0 overflow-hidden relative shadow-xl shadow-[#F9B000]/25">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/15 rounded-full blur-3xl -mr-40 -mt-40" />
          <div className="absolute bottom-0 left-0 w-72 h-72 bg-white/10 rounded-full blur-3xl -ml-24 -mb-24" />
          <div className="absolute top-1/2 left-1/3 w-48 h-48 bg-white/10 rounded-full blur-2xl" />
          <CardContent className="p-8 lg:p-10 relative z-10">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-full bg-white/40 backdrop-blur-sm flex items-center justify-center text-2xl font-bold text-ink border-2 border-white/60 shadow-lg">
                  {user?.firstName?.charAt(0) || 'U'}
                </div>
                <div>
                  <h2 className="text-[28px] font-bold text-ink leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
                    Welcome back, {user?.firstName || 'Partner'} 👋
                  </h2>
                  <div className="flex items-center gap-2 mt-1.5">
                    <p className="text-sm text-ink/70 font-medium">Verified Shipping Partner</p>
                    <span className="text-ink/30">•</span>
                    <Badge variant="success" dot className="bg-[#0C831F]/20 text-[#0C831F] border-none">Active Now</Badge>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 px-5 py-3 rounded-[16px] bg-white/30 backdrop-blur-sm text-sm font-semibold shadow-sm border border-white/20">
                  <Clock className="h-4 w-4 text-ink" />
                  <div>
                    <span className="text-ink/60 text-xs">Today's Target</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-ink">{user?.todayDeliveries ?? DASHBOARD_STATS.todayDeliveries}</span>
                      <span className="text-ink/50">/ 15 deliveries</span>
                    </div>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-2 px-4 py-3 rounded-[16px] bg-white/30 backdrop-blur-sm border border-white/20">
                  <MapPin className="h-4 w-4 text-ink" />
                  <span className="text-xs font-semibold text-ink/80">Sector 14, Gurugram</span>
                </div>
              </div>
            </div>
            {/* Mini progress bar */}
            <div className="mt-6 flex items-center gap-4">
              <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-white/60 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${((user?.todayDeliveries ?? DASHBOARD_STATS.todayDeliveries) / 15) * 100}%` }}
                  transition={{ duration: 1, delay: 0.5, ease: 'easeOut' }}
                />
              </div>
              <span className="text-xs font-semibold text-ink/70 whitespace-nowrap">
                {Math.round(((user?.todayDeliveries ?? DASHBOARD_STATS.todayDeliveries) / 15) * 100)}% of daily goal
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Stats Grid */}
      <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {statCards(user).map((stat) => (
          <Card key={stat.label} className="hover:shadow-lg hover:border-border transition-all duration-300 group overflow-hidden relative border-border bg-card">
            <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-50 group-hover:opacity-80 transition-opacity`} />
            <CardContent className="p-6 relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 rounded-[14px] bg-card/80 backdrop-blur-sm shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform`}>
                  <stat.icon className={`h-6 w-6 ${stat.iconColor}`} />
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{stat.badge}</span>
              </div>
              <p className="text-[28px] font-bold text-foreground leading-tight" style={{ fontFamily: 'var(--font-display)' }}>{stat.value}</p>
              <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Activity & Documents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <motion.div variants={item}>
          <Card className="border-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-foreground">Recent Activity</CardTitle>
                <button className="text-xs font-semibold text-saffron hover:underline flex items-center gap-1">View All <ChevronRight className="h-3 w-3" /></button>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="space-y-2">
                {RECENT_ACTIVITY.map((activity: { id: number; action: string; time: string; type: string }) => {
                  const Icon = activityIcons[activity.type] || Package
                  const color = activityColors[activity.type] || 'bg-muted text-muted-foreground'
                  return (
                    <div key={activity.id} className="flex items-center gap-4 p-4 rounded-[14px] hover:bg-muted transition-all group cursor-pointer">
                      <div className={`w-10 h-10 rounded-[12px] ${color} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground font-medium">{activity.action}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Clock className="h-3 w-3 inline" /> {activity.time}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors flex-shrink-0" />
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Document Status */}
        <motion.div variants={item}>
          <Card className="border-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-foreground">Document Status</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#0C831F]" />
                  <span className="text-xs text-muted-foreground">4 of 5 verified</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="space-y-2">
                {documentItems.map((doc) => (
                  <div key={doc.label} className="flex items-center justify-between p-4 rounded-[14px] bg-muted hover:bg-muted/80 transition-all group cursor-pointer">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-[12px] bg-card border border-border flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform`}>
                        <doc.icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{doc.label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{doc.date}</p>
                      </div>
                    </div>
                    <Badge variant={statusVariant[doc.status] || 'default'} size="sm" dot>{doc.status}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <motion.div variants={item}>
        <Card className="overflow-hidden border-border">
          <CardContent className="p-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { icon: Truck, label: 'Start Delivery', color: 'from-[#F9B000] to-[#E09E00]', desc: 'Pick new orders' },
                { icon: FileText, label: 'Upload Document', color: 'from-[#3B82F6] to-[#2563EB]', desc: 'Pending verification' },
                { icon: IndianRupee, label: 'View Earnings', color: 'from-[#0C831F] to-[#0A6B19]', desc: 'This week summary' },
                { icon: UserIcon, label: 'Update Profile', color: 'from-[#C4663A] to-[#A0522F]', desc: 'Keep info current' },
              ].map((action) => (
                <button key={action.label} className="group relative overflow-hidden rounded-[24px] p-5 border border-border hover:shadow-lg transition-all duration-300 bg-card">
                  <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/[0.02] opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className={`w-12 h-12 rounded-[14px] bg-gradient-to-br ${action.color} shadow-md flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                    <action.icon className="h-6 w-6 text-white" />
                  </div>
                  <p className="text-sm font-bold text-foreground">{action.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{action.desc}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
