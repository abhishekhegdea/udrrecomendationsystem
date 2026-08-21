import {
  useState,
  useEffect,
} from 'react'

import {
  motion,
  AnimatePresence,
} from 'framer-motion'

import {
  User,
  Truck,
  ShoppingBag,
  Mail,
  Phone,
  Calendar,
  Search,
  MapPin,
  Building2,
  Star,
} from 'lucide-react'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { Badge } from '@/components/ui/badge'

import api, {
  isCancel,
} from '@/lib/api'

import { useAbortSignal } from '@/hooks/useApiCall'

const container = {
  hidden: {
    opacity: 0,
  },

  show: {
    opacity: 1,

    transition: {
      staggerChildren:
        0.08,
    },
  },
}

const item = {
  hidden: {
    opacity: 0,
    y: 16,
  },

  show: {
    opacity: 1,
    y: 0,
  },
}

type TabType =
  | 'BUYERS'
  | 'SELLERS'
  | 'PARTNERS'

export function AdminProfile() {
  const [
    activeTab,
    setActiveTab,
  ] =
    useState<TabType>(
      'BUYERS'
    )

  const [
    users,
    setUsers,
  ] = useState<any[]>([])

  const [
    sellers,
    setSellers,
  ] = useState<any[]>([])

  const [
    partners,
    setPartners,
  ] = useState<any[]>([])

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    searchQuery,
    setSearchQuery,
  ] = useState('')

  const {
    getSignal,
    cancel,
    mountedRef,
  } = useAbortSignal()

  // ----------------------------------------------------------
  // LOAD ALL DIRECTORY DATA
  // ----------------------------------------------------------

  useEffect(() => {
    const fetchData =
      async () => {
        try {
          /*
           * IMPORTANT:
           *
           * Create ONE signal for all three parallel requests.
           *
           * Calling getSignal() separately for every request would
           * abort the previously-created controller.
           */
          const signal =
            getSignal()

          const [
            usersResponse,
            sellersResponse,
            partnersResponse,
          ] =
            await Promise.all(
              [
                api.get(
                  'http://localhost:3001/api/admin/users',
                  {
                    signal,
                  }
                ),

                api.get(
                  'http://localhost:3001/api/admin/sellers',
                  {
                    signal,
                  }
                ),

                api.get(
                  'http://localhost:3001/api/admin/partners',
                  {
                    signal,
                  }
                ),
              ]
            )

          if (
            !mountedRef.current
          ) {
            return
          }

          setUsers(
            Array.isArray(
              usersResponse.data
            )
              ? usersResponse.data
              : []
          )

          setSellers(
            Array.isArray(
              sellersResponse.data
            )
              ? sellersResponse.data
              : []
          )

          setPartners(
            Array.isArray(
              partnersResponse.data
            )
              ? partnersResponse.data
              : []
          )
        } catch (error) {
          if (
            !isCancel(error) &&
            mountedRef.current
          ) {
            console.error(
              'Failed to load directory data',
              error
            )
          }
        } finally {
          if (
            mountedRef.current
          ) {
            setLoading(false)
          }
        }
      }

    fetchData()

    return () => {
      cancel()
    }
  }, [
    getSignal,
    cancel,
    mountedRef,
  ])

  const tabs = [
    {
      id: 'BUYERS',

      label: 'Shoppers',

      icon: User,

      count:
        users.length,

      color:
        'bg-primary',
    },

    {
      id: 'SELLERS',

      label: 'Artisans',

      icon:
        ShoppingBag,

      count:
        sellers.length,

      color:
        'bg-accent',
    },

    {
      id: 'PARTNERS',

      label: 'Delivery',

      icon: Truck,

      count:
        partners.length,

      color:
        'bg-saffron',
    },
  ] as const

  const getFilteredData =
    () => {
      let data: any[] =
        []

      if (
        activeTab ===
        'BUYERS'
      ) {
        data = users
      }

      if (
        activeTab ===
        'SELLERS'
      ) {
        data = sellers
      }

      if (
        activeTab ===
        'PARTNERS'
      ) {
        data = partners
      }

      if (
        !searchQuery.trim()
      ) {
        return data
      }

      const query =
        searchQuery
          .toLowerCase()
          .trim()

      return data.filter(
        (entry) => {
          return (
            entry.firstName
              ?.toLowerCase()
              .includes(
                query
              ) ||
            entry.lastName
              ?.toLowerCase()
              .includes(
                query
              ) ||
            entry.email
              ?.toLowerCase()
              .includes(
                query
              ) ||
            entry.phone?.includes(
              query
            ) ||
            entry.businessName
              ?.toLowerCase()
              .includes(
                query
              )
          )
        }
      )
    }

  const filteredData =
    getFilteredData()

  const refreshCurrentTab =
    async () => {
      try {
        if (
          activeTab ===
          'SELLERS'
        ) {
          const response =
            await api.get(
              'http://localhost:3001/api/admin/sellers'
            )

          setSellers(
            response.data
          )
        }

        if (
          activeTab ===
          'PARTNERS'
        ) {
          const response =
            await api.get(
              'http://localhost:3001/api/admin/partners'
            )

          setPartners(
            response.data
          )
        }
      } catch (error) {
        console.error(
          'Failed to refresh directory',
          error
        )
      }
    }

  const approvePerson =
    async (
      person: any
    ) => {
      try {
        const endpoint =
          activeTab ===
          'SELLERS'
            ? 'approve-seller'
            : 'approve-partner'

        await api.put(
          `http://localhost:3001/api/admin/${endpoint}/${person.id}`
        )

        await refreshCurrentTab()
      } catch (error) {
        console.error(
          'Failed to approve',
          error
        )
      }
    }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8 pb-10"
    >
      {/* Header */}

      <motion.div
        variants={item}
      >
        <Card className="bg-gradient-to-br from-forest to-forest/90 text-primary-foreground border-0 overflow-hidden relative shadow-xl">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/10 rounded-full blur-3xl -mr-40 -mt-40" />

          <CardContent className="p-8 lg:p-10 relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <h2 className="text-[32px] font-bold leading-tight font-display mb-2">
                Master
                Directory
              </h2>

              <p className="text-white/80 font-medium">
                Manage all
                platform
                participants
                across
                UdrCrafts.
              </p>
            </div>

            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/50" />

              <input
                type="text"
                placeholder="Search by name, email, phone..."
                value={
                  searchQuery
                }
                onChange={(
                  event
                ) =>
                  setSearchQuery(
                    event.target
                      .value
                  )
                }
                className="w-full h-12 bg-white/10 border border-white/20 rounded-2xl pl-12 pr-4 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/30 backdrop-blur-sm transition-all"
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Tabs */}

      <motion.div
        variants={item}
        className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide"
      >
        {tabs.map(
          (tab) => {
            const isActive =
              activeTab ===
              tab.id

            return (
              <button
                type="button"
                key={tab.id}
                onClick={() =>
                  setActiveTab(
                    tab.id
                  )
                }
                className={`flex items-center gap-3 px-6 py-4 rounded-2xl transition-all font-semibold ${
                  isActive
                    ? 'bg-card text-foreground shadow-sm border border-border'
                    : 'bg-transparent text-muted-foreground hover:bg-muted/50 border border-transparent'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${tab.color} ${
                    isActive
                      ? 'opacity-100'
                      : 'opacity-70'
                  }`}
                >
                  <tab.icon className="h-4 w-4" />
                </div>

                {tab.label}

                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    isActive
                      ? 'bg-muted text-foreground'
                      : 'bg-muted/50 text-muted-foreground'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            )
          }
        )}
      </motion.div>

      {/* Directory */}

      <motion.div
        variants={item}
      >
        <Card className="border-border">
          <CardHeader className="border-b border-border bg-muted/20">
            <CardTitle className="text-foreground">
              {activeTab ===
                'BUYERS' &&
                'Registered Shoppers'}

              {activeTab ===
                'SELLERS' &&
                'Approved Artisans'}

              {activeTab ===
                'PARTNERS' &&
                'Delivery Fleet'}
            </CardTitle>
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />

                Loading
                directory
                data...
              </div>
            ) : filteredData.length ===
              0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <Search className="h-10 w-10 mx-auto mb-3 opacity-20" />

                No results
                found matching
                "
                {searchQuery}
                "
              </div>
            ) : (
              <div className="divide-y divide-border">
                <AnimatePresence mode="popLayout">
                  {filteredData.map(
                    (
                      person
                    ) => (
                      <motion.div
                        key={
                          person.id
                        }
                        layout
                        initial={{
                          opacity:
                            0,

                          filter:
                            'blur(4px)',
                        }}
                        animate={{
                          opacity:
                            1,

                          filter:
                            'blur(0px)',
                        }}
                        exit={{
                          opacity:
                            0,

                          filter:
                            'blur(4px)',
                        }}
                        className="p-6 hover:bg-muted/30 transition-colors flex flex-col md:flex-row gap-6 md:items-center justify-between"
                      >
                        <div className="flex items-center gap-5">
                          <div className="w-14 h-14 rounded-full bg-muted border border-border flex items-center justify-center text-xl font-bold text-muted-foreground shrink-0 overflow-hidden">
                            {person.profileImage ? (
                              <img
                                src={
                                  person.profileImage
                                }
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              person.firstName?.charAt(
                                0
                              ) || (
                                <User className="h-6 w-6" />
                              )
                            )}
                          </div>

                          <div>
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h3 className="font-bold text-foreground text-lg">
                                {
                                  person.firstName
                                }{' '}
                                {
                                  person.lastName
                                }
                              </h3>

                              {activeTab ===
                                'SELLERS' && (
                                <Badge
                                  variant={
                                    person.status ===
                                    'VERIFIED'
                                      ? 'success'
                                      : 'warning'
                                  }
                                  className="border-none"
                                >
                                  {
                                    person.status
                                  }
                                </Badge>
                              )}

                              {activeTab ===
                                'PARTNERS' && (
                                <Badge
                                  variant={
                                    person.status ===
                                    'Available'
                                      ? 'success'
                                      : 'secondary'
                                  }
                                  className="border-none"
                                >
                                  {person.status ||
                                    'Active'}
                                </Badge>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1.5">
                                <Mail className="h-3.5 w-3.5" />

                                {
                                  person.email
                                }
                              </span>

                              {person.phone && (
                                <span className="flex items-center gap-1.5">
                                  <Phone className="h-3.5 w-3.5" />

                                  {
                                    person.phone
                                  }
                                </span>
                              )}

                              {activeTab ===
                                'SELLERS' &&
                                person.businessName && (
                                  <span className="flex items-center gap-1.5">
                                    <Building2 className="h-3.5 w-3.5" />

                                    {
                                      person.businessName
                                    }
                                  </span>
                                )}

                              {activeTab ===
                                'PARTNERS' &&
                                person.partnerId && (
                                  <span className="flex items-center gap-1.5">
                                    <MapPin className="h-3.5 w-3.5" />

                                    ID:{' '}
                                    {
                                      person.partnerId
                                    }
                                  </span>
                                )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-6 text-sm">
                          {(activeTab ===
                            'SELLERS' ||
                            activeTab ===
                              'PARTNERS') && (
                            <div className="text-right flex items-center gap-4">
                              {(person.status ===
                                'PENDING' ||
                                person.status ===
                                  'Pending') && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    approvePerson(
                                      person
                                    )
                                  }
                                  className="px-3 py-1.5 bg-forest text-white text-xs font-bold rounded-lg hover:bg-forest/90 transition-colors"
                                >
                                  Approve
                                </button>
                              )}

                              <div>
                                <p className="text-muted-foreground text-xs uppercase font-bold tracking-wider mb-1">
                                  Rating
                                </p>

                                <p className="font-bold flex items-center justify-end gap-1 text-foreground">
                                  <Star className="h-4 w-4 fill-saffron text-saffron" />

                                  {person.rating ||
                                    '5.0'}
                                </p>
                              </div>
                            </div>
                          )}

                          <div className="text-right">
                            <p className="text-muted-foreground text-xs uppercase font-bold tracking-wider mb-1">
                              Joined
                            </p>

                            <p className="font-medium text-foreground flex items-center justify-end gap-1.5">
                              <Calendar className="h-3.5 w-3.5" />

                              {person.createdAt ||
                              person.dateJoined
                                ? new Date(
                                    person.createdAt ||
                                      person.dateJoined
                                  ).toLocaleDateString()
                                : 'N/A'}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    )
                  )}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}