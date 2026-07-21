import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useCart } from '@/contexts/CartContext'
import { useAuth } from '@/contexts/AuthContext'
import { RecommendationCarousel } from '@/components/ui/RecommendationCarousel'
import { ArrowLeft, ShoppingBag, Heart } from 'lucide-react'
import axios from 'axios'
import { toast } from 'sonner'

export function ProductDetailsPage() {
  const { id } = useParams()
  const { addItem } = useCart()
  const { user } = useAuth()
  
  const [product, setProduct] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 1. Fetch Product Data
    const fetchProduct = async () => {
      try {
        const res = await axios.get(`http://localhost:3001/api/products/${id}`)
        setProduct(res.data)
      } catch (err) {
        console.error('Failed to load product', err)
      } finally {
        setLoading(false)
      }
    }
    fetchProduct()

    // 2. Track Behavior for ML
    if (user && id) {
      axios.post('http://localhost:3001/api/events/view', {
        userId: user.id,
        productId: id,
        timeSpent: 30 // Mock time spent
      }).catch(console.error)
    }
  }, [id, user])

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center">Loading...</div>
  }

  if (!product) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <h2 className="text-2xl font-bold mb-4">Product not found</h2>
        <Link to="/" className="text-primary hover:underline">Return to Home</Link>
      </div>
    )
  }

  const getFallbackImage = (name: string) => {
    const n = name.toLowerCase()
    if (n.includes('vase') || n.includes('pottery')) return '/products/product-vase.jpg'
    if (n.includes('shawl') || n.includes('pashmina')) return '/products/product-scarf.jpg'
    if (n.includes('box') || n.includes('wood')) return '/products/product-box.jpg'
    if (n.includes('lamp') || n.includes('brass')) return '/products/product-lamp.jpg'
    return '/products/product-vase.jpg'
  }

  const displayImage = product.images?.[0]?.url || getFallbackImage(product.name || '')

  const handleAddToCart = () => {
    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      image: displayImage
    })
    
    // ML Tracking for Add to Cart
    if (user) {
      axios.post('http://localhost:3001/api/events/click', {
        userId: user.id,
        productId: product.id,
        source: 'product_details_add_to_cart'
      }).catch(console.error)
    }
  }

  const handleAddToWishlist = async () => {
    if (!user) {
      toast('Please login to save items to your wishlist')
      return
    }
    try {
      await axios.post('http://localhost:3001/api/products/wishlist', {
        userId: user.id,
        productId: product.id
      })
      toast.success('Added to Wishlist!')
    } catch (err) {
      toast.error('Failed to add to wishlist')
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors mb-8">
        <ArrowLeft className="h-4 w-4" /> Back to Shop
      </Link>
      
      <div className="grid md:grid-cols-2 gap-12">
        {/* Images */}
        <div className="rounded-3xl overflow-hidden bg-muted aspect-square">
          <img src={displayImage} alt={product.name} className="w-full h-full object-cover" />
        </div>
        
        {/* Details */}
        <div className="flex flex-col justify-center">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-bold px-2 py-1 bg-muted rounded-md text-muted-foreground uppercase tracking-wider">
              {product.category?.name || 'Artisan Craft'}
            </span>
            {product.seller?.isNewSeller && (
              <span className="text-xs font-bold px-2 py-1 bg-primary text-primary-foreground rounded-md">
                New Artisan
              </span>
            )}
          </div>
          
          <h1 className="text-4xl font-display font-bold text-foreground leading-tight mb-2">
            {product.name}
          </h1>
          
          <p className="text-2xl text-primary font-semibold mb-6">₹{product.price}</p>
          
          <div className="prose prose-sm mb-8 text-muted-foreground">
            <p>{product.description}</p>
          </div>
          
          {product.materials && product.materials.length > 0 && (
            <div className="mb-8">
              <h3 className="font-semibold text-foreground mb-3">Materials</h3>
              <div className="flex gap-2 flex-wrap">
                {product.materials.map((m: string) => (
                  <span key={m} className="px-3 py-1 bg-muted text-muted-foreground text-sm rounded-full">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          <div className="flex gap-4">
            <button 
              onClick={handleAddToCart}
              className="flex-1 py-4 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 text-lg shadow-lg"
            >
              <ShoppingBag className="h-5 w-5" />
              Add to Cart
            </button>
            <button
              onClick={handleAddToWishlist}
              className="w-16 flex items-center justify-center bg-muted text-muted-foreground hover:text-red-500 rounded-xl transition-colors border border-border shadow-sm"
              title="Save to Wishlist"
            >
              <Heart className="h-6 w-6" />
            </button>
          </div>
          
          <div className="mt-8 pt-6 border-t border-border flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-muted overflow-hidden">
               {/* Seller avatar placeholder */}
               <img src={`https://ui-avatars.com/api/?name=${product.seller?.businessName || 'S'}&background=random`} alt="Seller" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Crafted by</p>
              <p className="font-semibold text-foreground">{product.seller?.businessName || 'Local Artisan'}</p>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-20">
        <RecommendationCarousel 
          title="Similar Products" 
          subtitle="Explore other items with similar styles and materials."
          endpoint={`/product/${product.id}`} 
        />
      </div>
    </div>
  )
}
