import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from 'react'

import api from '@/lib/api'
import { useAuth } from './AuthContext'

const LS_KEY = 'udrcrafts_wishlist'

function loadFromStorage(): {
  productId: string
}[] {
  try {
    const saved =
      localStorage.getItem(LS_KEY)

    return saved
      ? JSON.parse(saved)
      : []
  } catch {
    return []
  }
}

function saveToStorage(
  items: {
    productId: string
  }[]
) {
  try {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify(items)
    )
  } catch {
    // localStorage unavailable/full.
  }
}

export interface WishlistItem {
  productId: string
}

interface WishlistContextType {
  items: WishlistItem[]

  toggleWishlist: (
    productId: string
  ) => Promise<void>

  isInWishlist: (
    productId: string
  ) => boolean
}

const WishlistContext =
  createContext<
    WishlistContextType | undefined
  >(undefined)

export function WishlistProvider({
  children,
}: {
  children: ReactNode
}) {
  const {
    user,
    isAuthenticated,
  } = useAuth()

  const [items, setItems] =
    useState<WishlistItem[]>(
      loadFromStorage
    )

  const fetchAbortRef =
    useRef<AbortController | null>(
      null
    )

  useEffect(() => {
    fetchAbortRef.current?.abort()

    const controller =
      new AbortController()

    fetchAbortRef.current =
      controller

    if (
      isAuthenticated &&
      user
    ) {
      api
        .get(
          `http://localhost:3001/api/products/wishlist/${user.id}`,
          {
            signal:
              controller.signal,

            timeout: 4000,
          }
        )
        .then((res) => {
          const serverItems =
            Array.isArray(
              res.data
            )
              ? res.data
              : []

          setItems(
            serverItems
          )

          saveToStorage(
            serverItems
          )
        })
        .catch(() => {
          // Keep localStorage items if server is unavailable.
        })
    }

    return () => {
      fetchAbortRef.current?.abort()
    }
  }, [
    isAuthenticated,
    user,
  ])

  useEffect(() => {
    saveToStorage(items)
  }, [items])

  const toggleWishlist =
    async (
      productId: string
    ) => {
      const exists =
        items.some(
          (item) =>
            item.productId ===
            productId
        )

      if (exists) {
        setItems(
          (previous) =>
            previous.filter(
              (item) =>
                item.productId !==
                productId
            )
        )
      } else {
        setItems(
          (previous) => [
            ...previous,
            {
              productId,
            },
          ]
        )
      }

      if (
        isAuthenticated &&
        user
      ) {
        try {
          if (exists) {
            await api.delete(
              `http://localhost:3001/api/products/wishlist/${user.id}/${productId}`,
              {
                timeout:
                  4000,
              }
            )
          } else {
            await api.post(
              'http://localhost:3001/api/products/wishlist',
              {
                userId:
                  user.id,

                productId,
              },
              {
                timeout:
                  4000,
              }
            )
          }
        } catch {
          // Local state already updated.
        }
      }
    }

  const isInWishlist = (
    productId: string
  ) => {
    return items.some(
      (item) =>
        item.productId ===
        productId
    )
  }

  return (
    <WishlistContext.Provider
      value={{
        items,
        toggleWishlist,
        isInWishlist,
      }}
    >
      {children}
    </WishlistContext.Provider>
  )
}

export function useWishlist() {
  const context =
    useContext(
      WishlistContext
    )

  if (
    context === undefined
  ) {
    throw new Error(
      'useWishlist must be used within a WishlistProvider'
    )
  }

  return context
}