import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Search, Edit3, Image as ImageIcon, Box, TrendingUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'
import axios from 'axios'

export function SellerProductsPage() {
  const { user } = useAuth()
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingProduct, setEditingProduct] = useState<any>(null)

  useEffect(() => {
    if (user?.id) fetchProducts()
  }, [user])

  const fetchProducts = async () => {
    try {
      setLoading(true)
      const res = await axios.get(`http://localhost:3001/api/seller/products/list/${user?.id}`)
      setProducts(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await axios.put(`http://localhost:3001/api/seller/products/${editingProduct.id}`, {
        name: editingProduct.name,
        price: editingProduct.price,
        inventory: editingProduct.inventory,
        description: editingProduct.description,
      })
      setEditingProduct(null)
      fetchProducts()
    } catch (err) {
      console.error(err)
      alert("Failed to save product")
    }
  }

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Products & Inventory</h1>
          <p className="text-muted-foreground mt-1">Manage your storefront listings and stock levels.</p>
        </div>
        <Button className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold h-11 px-6 rounded-xl shadow-md">
          <Plus className="h-5 w-5 mr-2" /> Add New Product
        </Button>
      </div>

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between gap-4 bg-muted/20">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search products..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Box className="h-4 w-4" /> {products.length} Total Items
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border">
              <tr>
                <th className="px-6 py-4">Product</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Price</th>
                <th className="px-6 py-4">Stock</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Loading inventory...</td></tr>
              ) : filteredProducts.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No products found.</td></tr>
              ) : (
                filteredProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-xl bg-muted border border-border overflow-hidden flex-shrink-0 flex items-center justify-center">
                          {p.images?.[0] ? (
                            <img src={p.images[0].url} alt={p.name} className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{p.name}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[200px] mt-0.5">{p.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="outline" className="bg-background text-xs">{p.category?.name || 'Uncategorized'}</Badge>
                    </td>
                    <td className="px-6 py-4 font-semibold">₹{p.price.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${p.inventory > 5 ? 'bg-green-500' : p.inventory > 0 ? 'bg-amber-500' : 'bg-red-500'}`} />
                        <span className={p.inventory === 0 ? 'text-red-500 font-medium' : ''}>{p.inventory} in stock</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setEditingProduct(p)} className="text-accent hover:text-accent hover:bg-accent/10">
                        <Edit3 className="h-4 w-4 mr-2" /> Edit
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-border"
            >
              <div className="flex items-center justify-between p-6 border-b border-border bg-muted/20">
                <h2 className="text-xl font-bold text-foreground">Edit Listing</h2>
                <button onClick={() => setEditingProduct(null)} className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <form onSubmit={handleSave} className="p-6 space-y-5">
                <Input 
                  label="Product Name" 
                  value={editingProduct.name} 
                  onChange={(e: any) => setEditingProduct({...editingProduct, name: e.target.value})} 
                  required
                />
                <div className="grid grid-cols-2 gap-5">
                  <Input 
                    type="number"
                    label="Price (₹)" 
                    value={editingProduct.price} 
                    onChange={(e: any) => setEditingProduct({...editingProduct, price: e.target.value})} 
                    required
                  />
                  <Input 
                    type="number"
                    label="Stock Inventory" 
                    value={editingProduct.inventory} 
                    onChange={(e: any) => setEditingProduct({...editingProduct, inventory: e.target.value})} 
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground ml-1">Description</label>
                  <textarea 
                    value={editingProduct.description}
                    onChange={(e) => setEditingProduct({...editingProduct, description: e.target.value})}
                    rows={4}
                    className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                  />
                </div>
                
                <div className="pt-4 flex gap-3">
                  <Button type="button" variant="outline" className="flex-1 h-12" onClick={() => setEditingProduct(null)}>Cancel</Button>
                  <Button type="submit" className="flex-1 h-12 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold">Save Changes</Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
