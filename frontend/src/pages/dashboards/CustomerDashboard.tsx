import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getProductImageUrl } from '@/lib/utils'
import { Package, Clock, User, Mail, Phone, X, Star } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import api from '@/lib/api'
import { Link } from 'react-router-dom'

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }

export function CustomerDashboard() {
  const { user } = useAuth()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('ALL')

  // Return feedback modal state
  const [returnModal, setReturnModal] = useState<{ orderId: string; itemId: string; product: any } | null>(null)
  const [returnReason, setReturnReason] = useState('QUALITY')
  const [returnReview, setReturnReview] = useState('')
  const [returnRating, setReturnRating] = useState(0)
  const [returnSubmitting, setReturnSubmitting] = useState(false)

  const filteredOrders = filterStatus === 'ALL' ? orders : orders.filter(o => o.status === filterStatus)

  const handleCancelOrder = async (orderId: string) => {
    if (!confirm('Are you sure you want to cancel this order?')) return;
    try {
      await api.patch(`http://localhost:3001/api/orders/${orderId}/cancel`);
      alert('Order cancelled successfully');
      setOrders(orders.map(o => o.id === orderId ? {...o, status: 'CANCELLED'} : o));
    } catch {
      alert('Failed to cancel order');
    }
  }

  const openReturnModal = (orderId: string, itemId: string, product: any) => {
    setReturnReason('QUALITY')
    setReturnReview('')
    setReturnRating(0)
    setReturnModal({ orderId, itemId, product })
  }

  const submitReturn = async () => {
    if (!returnModal) return
    setReturnSubmitting(true)
    try {
      // The server records the RETURN UserBehaviour row (with reason /
      // review / rating) and applies the seller penalty atomically.
      await api.patch(`http://localhost:3001/api/orders/${returnModal.orderId}/items/${returnModal.itemId}/return`, {
        reason: returnReason,
        reviewText: returnReview.trim() || null,
        rating: returnRating || null,
      })
      setOrders(orders.map(o => o.id === returnModal.orderId ? {
        ...o,
        items: o.items.map((i: any) => i.id === returnModal.itemId ? {...i, returned: true} : i)
      } : o))
      setReturnModal(null)
      alert('Return submitted. Thank you for your feedback!')
    } catch {
      alert('Failed to return item')
    } finally {
      setReturnSubmitting(false)
    }
  }

  useEffect(() => {
    if (user?.id) {
      api.get(`http://localhost:3001/api/orders/customer/${user.id}`)
        .then(res => setOrders(res.data))
        .catch(() => {})
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [user])

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">
      <motion.div variants={item}>
        <Card className="bg-gradient-to-br from-primary to-primary/90 text-primary-foreground border-0 overflow-hidden relative shadow-xl">
          <CardContent className="p-8 lg:p-10 relative z-10 flex flex-col md:flex-row gap-8 items-center md:items-start justify-between">
            <div>
              <h2 className="text-[28px] font-bold leading-tight font-display mb-2">
                Welcome back, {user?.firstName}!
              </h2>
              <p className="text-sm text-primary-foreground/80 font-medium">Manage your orders and account settings.</p>
            </div>
            
            <div className="bg-white/10 p-6 rounded-2xl border border-white/20 w-full md:w-auto">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><User className="h-5 w-5" /> Profile Details</h3>
              <div className="space-y-2 text-sm text-primary-foreground/90">
                <p className="flex items-center gap-2"><Mail className="h-4 w-4 opacity-70" /> {user?.email}</p>
                <p className="flex items-center gap-2"><User className="h-4 w-4 opacity-70" /> {user?.firstName} {user?.lastName}</p>
                <p className="flex items-center gap-2"><Phone className="h-4 w-4 opacity-70" /> {user?.phone || 'No phone added'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={item}>
        <Card>
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" /> Order History</CardTitle>
            <div className="flex gap-2 flex-wrap">
              {['ALL', 'PENDING', 'DELIVERED', 'CANCELLED'].map(status => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                    filterStatus === status 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="p-8 text-center text-muted-foreground border border-dashed border-border rounded-xl">
                <p>Loading orders...</p>
              </div>
            ) : orders.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground border border-dashed border-border rounded-xl">
                <Clock className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="mb-4">You haven't placed any orders yet.</p>
                <Link to="/search" className="px-6 py-2 bg-primary text-primary-foreground rounded-full text-sm font-semibold hover:bg-primary/90 inline-block transition-colors">
                  Browse Products
                </Link>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground border border-dashed border-border rounded-xl">
                <Clock className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="mb-4">No orders found.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {filteredOrders.map((order) => (
                  <div key={order.id} className="border border-border rounded-xl p-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-4 mb-4">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Order #{order.id.slice(0,8).toUpperCase()}</p>
                        <p className="font-semibold text-foreground">Placed on {new Date(order.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="flex flex-col md:items-end gap-2">
                        <span className="px-3 py-1 bg-accent/10 text-accent font-semibold text-xs rounded-full uppercase tracking-wide">
                          {order.status}
                        </span>
                        <p className="font-bold text-lg text-primary">₹{order.totalAmount}</p>
                        {order.status === 'PENDING' && (
                          <button onClick={() => handleCancelOrder(order.id)} className="text-xs text-red-500 font-semibold hover:underline">
                            Cancel Order
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      {order.items?.map((item: any) => (
                        <div key={item.id} className="flex gap-4 items-center">
                          <div className="h-16 w-16 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                            {item.product?.images?.[0]?.url ? (
                              <img src={getProductImageUrl(item.product.images[0].url)} alt={item.product.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="h-full w-full bg-sand flex items-center justify-center">
                                <Package className="h-6 w-6 text-clay opacity-30" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1">
                            <Link to={`/product/${item.product.id}`} className="font-semibold text-foreground hover:text-primary transition-colors block">
                              {item.product.name}
                            </Link>
                            <p className="text-sm text-muted-foreground">Qty: {item.quantity} × ₹{item.priceAtBuy}</p>
                            <div className="flex gap-4 items-center">
                              {order.status === 'DELIVERED' && (
                                <button 
                                  onClick={() => {
                                    const text = prompt('Leave a review for this product:')
                                    if (text) {
                                      api.post(`http://localhost:3001/api/products/${item.product.id}/reviews`, {
                                        text,
                                        userId: user?.id,
                                        rating: 5
                                      }).then(() => alert('Review submitted! Thank you.'))
                                        .catch(() => alert('Failed to submit review'))
                                    }
                                  }}
                                  className="mt-2 text-xs font-semibold text-primary hover:underline"
                                >
                                  Leave a Review
                                </button>
                              )}
                              
                              {order.status === 'DELIVERED' && !item.returned && (
                                <button 
                                  onClick={() => openReturnModal(order.id, item.id, item.product)}
                                  className="mt-2 text-xs font-semibold text-red-500 hover:underline"
                                >
                                  Return Item
                                </button>
                              )}

                              {item.returned && (
                                <span className="mt-2 text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded">
                                  Returned
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Return Feedback Modal — asks for the reason + review + rating so
          quality issues can negatively affect recommendation scores. */}
      {returnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !returnSubmitting && setReturnModal(null)}
          />
          <div className="relative bg-card border border-border rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold">Return {returnModal.product?.name || 'Item'}</h3>
                <p className="text-sm text-muted-foreground">Help us improve — why are you returning this item?</p>
              </div>
              <button
                onClick={() => !returnSubmitting && setReturnModal(null)}
                className="p-2 hover:bg-muted rounded-full transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Reason for return */}
            <div className="space-y-2">
              <label className="text-sm font-semibold">Reason for return</label>
              {[
                { value: 'QUALITY', label: 'Quality issue', desc: 'Defective, not as described, or poor quality' },
                { value: 'DAMAGED', label: 'Damaged in transit', desc: 'Arrived damaged or broken' },
                { value: 'MISTAKE', label: 'Ordered by mistake', desc: 'Changed my mind or wrong item' },
                { value: 'OTHER', label: 'Other', desc: 'Some other reason' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setReturnReason(opt.value)}
                  className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                    returnReason === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                  }`}
                >
                  <p className="font-semibold text-sm">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </button>
              ))}
              {(returnReason === 'QUALITY' || returnReason === 'DAMAGED') && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  Quality feedback helps us surface better artisans and improves recommendations for everyone.
                </p>
              )}
            </div>

            {/* Star rating (optional) */}
            <div className="mt-4">
              <label className="text-sm font-semibold">Rate the product (optional)</label>
              <div className="flex gap-1 mt-1">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setReturnRating(star)}
                    className="p-1 transition-transform hover:scale-110"
                    aria-label={`${star} star${star > 1 ? 's' : ''}`}
                  >
                    <Star className={`h-6 w-6 ${star <= returnRating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
                  </button>
                ))}
              </div>
            </div>

            {/* Review text (optional) */}
            <div className="mt-4">
              <label className="text-sm font-semibold">Your review (optional)</label>
              <textarea
                value={returnReview}
                onChange={(e) => setReturnReview(e.target.value)}
                rows={3}
                placeholder="Tell us more about your experience..."
                className="mt-1 w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none resize-none"
              />
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setReturnModal(null)}
                disabled={returnSubmitting}
                className="flex-1 h-11 bg-muted text-foreground font-semibold rounded-xl hover:bg-muted/80 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submitReturn}
                disabled={returnSubmitting}
                className="flex-1 h-11 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {returnSubmitting ? 'Submitting...' : 'Submit Return'}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}
