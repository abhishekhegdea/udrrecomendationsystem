import { useEffect, useState } from 'react'
import axios from 'axios'
import { ProductCard } from './ProductCard'

interface RecommendationCarouselProps {
  title: string;
  subtitle: string;
  endpoint: string;
}

const getMockProductsForEndpoint = (endpoint: string) => {
  const mocks = [
    { id: '1', name: 'Jaipur Blue Pottery Vase', price: 1200, seller_name: 'Meera Studio', seller_new: true, image: 'https://images.unsplash.com/photo-1610701596007-11502861dcfa?q=80&w=600&auto=format&fit=crop' },
    { id: '2', name: 'Handwoven Pashmina Shawl', price: 4500, seller_name: 'Kashmir Looms', seller_new: false, image: 'https://images.unsplash.com/photo-1620799140188-3b2a02fd9a77?q=80&w=600&auto=format&fit=crop' },
    { id: '3', name: 'Carved Teakwood Box', price: 850, seller_name: 'Rao Craftworks', seller_new: true, image: 'https://images.unsplash.com/photo-1590740685955-442882a4d3dc?q=80&w=600&auto=format&fit=crop' },
    { id: '4', name: 'Brass Vintage Lamp', price: 2100, seller_name: 'Moradabad Metals', seller_new: false, image: 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?q=80&w=600&auto=format&fit=crop' },
    { id: '5', name: 'Terracotta Planters', price: 400, seller_name: 'Village Clay Arts', seller_new: true, image: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?q=80&w=600&auto=format&fit=crop' },
    { id: '6', name: 'Madhubani Canvas Painting', price: 3200, seller_name: 'Artisan Heritage', seller_new: false, image: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?q=80&w=600&auto=format&fit=crop' },
  ];
  
  if (endpoint.includes('trending')) return mocks.slice(0, 4);
  if (endpoint.includes('new-arrivals')) return mocks.filter(m => m.seller_new);
  return [...mocks].reverse().slice(0, 5); // Default / Personalized
}

export function RecommendationCarousel({ title, subtitle, endpoint }: RecommendationCarouselProps) {
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        const response = await axios.get(`http://localhost:3001/api/recommendations${endpoint}`)
        // API returns { recommendations: [...] } or { trending_products: [...] } or { new_arrivals: [...] }
        const dataKey = Object.keys(response.data).find(k => Array.isArray(response.data[k]))
        const items = response.data[dataKey] || []
        const explanation = response.data.explanation
        
        // Attach explanation to each product so ProductCard can display it
        const productsWithExplanation = items.map((item: any) => ({
          ...item,
          explanation: explanation
        }))
        
        setProducts(productsWithExplanation)
      } catch (error) {
        console.error('Failed to fetch recommendations', error)
      } finally {
        setLoading(false)
      }
    }
    fetchRecommendations()
  }, [endpoint])

  if (loading) {
    return (
      <div className="py-12 animate-pulse">
        <div className="h-8 w-64 bg-muted rounded mb-2"></div>
        <div className="h-4 w-48 bg-muted rounded mb-8"></div>
        <div className="flex gap-6 overflow-hidden">
          {[1,2,3,4,5].map(i => <div key={i} className="w-64 h-80 bg-muted rounded-2xl flex-shrink-0"></div>)}
        </div>
      </div>
    )
  }

  const displayProducts = products.length > 0 ? products : getMockProductsForEndpoint(endpoint);

  // If there are still no products (even mocks), don't render
  if (displayProducts.length === 0) return null;

  return (
    <section className="py-12">
      <div className="container mx-auto px-4 mb-8">
        <h2 className="text-3xl font-display font-bold text-foreground">{title}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>
      </div>
      
      <div className="w-full overflow-x-auto pb-8 hide-scrollbar">
        <div className="container mx-auto px-4">
          <div className="flex gap-6 w-max">
            {displayProducts.map((product: any) => (
              <div key={product.id} className="w-[256px] min-w-[256px] max-w-[256px] flex-shrink-0">
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
