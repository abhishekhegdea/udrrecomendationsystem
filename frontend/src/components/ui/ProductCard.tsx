import { Link, useNavigate } from 'react-router-dom'
import { Heart, ShoppingBag } from 'lucide-react'
import { useWishlist } from '@/contexts/WishlistContext'
import { useCart } from '@/contexts/CartContext'

interface Product {
  id: string;
  name: string;
  price: number;
  seller_name?: string;
  seller_new?: boolean;
  image?: string;
  explanation?: string;
}

export function ProductCard({ product }: { product: Product }) {
  const { toggleWishlist, isInWishlist } = useWishlist()
  const { addItem } = useCart()
  const navigate = useNavigate()
  
  const inWishlist = isInWishlist(product.id)

  const handleWishlist = (e: React.MouseEvent) => {
    e.preventDefault()
    toggleWishlist(product.id)
  }

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault()
    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      image: product.image
    })
    // Optionally navigate to cart or show toast
  }

  return (
    <Link to={`/product/${product.id}`} className="group block w-full h-full relative overflow-hidden rounded-2xl bg-card border border-border shadow-sm hover:shadow-lg transition-all flex flex-col">
      {/* Image Container */}
      <div className="relative aspect-square rounded-2xl overflow-hidden bg-muted border border-border">
        {product.image ? (
          <img 
            src={product.image} 
            alt={product.name} 
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/products/product-vase.jpg'
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-sand text-clay grain">
            <span className="text-sm font-medium">No Image</span>
          </div>
        )}
        
        {/* ML Fairness Badge */}
        {product.seller_new && (
          <div className="absolute top-3 left-3 bg-accent text-accent-foreground text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider shadow-sm z-10">
            New Artisan
          </div>
        )}
        
        {/* Wishlist Button */}
        <button 
          onClick={handleWishlist}
          className="absolute top-3 right-3 p-2 bg-background/80 backdrop-blur-md rounded-full shadow-sm hover:bg-background transition-colors z-10 group/btn"
        >
          <Heart className={`h-4 w-4 transition-colors ${inWishlist ? 'fill-red-500 text-red-500' : 'text-muted-foreground group-hover/btn:text-red-500'}`} />
        </button>
      </div>

      {/* Details */}
      <div className="mt-4 space-y-1">
        <div className="flex justify-between items-start">
          <h3 className="text-sm font-semibold text-foreground truncate pr-2">{product.name}</h3>
          <p className="text-sm font-bold text-primary">₹{product.price || '999'}</p>
        </div>
        <p className="text-xs text-muted-foreground truncate">
          By <span className="hover:text-primary transition-colors cursor-pointer">{product.seller_name || 'UdrCrafts Artisan'}</span>
        </p>
        
        {/* ML Explanation */}
        {product.explanation && (
          <div className="mt-2 pt-2 border-t border-border">
            <p className="text-[10px] text-muted-foreground italic leading-tight">
              ✨ {product.explanation}
            </p>
          </div>
        )}

        {/* Quick Add to Cart */}
        <button 
          onClick={handleAddToCart}
          className="w-full mt-3 py-2 bg-primary/10 text-primary font-semibold rounded-lg text-xs hover:bg-primary hover:text-primary-foreground transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 focus:opacity-100"
        >
          <ShoppingBag className="h-3 w-3" /> Add to Cart
        </button>
      </div>
    </Link>
  )
}
