import { useState, useRef, type DragEvent, type ChangeEvent } from 'react'
import { cn } from '@/lib/utils'
import { Upload, X, FileText, CheckCircle2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface UploadedFile {
  file: File
  preview?: string
  progress: number
  uploaded: boolean
}

interface UploadZoneProps {
  label: string
  accept?: string
  maxSize?: number
  multiple?: boolean
  onUpload?: (files: File[]) => void
  className?: string
  value?: string
}

export function UploadZone({
  label,
  accept = '.jpg,.jpeg,.png,.pdf',
  maxSize = 5,
  multiple = false,
  onUpload,
  className,
  value,
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [files, setFiles] = useState<UploadedFile[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    handleFiles(droppedFiles)
  }

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(Array.from(e.target.files))
    }
  }

  const handleFiles = (newFiles: File[]) => {
    const validFiles = newFiles.filter((file) => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase()
      const accepted = accept.split(',').map((a) => a.trim().toLowerCase())
      if (!accepted.includes(ext)) return false
      if (file.size > maxSize * 1024 * 1024) return false
      return true
    })

    const processed: UploadedFile[] = validFiles.map((file) => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      progress: 0,
      uploaded: false,
    }))

    processed.forEach((_file, i) => {
      let progress = 0
      const interval = setInterval(() => {
        progress += Math.random() * 30
        if (progress >= 100) {
          progress = 100
          clearInterval(interval)
          setFiles((prev) => {
            const updated = [...prev]
            const idx = updated.length - processed.length + i
            if (updated[idx]) {
              updated[idx] = { ...updated[idx], progress: 100, uploaded: true }
            }
            return updated
          })
        } else {
          setFiles((prev) => {
            const updated = [...prev]
            const idx = updated.length - processed.length + i
            if (updated[idx]) {
              updated[idx] = { ...updated[idx], progress }
            }
            return updated
          })
        }
      }, 200)
    })

    setFiles((prev) => [...prev, ...processed])
    onUpload?.(validFiles)
  }

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const updated = [...prev]
      if (updated[index]?.preview) {
        URL.revokeObjectURL(updated[index].preview!)
      }
      updated.splice(index, 1)
      return updated
    })
  }

  return (
    <div className={cn('space-y-3', className)}>
      <p className="text-sm font-medium text-foreground">{label}</p>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'relative cursor-pointer rounded-[18px] border-2 border-dashed p-10 transition-all duration-200',
          'hover:border-[#F9B000] hover:bg-[#F9B000]/5',
          isDragging
            ? 'border-saffron bg-saffron/10 scale-[1.02]'
            : 'border-border bg-background',
          value && 'border-green-300 bg-green-50/30'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleFileSelect}
          className="hidden"
        />

        {value ? (
          <div className="flex items-center gap-4">
            <CheckCircle2 className="h-8 w-8 text-[#0C831F]" />
            <div>
              <p className="text-sm font-semibold text-[#0C831F]">File uploaded</p>
              <p className="text-xs text-gray-400 mt-0.5">Tap to replace</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <div
              className={cn(
                'w-14 h-14 rounded-full flex items-center justify-center transition-colors',
                isDragging ? 'bg-saffron/20' : 'bg-muted'
              )}
            >
              <Upload
                className={cn(
                  'h-6 w-6 transition-colors',
                  isDragging ? 'text-[#F9B000]' : 'text-gray-400'
                )}
              />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                <span className="text-[#F9B000]">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {accept.replace(/,/g, ', ').toUpperCase()} · Max {maxSize}MB
              </p>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {files.map((file, index) => (
          <motion.div
            key={`${file.file.name}-${index}`}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-4 p-4 rounded-[12px] bg-muted border border-border"
          >
            {file.preview ? (
              <img
                src={file.preview}
                alt={file.file.name}
                className="w-12 h-12 rounded-[10px] object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-[10px] bg-background flex items-center justify-center flex-shrink-0">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {file.file.name}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {(file.file.size / 1024).toFixed(1)} KB
              </p>
              {!file.uploaded && (
                <div className="mt-2 h-[4px] bg-background rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-[#F9B000] rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${file.progress}%` }}
                  />
                </div>
              )}
            </div>
            <button
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation()
                removeFile(index)
              }}
              className="p-1.5 hover:bg-background rounded-lg transition-colors flex-shrink-0"
            >
              <X className="h-4 w-4 text-gray-400" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
