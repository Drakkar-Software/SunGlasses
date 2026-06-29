import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  id?: string;
}

/**
 * The signature "lens" element: a frosted glass card.
 * Reused across feature grid, pipeline steps, package cards, etc.
 */
export function GlassCard({ children, className = '', id }: Props) {
  return (
    <div
      id={id}
      className={[
        'glass rounded-2xl p-6',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}
