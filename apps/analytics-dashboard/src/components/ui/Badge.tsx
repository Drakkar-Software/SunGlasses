interface Props {
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'muted';
  children: React.ReactNode;
}

const classes: Record<NonNullable<Props['variant']>, string> = {
  default:     'bg-primary/10 text-primary',
  success:     'bg-success/10 text-success',
  warning:     'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
  muted:       'bg-muted text-muted-fg',
};

export function Badge({ variant = 'default', children }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-medium tabular ${classes[variant]}`}
    >
      {children}
    </span>
  );
}
