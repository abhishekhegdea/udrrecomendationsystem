import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useCart } from '@/contexts/CartContext'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, CreditCard, ShieldCheck, Truck, CheckCircle2 } from 'lucide-react'
import axios from 'axios'

export function CheckoutPage() {
  const { items, totalPrice, clearCart } = useCart()
  const { user } = useAuth()
  const navigate = useNavigate()
  
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  
  const tax = Math.floor(totalPrice * 0.05)
  const finalTotal = totalPrice + tax
  
  const handlePayment = async () => {
    if (!user) {
      navigate('/login')
      return
    }
    
    setLoading(true)
    setError('')
    
    try {
      // Simulate Payment Delay
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Hit Backend to create Order
      const res = await axios.post('http://localhost:3001/api/orders/checkout', {
        userId: user.id,
        items: items.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          priceAtBuy: item.price
        })),
        totalAmount: finalTotal
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      
      setSuccess(true)
      clearCart()
    } catch (err: any) {
      console.error(err)
      const backendError = err.response?.data?.error
      setError(backendError || 'Payment simulation or order creation failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (items.length === 0 && !success) {
    return <Navigate to="/cart" replace />
  }

  if (success) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 className="h-12 w-12" />
        </div>
        <h1 className="text-4xl font-display font-bold text-foreground mb-4">Payment Successful!</h1>
        <p className="text-lg text-muted-foreground max-w-md mb-8">
          Thank you for your purchase. We have received your order and our artisan network is preparing it for shipment.
        </p>
        <div className="flex gap-4">
          <Link to="/customer/orders" className="px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-colors">
            View Order
          </Link>
          <Link to="/" className="px-6 py-3 bg-muted text-foreground font-semibold rounded-xl hover:bg-muted/80 transition-colors">
            Continue Shopping
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <Link to="/cart" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors mb-8">
        <ArrowLeft className="h-4 w-4" /> Back to Cart
      </Link>
      
      <h1 className="text-3xl font-display font-bold text-foreground mb-8">Secure Checkout</h1>
      
      {error && (
        <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between">
          <div className="text-red-600 font-medium">{error}</div>
          {error.includes('clear your cart') && (
            <button 
              onClick={() => {
                clearCart();
                navigate('/');
              }}
              className="px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap ml-4"
            >
              Clear Cart Now
            </button>
          )}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-12">
        {/* Payment Form (Simulated) */}
        <div className="space-y-8">
          <div className="bg-card border border-border rounded-3xl p-8 shadow-sm">
            <h2 className="text-xl font-bold flex items-center gap-2 mb-6">
              <Truck className="h-5 w-5 text-primary" /> Delivery Address
            </h2>
            <div className="space-y-4">
              <input type="text" placeholder="Full Name" defaultValue={user?.firstName ? `${user.firstName} ${user.lastName}` : ''} className="w-full h-12 bg-muted rounded-xl px-4 outline-none focus:ring-2 focus:ring-primary" />
              <textarea placeholder="Complete Address" className="w-full bg-muted rounded-xl p-4 outline-none focus:ring-2 focus:ring-primary min-h-[100px]" defaultValue="123 Artisan Street, Udaipur, Rajasthan 313001" />
            </div>
          </div>

          <div className="bg-card border border-border rounded-3xl p-8 shadow-sm">
            <h2 className="text-xl font-bold flex items-center gap-2 mb-6">
              <CreditCard className="h-5 w-5 text-primary" /> Payment Method
            </h2>
            <div className="space-y-4">
              <div className="p-4 border-2 border-primary bg-primary/5 rounded-xl flex items-center gap-3">
                <input type="radio" checked readOnly className="accent-primary w-5 h-5" />
                <span className="font-semibold">Simulate Successful Payment</span>
              </div>
              <div className="p-4 border border-border rounded-xl flex items-center gap-3 opacity-50">
                <input type="radio" disabled className="w-5 h-5" />
                <span>Credit / Debit Card (Coming Soon)</span>
              </div>
              <div className="p-4 border border-border rounded-xl flex items-center gap-3 opacity-50">
                <input type="radio" disabled className="w-5 h-5" />
                <span>UPI (Coming Soon)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Order Summary */}
        <div className="bg-card border border-border rounded-3xl p-8 h-fit shadow-lg sticky top-24">
          <h2 className="text-xl font-bold text-foreground mb-6">Order Summary</h2>
          <div className="space-y-4 text-sm mb-6 max-h-[300px] overflow-y-auto pr-2">
            {items.map(item => (
              <div key={item.id} className="flex gap-4">
                <div className="w-16 h-16 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                  {item.image && <img src={item.image} className="w-full h-full object-cover" alt="" />}
                </div>
                <div className="flex-1">
                  <p className="font-bold line-clamp-1">{item.name}</p>
                  <p className="text-muted-foreground">Qty: {item.quantity}</p>
                  <p className="font-semibold text-primary">₹{item.price * item.quantity}</p>
                </div>
              </div>
            ))}
          </div>
          
          <div className="border-t border-border pt-6 space-y-4 text-sm mb-6">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>₹{totalPrice}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Shipping</span>
              <span className="text-green-600 font-medium">Free</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Tax (5%)</span>
              <span>₹{tax}</span>
            </div>
            <div className="pt-4 border-t border-border flex justify-between font-bold text-xl text-foreground">
              <span>Total to Pay</span>
              <span>₹{finalTotal}</span>
            </div>
          </div>
          
          <button 
            onClick={handlePayment}
            disabled={loading}
            className="w-full py-4 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg hover:shadow-primary/25"
          >
            {loading ? 'Processing Payment...' : (
              <>
                <ShieldCheck className="h-5 w-5" /> Pay ₹{finalTotal} Securely
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// Need to import Navigate inside the file to avoid error
import { Navigate } from 'react-router-dom'
