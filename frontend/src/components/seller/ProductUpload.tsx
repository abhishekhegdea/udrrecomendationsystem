import { useState, useEffect } from 'react'
import { Upload, X, Loader2 } from 'lucide-react'
import axios from 'axios'
import { useAuth } from '@/contexts/AuthContext'

export function ProductUpload({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
  const { user } = useAuth()
  const [categories, setCategories] = useState<any[]>([])
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    inventory: '1',
    categoryId: '',
    craftType: '',
    tags: '',
    materials: '',
    imageUrl: ''
  })
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    axios.get('http://localhost:3001/api/products/categories/all')
      .then(res => setCategories(res.data))
      .catch(console.error)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      await axios.post('http://localhost:3001/api/seller/products', {
        ...formData,
        sellerId: user?.id,
        tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
        materials: formData.materials.split(',').map(m => m.trim()).filter(Boolean)
      })
      onSuccess()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to upload product')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-border shadow-2xl p-6 relative">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 bg-muted rounded-full hover:bg-muted/80 text-muted-foreground">
          <X className="h-5 w-5" />
        </button>
        
        <h2 className="text-2xl font-bold font-display mb-6">Upload New Product</h2>
        
        {error && <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Product Name</label>
            <input 
              required
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              className="w-full h-12 bg-muted border border-border rounded-xl px-4 focus:ring-1 focus:ring-primary outline-none" 
              placeholder="e.g. Handwoven Pashmina Shawl" 
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <textarea 
              required
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
              className="w-full bg-muted border border-border rounded-xl p-4 focus:ring-1 focus:ring-primary outline-none min-h-[100px]" 
              placeholder="Describe your handcrafted product..." 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Price (₹)</label>
              <input 
                type="number" required
                value={formData.price}
                onChange={e => setFormData({...formData, price: e.target.value})}
                className="w-full h-12 bg-muted border border-border rounded-xl px-4 focus:ring-1 focus:ring-primary outline-none" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Inventory Count</label>
              <input 
                type="number" required
                value={formData.inventory}
                onChange={e => setFormData({...formData, inventory: e.target.value})}
                className="w-full h-12 bg-muted border border-border rounded-xl px-4 focus:ring-1 focus:ring-primary outline-none" 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <select 
                required
                value={formData.categoryId}
                onChange={e => setFormData({...formData, categoryId: e.target.value})}
                className="w-full h-12 bg-muted border border-border rounded-xl px-4 focus:ring-1 focus:ring-primary outline-none"
              >
                <option value="">Select Category</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Craft Type</label>
              <input 
                value={formData.craftType}
                onChange={e => setFormData({...formData, craftType: e.target.value})}
                className="w-full h-12 bg-muted border border-border rounded-xl px-4 focus:ring-1 focus:ring-primary outline-none" 
                placeholder="e.g. Blue Pottery, Weaving" 
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Tags (comma separated)</label>
            <input 
              value={formData.tags}
              onChange={e => setFormData({...formData, tags: e.target.value})}
              className="w-full h-12 bg-muted border border-border rounded-xl px-4 focus:ring-1 focus:ring-primary outline-none" 
              placeholder="e.g. decor, winter, luxury" 
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Materials (comma separated)</label>
            <input 
              value={formData.materials}
              onChange={e => setFormData({...formData, materials: e.target.value})}
              className="w-full h-12 bg-muted border border-border rounded-xl px-4 focus:ring-1 focus:ring-primary outline-none" 
              placeholder="e.g. Ceramic, Wool, Teakwood" 
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Image URL (Optional)</label>
            <input 
              value={formData.imageUrl}
              onChange={e => setFormData({...formData, imageUrl: e.target.value})}
              className="w-full h-12 bg-muted border border-border rounded-xl px-4 focus:ring-1 focus:ring-primary outline-none" 
              placeholder="/products/product-vase.jpg" 
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full h-12 bg-primary text-primary-foreground font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
            Publish Product
          </button>
        </form>
      </div>
    </div>
  )
}
