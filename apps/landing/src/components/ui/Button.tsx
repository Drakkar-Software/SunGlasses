import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  href?: string;
  onClick?: () => void;
  className?: string;
  'aria-label'?: string;
  target?: string;
  rel?: string;
}

const variants = {
  primary:   'bg-lens text-lens-fg hover:bg-lens-hover shadow-lg shadow-lens/20 font-semibold',
  secondary: 'border border-border text-foreground hover:border-lens hover:text-lens bg-surface/50',
  ghost:     'text-muted-fg hover:text-foreground hover:bg-surface-2',
};

const sizes = {
  sm: 'px-3.5 py-1.5 text-sm rounded-lg',
  md: 'px-5 py-2.5 text-sm rounded-xl',
  lg: 'px-7 py-3.5 text-base rounded-xl',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  href,
  onClick,
  className = '',
  target,
  rel,
  'aria-label': ariaLabel,
}: Props) {
  const classes = [
    'inline-flex items-center gap-2 transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lens select-none whitespace-nowrap',
    variants[variant],
    sizes[size],
    className,
  ].join(' ');

  if (href) {
    return (
      <a href={href} className={classes} aria-label={ariaLabel} target={target} rel={rel}>
        {children}
      </a>
    );
  }

  return (
    <button type="button" className={classes} onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  );
}
