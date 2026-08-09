import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MapPin, Truck, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import api from '@/lib/api'

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }

export function DeliveryDashboard() {
  const { user } = useAuth()
  const [partner, setPartner] = useState<any>(null)
  const [orders, setOrders] = useState<any[]>([])

  useEffect(() => {
    if (user?.id) {
      api.get('http://localhost:3001/api/partner/me', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      .then(res => {
        setPartner(res.data.user)
        return api.get(`http://localhost:3001/api/partner/orders/${res.data.user.id}`)
      })
      .then(res => setOrders(res.data))
      .catch(() => {})
    }
  }, [user])

  const pendingOrders = orders.filter(o => o.status === 'ASSIGNED' || o.status === 'OUT_FOR_DELIVERY')

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">
      <motion.div variants={item}>
        <Card className="bg-gradient-to-br from-saffron to-saffron/90 text-black border-0 overflow-hidden relative shadow-xl">
          <CardContent className="p-8 lg:p-10 relative z-10">
            <h2 className="text-[28px] font-bold leading-tight font-display mb-2">
              Welcome back, {partner?.firstName || user?.firstName || 'Partner'}!
            </h2>
            <p className="text-sm text-black/80 font-medium">View your assigned routes and track earnings.</p>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div variants={item}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Truck className="h-4 w-4" /> Today's Deliveries
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-3xl font-bold">{pendingOrders.length}</span>
              <p className="text-sm text-muted-foreground mt-1">Pending Assignments</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" /> Completed This Week
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-3xl font-bold">{orders.filter(o => o.status === 'DELIVERED').length}</span>
              <p className="text-sm text-muted-foreground mt-1">Total: ₹{orders.filter(o => o.status === 'DELIVERED').length * 50} Earned</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div variants={item}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" /> Current Assignments</CardTitle>
          </CardHeader>
          <CardContent>
            {pendingOrders.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground border border-dashed border-border rounded-xl">
                <Truck className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p>You have no active deliveries right now.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingOrders.map(order => (
                  <div key={order.id} className="p-5 border border-border rounded-xl flex flex-col md:flex-row justify-between gap-4">
                    <div>
                      <p className="font-bold text-lg mb-1">Order #{order.id.slice(0,8).toUpperCase()}</p>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p><span className="font-semibold text-foreground">Customer:</span> {order.user?.firstName} {order.user?.lastName} ({order.user?.phone})</p>
                        <p><span className="font-semibold text-foreground">Items:</span> {order.items?.map((i:any) => i.product.name).join(', ')}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="px-3 py-1 bg-saffron/20 text-saffron-foreground font-bold text-xs rounded-full uppercase tracking-wide">
                        {order.status}
                      </span>
                      <button 
                        onClick={async () => {
                          try {
                            await api.post(`http://localhost:3001/api/partner/orders/${order.id}/deliver`, { partnerId: user?.id })
                            // Refresh orders list
                            api.get(`http://localhost:3001/api/partner/orders/${user?.id}`).then(res => setOrders(res.data))
                          } catch (err) {
                            console.error('Failed to mark delivered', err)
                          }
                        }}
                        className="px-4 py-2 bg-accent text-accent-foreground rounded-lg font-semibold text-sm hover:bg-accent/90 transition-colors"
                      >
                        Mark Delivered
                      </button>
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
