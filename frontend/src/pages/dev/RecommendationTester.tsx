import { useEffect, useState } from 'react'
import api from '@/lib/api'

// Human-readable labels for the return reasons recorded with RETURN events
const RETURN_REASON_LABELS: Record<string, string> = {
  QUALITY: 'Quality issue',
  DAMAGED: 'Damaged in transit',
  MISTAKE: 'Ordered by mistake',
  OTHER: 'Other',
}

export function RecommendationTester() {
  const [stats, setStats] = useState<any>(null)
  const [selectedBuyerId, setSelectedBuyerId] = useState<string>('')
  const [buyerHistory, setBuyerHistory] = useState<any>(null)
  const [recommendations, setRecommendations] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Fetch global DB stats and buyer list
    api.get('http://localhost:3001/api/admin/debug/stats')
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
    
    const fetchHistory = api.get(`http://localhost:3001/api/admin/debug/buyer/${selectedBuyerId}`)
    const fetchRecs = api.get(`http://localhost:3001/api/recommendations/home/${selectedBuyerId}`)

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
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
        {[
          { label: 'Sellers', val: stats.totalSellers },
          { label: 'Buyers', val: stats.totalBuyers },
          { label: 'Products', val: stats.totalProducts },
          { label: 'Orders', val: stats.totalOrders },
          { label: 'Wishlists', val: stats.totalWishlists },
          { label: 'Views', val: stats.totalViews },
          { label: 'Cart Events', val: stats.totalCartEvents },
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
                <h3 className="font-semibold text-sm mb-2 text-primary uppercase">Returned Items</h3>
                {(!buyerHistory?.returns || buyerHistory.returns.length === 0) && <p className="text-xs text-muted-foreground">None</p>}
                <ul className="list-disc pl-5 text-sm space-y-1">
                  {buyerHistory?.returns?.map((r: any, i: number) => (
                    <li key={r.id ?? i}>
                      {r.product?.name || 'Deleted product'}{' '}
                      <span className="text-muted-foreground">({r.product?.category?.name || '—'})</span>{' '}
                      <span className={`text-xs font-medium ${r.metadata?.qualityIssue ? 'text-red-500' : 'text-muted-foreground'}`}>
                        [{RETURN_REASON_LABELS[r.metadata?.reason] || r.metadata?.reason || 'Other'}]
                      </span>
                      {r.metadata?.qualityIssue && (
                        <span className="ml-1 inline-block px-1.5 py-0.5 bg-red-50 text-red-600 text-[10px] font-bold uppercase rounded">Quality</span>
                      )}
                      {r.metadata?.rating ? <span className="text-xs text-amber-500"> ★{r.metadata.rating}</span> : null}
                      {r.metadata?.reviewText && (
                        <p className="text-xs text-muted-foreground italic">"{r.metadata.reviewText}"</p>
                      )}
                    </li>
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
                <h3 className="font-semibold text-sm mb-2 text-primary uppercase">Clicks</h3>
                {(!buyerHistory?.clicks || buyerHistory.clicks.length === 0) && <p className="text-xs text-muted-foreground">None</p>}
                <ul className="list-disc pl-5 text-sm space-y-1">
                  {buyerHistory?.clicks?.map((c: any, i: number) => (
                    <li key={c.id ?? i}>
                      {c.product?.name || 'Deleted product'}{' '}
                      <span className="text-muted-foreground">({c.product?.category?.name || '—'})</span>{' '}
                      <span className="text-xs text-muted-foreground">
                        [{c.metadata?.element_clicked || c.metadata?.elementClicked || 'product_link'}]
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-sm mb-2 text-primary uppercase">Cart Activity</h3>
                {(!buyerHistory?.cart || buyerHistory.cart.length === 0) && <p className="text-xs text-muted-foreground">None</p>}
                <ul className="list-disc pl-5 text-sm space-y-1">
                  {buyerHistory?.cart?.map((c: any, i: number) => (
                    <li key={c.id ?? i}>
                      {c.product?.name || 'Deleted product'}{' '}
                      <span className="text-muted-foreground">({c.product?.category?.name || '—'})</span>{' '}
                      <span className="text-xs text-muted-foreground">
                        [{c.metadata?.action || 'add'}
                        {c.metadata?.quantity ? ` ×${c.metadata.quantity}` : ''}]
                      </span>
                    </li>
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
                    
                    {rec.score_details && (
                      <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs bg-muted/50 p-2 rounded border">
                        <div className="flex justify-between px-1"><span className="text-muted-foreground">Source:</span> <span className="font-medium text-foreground">{rec.score_details.source}</span></div>
                        <div className="flex justify-between px-1"><span className="text-muted-foreground">Content:</span> <span className="font-medium text-foreground">{rec.score_details.content}</span></div>
                        <div className="flex justify-between px-1"><span className="text-muted-foreground">Collab:</span> <span className="font-medium text-foreground">{rec.score_details.collab}</span></div>
                        <div className="flex justify-between px-1"><span className="text-muted-foreground">Engagement:</span> <span className="font-medium text-foreground">{rec.engagement_score}</span></div>
                        <div className="flex justify-between px-1"><span className="text-muted-foreground">Trend:</span> <span className="font-medium text-foreground">{rec.score_details.trend}</span></div>
                        <div className="flex justify-between px-1"><span className="text-muted-foreground">Category:</span> <span className="font-medium text-foreground">{rec.score_details.category}</span></div>
                        <div className="flex justify-between px-1"><span className="text-muted-foreground">Brand:</span> <span className="font-medium text-foreground">{rec.score_details.brand}</span></div>
                        <div className="flex justify-between px-1"><span className="text-muted-foreground">Location:</span> <span className="font-medium text-foreground">{rec.score_details.location}</span></div>
                        <div className="flex justify-between px-1"><span className="text-muted-foreground">Seller:</span> <span className="font-medium text-foreground">{rec.score_details.seller}</span></div>
                      </div>
                    )}
                    
                    <div className="mt-3 inline-block px-2 py-1 bg-muted text-xs rounded text-muted-foreground italic border">
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
