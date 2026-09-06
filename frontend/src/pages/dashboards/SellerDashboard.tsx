import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Package, 
  TrendingUp, 
  DollarSign, 
  Plus, 
  Loader2, 
  XCircle, 
  AlertTriangle, 
  ShieldCheck, 
  Award, 
  Truck, 
  Star, 
  CheckCircle2, 
  Clock, 
  Sparkles,
  MessageSquare,
  RefreshCw
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { ProductUpload } from '@/components/seller/ProductUpload'
import { getProductImageUrl } from '@/lib/utils'
import api from '@/lib/api'
import { toast } from 'sonner'

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }

export function SellerDashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState<any>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [dispatchingId, setDispatchingId] = useState<string | null>(null)

  const fetchStats = async (showToast = false) => {
    if (!user) return
    setIsRefreshing(true)
    try {
      const res = await api.get(`http://localhost:3001/api/seller/stats/${user.id}`)
      setStats(res.data)
      if (showToast) {
        toast.success('Dashboard refreshed with latest orders and reviews!')
      }
    } catch (error) {
      console.error('Failed to load seller stats', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchStats()
    // Auto-refresh every 30 seconds to catch live orders and reviews
    const timer = setInterval(() => {
      fetchStats(false)
    }, 30000)
    return () => clearInterval(timer)
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

  const handleDispatchItem = async (orderItemId: string) => {
    if (!user) return
    setDispatchingId(orderItemId)
    try {
      const res = await api.put(`http://localhost:3001/api/seller/orders/${orderItemId}/dispatch`, {
        sellerId: user.id,
      })
      const isOntime = res.data.isDispatchedOnTime
      if (isOntime) {
        toast.success('🎉 Item marked dispatched on time! +SLA Score boost.')
      } else {
        toast.warning('Item marked dispatched (after SLA target).')
      }
      fetchStats()
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to update dispatch status.'
      toast.error(msg)
    } finally {
      setDispatchingId(null)
    }
  }

  if (!stats) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>
  }

  const trustScore = Math.round((stats.sellerTrustScore ?? 0.70) * 100)
  const isColdStart = (stats.totalCompletedOrders ?? 0) < 5 || stats.isNewSeller

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8 relative">
      <motion.div variants={item} className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-end">
        <div className="flex-1 w-full">
          <Card className="bg-gradient-to-br from-accent to-accent/90 text-accent-foreground border-0 overflow-hidden relative shadow-xl">
            <CardContent className="p-8 lg:p-10 relative z-10">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h2 className="text-[28px] font-bold leading-tight font-display">
                  Artisan Dashboard
                </h2>
                {stats.trustBadge && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30">
                    <Award className="h-3.5 w-3.5" />
                    {stats.trustBadge}
                  </span>
                )}
                {isColdStart && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/20 text-blue-200 border border-blue-400/30">
                    <Sparkles className="h-3 w-3" /> Cold Start Protected
                  </span>
                )}
              </div>
              <p className="text-sm text-accent-foreground/80 font-medium">Manage your craft listings, track dispatch SLA, and grow your artisan trust score.</p>
            </CardContent>
          </Card>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchStats(true)}
            disabled={isRefreshing}
            className="h-16 px-5 rounded-3xl bg-muted border border-border text-foreground font-semibold flex items-center gap-2 shadow-sm hover:bg-muted/80 transition-all disabled:opacity-50"
            title="Refresh dashboard stats and orders"
          >
            <RefreshCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
            Refresh
          </button>
          <button 
            onClick={() => setIsUploading(true)}
            className="h-16 px-8 rounded-3xl bg-primary text-primary-foreground font-bold flex items-center gap-2 shadow-xl hover:-translate-y-1 transition-transform"
          >
            <Plus className="h-6 w-6" /> Add Product
          </button>
        </div>
      </motion.div>

      {/* Top Level Summary Cards */}
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
              <CardTitle className="text-sm font-medium text-muted-foreground">Artisan Trust Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <ShieldCheck className={`h-5 w-5 ${trustScore >= 80 ? 'text-emerald-500' : trustScore >= 60 ? 'text-amber-500' : 'text-rose-500'}`} />
                <span className={`text-2xl font-bold ${trustScore >= 80 ? 'text-emerald-600' : trustScore >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>
                  {trustScore}/100
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Multi-pillar performance rating</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Completed Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-saffron" />
                <span className="text-2xl font-bold">{stats.totalCompletedOrders ?? 0}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {stats.recentOrders?.length ?? 0} total active items
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Trust & Performance Breakdown Section */}
      <motion.div variants={item}>
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Seller Performance & Trust Scoring
              </CardTitle>
              {stats.trustBadge && (
                <div className="px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5">
                  <Award className="h-3.5 w-3.5" />
                  {stats.trustBadge}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Your overall trust score directly modulates recommendation placement. High scores earn priority visibility across discovery carousels.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {/* Pillar 1: Customer Rating (30%) */}
              <div className="p-3 bg-muted/40 rounded-xl border border-border/50">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-foreground flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" /> Rating (30%)
                  </span>
                  <span className="font-bold">{Math.round((stats.ratingScore ?? 0.70) * 100)}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-amber-500 h-2 rounded-full transition-all" 
                    style={{ width: `${Math.min(100, Math.max(0, (stats.ratingScore ?? 0.70) * 100))}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {stats.sellerRating > 0 ? `Avg: ${Number(stats.sellerRating).toFixed(1)} ★` : 'No reviews yet (0.70 prior)'}
                </p>
              </div>

              {/* Pillar 2: Fulfilment History (25%) */}
              <div className="p-3 bg-muted/40 rounded-xl border border-border/50">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-foreground flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Fulfilment (25%)
                  </span>
                  <span className="font-bold">{Math.round((stats.fulfilmentRate ?? 1.0) * 100)}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-emerald-500 h-2 rounded-full transition-all" 
                    style={{ width: `${Math.min(100, Math.max(0, (stats.fulfilmentRate ?? 1.0) * 100))}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{stats.totalCompletedOrders ?? 0} delivered / {stats.totalOrders ?? stats.recentOrders?.length ?? 0} total</p>
              </div>

              {/* Pillar 3: Dispatch Reliability SLA (20%) */}
              <div className="p-3 bg-muted/40 rounded-xl border border-border/50">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-foreground flex items-center gap-1">
                    <Truck className="h-3.5 w-3.5 text-blue-500" /> Dispatch SLA (20%)
                  </span>
                  <span className="font-bold">{Math.round((stats.dispatchSlaScore ?? 1.0) * 100)}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all" 
                    style={{ width: `${Math.min(100, Math.max(0, (stats.dispatchSlaScore ?? 1.0) * 100))}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Dispatched within SLA</p>
              </div>

              {/* Pillar 4: Cancellation Control (15%) */}
              <div className="p-3 bg-muted/40 rounded-xl border border-border/50">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-foreground flex items-center gap-1">
                    <XCircle className="h-3.5 w-3.5 text-rose-500" /> Cancel Rate (15%)
                  </span>
                  <span className={`font-bold ${(stats.cancellationRate ?? 0) > 0.1 ? 'text-rose-500' : 'text-emerald-600'}`}>
                    {Math.round((stats.cancellationRate ?? 0) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-rose-500 h-2 rounded-full transition-all" 
                    style={{ width: `${Math.min(100, Math.max(0, (1 - (stats.cancellationRate ?? 0)) * 100))}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{stats.cancelledOrders?.length ?? 0} cancelled</p>
              </div>

              {/* Pillar 5: Return Control (10%) */}
              <div className="p-3 bg-muted/40 rounded-xl border border-border/50">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-foreground flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-orange-500" /> Return Rate (10%)
                  </span>
                  <span className="font-bold">{Math.round((stats.returnRate ?? 0) * 100)}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-orange-500 h-2 rounded-full transition-all" 
                    style={{ width: `${Math.min(100, Math.max(0, (1 - (stats.returnRate ?? 0)) * 100))}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Low returns protect score</p>
              </div>
            </div>

            {isColdStart && (
              <div className="flex items-center gap-2 p-3 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl text-xs text-blue-700 dark:text-blue-300">
                <Sparkles className="h-4 w-4 shrink-0 text-blue-500" />
                <span>
                  <strong>New Artisan Protection:</strong> Because you have fewer than 5 orders, your score is initialized with a safe prior of 0.70 and your products receive a reserved 15% discovery boost.
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
      
      {/* Customer Reviews on Seller's Products */}
      <motion.div variants={item}>
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                Customer Reviews on Your Products
              </CardTitle>
              <span className="text-xs font-semibold px-3 py-1 bg-amber-500/10 text-amber-600 rounded-full border border-amber-500/20">
                {stats.recentReviews?.length || 0} Reviews
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {stats.recentReviews?.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {stats.recentReviews.map((rev: any) => (
                  <div key={rev.id} className="p-4 bg-muted/40 rounded-2xl border border-border space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">
                          {rev.user?.firstName?.[0] || 'C'}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-foreground">
                            {rev.user?.firstName ? `${rev.user.firstName} ${rev.user.lastName || ''}` : 'Customer'}
                          </p>
                          <p className="text-[11px] text-primary font-medium truncate max-w-[200px]">
                            {rev.product?.name}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star 
                              key={s} 
                              className={`h-3 w-3 ${s <= (rev.rating || 5) ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/30'}`} 
                            />
                          ))}
                        </div>
                        <span className="text-[9px] text-muted-foreground block mt-0.5">
                          {new Date(rev.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    {rev.text && (
                      <p className="text-xs text-foreground/90 italic pt-1">
                        "{rev.text}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center bg-muted/20 rounded-2xl border border-dashed border-border text-muted-foreground">
                <p className="text-sm font-semibold">No customer reviews received yet.</p>
                <p className="text-xs mt-0.5">When buyers rate or review your delivered products, their feedback will appear here in real time.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Recent Orders Section with Dispatch SLA */}
      <motion.div variants={item}>
        <Card>
          <CardHeader>
            <CardTitle>Recent Orders & Fulfilment</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentOrders?.length > 0 ? (
              <div className="space-y-4">
                {stats.recentOrders.map((orderItem: any) => {
                  const isDelivered = orderItem.order?.status === 'DELIVERED'
                  const isCancelled = orderItem.order?.status === 'CANCELLED'
                  const isDispatched = !!orderItem.dispatchedAt
                  const isOnTime = orderItem.isDispatchedOnTime

                  return (
                    <div key={orderItem.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-muted/50 rounded-xl gap-4 border border-border/40">
                      <div className="flex items-center gap-3">
                        <div className="h-14 w-14 bg-muted rounded-xl overflow-hidden shrink-0 border border-border/50">
                          {orderItem.product?.images?.[0]?.url && (
                            <img src={getProductImageUrl(orderItem.product.images[0].url)} alt={orderItem.product.name} className="h-full w-full object-cover" />
                          )}
                        </div>
                        <div className="space-y-0.5">
                          <p className="font-bold text-foreground text-sm">{orderItem.product?.name} (x{orderItem.quantity})</p>
                          <p className="text-xs text-muted-foreground">
                            Order #{orderItem.order?.id?.slice(0,8).toUpperCase()} • Customer: {orderItem.order?.user?.firstName || 'Customer'} {orderItem.order?.user?.lastName || ''}
                          </p>
                          
                          {/* Dispatch SLA Status */}
                          <div className="flex items-center gap-2 mt-1">
                            {isDispatched ? (
                              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                                isOnTime !== false ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}>
                                <Truck className="h-3 w-3" />
                                {isOnTime !== false ? 'Dispatched on time' : 'Dispatched'} ({new Date(orderItem.dispatchedAt).toLocaleDateString()})
                              </span>
                            ) : isCancelled ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-red-50 text-red-600 border border-red-200">
                                <XCircle className="h-3 w-3" /> Cancelled
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                                <Clock className="h-3 w-3" />
                                {orderItem.expectedDispatchAt 
                                  ? `Dispatch SLA: ${new Date(orderItem.expectedDispatchAt).toLocaleDateString()}`
                                  : 'Pending dispatch'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3">
                        <div className="text-right">
                          <p className="font-bold text-primary">₹{orderItem.priceAtBuy * orderItem.quantity}</p>
                          <span className={`text-[10px] font-bold uppercase ${
                            isDelivered ? 'text-green-600' : 
                            isCancelled ? 'text-red-500' : 'text-muted-foreground'
                          }`}>
                            {orderItem.order?.status}
                          </span>
                        </div>

                        {/* Dispatch Action Button */}
                        {!isDispatched && !isCancelled && !isDelivered && (
                          <button
                            onClick={() => handleDispatchItem(orderItem.id)}
                            disabled={dispatchingId === orderItem.id}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                            title="Mark this item as dispatched"
                          >
                            {dispatchingId === orderItem.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Truck className="h-3.5 w-3.5" />
                            )}
                            Dispatch
                          </button>
                        )}

                        {/* Cancel Button */}
                        {!isDelivered && !isCancelled && !isDispatched && (
                          <button
                            onClick={() => handleCancelItem(orderItem.id)}
                            disabled={cancellingId === orderItem.id}
                            className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 transition-all disabled:opacity-50"
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
                  )
                })}
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
                      <p className="font-semibold text-foreground">{orderItem.product?.name} (x{orderItem.quantity})</p>
                      <p className="text-xs text-muted-foreground">
                        Order #{orderItem.order?.id?.slice(0,8).toUpperCase()}
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
                <AlertTriangle className="h-3 w-3 text-red-500" />
                Cancellations impact your trust score and reduce priority in recommendation rankings.
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