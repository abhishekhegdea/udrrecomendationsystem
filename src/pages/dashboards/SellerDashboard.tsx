import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Package, TrendingUp, DollarSign, Plus, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { ProductUpload } from '@/components/seller/ProductUpload'
import axios from 'axios'

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }

export function SellerDashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState<any>(null)
  const [isUploading, setIsUploading] = useState(false)

  const fetchStats = async () => {
    if (!user) return
    try {
      const res = await axios.get(`http://localhost:3001/api/seller/stats/${user.id}`)
      setStats(res.data)
    } catch (error) {
      console.error('Failed to load seller stats', error)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [user])

  if (!stats) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8 relative">
      <motion.div variants={item} className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-end">
        <div className="flex-1 w-full">
          <Card className="bg-gradient-to-br from-accent to-accent/90 text-accent-foreground border-0 overflow-hidden relative shadow-xl">
            <CardContent className="p-8 lg:p-10 relative z-10">
              <h2 className="text-[28px] font-bold leading-tight font-display mb-2">
                Artisan Dashboard
              </h2>
              <p className="text-sm text-accent-foreground/80 font-medium">Manage your products and track your sales.</p>
            </CardContent>
          </Card>
        </div>
        <button 
          onClick={() => setIsUploading(true)}
          className="h-16 px-8 rounded-3xl bg-primary text-primary-foreground font-bold flex items-center gap-2 shadow-xl hover:-translate-y-1 transition-transform"
        >
          <Plus className="h-6 w-6" /> Add Product
        </button>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div variants={item}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-600" />
                <span className="text-2xl font-bold">₹{stats.revenue.toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Listings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">{stats.activeListings}</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Growth</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-saffron" />
                <span className="text-2xl font-bold">+18.5%</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
      
        <motion.div variants={item}>
          <Card>
            <CardHeader>
              <CardTitle>Recent Orders</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.recentOrders?.length > 0 ? (
                <div className="space-y-4">
                  {stats.recentOrders.map((orderItem: any) => (
                    <div key={orderItem.id} className="flex items-center justify-between p-4 bg-muted/50 rounded-xl">
                      <div>
                        <p className="font-bold text-foreground">{orderItem.product.name} (x{orderItem.quantity})</p>
                        <p className="text-sm text-muted-foreground">Order #{orderItem.order.id.slice(0,8).toUpperCase()} • {orderItem.order.user?.firstName}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-primary">₹{orderItem.priceAtBuy * orderItem.quantity}</p>
                        <span className="text-xs font-bold text-muted-foreground uppercase">{orderItem.order.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No orders yet.</p>
              )}
            </CardContent>
          </Card>
        </motion.div>

      {isUploading && (
        <ProductUpload 
          onClose={() => setIsUploading(false)} 
          onSuccess={() => {
            setIsUploading(false)
            fetchStats()
          }} 
        />
      )}
    </motion.div>
  )
}
