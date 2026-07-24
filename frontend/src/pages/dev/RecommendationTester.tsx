import { useEffect, useState } from 'react'
import axios from 'axios'

export function RecommendationTester() {
  const [stats, setStats] = useState<any>(null)
  const [selectedBuyerId, setSelectedBuyerId] = useState<string>('')
  const [buyerHistory, setBuyerHistory] = useState<any>(null)
  const [recommendations, setRecommendations] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Fetch global DB stats and buyer list
    axios.get('http://localhost:3001/api/admin/debug/stats')
      .then(res => {
        setStats(res.data)
        if (res.data.buyers && res.data.buyers.length > 0) {
          setSelectedBuyerId(res.data.buyers[0].id)
        }
      })
      .catch(err => console.error(err))
  }, [])

  useEffect(() => {
    if (!selectedBuyerId) return
    
    setLoading(true)
    
    // 1. Fetch exact DB history
    const fetchHistory = axios.get(`http://localhost:3001/api/admin/debug/buyer/${selectedBuyerId}`)
    // 2. Fetch live ML recommendations (using Python endpoint directly or via proxy)
    // Assuming backend proxy routes /api/recommendations/home/:userId to FastAPI
    const fetchRecs = axios.get(`http://localhost:3001/api/recommendations/home/${selectedBuyerId}`)

    Promise.all([fetchHistory, fetchRecs])
      .then(([histRes, recRes]) => {
        setBuyerHistory(histRes.data)
        setRecommendations(recRes.data.recommendations || [])
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        setLoading(false)
      })
  }, [selectedBuyerId])

  if (!stats) return <div className="p-8">Loading verification data...</div>

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 bg-background min-h-screen">
      <div className="border-b pb-6">
        <h1 className="text-3xl font-bold text-foreground">🔬 ML Recommendation Engine - Verification Matrix</h1>
        <p className="text-muted-foreground mt-2">This dashboard proves the Recommendation API returns isolated, context-aware results per user persona.</p>
      </div>

      {/* Aggregate Report */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {[
          { label: 'Sellers', val: stats.totalSellers },
          { label: 'Buyers', val: stats.totalBuyers },
          { label: 'Products', val: stats.totalProducts },
          { label: 'Orders', val: stats.totalOrders },
          { label: 'Wishlists', val: stats.totalWishlists },
          { label: 'Views', val: stats.totalViews },
        ].map(s => (
          <div key={s.label} className="bg-card border rounded-xl p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-primary">{s.val}</div>
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Buyer Selector */}
      <div className="bg-card border rounded-xl p-6 shadow-sm">
        <label className="block text-sm font-semibold text-foreground mb-2">Select Simulated Persona to Test:</label>
        <select 
          className="w-full md:w-96 p-3 bg-muted border rounded-lg text-foreground font-medium"
          value={selectedBuyerId}
          onChange={(e) => setSelectedBuyerId(e.target.value)}
        >
          {stats.buyers.map((b: any) => (
            <option key={b.id} value={b.id}>{b.firstName} ({b.email})</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center text-muted-foreground">Running ML Inference...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* LEFT: The Postgres DB Truth (What they actually did) */}
          <div className="space-y-6">
            <h2 className="text-xl font-bold border-b pb-2 text-foreground">PostgreSQL Behaviour History</h2>
            
            <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
              <div>
                <h3 className="font-semibold text-sm mb-2 text-primary uppercase">Purchases</h3>
                {buyerHistory?.purchases?.length === 0 && <p className="text-xs text-muted-foreground">None</p>}
                <ul className="list-disc pl-5 text-sm space-y-1">
                  {buyerHistory?.purchases?.map((p: any, i: number) => (
                    <li key={i}>{p.product.name} <span className="text-muted-foreground">({p.product.category.name})</span></li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-sm mb-2 text-primary uppercase">Wishlist Items</h3>
                {buyerHistory?.wishlist?.length === 0 && <p className="text-xs text-muted-foreground">None</p>}
                <ul className="list-disc pl-5 text-sm space-y-1">
                  {buyerHistory?.wishlist?.map((w: any, i: number) => (
                    <li key={i}>{w.product.name} <span className="text-muted-foreground">({w.product.category.name})</span></li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-sm mb-2 text-primary uppercase">Products Viewed</h3>
                {buyerHistory?.views?.length === 0 && <p className="text-xs text-muted-foreground">None</p>}
                <ul className="list-disc pl-5 text-sm space-y-1">
                  {buyerHistory?.views?.map((v: any, i: number) => (
                    <li key={i}>{v.product.name} <span className="text-muted-foreground">({v.product.category.name})</span></li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-sm mb-2 text-primary uppercase">Search Queries</h3>
                {buyerHistory?.searches?.length === 0 && <p className="text-xs text-muted-foreground">None</p>}
                <ul className="list-disc pl-5 text-sm space-y-1">
                  {buyerHistory?.searches?.map((s: any, i: number) => (
                    <li key={i}>"{s.query}"</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* RIGHT: ML Engine Output */}
          <div className="space-y-6">
            <h2 className="text-xl font-bold border-b pb-2 text-foreground">Live ML Recommendation Output</h2>
            
            <div className="space-y-4">
              {recommendations?.map((rec: any, idx: number) => (
                <div key={rec.id} className="bg-card border rounded-xl p-4 shadow-sm flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-forest text-primary-foreground flex items-center justify-center font-bold">
                    {idx + 1}
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">{rec.name}</h3>
                    <p className="text-sm text-primary font-medium mt-1">₹{rec.price} <span className="text-muted-foreground ml-2">| Score: {rec.score}</span></p>
                    <div className="mt-2 inline-block px-2 py-1 bg-muted text-xs rounded text-muted-foreground italic border">
                      ✨ {rec.explanation}
                    </div>
                  </div>
                </div>
              ))}
              {(!recommendations || recommendations.length === 0) && (
                <p className="text-sm text-muted-foreground">No recommendations generated.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
