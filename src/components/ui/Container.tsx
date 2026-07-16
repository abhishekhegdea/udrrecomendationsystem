import { type HTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  as?: 'div' | 'section' | 'article' | 'main' | 'footer' | 'header'
}

const Container = forwardRef<HTMLDivElement, ContainerProps>(
  ({ className, as: Component = 'div', children, ...props }, ref) => (
    <Component
      ref={ref}
      className={cn('container-app w-full', className)}
      {...props}
    >
      {children}
    </Component>
  )
)
Container.displayName = 'Container'

export { Container }
