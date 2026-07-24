import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ReactNode } from 'react'

interface Step {
  title: string
  description?: string
}

interface ProgressStepperProps {
  steps: Step[]
  currentStep: number
  className?: string
}

export function ProgressStepper({ steps, currentStep, className }: ProgressStepperProps) {
  const progress = steps.length > 1 ? (currentStep / (steps.length - 1)) * 100 : 0

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-gray-500">
          Step {currentStep + 1} of {steps.length}
        </span>
        <span className="text-sm font-semibold text-[#F9B000]">
          {Math.round(progress)}% Complete
        </span>
      </div>

      {/* Progress Bar */}
      <div className="relative h-[6px] bg-gray-100 rounded-full overflow-hidden mb-8">
        <motion.div
          className="absolute inset-y-0 left-0 bg-[#F9B000] rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* Step Indicators */}
      <div className="hidden sm:flex items-start justify-between mb-8">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep
          const isCurrent = index === currentStep
          const isUpcoming = index > currentStep

          return (
            <div key={index} className="flex flex-col items-center relative flex-1">
              <div className="flex items-center justify-center w-full">
                <motion.div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all duration-300 z-10',
                    isCompleted && 'bg-[#F9B000] border-[#F9B000] text-[#111111]',
                    isCurrent && 'border-[#F9B000] bg-[#F9B000]/10 text-[#F9B000]',
                    isUpcoming && 'border-[#EAEAEA] bg-white text-gray-400'
                  )}
                  animate={{ scale: isCurrent ? 1.1 : 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </motion.div>
              </div>
              <div className="mt-3 text-center max-w-[120px]">
                <p
                  className={cn(
                    'text-xs font-semibold transition-colors',
                    isCompleted && 'text-[#F9B000]',
                    isCurrent && 'text-[#111111]',
                    isUpcoming && 'text-gray-400'
                  )}
                >
                  {step.title}
                </p>
                {step.description && (
                  <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed hidden md:block">
                    {step.description}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface StepContainerProps {
  children: ReactNode
  isActive: boolean
}

export function StepContainer({ children, isActive }: StepContainerProps) {
  return (
    <AnimatePresence mode="wait">
      {isActive && (
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
