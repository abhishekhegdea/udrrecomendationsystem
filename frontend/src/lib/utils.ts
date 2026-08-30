import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency: string = 'INR'): string {
  if (currency === 'USD') {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  // Default to INR for backward compatibility
  return `₹${amount.toLocaleString('en-IN')}`
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function maskNumber(num: string, visible = 4): string {
  return num.length > visible ? 'X'.repeat(num.length - visible) + num.slice(-visible) : num
}

export const FALLBACK_PRODUCT_IMAGE = '/products/product-vase.jpg'

/**
 * Hosts on `.example` / `.test` / `.invalid` are reserved by RFC 2606 and
 * never resolve. Placeholder seed data occasionally references them (e.g.
 * `https://synthetic.example/images/...`), which triggers failed network
 * requests (`ERR_NAME_NOT_RESOLVED`) in the browser. Return the fallback
 * instead of ever attempting to load such URLs.
 */
const PLACEHOLDER_HOST_RE = /(^|\.)(example|test|invalid)$/i

export function getProductImageUrl(
  url?: string | null,
  fallback: string = FALLBACK_PRODUCT_IMAGE
): string {
  if (!url) return fallback
  try {
    if (PLACEHOLDER_HOST_RE.test(new URL(url).hostname)) return fallback
  } catch {
    // Not a parseable absolute URL (e.g. a local path) — use as-is
    return url
  }
  return url
}


