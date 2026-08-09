import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import axios from 'axios'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  SlidersHorizontal, RefreshCw, Save, Scale, 
  Sparkles, Users, BarChart3, Info, 
  Wifi, WifiOff, Loader2 
} from 'lucide-react'
import { cn } from '@/lib/utils'

const API_BASE = 'http://localhost:8000/api/v1/recommendations'
const FETCH_TIMEOUT_MS = 5000

interface FairnessConfig {
  boost_amount: number
  new_seller_ratio: number
  max_per_seller_ratio: number
}

const STALE_RETRY_COOLDOWN_MS = 30_000 // 30s before auto-retry after failure

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }

const DEFAULT_CONFIG: FairnessConfig = {
  boost_amount: 0.15,
  new_seller_ratio: 0.15,
  max_per_seller_ratio: 0.20,
}

function clamp(v: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, v))
}

function formatPct(v: number): string {
  return `${Math.round(v * 100)}%`
}

const TIMEOUT_ERR_CODE = 'ECONNABORTED'

type ConnectionStatus = 'connecting' | 'connected' | 'offline'

interface SliderFieldProps {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  icon: React.ReactNode
  description: string
  recommendation: string
  disabled?: boolean
}

function SliderField({ label, value, onChange, min = 0, max = 1, step = 0.01, icon, description, recommendation, disabled }: SliderFieldProps) {
  return (
    <motion.div variants={item} className={cn('space-y-3', disabled && 'opacity-50 pointer-events-none')}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-forest/10 flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <label className="text-sm font-semibold text-foreground block truncate">{label}</label>
            <p className="text-xs text-muted-foreground leading-tight mt-0.5">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-mono font-bold text-foreground bg-muted px-2.5 py-1 rounded-lg min-w-[56px] text-center tabular-nums">
            {formatPct(value)}
          </span>
          <Input
            type="number"
            value={value}
            onChange={(e) => {
              const raw = parseFloat(e.target.value)
              onChange(isNaN(raw) ? min : clamp(raw, min, max))
            }}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            className="w-20 h-8 text-xs font-mono text-center tabular-nums"
          />
        </div>
      </div>
      <div className="relative h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-forest rounded-full transition-all duration-200"
          style={{ width: `${value * 100}%` }}
        />
        <input
          type="range"
          value={value}
          onChange={(e) => onChange(clamp(parseFloat(e.target.value), min, max))}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-0.5 pointer-events-none">
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
            <div
              key={tick}
              className={`w-0.5 h-1.5 rounded-full transition-colors ${
                tick <= value ? 'bg-white/40' : 'bg-muted-foreground/20'
              }`}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Info className="h-3 w-3 flex-shrink-0" />
        <span>{recommendation}</span>
      </div>
    </motion.div>
  )
}

interface ConnectionBannerProps {
  status: ConnectionStatus
  onRetry: () => void
}

function ConnectionBanner({ status, onRetry }: ConnectionBannerProps) {
  if (status === 'connected') return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm"
    >
      {status === 'connecting' ? (
        <>
          <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />
          <span className="text-muted-foreground">
            Connecting to recommendation service…
          </span>
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            Recommendation service unavailable — working with local defaults.
          </span>
          <Button variant="outline" size="sm" onClick={onRetry} className="ml-auto text-xs h-7 px-3">
            <RefreshCw className="h-3 w-3 mr-1.5" />
            Retry
          </Button>
        </>
      )}
    </motion.div>
  )
}

export function FairnessConfigPanel() {
  const [serverConfig, setServerConfig] = useState<FairnessConfig | null>(null)
  const [draft, setDraft] = useState<FairnessConfig>(DEFAULT_CONFIG)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  // Track mount for clean async
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const fetchConfig = async () => {
    // Cancel any in-flight request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setConnectionStatus('connecting')

    try {
      const res = await axios.get<FairnessConfig>(`${API_BASE}/fairness-config`, {
        signal: controller.signal,
        timeout: FETCH_TIMEOUT_MS,
      })
      if (!mountedRef.current) return

      setServerConfig(res.data)
      setDraft(res.data)
      setDirty(false)
      setConnectionStatus('connected')
    } catch (err: any) {
      if (axios.isCancel(err) || err?.code === 'ERR_CANCELED') return
      if (!mountedRef.current) return

      // Timeout or network error — go offline with defaults
      setServerConfig(null)
      setConnectionStatus('offline')

      const isTimeout = err?.code === TIMEOUT_ERR_CODE
      const isNetwork = !err?.response && !isTimeout

      if (isNetwork) {
        console.warn('FairnessConfig: recommendation service unreachable, using local defaults')
      } else if (isTimeout) {
        console.warn(`FairnessConfig: request timed out after ${FETCH_TIMEOUT_MS}ms, using local defaults`)
      }
    }
  }

  useEffect(() => {
    fetchConfig()
    return () => abortRef.current?.abort()
  }, [])

  const updateField = (key: keyof FairnessConfig, value: number) => {
    setDraft((prev) => ({ ...prev, [key]: clamp(value, 0, 1) }))
    setDirty(true)
  }

  const saveConfig = async () => {
    setSaving(true)
    try {
      const res = await axios.put<FairnessConfig>(`${API_BASE}/fairness-config`, {
        boost_amount: draft.boost_amount,
        new_seller_ratio: draft.new_seller_ratio,
        max_per_seller_ratio: draft.max_per_seller_ratio,
      }, {
        timeout: FETCH_TIMEOUT_MS,
      })
      if (!mountedRef.current) return

      setServerConfig(res.data)
      setDraft(res.data)
      setDirty(false)
      setConnectionStatus('connected')
      toast.success('Fairness configuration updated')
    } catch (err: any) {
      if (!mountedRef.current) return

      if (!err?.response) {
        toast.error('Recommendation service is offline — changes cannot be saved right now')
      } else {
        toast.error(err?.response?.data?.detail?.[0]?.msg || 'Failed to update fairness configuration')
      }
    } finally {
      if (mountedRef.current) setSaving(false)
    }
  }

  const isOnline = connectionStatus === 'connected'
  const hasChanged = dirty && serverConfig !== null

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">
      {/* Header */}
      <motion.div variants={item}>
        <Card className="bg-gradient-to-br from-forest to-forest/90 text-primary-foreground border-0 overflow-hidden relative shadow-xl">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/10 rounded-full blur-3xl -mr-40 -mt-40" />
          <CardContent className="p-8 lg:p-10 relative z-10">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
                  <Scale className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h2 className="text-[28px] font-bold leading-tight font-display">
                    Seller Fairness Config
                  </h2>
                  <div className="flex items-center gap-2 mt-1.5">
                    <p className="text-sm text-primary-foreground/80 font-medium">Recommendation System Tuning</p>
                    <span className="text-white/30">•</span>
                    <Badge
                      variant={isOnline ? 'success' : 'secondary'}
                      dot
                      className={`border-none ${
                        isOnline ? 'bg-green-500/20 text-green-100' : 'bg-amber-500/20 text-amber-100'
                      }`}
                    >
                      {connectionStatus === 'connecting' ? 'Connecting...' : isOnline ? 'Service Connected' : 'Offline Mode'}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchConfig}
                  disabled={connectionStatus === 'connecting'}
                  className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
                >
                  <RefreshCw className={`h-4 w-4 mr-1.5 ${connectionStatus === 'connecting' ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Config Editor */}
      <motion.div variants={item}>
        <Card className="border-border">
          <CardHeader className="border-b border-border bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-foreground flex items-center gap-2">
                  <SlidersHorizontal className="h-5 w-5 text-primary" />
                  Fairness Parameters
                </CardTitle>
                <CardDescription className="mt-1">
                  Tune how the recommendation engine distributes visibility between new and established sellers.
                </CardDescription>
              </div>
            </div>
            {/* Connection banner inside card header */}
            <ConnectionBanner status={connectionStatus} onRetry={fetchConfig} />
          </CardHeader>
          <CardContent className="p-6 lg:p-8">
            <div className="space-y-10">
              {/* Boost Amount */}
              <SliderField
                label="New Seller Boost"
                value={draft.boost_amount}
                onChange={(v) => updateField('boost_amount', v)}
                icon={<Sparkles className="h-4 w-4 text-forest" />}
                description="Score multiplier applied to new-artisan products"
                recommendation="Higher values (e.g., 0.25–0.30) strongly promote new sellers. Recommended: 0.15–0.25."
                disabled={connectionStatus === 'connecting'}
              />

              <div className="border-t border-border" />

              {/* New Seller Ratio */}
              <SliderField
                label="Slot Reservation"
                value={draft.new_seller_ratio}
                onChange={(v) => updateField('new_seller_ratio', v)}
                icon={<Users className="h-4 w-4 text-forest" />}
                description="Fraction of recommendation slots reserved for new sellers"
                recommendation="15% (0.15) ensures consistent discovery. Going above 20% may reduce relevance."
                disabled={connectionStatus === 'connecting'}
              />

              <div className="border-t border-border" />

              {/* Max Per Seller Ratio */}
              <SliderField
                label="Dominance Cap"
                value={draft.max_per_seller_ratio}
                onChange={(v) => updateField('max_per_seller_ratio', v)}
                icon={<BarChart3 className="h-4 w-4 text-forest" />}
                description="Maximum slots any single seller can occupy"
                recommendation="20% (0.20) prevents any single seller from dominating. Lower values increase diversity."
                disabled={connectionStatus === 'connecting'}
              />

              {/* Live preview of effects */}
              <div className="border-t border-border pt-6">
                <div className="bg-muted/50 rounded-xl p-5 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Effect Preview</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-background rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-forest tabular-nums">{formatPct(draft.new_seller_ratio)}</p>
                      <p className="text-xs text-muted-foreground mt-1">New Seller Slots</p>
                    </div>
                    <div className="bg-background rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-accent tabular-nums">{formatPct(draft.max_per_seller_ratio)}</p>
                      <p className="text-xs text-muted-foreground mt-1">Max Per Seller</p>
                    </div>
                    <div className="bg-background rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-primary tabular-nums">{formatPct(draft.boost_amount)}</p>
                      <p className="text-xs text-muted-foreground mt-1">Score Boost</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Save Actions */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  {hasChanged && (
                    <Badge variant="warning" className="bg-amber-500/20 text-amber-700 border-none text-xs">
                      Unsaved changes
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (serverConfig) {
                        setDraft({ ...serverConfig })
                        setDirty(false)
                      } else {
                        setDraft(DEFAULT_CONFIG)
                        setDirty(false)
                      }
                    }}
                    disabled={!hasChanged && serverConfig !== null}
                  >
                    Reset
                  </Button>
                  <Button
                    onClick={saveConfig}
                    disabled={!(dirty && isOnline) || saving}
                    className="bg-forest hover:bg-forest/90 text-primary-foreground"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Info Card */}
      <motion.div variants={item}>
        <Card className="border-border bg-muted/30">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <Info className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="text-sm text-muted-foreground space-y-2">
                <p className="font-semibold text-foreground">How Seller Fairness Works</p>
                <p>
                  The fairness algorithm runs in four phases on every recommendation request:
                </p>
                <ol className="list-decimal list-inside space-y-1 pl-2">
                  <li><strong>Boost</strong> — New-seller products get a score bump (<em>boost_amount</em>).</li>
                  <li><strong>Cap</strong> — No seller can exceed <em>max_per_seller_ratio</em> of the slots.</li>
                  <li><strong>Reserve</strong> — <em>new_seller_ratio</em> slots are reserved for new artisans.</li>
                  <li><strong>Interleave</strong> — New and established products are evenly distributed throughout the ranking.</li>
                </ol>
                <p className="pt-1">
                  This ensures new artisans get discovered while keeping recommendations relevant.
                  Changes take effect immediately — no restart needed.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
