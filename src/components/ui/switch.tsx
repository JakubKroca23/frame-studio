import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '../../lib/cn'

export function Switch({ className, ...props }: SwitchPrimitive.SwitchProps) {
  return (
    <SwitchPrimitive.Root className={cn('switch-track', className)} {...props}>
      <SwitchPrimitive.Thumb className="switch-knob" />
    </SwitchPrimitive.Root>
  )
}
