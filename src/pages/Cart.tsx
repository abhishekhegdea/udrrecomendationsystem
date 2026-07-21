import { useCart } from '@/contexts/CartContext'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Trash2, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'

export function CartPage() {
  const { items, updateQuantity, removeItem, totalPrice, clearCart } = useCart()
  const [checkingOut, setCheckingOut] = useState(false)
  const [success, setSuccess] = useState(false)
  const navigate = useNavigate()

  const handleCheckout = () => {
    navigate('/checkout')
  }

  if (success) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 className="h-10 w-10" />
        </div>
        <h1 className="text-3xl font-display font-bold text-foreground mb-4">Order Placed Successfully!</h1>
        <p className="text-muted-foreground max-w-md mb-8">
          Thank you for supporting local artisans! Your items will be shipped soon.
        </p>
        <Link to="/" className="px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-colors">
          Continue Shopping
        </Link>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-3xl font-display font-bold text-foreground mb-4">Your Cart is Empty</h1>
        <p className="text-muted-foreground mb-8">Looks like you haven't added any items to your cart yet.</p>
        <Link to="/" className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Return to Shop
        </Link>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <h1 className="text-3xl font-display font-bold text-foreground mb-8">Shopping Cart</h1>

      <div className="grid lg:grid-cols-3 gap-12">
        {/* Cart Items */}
        <div className="lg:col-span-2 space-y-6">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-6 p-4 bg-card border border-border rounded-2xl shadow-sm">
              <div className="w-24 h-24 bg-muted rounded-xl flex-shrink-0 overflow-hidden">
                {item.image && <img src={item.image} alt={item.name} className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-foreground">{item.name}</h3>
                <p className="text-primary font-semibold mt-1">₹{item.price}</p>
                <div className="flex items-center gap-4 mt-4">
                  <div className="flex items-center border border-border rounded-lg">
                    <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="px-3 py-1 text-foreground hover:bg-muted rounded-l-lg transition-colors">-</button>
                    <span className="px-3 py-1 font-medium text-sm">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="px-3 py-1 text-foreground hover:bg-muted rounded-r-lg transition-colors">+</button>
                  </div>
                  <button onClick={() => removeItem(item.id)} className="text-destructive p-2 hover:bg-destructive/10 rounded-lg transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="text-right font-bold text-lg hidden sm:block">
                ₹{item.price * item.quantity}
              </div>
            </div>
          ))}
        </div>

        {/* Order Summary */}
        <div className="bg-card border border-border rounded-3xl p-8 h-fit shadow-lg sticky top-24">
          <h2 className="text-xl font-bold text-foreground mb-6">Order Summary</h2>
          <div className="space-y-4 text-sm mb-6">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>₹{totalPrice}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Shipping</span>
              <span className="text-green-600 font-medium">Free</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Tax</span>
              <span>₹{Math.floor(totalPrice * 0.05)}</span>
            </div>
            <div className="pt-4 border-t border-border flex justify-between font-bold text-lg text-foreground">
              <span>Total</span>
              <span>₹{totalPrice + Math.floor(totalPrice * 0.05)}</span>
            </div>
          </div>
          
          <button 
            onClick={handleCheckout}
            disabled={checkingOut}
            className="w-full py-4 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-70"
          >
            {checkingOut ? 'Processing...' : 'Proceed to Checkout'}
          </button>
        </div>
      </div>
    </div>
  )
}
