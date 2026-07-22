// Tailwind v4 safelist — scanned by Tailwind to detect class names used
// inside Angular component inline templates (backtick strings in .ts files).
// All layout and utility classes used across the execution-ui app are listed here.

export const _ = [
  // spacing
  'h-2', 'h-3', 'h-3.5', 'h-4', 'h-5', 'h-6', 'h-8', 'h-10', 'h-12',
  'w-2', 'w-3', 'w-3.5', 'w-4', 'w-5', 'w-6', 'w-8', 'w-10', 'w-12',
  'w-full', 'h-full',
  'max-w-lg', 'max-h-80', 'max-h-48',

  // layout
  'flex', 'inline-flex', 'flex-col', 'flex-1', 'flex-shrink-0', 'shrink-0',
  'items-center', 'items-start', 'items-end', 'items-baseline',
  'justify-between', 'justify-center', 'justify-end',
  'grid', 'grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4',
  'md:grid-cols-2', 'md:grid-cols-4', 'md:grid-cols-3', 'lg:grid-cols-3',

  // gap / space
  'gap-1', 'gap-1.5', 'gap-2', 'gap-3', 'gap-4', 'gap-6',
  'space-y-1', 'space-y-3', 'space-y-4', 'space-y-6',

  // padding
  'p-2', 'p-3', 'p-4', 'p-6', 'p-8',
  'px-2', 'px-2.5', 'px-3', 'px-4', 'px-6',
  'py-1', 'py-1.5', 'py-2', 'py-4', 'py-8', 'py-12',
  'pt-2', 'pb-2', 'pb-3',

  // margin
  'm-0', 'mx-auto', 'ml-1', 'ml-2', 'ml-4', 'mr-1', 'mb-1', 'mb-2', 'mb-3',

  // text
  'text-xs', 'text-sm', 'text-lg', 'text-xl', 'text-2xl',
  'text-[10px]', 'text-[11px]',
  'font-medium', 'font-semibold', 'font-bold', 'font-mono', 'font-normal',
  'text-left', 'text-right', 'text-center',
  'truncate', 'uppercase', 'tracking-wide', 'tracking-tight',
  'whitespace-nowrap',

  // color (text & bg)
  'text-green-500', 'text-green-600', 'text-red-500', 'text-red-400',
  'text-gray-500', 'text-yellow-600',
  'bg-green-500/10', 'bg-red-500/10', 'bg-yellow-500/10',
  'bg-green-500/[0.03]', 'bg-red-500/[0.03]',
  'bg-steel-900', 'dark:bg-steel-900',

  // border & rounded
  'rounded', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-full',
  'border', 'border-b', 'border-t', 'border-l', 'border-l-0', 'border-r',
  'border-green-500/20', 'border-red-500/20', 'border-yellow-500/20',
  'ring-2', 'ring-green-500', 'ring-red-500',

  // cursor & interaction
  'cursor-pointer', 'group',
  'transition-colors', 'transition-all', 'transition-opacity',
  'hover:shadow-md', 'hover:opacity-90', 'hover:bg-[rgb(var(--color-surface-hover))]',

  // sizing
  'min-w-0', 'min-h-[1.5rem]',
  'overflow-auto', 'overflow-hidden',

  // animation
  'animate-spin', 'animate-ping', 'animate-pulse',

  // position
  'relative', 'absolute', 'inline-block',

  // misc
  'opacity-75', 'opacity-30', 'opacity-40',
  'max-w-[200px]', 'max-w-[180px]',
  'col-span-full',
];
