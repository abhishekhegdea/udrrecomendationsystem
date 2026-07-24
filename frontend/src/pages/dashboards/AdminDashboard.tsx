import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Package, Truck, CheckCircle2, User as UserIcon, MapPin, Search, ShieldCheck } from 'lucide-react'
import axios from 'axios'
import { toast } from 'sonner'

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }

export function AdminDashboard() {
  const [orders, setOrders] = useState<any[]>([])
  const [partners, setPartners] = useState<any[]>([])
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ordersRes, partnersRes] = await Promise.all([
          axios.get('http://localhost:3001/api/admin/orders'),
          axios.get('http://localhost:3001/api/admin/partners')
        ])
        setOrders(ordersRes.data)
        setPartners(partnersRes.data)
      } catch (err) {
        console.error('Failed to load admin data', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const assignDelivery = async (orderId: string, partnerId: string) => {
    try {
      await axios.post('http://localhost:3001/api/admin/assign', { orderId, deliveryPartnerId: partnerId })
      toast.success('Order assigned successfully!')
      setOrders(orders.map(o => o.id === orderId ? { ...o, status: 'ASSIGNED', deliveryPartnerId: partnerId } : o))
      setSelectedOrder(null)
    } catch (err) {
      toast.error('Failed to assign order')
    }
  }

  const unassignedOrders = orders.filter(o => o.status === 'PENDING')

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">
      {/* Welcome Card */}
      <motion.div variants={item}>
        <Card className="bg-gradient-to-br from-forest to-forest/90 text-primary-foreground border-0 overflow-hidden relative shadow-xl">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/10 rounded-full blur-3xl -mr-40 -mt-40" />
          <CardContent className="p-8 lg:p-10 relative z-10">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-2xl font-bold shadow-lg">
                  <ShieldCheck className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h2 className="text-[28px] font-bold leading-tight font-display">
                    Admin Dispatch Center
                  </h2>
                  <div className="flex items-center gap-2 mt-1.5">
                    <p className="text-sm text-primary-foreground/80 font-medium">Platform Operations</p>
                    <span className="text-white/30">•</span>
                    <Badge variant="success" dot className="bg-green-500/20 text-green-100 border-none">System Online</Badge>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 px-5 py-3 rounded-[16px] bg-white/10 backdrop-blur-sm text-sm font-semibold shadow-sm border border-white/20">
                  <Package className="h-4 w-4" />
                  <div>
                    <span className="text-white/60 text-xs">Pending Assignments</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold">{unassignedOrders.length}</span>
                      <span className="text-white/50">orders</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Pending Orders */}
        <motion.div variants={item}>
          <Card className="border-border h-full">
            <CardHeader className="border-b border-border bg-muted/30">
              <div className="flex items-center justify-between">
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" /> Unassigned Orders
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-10 text-center text-muted-foreground">Loading orders...</div>
              ) : unassignedOrders.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
                  <p>All orders have been assigned!</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {unassignedOrders.map(order => (
                    <div 
                      key={order.id} 
                      onClick={() => setSelectedOrder(order.id)}
                      className={`p-5 cursor-pointer transition-colors ${selectedOrder === order.id ? 'bg-primary/5' : 'hover:bg-muted/50'}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-primary">#{order.id.slice(0,8).toUpperCase()}</span>
                          <Badge variant="warning" className="bg-saffron/20 text-saffron-foreground border-none">Needs Assignment</Badge>
                        </div>
                        <span className="text-sm font-medium">{order.items?.length} Items</span>
                      </div>
                      <div className="text-sm text-muted-foreground grid grid-cols-2 gap-2 mt-3">
                        <div className="flex items-center gap-1.5">
                          <UserIcon className="h-3.5 w-3.5" /> {order.user?.firstName || 'Customer'}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" /> Delivery Address
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Delivery Partners Assignment */}
        <motion.div variants={item}>
          <Card className="border-border h-full">
            <CardHeader className="border-b border-border bg-muted/30">
              <CardTitle className="text-foreground flex items-center gap-2">
                <Truck className="h-5 w-5 text-accent" /> Assign Partner
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!selectedOrder ? (
                <div className="p-10 text-center text-muted-foreground flex flex-col items-center justify-center h-[300px]">
                  <Search className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p>Select an order from the left to assign a delivery partner.</p>
                </div>
              ) : (
                <div>
                  <div className="p-5 bg-primary/5 border-b border-primary/10">
                    <p className="text-sm text-primary font-semibold mb-1">Assigning Order:</p>
                    <p className="text-2xl font-bold font-display">#{selectedOrder.slice(0,8).toUpperCase()}</p>
                  </div>
                  <div className="divide-y divide-border">
                    {partners.map(partner => (
                      <div key={partner.id} className="p-5 flex items-center justify-between hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${partner.status === 'Available' || partner.status === 'Pending' ? 'bg-green-600' : 'bg-gray-400'}`}>
                            {partner.firstName.charAt(0)}
                          </div>
                          <div>
                            <p className="font-semibold">{partner.firstName} {partner.lastName}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                              <span className={partner.status === 'Available' || partner.status === 'Pending' ? 'text-green-600 font-medium' : 'text-gray-500'}>
                                • {partner.status || 'Available'}
                              </span>
                              <span>★ {partner.rating || 5.0}</span>
                            </p>
                          </div>
                        </div>
                        <button 
                          disabled={partner.status === 'Busy'}
                          onClick={() => assignDelivery(selectedOrder, partner.id)}
                          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                            partner.status !== 'Busy' 
                            ? 'bg-accent text-accent-foreground hover:bg-accent/90' 
                            : 'bg-muted text-muted-foreground cursor-not-allowed'
                          }`}
                        >
                          Assign
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  )
}
