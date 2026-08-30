import {
  Router,
  type Request,
  type Response,
} from 'express'

import axios, {
  type AxiosError,
} from 'axios'


const router = Router()


const ML_SERVICE_URL = (
  process.env.ML_SERVICE_URL ||
  'http://127.0.0.1:8000/api/v1/recommendations'
).replace(/\/+$/, '')


const ML_TIMEOUT_MS = 10000


/**
 * Express route params may be typed as:
 *
 * string | string[] | undefined
 *
 * Convert them safely to a single string before
 * passing them to encodeURIComponent().
 */
function getRouteParam(
  value: string | string[] | undefined
): string | null {
  if (Array.isArray(value)) {
    const firstValue = value[0]

    if (
      typeof firstValue !== 'string' ||
      firstValue.trim() === ''
    ) {
      return null
    }

    return firstValue
  }

  if (
    typeof value !== 'string' ||
    value.trim() === ''
  ) {
    return null
  }

  return value
}


/**
 * Handle errors returned by the Python recommendation service.
 */
function handleRecommendationError(
  error: unknown,
  res: Response,
  operation: string
) {
  if (axios.isAxiosError(error)) {
    const axiosError =
      error as AxiosError

    const status =
      axiosError.response?.status

    const upstreamData =
      axiosError.response?.data

    const upstreamUrl =
      axiosError.config?.url


    console.error('')
    console.error(
      'Recommendation service request failed'
    )

    console.error(
      `Operation: ${operation}`
    )

    console.error(
      `URL: ${upstreamUrl ?? 'unknown'}`
    )

    console.error(
      `Status: ${status ?? 'NO RESPONSE'}`
    )

    console.error(
      'Response:',
      upstreamData
    )

    console.error('')


    /**
     * FastAPI is running, but requested endpoint
     * doesn't exist.
     */
    if (status === 404) {
      return res.status(502).json({
        error:
          'Recommendation route not found',

        operation,

        upstreamUrl,

        upstreamStatus: 404,

        upstreamResponse:
          upstreamData,

        hint:
          'Verify that the UdrCrafts recommendation FastAPI application is running and its /api/v1/recommendations routes are registered.',
      })
    }


    /**
     * Python recommendation system itself failed.
     */
    if (
      typeof status === 'number' &&
      status >= 500
    ) {
      return res.status(502).json({
        error:
          'Recommendation service failed',

        operation,

        upstreamUrl,

        upstreamStatus:
          status,

        upstreamResponse:
          upstreamData,
      })
    }


    /**
     * Nothing is listening on port 8000.
     */
    if (
      axiosError.code ===
        'ECONNREFUSED' ||
      axiosError.code ===
        'ECONNABORTED' ||
      axiosError.code ===
        'ETIMEDOUT'
    ) {
      return res.status(503).json({
        error:
          'Recommendation service unavailable',

        operation,

        upstreamUrl,

        code:
          axiosError.code,

        hint:
          'Start the Python FastAPI recommendation service on port 8000.',
      })
    }


    return res.status(502).json({
      error:
        'Recommendation service request failed',

      operation,

      upstreamUrl,

      upstreamStatus:
        status,

      upstreamResponse:
        upstreamData,
    })
  }


  console.error(
    'Unexpected recommendation proxy error:',
    error
  )


  return res.status(500).json({
    error:
      'Unexpected recommendation proxy error',

    operation,
  })
}


/**
 * Common GET proxy helper.
 */
async function proxyGet(
  path: string,
  res: Response,
  operation: string
) {
  const url =
    `${ML_SERVICE_URL}${path}`

  try {
    const response =
      await axios.get(
        url,
        {
          timeout:
            ML_TIMEOUT_MS,
        }
      )

    return res.json(
      response.data
    )
  } catch (error) {
    return handleRecommendationError(
      error,
      res,
      operation
    )
  }
}


/**
 * ---------------------------------------------------------
 * HOME RECOMMENDATIONS
 * ---------------------------------------------------------
 */
router.get(
  '/home/:userId',
  async (
    req: Request,
    res: Response
  ) => {
    const userId =
      getRouteParam(
        req.params.userId
      )

    if (!userId) {
      return res.status(400).json({
        error:
          'Valid userId is required',
      })
    }

    return proxyGet(
      `/home/${encodeURIComponent(
        userId
      )}`,
      res,
      'home recommendations'
    )
  }
)


/**
 * ---------------------------------------------------------
 * SIMILAR PRODUCTS
 * ---------------------------------------------------------
 */
router.get(
  '/product/:productId',
  async (
    req: Request,
    res: Response
  ) => {
    const productId =
      getRouteParam(
        req.params.productId
      )

    if (!productId) {
      return res.status(400).json({
        error:
          'Valid productId is required',
      })
    }

    return proxyGet(
      `/product/${encodeURIComponent(
        productId
      )}`,
      res,
      'similar products'
    )
  }
)


/**
 * ---------------------------------------------------------
 * TRENDING
 * ---------------------------------------------------------
 */
router.get(
  '/trending',
  async (
    _req: Request,
    res: Response
  ) => {
    return proxyGet(
      '/trending',
      res,
      'trending products'
    )
  }
)


/**
 * ---------------------------------------------------------
 * NEW ARRIVALS
 * ---------------------------------------------------------
 */
router.get(
  '/new-arrivals',
  async (
    _req: Request,
    res: Response
  ) => {
    return proxyGet(
      '/new-arrivals',
      res,
      'new arrivals'
    )
  }
)


/**
 * ---------------------------------------------------------
 * ALSO BOUGHT
 * ---------------------------------------------------------
 */
router.get(
  '/also-bought/:productId',
  async (
    req: Request,
    res: Response
  ) => {
    const productId =
      getRouteParam(
        req.params.productId
      )

    if (!productId) {
      return res.status(400).json({
        error:
          'Valid productId is required',
      })
    }

    return proxyGet(
      `/also-bought/${encodeURIComponent(
        productId
      )}`,
      res,
      'also-bought products'
    )
  }
)


/**
 * ---------------------------------------------------------
 * SEARCH RECOMMENDATIONS
 * ---------------------------------------------------------
 */
router.get(
  '/search',
  async (
    req: Request,
    res: Response
  ) => {
    const url =
      `${ML_SERVICE_URL}/search`

    try {
      const response =
        await axios.get(
          url,
          {
            params:
              req.query,

            timeout:
              ML_TIMEOUT_MS,
          }
        )

      return res.json(
        response.data
      )
    } catch (error) {
      return handleRecommendationError(
        error,
        res,
        'recommendation search'
      )
    }
  }
)


/**
 * ---------------------------------------------------------
 * FAIRNESS CONFIG
 * ---------------------------------------------------------
 */
router.get(
  '/fairness-config',
  async (
    _req: Request,
    res: Response
  ) => {
    return proxyGet(
      '/fairness-config',
      res,
      'fairness configuration'
    )
  }
)


/**
 * ---------------------------------------------------------
 * NODE → PYTHON HEALTH CHECK
 * ---------------------------------------------------------
 */
router.get(
  '/health',
  async (
    _req: Request,
    res: Response
  ) => {
    const pythonBaseUrl =
      ML_SERVICE_URL.replace(
        /\/api\/v1\/recommendations$/,
        ''
      )

    try {
      const response =
        await axios.get(
          `${pythonBaseUrl}/health`,
          {
            timeout:
              3000,
          }
        )

      return res.json({
        status:
          'healthy',

        nodeProxy:
          true,

        mlServiceUrl:
          ML_SERVICE_URL,

        python:
          response.data,
      })
    } catch (error) {
      return handleRecommendationError(
        error,
        res,
        'recommendation service health'
      )
    }
  }
)


export default router