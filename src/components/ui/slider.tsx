import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '../../lib/cn'

export function Slider({ className, ...props }: SliderPrimitive.SliderProps) {
  return (
    <SliderPrimitive.Root
      className={cn('relative flex w-full touch-none items-center select-none', className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-[#ddd6c8]">
        <SliderPrimitive.Range className="absolute h-full bg-[var(--rust)]" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block size-4 rounded-full border border-[#c4552a] bg-white shadow focus-visible:ring-2 focus-visible:ring-[var(--rust)] outline-none" />
    </SliderPrimitive.Root>
  )
}
