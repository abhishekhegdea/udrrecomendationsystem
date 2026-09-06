import { useEffect, useState } from 'react'
import api from '@/lib/api'

// Human-readable labels for the return reasons recorded with RETURN events
const RETURN_REASON_LABELS: Record<string, string> = {
  QUALITY: 'Quality issue',
  DAMAGED: 'Damaged in transit',
  MISTAKE: 'Ordered by mistake',
  OTHER: 'Other',
}

// Configured Signal Weights in the ML Recommendation Engine (Sum = 1.00 / 100%)
const SIGNAL_CONFIG = [
  { key: 'content', label: 'Content Similarity', shortLabel: 'Content', weight: 0.08, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40' },
  { key: 'collab', label: 'Collaborative Filter', shortLabel: 'Collab', weight: 0.08, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/40' },
  { key: 'engagement', label: 'Engagement Score', shortLabel: 'Engagement', weight: 0.10, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/40' },
  { key: 'user_click_affinity', label: 'User Click Affinity', shortLabel: 'User Clicks', weight: 0.09, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
  { key: 'location', label: 'Seller Location', shortLabel: 'Location', weight: 0.08, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-950/40' },
  { key: 'category', label: 'Category Affinity', shortLabel: 'Category', weight: 0.08, color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
  { key: 'brand', label: 'Brand Affinity', shortLabel: 'Brand', weight: 0.06, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40' },
  { key: 'rating', label: 'Product Rating', shortLabel: 'Rating', weight: 0.06, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-950/40' },
  { key: 'trend', label: 'Trending Score', shortLabel: 'Trend', weight: 0.07, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/40' },
  { key: 'seasonal', label: 'Seasonal Factor', shortLabel: 'Seasonal', weight: 0.06, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/40' },
  { key: 'seller', label: 'Seller Freshness', shortLabel: 'Seller', weight: 0.05, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-950/40' },
  { key: 'price_affinity', label: 'Price Range Affinity', shortLabel: 'Price Range', weight: 0.05, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/40' },
  { key: 'price_behavior', label: 'Price Behaviour', shortLabel: 'Price Tier', weight: 0.05, color: 'text-fuchsia-600 dark:text-fuchsia-400', bg: 'bg-fuchsia-50 dark:bg-fuchsia-950/40' },
  { key: 'discount_affinity', label: 'User Discount Affinity', shortLabel: '🔥 Discount', weight: 0.05, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/40' },
  { key: 'click_rate', label: 'Click-Through Rate', shortLabel: 'CTR', weight: 0.04, color: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-50 dark:bg-pink-950/40' },
]

export function RecommendationTester() {
  const [stats, setStats] = useState<any>(null)
  const [selectedBuyerId, setSelectedBuyerId] = useState<string>('')
  const [buyerHistory, setBuyerHistory] = useState<any>(null)
  const [recommendations, setRecommendations] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [expandedBreakdown, setExpandedBreakdown] = useState<Record<string, boolean>>({})

  const toggleBreakdown = (id: string) => {
    setExpandedBreakdown(prev => ({ ...prev, [id]: !prev[id] }))
  }

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
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }, [selectedBuyerId])

  if (!stats) return <div className="p-8">Loading verification data...</div>

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 bg-background min-h-screen">
      <div className="border-b pb-6">
        <h1 className="text-3xl font-bold text-foreground">🔬 ML Recommendation Engine - Verification Matrix</h1>
        <p className="text-muted-foreground mt-2">
          Transparent multi-signal score breakdown & formula tracing for personalized recommendations.
        </p>
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
              {recommendations?.map((rec: any, idx: number) => {
                const details = rec.score_details || {}
                const isExpanded = !!expandedBreakdown[rec.id || idx]

                // Extract discount information
                const discountRate = Number(rec.discount_rate ?? rec.discountRate ?? rec.discount ?? 0)
                const originalPrice = Number(rec.original_price ?? rec.originalPrice ?? rec.price ?? 0)
                const discountedPrice = discountRate > 0 ? Number(rec.price ?? (originalPrice * (1 - discountRate / 100))) : originalPrice

                // Extract all raw scores safely
                const signalValues: Record<string, number> = {
                  content: Number(details.content ?? 0),
                  collab: Number(details.collab ?? 0),
                  engagement: Number(details.engagement ?? rec.engagement_score ?? 0),
                  user_click_affinity: Number(details.user_click_affinity ?? 0),
                  location: Number(details.location ?? 0),
                  category: Number(details.category ?? 0),
                  brand: Number(details.brand ?? 0),
                  rating: Number(details.rating ?? 0),
                  trend: Number(details.trend ?? 0),
                  seasonal: Number(details.seasonal ?? 0),
                  seller: Number(details.seller ?? 0),
                  price_affinity: Number(details.price_affinity_score ?? details.price_affinity ?? 0.50),
                  price_behavior: Number(details.price_behavior?.score ?? rec.price_behavior?.score ?? 0.50),
                  discount_affinity: Number(details.discount_affinity_score ?? rec.discount_affinity_score ?? 0.50),
                  click_rate: Number(details.click_rate ?? details.ctr_score ?? 0),
                }

                // Compute exact contribution per signal: raw_score * weight
                const signalContributions = SIGNAL_CONFIG.map(sig => {
                  const rawVal = signalValues[sig.key] ?? 0
                  const contribution = rawVal * sig.weight
                  return {
                    ...sig,
                    rawValue: rawVal,
                    contribution: contribution,
                  }
                })

                // Sum of weighted contributions
                const computedSum = signalContributions.reduce((acc, curr) => acc + curr.contribution, 0)

                return (
                  <div key={rec.id || idx} className="bg-card border rounded-xl p-5 shadow-sm space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-forest text-primary-foreground flex items-center justify-center font-bold text-sm">
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-foreground text-base leading-tight">{rec.name}</h3>
                          {discountRate > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-red-500 text-white font-bold text-xs animate-pulse">
                              🔥 {discountRate}% OFF
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 mt-1.5 text-sm">
                          {discountRate > 0 ? (
                            <div className="flex items-baseline gap-2">
                              <span className="font-bold text-primary text-base">₹{Math.round(discountedPrice).toLocaleString()}</span>
                              <span className="text-xs text-muted-foreground line-through">₹{Math.round(originalPrice).toLocaleString()}</span>
                            </div>
                          ) : (
                            <span className="font-semibold text-primary">₹{Math.round(originalPrice).toLocaleString()}</span>
                          )}
                          <span className="text-muted-foreground">•</span>
                          <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-bold text-xs">
                            Final Score: {typeof rec.score === 'number' ? rec.score.toFixed(6) : rec.score}
                          </span>
                          {details.source && (
                            <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground text-xs uppercase font-medium">
                              Source: {details.source}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Compact Signal Summary Grid (All 13 Signals) */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs bg-muted/40 p-3 rounded-lg border">
                      {SIGNAL_CONFIG.map(sig => {
                        const raw = signalValues[sig.key] ?? 0
                        const isNonZero = raw > 0
                        return (
                          <div 
                            key={sig.key} 
                            className={`flex flex-col p-1.5 rounded border transition-colors ${
                              isNonZero ? sig.bg + ' border-primary/20' : 'bg-background/50 border-border/50 opacity-70'
                            }`}
                          >
                            <span className="text-[11px] text-muted-foreground truncate">{sig.shortLabel} ({Math.round(sig.weight * 100)}%):</span>
                            <div className="flex items-baseline justify-between mt-0.5">
                              <span className={`font-mono font-semibold ${isNonZero ? sig.color : 'text-foreground'}`}>
                                {raw.toFixed(2)}
                              </span>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                +{(raw * sig.weight).toFixed(4)}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Toggle Detailed Calculation Formula */}
                    <div className="pt-1">
                      <button
                        onClick={() => toggleBreakdown(rec.id || idx)}
                        className="text-xs text-primary hover:underline font-medium flex items-center gap-1 cursor-pointer"
                      >
                        {isExpanded ? '▼ Hide Full Formula Breakdown' : '▶ Show Full Formula Breakdown (Raw × Weight = Contribution)'}
                      </button>

                      {isExpanded && (
                        <div className="mt-2.5 p-3.5 bg-muted/70 rounded-lg border space-y-3 text-xs">
                          <div className="font-semibold text-foreground border-b pb-1.5 flex justify-between">
                            <span>Mathematical Formula Breakdown</span>
                            <span className="font-mono text-primary">Σ (Score × Weight) = {computedSum.toFixed(6)}</span>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b text-[11px] text-muted-foreground uppercase">
                                  <th className="py-1 px-1">Signal</th>
                                  <th className="py-1 px-1 text-center">Raw Score</th>
                                  <th className="py-1 px-1 text-center">Weight</th>
                                  <th className="py-1 px-1 text-right">Contribution to Final Score</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/40 font-mono text-[11px]">
                                {signalContributions.map(c => (
                                  <tr key={c.key} className={c.rawValue > 0 ? 'bg-background/40 font-medium' : 'text-muted-foreground'}>
                                    <td className="py-1 px-1 font-sans">{c.label}</td>
                                    <td className="py-1 px-1 text-center">{c.rawValue.toFixed(4)}</td>
                                    <td className="py-1 px-1 text-center">× {(c.weight * 100).toFixed(0)}%</td>
                                    <td className={`py-1 px-1 text-right font-semibold ${c.rawValue > 0 ? c.color : ''}`}>
                                      +{c.contribution.toFixed(6)}
                                    </td>
                                  </tr>
                                ))}
                                <tr className="border-t-2 border-primary/40 font-bold bg-primary/5">
                                  <td className="py-1.5 px-1 font-sans text-foreground">Total Weighted Final Score</td>
                                  <td className="py-1.5 px-1 text-center">—</td>
                                  <td className="py-1.5 px-1 text-center">100%</td>
                                  <td className="py-1.5 px-1 text-right text-primary">
                                    {computedSum.toFixed(6)}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {details.seller_distance_km !== undefined && details.seller_distance_km !== null && (
                            <div className="text-[11px] text-muted-foreground pt-1 border-t">
                              📍 Seller Distance: <strong>{details.seller_distance_km} km</strong> (Location score: {signalValues.location})
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {rec.explanation && (
                      <div className="inline-block px-2.5 py-1 bg-muted text-xs rounded-md text-muted-foreground italic border">
                        ✨ {rec.explanation}
                      </div>
                    )}
                  </div>
                )
              })}

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
