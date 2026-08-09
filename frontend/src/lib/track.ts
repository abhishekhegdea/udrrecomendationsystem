/**
 * track.ts — Fire-and-forget event tracking for ML personalization.
 *
 * Each function sends events to **both**:
 *   - Node.js events API (localhost:3001) → creates ProductView / ClickEvent + UserBehaviour
 *   - Python ML event tracker (localhost:8000) → creates UserBehaviour for immediate signals
 *
 * All calls are fire-and-forget with `.catch(() => {})` so they never block the UI.
 */

import api from './api'

const NODE_API = 'http://localhost:3001/api/events'
const ML_API = 'http://localhost:8000/api/v1/events'

/** Track a product view event */
export function trackProductView(
  userId: string,
  productId: string,
  opts?: { timeSpent?: number; scrollDepth?: number; source?: string }
) {
  const { timeSpent, scrollDepth, source = 'product_card' } = opts || {}

  // Node.js API (creates ProductView + UserBehaviour)
  api.post(`${NODE_API}/view`, {
    userId,
    productId,
    timeSpent: timeSpent ?? null,
    scrollDepth: scrollDepth ?? null,
    source,
  }).catch(() => {})

  // Python ML API (creates UserBehaviour immediately)
  api.post(`${ML_API}/view`, {
    user_id: userId,
    product_id: productId,
    time_spent: timeSpent ?? null,
    scroll_depth: scrollDepth ?? null,
    source,
  }).catch(() => {})
}

/** Track a click event */
export function trackClick(
  userId: string,
  productId: string,
  opts?: { source?: string; elementClicked?: string }
) {
  const { source = 'unknown', elementClicked } = opts || {}

  api.post(`${NODE_API}/click`, {
    userId,
    productId,
    source,
    elementClicked: elementClicked ?? null,
  }).catch(() => {})

  api.post(`${ML_API}/click`, {
    user_id: userId,
    product_id: productId,
    source,
    element_clicked: elementClicked ?? null,
  }).catch(() => {})
}

/** Track a wishlist event (add / remove) */
export function trackWishlist(
  userId: string,
  productId: string,
  action: 'add' | 'remove',
  opts?: { source?: string }
) {
  const { source = 'unknown' } = opts || {}

  // Use the Node.js generic behaviour endpoint for wishlist
  api.post(`${NODE_API}/behaviour`, {
    userId,
    eventType: 'WISHLIST',
    productId,
    source,
    metadata: { action },
  }).catch(() => {})

  api.post(`${ML_API}/wishlist`, {
    user_id: userId,
    product_id: productId,
    action,
    source,
  }).catch(() => {})
}

/** Track a cart event (add / remove / update) */
export function trackCart(
  userId: string,
  productId: string,
  action: 'add' | 'remove' | 'update',
  opts?: { quantity?: number; source?: string }
) {
  const { quantity = 1, source = 'unknown' } = opts || {}

  api.post(`${NODE_API}/behaviour`, {
    userId,
    eventType: 'CART',
    productId,
    source,
    metadata: { action, quantity },
  }).catch(() => {})

  api.post(`${ML_API}/cart`, {
    user_id: userId,
    product_id: productId,
    action,
    quantity,
    source,
  }).catch(() => {})
}

/** Track a search query event */
export function trackSearch(
  userId: string,
  query: string,
  opts?: { resultCount?: number; source?: string }
) {
  const { resultCount, source = 'search_page' } = opts || {}

  api.post(`${NODE_API}/search`, {
    userId,
    query,
  }).catch(() => {})

  api.post(`${ML_API}/search`, {
    user_id: userId,
    query,
    result_count: resultCount ?? null,
    source,
  }).catch(() => {})
}
