import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  color?: 'lens' | 'glare' | 'success' | 'muted';
  className?: string;
}

const colors = {
  lens:    'bg-lens-dim text-lens border-lens/20',
  glare:   'bg-glare-dim text-glare border-glare/20',
  success: 'bg-success/10 text-success border-success/20',
  muted:   'bg-surface-2 text-muted-fg border-border',
};

export function Chip({ children, color = 'muted', className = '' }: Props) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded-full border',
        colors[color],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  );
}
