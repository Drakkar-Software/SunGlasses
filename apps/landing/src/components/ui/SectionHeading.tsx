import type { ReactNode } from 'react';

interface Props {
  eyebrow?: string;
  heading: ReactNode;
  sub?: ReactNode;
  center?: boolean;
  className?: string;
}

export function SectionHeading({ eyebrow, heading, sub, center = false, className = '' }: Props) {
  return (
    <div className={[center ? 'text-center' : '', className].join(' ')}>
      {eyebrow !== undefined && (
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-lens mb-3">
          {eyebrow}
        </p>
      )}
      <h2 className="font-heading text-3xl sm:text-4xl font-bold text-foreground leading-tight tracking-tight">
        {heading}
      </h2>
      {sub !== undefined && (
        <p className="mt-4 text-lg text-muted-fg leading-relaxed max-w-2xl">
          {sub}
        </p>
      )}
    </div>
  );
}
