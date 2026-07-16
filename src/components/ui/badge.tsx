import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full font-medium transition-all duration-200',
  {
    variants: {
      variant: {
        default: 'bg-[#F0EDE8] text-gray-700',
        primary: 'bg-[#F9B000]/15 text-[#8B6914]',
        success: 'bg-green-50 text-[#0C831F]',
        warning: 'bg-amber-50 text-[#F59E0B]',
        error: 'bg-red-50 text-[#EF4444]',
        info: 'bg-blue-50 text-[#3B82F6]',
        warm: 'bg-[#F5E6D0] text-[#8B6914]',
      },
      size: {
        sm: 'px-2.5 py-0.5 text-[11px]',
        md: 'px-3.5 py-1 text-[12px]',
        lg: 'px-4 py-1.5 text-[13px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean
}

function Badge({ className, variant, size, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {dot && (
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            variant === 'success' && 'bg-[#0C831F]',
            variant === 'warning' && 'bg-[#F59E0B]',
            variant === 'error' && 'bg-[#EF4444]',
            variant === 'primary' && 'bg-[#F9B000]',
            variant === 'warm' && 'bg-[#8B6914]',
            variant === 'info' && 'bg-[#3B82F6]',
            variant === 'default' && 'bg-gray-400',
            !variant && 'bg-gray-400'
          )}
        />
      )}
      {children}
    </span>
  )
}

export { Badge, badgeVariants }
