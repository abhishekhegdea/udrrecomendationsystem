import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { getProductImageUrl } from '@/lib/utils'
import { Package, Clock, User, Mail, Phone, X, Star, CheckCircle2, MessageSquare, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import api from '@/lib/api'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }

const RATING_LABELS: Record<number, string> = {
  5: '5/5 — Exceptional Craftsmanship! ⭐⭐⭐⭐⭐',
  4: '4/5 — Very Good Quality ⭐⭐⭐⭐',
  3: '3/5 — Average Product ⭐⭐⭐',
  2: '2/5 — Below Expectations ⭐⭐',
  1: '1/5 — Unsatisfied ⭐',
}

export function CustomerDashboard() {
  const { user } = useAuth()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('ALL')

  // Review modal state
  const [reviewModal, setReviewModal] = useState<{ orderId: string; itemId: string; product: any } | null>(null)
  const [reviewRating, setReviewRating] = useState<number>(5)
  const [hoverRating, setHoverRating] = useState<number>(0)
  const [reviewText, setReviewText] = useState<string>('')
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewedProductIds, setReviewedProductIds] = useState<Set<string>>(new Set())

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
      toast.success('Order cancelled successfully');
      setOrders(orders.map(o => o.id === orderId ? {...o, status: 'CANCELLED'} : o));
    } catch {
      toast.error('Failed to cancel order');
    }
  }

  const openReviewModal = async (orderId: string, itemId: string, product: any) => {
    setReviewRating(5)
    setHoverRating(0)
    setReviewText('')
    setReviewModal({ orderId, itemId, product })

    // Check if user already reviewed this product
    if (user?.id) {
      try {
        const res = await api.get(`http://localhost:3001/api/products/${product.id}/user-review?userId=${user.id}`)
        if (res.data.hasReviewed) {
          if (res.data.rating) setReviewRating(res.data.rating)
          if (res.data.reviewText) setReviewText(res.data.reviewText)
        }
      } catch {
        // Fallback to default
      }
    }
  }

  const submitReview = async () => {
    if (!reviewModal || !user) return
    if (!reviewRating || reviewRating < 1 || reviewRating > 5) {
      toast.error('Please select a star rating between 1 and 5.')
      return
    }

    setReviewSubmitting(true)
    try {
      const res = await api.post(`http://localhost:3001/api/products/${reviewModal.product.id}/reviews`, {
        rating: reviewRating,
        text: reviewText.trim() || undefined,
        userId: user.id,
        orderId: reviewModal.orderId,
      })
      toast.success(res.data.message || '🎉 Thank you! Your review and rating have been added to the product.')
      setReviewedProductIds(prev => new Set(prev).add(reviewModal.product.id))
      setReviewModal(null)
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to submit review. Please try again.'
      toast.error(msg)
    } finally {
      setReviewSubmitting(false)
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
      toast.success('Return submitted. Thank you for your feedback!')
    } catch {
      toast.error('Failed to return item')
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

      <motion.div variants={item} className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold font-display">Your Orders</h3>
          <div className="flex gap-2">
            {['ALL', 'PENDING', 'DELIVERED', 'CANCELLED'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-4 py-2 rounded-full text-xs font-semibold transition-all ${
                  filterStatus === status 
                    ? 'bg-primary text-primary-foreground shadow-md' 
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            {loading ? (
              <div className="py-12 text-center text-muted-foreground">Loading your orders...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>No orders found.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {filteredOrders.map((order) => (
                  <div key={order.id} className="border border-border rounded-2xl p-6 space-y-4">
                    <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 pb-4 border-b border-border/50">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-foreground">Order #{order.id.slice(0, 8).toUpperCase()}</span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {new Date(order.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {order.items?.length || 0} items • Payment: {order.paymentMethod || 'Online'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 font-semibold text-xs rounded-full uppercase tracking-wide ${
                          order.status === 'DELIVERED' ? 'bg-green-500/10 text-green-600 border border-green-500/20' :
                          order.status === 'CANCELLED' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                          'bg-accent/10 text-accent border border-accent/20'
                        }`}>
                          {order.status}
                        </span>
                        <p className="font-bold text-lg text-primary">₹{order.totalAmount}</p>
                        {order.status === 'PENDING' && (
                          <button onClick={() => handleCancelOrder(order.id)} className="text-xs text-red-500 font-semibold hover:underline">
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      {order.items?.map((item: any) => {
                        const isReviewed = reviewedProductIds.has(item.product.id)
                        return (
                          <div key={item.id} className="flex gap-4 items-center justify-between flex-wrap">
                            <div className="flex gap-4 items-center">
                              <div className="h-16 w-16 bg-muted rounded-xl overflow-hidden flex-shrink-0 border border-border/50">
                                {item.product?.images?.[0]?.url ? (
                                  <img src={getProductImageUrl(item.product.images[0].url)} alt={item.product.name} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="h-full w-full bg-sand flex items-center justify-center">
                                    <Package className="h-6 w-6 text-clay opacity-30" />
                                  </div>
                                )}
                              </div>
                              <div>
                                <Link to={`/product/${item.product.id}`} className="font-semibold text-foreground hover:text-primary transition-colors block">
                                  {item.product.name}
                                </Link>
                                <p className="text-xs text-muted-foreground">Qty: {item.quantity} × ₹{item.priceAtBuy}</p>
                              </div>
                            </div>

                            <div className="flex gap-3 items-center">
                              {order.status === 'DELIVERED' && (
                                <button 
                                  onClick={() => openReviewModal(order.id, item.id, item.product)}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                                    isReviewed 
                                      ? 'bg-amber-500/10 text-amber-600 border border-amber-500/30 hover:bg-amber-500/20'
                                      : 'bg-primary text-primary-foreground hover:bg-primary/90'
                                  }`}
                                >
                                  <Star className={`h-3.5 w-3.5 ${isReviewed ? 'fill-amber-500 text-amber-500' : 'fill-primary-foreground text-primary-foreground'}`} />
                                  {isReviewed ? 'Edit Review' : 'Rate & Review'}
                                </button>
                              )}
                              
                              {order.status === 'DELIVERED' && !item.returned && (
                                <button 
                                  onClick={() => openReturnModal(order.id, item.id, item.product)}
                                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                >
                                  Return Item
                                </button>
                              )}

                              {item.returned && (
                                <span className="text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-950/40 px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-900">
                                  Returned
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Review & Rating Modal */}
      {reviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !reviewSubmitting && setReviewModal(null)}
          />
          <div className="relative bg-card border border-border rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden p-6 z-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between pb-4 border-b border-border">
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                  Rate & Review Product
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Your rating directly influences this handcrafted product's total score.
                </p>
              </div>
              <button
                onClick={() => !reviewSubmitting && setReviewModal(null)}
                className="p-1.5 hover:bg-muted rounded-full transition-colors text-muted-foreground"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="py-5 space-y-5">
              <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-2xl border border-border/50">
                <div className="h-12 w-12 bg-muted rounded-lg overflow-hidden shrink-0">
                  {reviewModal.product?.images?.[0]?.url && (
                    <img src={getProductImageUrl(reviewModal.product.images[0].url)} alt={reviewModal.product.name} className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="truncate">
                  <p className="font-semibold text-sm text-foreground truncate">{reviewModal.product?.name}</p>
                  <p className="text-xs text-muted-foreground">Order #{reviewModal.orderId.slice(0, 8).toUpperCase()}</p>
                </div>
              </div>

              <div className="text-center space-y-2">
                <label className="text-xs font-semibold text-muted-foreground block">Select Rating</label>
                <div className="flex justify-center items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const active = (hoverRating || reviewRating) >= star
                    return (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setReviewRating(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        className="p-1 transition-transform hover:scale-125 focus:outline-none"
                      >
                        <Star
                          className={`h-8 w-8 transition-colors ${
                            active
                              ? 'text-amber-500 fill-amber-500 drop-shadow-sm'
                              : 'text-muted-foreground/30 hover:text-amber-300'
                          }`}
                        />
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs font-bold text-amber-600 dark:text-amber-400 min-h-[16px]">
                  {RATING_LABELS[hoverRating || reviewRating] || ''}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <MessageSquare className="h-3.5 w-3.5 text-primary" />
                  Detailed Feedback (Optional)
                </label>
                <textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  rows={4}
                  placeholder="Share details about the craftsmanship, materials, delivery, and experience with this artisan..."
                  className="w-full text-sm p-3 rounded-2xl bg-muted/30 border border-border focus:ring-2 focus:ring-primary focus:outline-none resize-none"
                />
                <p className="text-[10px] text-muted-foreground text-right">{reviewText.length} characters</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-border">
              <button
                onClick={() => setReviewModal(null)}
                disabled={reviewSubmitting}
                className="px-5 py-2.5 rounded-xl border border-border text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submitReview}
                disabled={reviewSubmitting}
                className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-2 shadow-lg hover:opacity-90 transition-all disabled:opacity-50"
              >
                {reviewSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Submit Review & Rating
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return Feedback Modal */}
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
