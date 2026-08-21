import {
  useState,
  useEffect,
  type FormEvent,
} from 'react'

import {
  Upload,
  X,
  Loader2,
} from 'lucide-react'

import api, {
  isCancel,
} from '@/lib/api'

import { useAuth } from '@/contexts/AuthContext'

import { useAbortSignal } from '@/hooks/useApiCall'

interface ProductUploadProps {
  onClose: () => void

  onSuccess: () => void
}

export function ProductUpload({
  onClose,
  onSuccess,
}: ProductUploadProps) {
  const { user } =
    useAuth()

  const [
    categories,
    setCategories,
  ] = useState<any[]>([])

  const [
    formData,
    setFormData,
  ] = useState({
    name: '',

    description: '',

    price: '',

    inventory: '1',

    categoryId: '',

    craftType: '',

    tags: '',

    materials: '',

    imageUrl: '',
  })

  const [
    loading,
    setLoading,
  ] = useState(false)

  const [
    error,
    setError,
  ] = useState('')

  const {
    getSignal,
    cancel,
    mountedRef,
  } = useAbortSignal()

  // ----------------------------------------------------------
  // LOAD CATEGORIES
  // ----------------------------------------------------------

  useEffect(() => {
    const loadCategories =
      async () => {
        try {
          const response =
            await api.get(
              'http://localhost:3001/api/products/categories/all',
              {
                signal:
                  getSignal(),
              }
            )

          if (
            mountedRef.current
          ) {
            setCategories(
              response.data
            )
          }
        } catch (
          requestError
        ) {
          if (
            !isCancel(
              requestError
            )
          ) {
            console.error(
              'Failed to load categories',
              requestError
            )
          }
        }
      }

    loadCategories()

    return () => {
      cancel()
    }
  }, [
    getSignal,
    cancel,
    mountedRef,
  ])

  // ----------------------------------------------------------
  // CREATE PRODUCT
  // ----------------------------------------------------------

  const handleSubmit =
    async (
      event: FormEvent
    ) => {
      event.preventDefault()

      if (!user?.id) {
        setError(
          'Seller account is not available.'
        )

        return
      }

      setLoading(true)

      setError('')

      try {
        await api.post(
          'http://localhost:3001/api/seller/products',
          {
            ...formData,

            sellerId:
              user.id,

            price:
              Number(
                formData.price
              ),

            inventory:
              Number(
                formData.inventory
              ),

            tags:
              formData.tags
                .split(',')
                .map((tag) =>
                  tag.trim()
                )
                .filter(Boolean),

            materials:
              formData.materials
                .split(',')
                .map(
                  (material) =>
                    material.trim()
                )
                .filter(Boolean),
          }
        )

        onSuccess()
      } catch (
        requestError: any
      ) {
        setError(
          requestError
            ?.response
            ?.data
            ?.error ||
            'Failed to upload product'
        )
      } finally {
        setLoading(false)
      }
    }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-border shadow-2xl p-6 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-6 right-6 p-2 bg-muted rounded-full hover:bg-muted/80 text-muted-foreground"
          aria-label="Close product upload"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-2xl font-bold font-display mb-6">
          Upload New Product
        </h2>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm">
            {error}
          </div>
        )}

        <form
          onSubmit={
            handleSubmit
          }
          className="space-y-6"
        >
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Product Name
            </label>

            <input
              required
              value={
                formData.name
              }
              onChange={(
                event
              ) =>
                setFormData(
                  {
                    ...formData,

                    name:
                      event
                        .target
                        .value,
                  }
                )
              }
              className="w-full h-12 bg-muted border border-border rounded-xl px-4 focus:ring-1 focus:ring-primary outline-none"
              placeholder="e.g. Handwoven Pashmina Shawl"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Description
            </label>

            <textarea
              required
              value={
                formData.description
              }
              onChange={(
                event
              ) =>
                setFormData(
                  {
                    ...formData,

                    description:
                      event
                        .target
                        .value,
                  }
                )
              }
              className="w-full bg-muted border border-border rounded-xl p-4 focus:ring-1 focus:ring-primary outline-none min-h-[100px]"
              placeholder="Describe your handcrafted product..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Price (₹)
              </label>

              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={
                  formData.price
                }
                onChange={(
                  event
                ) =>
                  setFormData(
                    {
                      ...formData,

                      price:
                        event
                          .target
                          .value,
                    }
                  )
                }
                className="w-full h-12 bg-muted border border-border rounded-xl px-4 focus:ring-1 focus:ring-primary outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Inventory Count
              </label>

              <input
                type="number"
                required
                min="0"
                value={
                  formData.inventory
                }
                onChange={(
                  event
                ) =>
                  setFormData(
                    {
                      ...formData,

                      inventory:
                        event
                          .target
                          .value,
                    }
                  )
                }
                className="w-full h-12 bg-muted border border-border rounded-xl px-4 focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Category
              </label>

              <select
                required
                value={
                  formData.categoryId
                }
                onChange={(
                  event
                ) =>
                  setFormData(
                    {
                      ...formData,

                      categoryId:
                        event
                          .target
                          .value,
                    }
                  )
                }
                className="w-full h-12 bg-muted border border-border rounded-xl px-4 focus:ring-1 focus:ring-primary outline-none"
              >
                <option value="">
                  Select Category
                </option>

                {categories.map(
                  (category) => (
                    <option
                      key={
                        category.id
                      }
                      value={
                        category.id
                      }
                    >
                      {
                        category.name
                      }
                    </option>
                  )
                )}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Craft Type
              </label>

              <input
                value={
                  formData.craftType
                }
                onChange={(
                  event
                ) =>
                  setFormData(
                    {
                      ...formData,

                      craftType:
                        event
                          .target
                          .value,
                    }
                  )
                }
                className="w-full h-12 bg-muted border border-border rounded-xl px-4 focus:ring-1 focus:ring-primary outline-none"
                placeholder="e.g. Blue Pottery, Weaving"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Tags (comma separated)
            </label>

            <input
              value={
                formData.tags
              }
              onChange={(
                event
              ) =>
                setFormData(
                  {
                    ...formData,

                    tags:
                      event
                        .target
                        .value,
                  }
                )
              }
              className="w-full h-12 bg-muted border border-border rounded-xl px-4 focus:ring-1 focus:ring-primary outline-none"
              placeholder="e.g. decor, winter, luxury"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Materials (comma separated)
            </label>

            <input
              value={
                formData.materials
              }
              onChange={(
                event
              ) =>
                setFormData(
                  {
                    ...formData,

                    materials:
                      event
                        .target
                        .value,
                  }
                )
              }
              className="w-full h-12 bg-muted border border-border rounded-xl px-4 focus:ring-1 focus:ring-primary outline-none"
              placeholder="e.g. Ceramic, Wool, Teakwood"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Image URL (Optional)
            </label>

            <input
              value={
                formData.imageUrl
              }
              onChange={(
                event
              ) =>
                setFormData(
                  {
                    ...formData,

                    imageUrl:
                      event
                        .target
                        .value,
                  }
                )
              }
              className="w-full h-12 bg-muted border border-border rounded-xl px-4 focus:ring-1 focus:ring-primary outline-none"
              placeholder="/products/product-vase.jpg"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-primary text-primary-foreground font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Upload className="h-5 w-5" />
            )}

            {loading
              ? 'Publishing...'
              : 'Publish Product'}
          </button>
        </form>
      </div>
    </div>
  )
}