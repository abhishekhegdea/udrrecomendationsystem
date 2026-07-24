import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2.5 font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none select-none cursor-pointer',
  {
    variants: {
      variant: {
        primary:
          'bg-[#111111] text-white hover:bg-gray-800 active:bg-black focus:ring-[#111111]/30 shadow-sm hover:shadow-md',
        secondary:
          'bg-[#F9B000] text-[#111111] hover:bg-[#E09E00] active:bg-[#D09400] focus:ring-[#F9B000]/40 shadow-sm hover:shadow-md',
        outline:
          'border-2 border-[#E2DDD5] bg-white text-[#111111] hover:border-[#111111] hover:bg-[#FAF8F5] focus:ring-[#E2DDD5]/30',
        ghost:
          'text-gray-500 hover:text-[#111111] hover:bg-[#FAF8F5] focus:ring-gray-200/30',
        link:
          'text-[#F9B000] underline-offset-4 hover:underline p-0 h-auto',
        destructive:
          'bg-[#EF4444] text-white hover:bg-red-600 focus:ring-red-500/30 shadow-sm',
      },
      size: {
        sm: 'h-10 px-5 text-sm rounded-xl',
        md: 'h-[52px] px-7 text-base rounded-[16px]',
        lg: 'h-14 px-9 text-base rounded-[16px]',
        xl: 'h-16 px-11 text-lg rounded-[16px]',
        icon: 'h-[52px] w-[52px] rounded-[16px]',
      },
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, loading, disabled, children, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, fullWidth, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="h-5 w-5 animate-spin" />}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
