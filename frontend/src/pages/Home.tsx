import { HeroSection } from '@/components/ui/HeroSection'
import { RecommendationCarousel } from '@/components/ui/RecommendationCarousel'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

export function HomePage() {
  const { user } = useAuth()

  return (
    <div className="flex flex-col w-full">
      <HeroSection />
      
      {/* Quick Access to All DB Products */}
      <section className="py-12 bg-muted/30 border-b border-border">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between">
          <div>
            <h2 className="text-3xl font-display font-bold text-foreground">Explore All Artisans</h2>
            <p className="text-muted-foreground mt-2">Discover every product added by our verified sellers.</p>
          </div>
          <Link to="/search" className="mt-6 md:mt-0 px-8 py-3 bg-foreground text-background font-semibold rounded-full hover:bg-foreground/90 transition-colors flex items-center gap-2">
            View All Latest Products <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <div className="mt-8">
        <RecommendationCarousel 
          title="Trending Local Crafts" 
          subtitle="Pieces that everyone is talking about this week."
          endpoint="/trending" 
        />
        
        <RecommendationCarousel 
          title="Support New Artisans" 
          subtitle="Discover fresh talent and one-of-a-kind styles. Reserved exclusively for new sellers."
          endpoint="/new-arrivals" 
        />

        {user && (
          <RecommendationCarousel 
            title="Personalized For You" 
            subtitle="Hand-picked items based on your browsing history."
            endpoint={`/home/${user.id}`} 
          />
        )}
      </div>
    </div>
  )
}
