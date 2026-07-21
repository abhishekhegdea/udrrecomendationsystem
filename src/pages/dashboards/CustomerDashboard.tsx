import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Package, Clock, User, MapPin, Mail, Phone } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import axios from 'axios'
import { Link } from 'react-router-dom'

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }

export function CustomerDashboard() {
  const { user } = useAuth()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.id) {
      axios.get(`http://localhost:3001/api/orders/customer/${user.id}`)
        .then(res => setOrders(res.data))
        .catch(console.error)
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
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" /> Order History</CardTitle>
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
            ) : (
              <div className="space-y-6">
                {orders.map((order) => (
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
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      {order.items?.map((item: any) => (
                        <div key={item.id} className="flex gap-4 items-center">
                          <div className="h-16 w-16 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                            {item.product?.images?.[0]?.url ? (
                              <img src={item.product.images[0].url} alt={item.product.name} className="h-full w-full object-cover" />
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
                            {order.status === 'DELIVERED' && (
                              <button 
                                onClick={() => {
                                  const text = prompt('Leave a review for this product:')
                                  if (text) {
                                    axios.post(`http://localhost:3001/api/products/${item.product.id}/reviews`, {
                                      text,
                                      userId: user?.id,
                                      rating: 5
                                    }).then(() => alert('Review submitted! Thank you.'))
                                      .catch(err => alert('Failed to submit review'))
                                  }
                                }}
                                className="mt-2 text-xs font-semibold text-primary hover:underline"
                              >
                                Leave a Review
                              </button>
                            )}
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
    </motion.div>
  )
}
