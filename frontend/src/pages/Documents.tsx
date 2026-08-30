import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { UploadZone } from '@/components/ui/upload-zone'
import { DOCUMENT_STATUS } from '@/lib/constants'
import {
  Shield, Car, BanknoteIcon, IdCard, Upload, CheckCircle2,
  Clock, XCircle, ChevronDown, ChevronUp, FileText, Download,
} from 'lucide-react'

const documents = [
  { id: 'aadhaar', title: 'Aadhaar Card', icon: IdCard, status: DOCUMENT_STATUS.aadhaar, number: 'XXXX-XXXX-1234', uploadDate: '12 Jan 2024', preview: null, description: 'Government-issued identity proof' },
  { id: 'pan', title: 'PAN Card', icon: Shield, status: DOCUMENT_STATUS.pan, number: 'ABCDE1234F', uploadDate: '12 Jan 2024', preview: null, description: 'Tax identification document' },
  { id: 'drivingLicense', title: 'Driving License', icon: IdCard, status: DOCUMENT_STATUS.drivingLicense, number: 'HR-2619950001234', uploadDate: '15 Jan 2024', preview: null, description: 'Valid driver authorization' },
  { id: 'bank', title: 'Bank Details', icon: BanknoteIcon, status: DOCUMENT_STATUS.bank, number: 'XXXX-XXXX-4567', uploadDate: '15 Jan 2024', preview: null, description: 'Payment & settlement info' },
  { id: 'vehicle', title: 'Vehicle RC & Insurance', icon: Car, status: DOCUMENT_STATUS.vehicle, number: 'HR-26-AB-1234', uploadDate: '16 Jan 2024', preview: null, description: 'Registration & insurance' },
]

const statusConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; variant: 'success' | 'warning' | 'error'; bg: string; text: string }> = {
  Verified: { icon: CheckCircle2, variant: 'success', bg: 'bg-green-50', text: 'text-[#0C831F]' },
  Pending: { icon: Clock, variant: 'warning', bg: 'bg-amber-50', text: 'text-[#F59E0B]' },
  Rejected: { icon: XCircle, variant: 'error', bg: 'bg-red-50', text: 'text-[#EF4444]' },
}

export function DocumentsPage() {
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState<string | null>(null)

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } }
  const variantItem = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h2 className="display-2 text-foreground">My Documents</h2>
        <p className="text-gray-500 mt-2 body-lg">Manage and track your verification documents. Keep them up to date for uninterrupted partnership.</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {Object.entries(statusConfig).map(([key, config]) => {
          const count = documents.filter((d) => d.status === key).length
          const Icon = config.icon
          return (
            <Card key={key} className="hover:shadow-lg hover:border-[#F9B000]/20 transition-all">
              <CardContent className="p-5 text-center">
                <div className={`w-10 h-10 rounded-[12px] ${config.bg} flex items-center justify-center mx-auto mb-3`}>
                  <Icon className={`h-5 w-5 ${config.text}`} />
                </div>
                <p className="text-xl font-bold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>{count}</p>
                <p className="text-xs text-gray-500 mt-1 capitalize font-medium">{key}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Document Cards */}
      <div className="space-y-4">
        {documents.map((doc) => {
          const isExpanded = expandedDoc === doc.id
          const isUploading = showUpload === doc.id
          const StatusIcon = statusConfig[doc.status]?.icon || CheckCircle2

          return (
            <motion.div key={doc.id} variants={variantItem}>
              <Card className={`overflow-hidden hover:shadow-lg transition-all duration-300 ${doc.status === 'Pending' ? 'border-[#F59E0B]/30' : ''}`}>
                <div className="p-6 lg:p-8 flex items-center justify-between cursor-pointer hover:bg-[#FAF8F5] transition-colors"
                  onClick={() => setExpandedDoc(isExpanded ? null : doc.id)}>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-[14px] bg-gradient-to-br from-[#FAF8F5] to-white border border-[#E2DDD5] flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                      <doc.icon className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-foreground">{doc.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{doc.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-gray-400">
                      <Clock className="h-3 w-3" /> {doc.uploadDate}
                    </div>
                    <Badge variant={statusConfig[doc.status]?.variant || 'default'} size="sm" dot>{doc.status}</Badge>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 lg:px-8 pb-6 lg:pb-8 border-t border-[#E2DDD5] pt-5 space-y-5">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="p-4 rounded-[14px] bg-[#FAF8F5]">
                            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Document Number</p>
                            <p className="text-sm font-bold text-[#111111] mt-1" style={{ fontFamily: 'var(--font-display)' }}>{doc.number}</p>
                          </div>
                          <div className="p-4 rounded-[14px] bg-[#FAF8F5]">
                            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Upload Date</p>
                            <p className="text-sm font-bold text-[#111111] mt-1" style={{ fontFamily: 'var(--font-display)' }}>{doc.uploadDate}</p>
                          </div>
                          <div className="p-4 rounded-[14px] bg-[#FAF8F5]">
                            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Status</p>
                            <div className="flex items-center gap-2 mt-1">
                              <StatusIcon className={`h-4 w-4 ${statusConfig[doc.status]?.text || 'text-gray-400'}`} />
                              <p className="text-sm font-bold text-[#111111]" style={{ fontFamily: 'var(--font-display)' }}>{doc.status}</p>
                            </div>
                          </div>
                        </div>

                        <div className="w-full aspect-video bg-gradient-to-br from-[#FAF8F5] to-[#F0EDE8] rounded-[24px] flex items-center justify-center border border-[#E2DDD5] group cursor-pointer hover:border-[#F9B000]/30 transition-all">
                          <div className="text-center">
                            <FileText className="h-12 w-12 text-gray-300 group-hover:text-gray-400 mx-auto mb-3 transition-colors" />
                            <p className="text-sm text-gray-400 font-medium">Click to preview document</p>
                            <p className="text-xs text-gray-300 mt-1">PDF, JPG or PNG format</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          {isUploading ? (
                            <div className="w-full space-y-3">
                              <UploadZone label={`Replace ${doc.title}`} onUpload={() => setShowUpload(null)} />
                              <Button variant="outline" size="sm" onClick={() => setShowUpload(null)}>Cancel</Button>
                            </div>
                          ) : (
                            <>
                              <Button variant="outline" size="md" onClick={() => setShowUpload(doc.id)}>
                                <Upload className="h-4 w-4" /> Replace Document
                              </Button>
                              <Button variant="ghost" size="md">
                                <Download className="h-4 w-4" /> Download
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}
