/**
 * Fire-and-forget event tracking used by recommendation/personalisation.
 *
 * IMPORTANT:
 *
 * CLICK is sent ONLY to the Node backend.
 *
 * Node now creates:
 *
 *   1. ClickEvent
 *   2. UserBehaviour
 *   3. ProductClickHistory (legacy short-lived click analytics)
 *   4. Exact RecommendationLog CTR attribution when recommendationRunId exists
 *
 * Therefore also sending CLICK to FastAPI would duplicate the same click
 * inside UserBehaviour.
 */

import api from './api'

const NODE_API = 'http://localhost:3001/api/events'
const ML_API = 'http://localhost:8000/api/v1/events'

// --------------------------------------------------------------------------
// PRODUCT VIEW
// --------------------------------------------------------------------------

export function trackProductView(
  userId: string,
  productId: string,
  opts?: {
    timeSpent?: number
    scrollDepth?: number
    source?: string
  }
) {
  const {
    timeSpent,
    scrollDepth,
    source = 'product_card',
  } = opts || {}

  api.post(`${NODE_API}/view`, {
    userId,
    productId,
    timeSpent: timeSpent ?? null,
    scrollDepth: scrollDepth ?? null,
    source,
  }).catch(() => {})

  api.post(`${ML_API}/view`, {
    user_id: userId,
    product_id: productId,
    time_spent: timeSpent ?? null,
    scroll_depth: scrollDepth ?? null,
    source,
  }).catch(() => {})
}

// --------------------------------------------------------------------------
// CLICK
// --------------------------------------------------------------------------

export function trackClick(
  userId: string | null | undefined,
  productId: string,
  opts?: {
    source?: string
    elementClicked?: string
    recommendationRunId?: string
    recommendationContext?: string
  }
) {
  const {
    source = 'unknown',
    elementClicked,
    recommendationRunId,
    recommendationContext,
  } = opts || {}

  /*
   * Node is the canonical writer for click events.
   *
   * Do NOT duplicate this request to FastAPI.
   */
  api.post(`${NODE_API}/click`, {
    userId: userId ?? null,
    productId,
    source,
    elementClicked: elementClicked ?? null,
    recommendationRunId: recommendationRunId ?? null,
    recommendationContext: recommendationContext ?? null,
  })
    .then((response) => {
      if (recommendationRunId) {
        console.log('[CTR click recorded]', {
          userId: userId ?? null,
          productId,
          recommendationRunId,
          recommendationContext,
          elementClicked: elementClicked ?? null,
          response: response.data,
        })
      }
    })
    .catch((error) => {
      if (recommendationRunId) {
        console.error('[CTR click failed]', {
          userId: userId ?? null,
          productId,
          recommendationRunId,
          recommendationContext,
          elementClicked: elementClicked ?? null,
          error,
        })
      }
    })
}

// --------------------------------------------------------------------------
// TRUE RECOMMENDATION IMPRESSION / CTR DENOMINATOR
// --------------------------------------------------------------------------

export function trackRecommendationImpression(
  userId: string,
  productId: string,
  recommendationRunId: string,
  opts?: {
    context?: string
  }
) {
  const {
    context = 'home',
  } = opts || {}

  api.post(`${NODE_API}/recommendation-impression`, {
    userId,
    productId,
    recommendationRunId,
    context,
  })
    .then((response) => {
      console.log('[CTR impression recorded]', {
        userId,
        productId,
        recommendationRunId,
        context,
        response: response.data,
      })
    })
    .catch((error) => {
      console.error('[CTR impression failed]', {
        userId,
        productId,
        recommendationRunId,
        context,
        error,
      })
    })
}

// --------------------------------------------------------------------------
// WISHLIST
// --------------------------------------------------------------------------

export function trackWishlist(
  userId: string,
  productId: string,
  action: 'add' | 'remove',
  opts?: {
    source?: string
  }
) {
  const {
    source = 'unknown',
  } = opts || {}

  api.post(`${NODE_API}/behaviour`, {
    userId,
    eventType: 'WISHLIST',
    productId,
    source,
    metadata: {
      action,
    },
  }).catch(() => {})

  api.post(`${ML_API}/wishlist`, {
    user_id: userId,
    product_id: productId,
    action,
    source,
  }).catch(() => {})
}

// --------------------------------------------------------------------------
// CART
// --------------------------------------------------------------------------

export function trackCart(
  userId: string,
  productId: string,
  action: 'add' | 'remove' | 'update',
  opts?: {
    quantity?: number
    source?: string
  }
) {
  const {
    quantity = 1,
    source = 'unknown',
  } = opts || {}

  api.post(`${NODE_API}/behaviour`, {
    userId,
    eventType: 'CART',
    productId,
    source,
    metadata: {
      action,
      quantity,
    },
  }).catch(() => {})

  api.post(`${ML_API}/cart`, {
    user_id: userId,
    product_id: productId,
    action,
    quantity,
    source,
  }).catch(() => {})
}

// --------------------------------------------------------------------------
// SEARCH
// --------------------------------------------------------------------------

export function trackSearch(
  userId: string,
  query: string,
  opts?: {
    resultCount?: number
    source?: string
  }
) {
  const {
    resultCount,
    source = 'search_page',
  } = opts || {}

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