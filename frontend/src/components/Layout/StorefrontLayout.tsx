import { Outlet } from 'react-router-dom'
import { StorefrontNavbar } from './StorefrontNavbar'

export function StorefrontLayout() {
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <StorefrontNavbar />
      <main className="flex-1">
        <Outlet />
      </main>
      
      {/* Simple Footer */}
      <footer className="bg-primary text-primary-foreground py-12 mt-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl font-serif italic mb-4">UdrCrafts</h2>
          <p className="text-primary-foreground/60 text-sm">Empowering Local Artisans. Delivered Globally.</p>
        </div>
      </footer>
    </div>
  )
}
