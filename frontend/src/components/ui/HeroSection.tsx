export function HeroSection() {
  return (
    <div className="relative w-full bg-primary overflow-hidden min-h-[500px] flex items-center">
      <div className="absolute inset-0 grain opacity-20"></div>
      
      <div className="container mx-auto px-4 py-20 relative z-10 grid md:grid-cols-2 gap-12 items-center">
        <div className="max-w-xl">
          <h1 className="text-5xl md:text-6xl font-serif text-primary-foreground leading-tight">
            Handcrafted <br />
            <span className="text-accent italic">Local Artistry</span>
          </h1>
          <p className="mt-6 text-lg text-primary-foreground/80 leading-relaxed font-sans">
            Discover exquisite, one-of-a-kind local products. Directly from the hands of artisans in Udaipur, brought to the global market.
          </p>
          
          <div className="mt-10 flex gap-4">
            <button className="px-8 py-3.5 bg-accent text-accent-foreground font-semibold rounded-full hover:bg-accent/90 transition-transform hover:-translate-y-0.5">
              Explore Collections
            </button>
            <button className="px-8 py-3.5 bg-primary-foreground/10 text-primary-foreground font-semibold rounded-full border border-primary-foreground/20 hover:bg-primary-foreground/20 transition-colors">
              Sell on UdrCrafts
            </button>
          </div>
        </div>
        
        <div className="hidden md:block relative">
          {/* Aesthetic Abstract Composition */}
          <div className="relative w-full aspect-square max-w-md mx-auto">
            <div className="absolute top-0 right-0 w-64 h-80 bg-terracotta rounded-[40px] rotate-6 opacity-80 blur-[2px]"></div>
            <div className="absolute bottom-10 left-10 w-72 h-72 bg-sand rounded-full -rotate-12 border-4 border-accent shadow-2xl flex items-center justify-center p-8 text-center text-clay">
              <span className="font-serif text-3xl font-bold italic">Authentic<br/>Crafts</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
