import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Heart, Loader2 } from 'lucide-react'
import { useWishlist } from '@/contexts/WishlistContext'
import { useCart } from '@/contexts/CartContext'
import { ProductCard } from '@/components/ui/ProductCard'
import axios from 'axios'

export function WishlistPage() {
  const { items } = useWishlist()
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchWishlistProducts = async () => {
      setLoading(true)
      try {
        const productIds = items.map(i => i.productId)
        if (productIds.length > 0) {
          // Fetch products by ids using a search trick or direct endpoint
          // For simplicity, we can fetch all and filter or add an endpoint for array of IDs
          // In a real app we'd have a specific endpoint. Here we map individual queries:
          const fetches = productIds.map(id => axios.get(`http://localhost:3001/api/products/${id}`))
          const results = await Promise.all(fetches)
          setProducts(results.map(r => r.data))
        } else {
          setProducts([])
        }
      } catch (err) {
        console.error('Failed to load wishlist products', err)
      } finally {
        setLoading(false)
      }
    }
    
    fetchWishlistProducts()
  }, [items])

  return (
    <div className="container mx-auto px-4 py-12 max-w-7xl min-h-[60vh]">
      <h1 className="text-3xl font-display font-bold text-foreground mb-2">My Wishlist</h1>
      <p className="text-muted-foreground mb-8">Items you have saved for later.</p>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>
      ) : products.length === 0 ? (
        <div className="text-center py-20 bg-muted/50 rounded-3xl border border-border">
          <Heart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-bold text-foreground mb-2">Your wishlist is empty</h3>
          <p className="text-muted-foreground mb-6">Discover beautiful handcrafted items and save them here.</p>
          <Link 
            to="/"
            className="px-6 py-2 bg-primary text-primary-foreground font-semibold rounded-full hover:bg-primary/90 transition-colors inline-block"
          >
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {products.map((product) => {
            const cardProduct = {
              id: product.id,
              name: product.name,
              price: product.price,
              seller_name: product.seller?.businessName || product.seller?.firstName,
              seller_new: product.seller?.isNewSeller,
              image: product.images?.[0]?.url || '/products/product-vase.jpg'
            }
            return <ProductCard key={product.id} product={cardProduct} />
          })}
        </div>
      )}
    </div>
  )
}
