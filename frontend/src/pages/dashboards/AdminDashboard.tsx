import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Package, Truck, CheckCircle2, User as UserIcon, MapPin, Search, ShieldCheck, Users, Store } from 'lucide-react'
import api, { isCancel } from '@/lib/api'
import { useAbortSignal } from '@/hooks/useApiCall'
import { toast } from 'sonner'

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }

export function AdminDashboard() {
  const [orders, setOrders] = useState<any[]>([])
  const [partners, setPartners] = useState<any[]>([])
  const [buyers, setBuyers] = useState<any[]>([])
  const [sellers, setSellers] = useState<any[]>([])
  
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'dispatch' | 'buyers' | 'sellers' | 'partners'>('dispatch')

  const { getSignal, mountedRef } = useAbortSignal()

  useEffect(() => {
    const fetchData = async () => {
      const signal = getSignal()
      try {
        const [ordersRes, partnersRes, buyersRes, sellersRes] = await Promise.all([
          api.get('http://localhost:3001/api/admin/orders', { signal }),
          api.get('http://localhost:3001/api/admin/partners', { signal }),
          api.get('http://localhost:3001/api/admin/users', { signal }),
          api.get('http://localhost:3001/api/admin/sellers', { signal })
        ])
        if (mountedRef.current) {
          setOrders(ordersRes.data)
          setPartners(partnersRes.data)
          setBuyers(buyersRes.data)
          setSellers(sellersRes.data)
        }
      } catch (err: any) {
        if (!isCancel(err) && mountedRef.current) {
          console.error('Failed to load admin data', err)
          setError(err.message || String(err))
        }
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    }
    fetchData()
    return () => { getSignal() }
  }, [])

  const approveSeller = async (id: string) => {
    try {
      await api.put(`http://localhost:3001/api/admin/approve-seller/${id}`)
      setSellers(sellers.map(s => s.id === id ? { ...s, status: 'VERIFIED' } : s))
      toast.success('Seller approved successfully!')
    } catch(err) {
      toast.error('Failed to approve seller')
    }
  }

  const approvePartner = async (id: string) => {
    try {
      await api.put(`http://localhost:3001/api/admin/approve-partner/${id}`)
      setPartners(partners.map(p => p.id === id ? { ...p, status: 'VERIFIED' } : p))
      toast.success('Delivery partner approved successfully!')
    } catch(err) {
      toast.error('Failed to approve delivery partner')
    }
  }

  const assignDelivery = async (orderId: string, partnerId: string) => {
    try {
      await api.post('http://localhost:3001/api/admin/assign', { orderId, deliveryPartnerId: partnerId })
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
                    Admin Command Center
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

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-border pb-px overflow-x-auto">
        <button
          onClick={() => setActiveTab('dispatch')}
          className={`px-4 py-3 font-semibold text-sm rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'dispatch' ? 'bg-primary/10 text-primary border-b-2 border-primary' : 'text-muted-foreground hover:bg-muted/50'}`}
        >
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4" /> Dispatch Center
          </div>
        </button>
        <button
          onClick={() => setActiveTab('buyers')}
          className={`px-4 py-3 font-semibold text-sm rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'buyers' ? 'bg-primary/10 text-primary border-b-2 border-primary' : 'text-muted-foreground hover:bg-muted/50'}`}
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" /> Customers ({buyers.length})
          </div>
        </button>
        <button
          onClick={() => setActiveTab('sellers')}
          className={`px-4 py-3 font-semibold text-sm rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'sellers' ? 'bg-primary/10 text-primary border-b-2 border-primary' : 'text-muted-foreground hover:bg-muted/50'}`}
        >
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4" /> Sellers ({sellers.length})
          </div>
        </button>
        <button
          onClick={() => setActiveTab('partners')}
          className={`px-4 py-3 font-semibold text-sm rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'partners' ? 'bg-primary/10 text-primary border-b-2 border-primary' : 'text-muted-foreground hover:bg-muted/50'}`}
        >
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4" /> Delivery Partners ({partners.length})
          </div>
        </button>
      </div>

      {error ? (
        <div className="p-10 text-center text-red-500 font-bold bg-red-50 rounded-xl">
          Error loading dashboard data: {error}. Please take a screenshot of this and send it to me!
        </div>
      ) : loading ? (
        <div className="p-10 text-center text-muted-foreground">Loading admin data...</div>
      ) : (
        <>
          {/* Dispatch Center View */}
          {activeTab === 'dispatch' && (
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
                    {unassignedOrders.length === 0 ? (
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
                          <div className="mt-3 space-y-2">
                            {orders.find(o => o.id === selectedOrder)?.items?.map((item: any) => (
                              <div key={item.id} className="flex justify-between items-center text-sm bg-white/50 p-2 rounded border border-black/5">
                                <div className="font-medium text-foreground">{item.product?.name || 'Product'} <span className="text-muted-foreground ml-1">x{item.quantity}</span></div>
                                <div className="text-muted-foreground font-mono">${(item.priceAtBuy * item.quantity).toFixed(2)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="divide-y divide-border h-[400px] overflow-y-auto">
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
          )}

          {/* Buyers View */}
          {activeTab === 'buyers' && (
            <motion.div variants={item}>
              <Card className="border-border">
                <CardHeader className="border-b border-border bg-muted/30">
                  <CardTitle className="text-foreground flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" /> Registered Customers
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-muted/50 text-muted-foreground uppercase">
                        <tr>
                          <th className="px-6 py-4 font-semibold">Name</th>
                          <th className="px-6 py-4 font-semibold">Email</th>
                          <th className="px-6 py-4 font-semibold">Phone</th>
                          <th className="px-6 py-4 font-semibold">Joined Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {buyers.slice(0, 100).map(buyer => (
                          <tr key={buyer.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-6 py-4 font-medium flex items-center gap-3">
                               <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold">
                                 {buyer.firstName?.charAt(0) || 'U'}
                               </div>
                               {buyer.firstName} {buyer.lastName}
                            </td>
                            <td className="px-6 py-4">{buyer.email}</td>
                            <td className="px-6 py-4">{buyer.phone || 'N/A'}</td>
                            <td className="px-6 py-4">{new Date(buyer.createdAt).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {buyers.length === 0 && <div className="p-10 text-center text-muted-foreground">No customers found.</div>}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Sellers View */}
          {activeTab === 'sellers' && (
            <motion.div variants={item}>
              <Card className="border-border">
                <CardHeader className="border-b border-border bg-muted/30">
                  <CardTitle className="text-foreground flex items-center gap-2">
                    <Store className="h-5 w-5 text-primary" /> Registered Sellers
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-muted/50 text-muted-foreground uppercase">
                        <tr>
                          <th className="px-6 py-4 font-semibold">Business / Owner</th>
                          <th className="px-6 py-4 font-semibold">Contact</th>
                          <th className="px-6 py-4 font-semibold">GST Number</th>
                          <th className="px-6 py-4 font-semibold">Status & Rating</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {sellers.slice(0, 100).map(seller => (
                          <tr key={seller.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-6 py-4">
                               <p className="font-bold">{seller.businessName}</p>
                               <p className="text-muted-foreground text-xs">{seller.firstName} {seller.lastName}</p>
                            </td>
                            <td className="px-6 py-4">
                               <p>{seller.email}</p>
                               <p className="text-muted-foreground text-xs">{seller.phone}</p>
                            </td>
                            <td className="px-6 py-4 font-mono text-xs">{seller.gstNumber || 'N/A'}</td>
                            <td className="px-6 py-4">
                               <Badge variant={seller.status === 'VERIFIED' ? 'success' : 'warning'} className="mb-2 block w-fit">
                                 {seller.status}
                               </Badge>
                               {seller.status !== 'VERIFIED' && (
                                 <button onClick={() => approveSeller(seller.id)} className="px-3 py-1 bg-primary text-primary-foreground text-xs font-bold rounded hover:bg-primary/90 transition-colors">
                                   Approve
                                 </button>
                               )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {sellers.length === 0 && <div className="p-10 text-center text-muted-foreground">No sellers found.</div>}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Delivery Partners View */}
          {activeTab === 'partners' && (
            <motion.div variants={item}>
              <Card className="border-border">
                <CardHeader className="border-b border-border bg-muted/30">
                  <CardTitle className="text-foreground flex items-center gap-2">
                    <Truck className="h-5 w-5 text-primary" /> Delivery Partners
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-muted/50 text-muted-foreground uppercase">
                        <tr>
                          <th className="px-6 py-4 font-semibold">Name</th>
                          <th className="px-6 py-4 font-semibold">Contact</th>
                          <th className="px-6 py-4 font-semibold">Vehicle & Location</th>
                          <th className="px-6 py-4 font-semibold">Status & Rating</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {partners.map(partner => (
                          <tr key={partner.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-6 py-4 font-medium flex items-center gap-3">
                               <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold">
                                 {partner.firstName?.charAt(0) || 'P'}
                               </div>
                               <div>
                                 <p>{partner.firstName} {partner.lastName}</p>
                                 <p className="text-xs text-muted-foreground font-mono">{partner.partnerId}</p>
                               </div>
                            </td>
                            <td className="px-6 py-4">
                               <p>{partner.email}</p>
                               <p className="text-muted-foreground text-xs">{partner.phone}</p>
                            </td>
                            <td className="px-6 py-4 text-xs text-muted-foreground">
                               <p className="font-semibold text-foreground">{partner.vehicleType} - {partner.vehicleNumber}</p>
                               <p>City: {partner.city || 'N/A'}</p>
                            </td>
                            <td className="px-6 py-4">
                               <Badge variant={partner.status === 'VERIFIED' ? 'success' : 'warning'} className="mb-2 block w-fit">
                                 {partner.status}
                               </Badge>
                               {partner.status !== 'VERIFIED' && (
                                 <button onClick={() => approvePartner(partner.id)} className="px-3 py-1 bg-primary text-primary-foreground text-xs font-bold rounded hover:bg-primary/90 transition-colors">
                                   Approve
                                 </button>
                               )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {partners.length === 0 && <div className="p-10 text-center text-muted-foreground">No delivery partners found.</div>}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </>
      )}
    </motion.div>
  )
}
