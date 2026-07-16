import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { AlertCircle } from 'lucide-react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="space-y-2">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700"
          >
            {label}
            {props.required && <span className="text-[#C4663A] ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          <input
            id={inputId}
            ref={ref}
            className={cn(
              'w-full rounded-[14px] border-2 border-[#E2DDD5] bg-white px-4 text-sm text-[#111111] placeholder:text-gray-400',
              'h-[52px]',
              'transition-all duration-200',
              'focus:outline-none focus:border-[#F9B000] focus:ring-3 focus:ring-[#F9B000]/10',
              'hover:border-gray-300',
              'disabled:bg-gray-50 disabled:cursor-not-allowed',
              error && 'border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]/10',
              className
            )}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={
              error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
            }
            {...props}
          />
          {error && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <AlertCircle className="h-4 w-4 text-[#EF4444]" />
            </div>
          )}
        </div>
        {error && (
          <p
            id={`${inputId}-error`}
            className="text-xs text-[#EF4444] flex items-center gap-1.5"
            role="alert"
          >
            <AlertCircle className="h-3 w-3 flex-shrink-0" />
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-xs text-gray-400">
            {hint}
          </p>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'

export { Input }
