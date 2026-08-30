import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Package, TrendingUp, DollarSign, Plus, Loader2, XCircle, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { ProductUpload } from '@/components/seller/ProductUpload'
import api from '@/lib/api'
import { toast } from 'sonner'

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }

export function SellerDashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState<any>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const fetchStats = async () => {
    if (!user) return
    try {
      const res = await api.get(`http://localhost:3001/api/seller/stats/${user.id}`)
      setStats(res.data)
    } catch (error) {
      console.error('Failed to load seller stats', error)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [user])

  const handleCancelItem = async (orderItemId: string) => {
    if (!user) return
    setCancellingId(orderItemId)
    try {
      const res = await api.put(`http://localhost:3001/api/seller/orders/${orderItemId}/cancel`, {
        sellerId: user.id,
      })
      toast.success(res.data.message || 'Item cancelled successfully.')
      fetchStats()
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to cancel item.'
      toast.error(msg)
    } finally {
      setCancellingId(null)
    }
  }

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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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

        {/* New: Cancel Penalty Score Card */}
        <motion.div variants={item}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Cancel Penalty</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <AlertTriangle className={`h-5 w-5 ${(stats.cancelPenalty || 0) > 0 ? 'text-red-500' : 'text-green-500'}`} />
                <span className={`text-2xl font-bold ${(stats.cancelPenalty || 0) > 0 ? 'text-red-500' : 'text-green-600'}`}>
                  {(stats.cancelPenalty || 0).toFixed(1)}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Higher = worse recommendation ranking</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
      
      {/* Recent Orders Section */}
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
                      <p className="text-sm text-muted-foreground">
                        Order #{orderItem.order.id.slice(0,8).toUpperCase()} • {orderItem.order.user?.firstName}
                      </p>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <div>
                        <p className="font-bold text-primary">₹{orderItem.priceAtBuy * orderItem.quantity}</p>
                        <span className={`text-xs font-bold uppercase ${
                          orderItem.order.status === 'DELIVERED' ? 'text-green-600' : 
                          orderItem.order.status === 'CANCELLED' ? 'text-red-500' : 'text-muted-foreground'
                        }`}>
                          {orderItem.order.status}
                        </span>
                      </div>
                      {/* Cancel Button — only show for non-delivered, non-cancelled items */}
                      {orderItem.order.status !== 'DELIVERED' && orderItem.order.status !== 'CANCELLED' && (
                        <button
                          onClick={() => handleCancelItem(orderItem.id)}
                          disabled={cancellingId === orderItem.id}
                          className="p-2 rounded-full bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Cancel this order item"
                        >
                          {cancellingId === orderItem.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}
                        </button>
                      )}
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

      {/* Cancelled Orders Section */}
      {stats.cancelledOrders?.length > 0 && (
        <motion.div variants={item}>
          <Card className="border-red-200/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <XCircle className="h-5 w-5" />
                Cancelled Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.cancelledOrders.map((orderItem: any) => (
                  <div key={orderItem.id} className="flex items-center justify-between p-3 bg-red-50/50 rounded-xl border border-red-100">
                    <div>
                      <p className="font-semibold text-foreground">{orderItem.product.name} (x{orderItem.quantity})</p>
                      <p className="text-xs text-muted-foreground">
                        Order #{orderItem.order.id.slice(0,8).toUpperCase()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-red-500">₹{orderItem.priceAtBuy * orderItem.quantity}</p>
                      <span className="text-[10px] font-bold text-red-400 uppercase">Cancelled</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Cancellations add a penalty of 5 points each, lowering your products in recommendations.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

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