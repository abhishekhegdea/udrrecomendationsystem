import { type HTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { Container } from './Container'

interface SectionProps extends HTMLAttributes<HTMLElement> {
  containerClassName?: string
  variant?: 'default' | 'muted'
}

const Section = forwardRef<HTMLElement, SectionProps>(
  ({ className, containerClassName, variant = 'default', children, ...props }, ref) => (
    <section
      ref={ref}
      className={cn(
        'py-16 md:py-20 lg:py-24',
        variant === 'muted' && 'bg-section-bg',
        className
      )}
      {...props}
    >
      <Container className={containerClassName}>{children}</Container>
    </section>
  )
)
Section.displayName = 'Section'

export { Section }
