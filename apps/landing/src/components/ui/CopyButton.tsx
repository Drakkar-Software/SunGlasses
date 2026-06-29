import { useEffect, useState } from 'react';

interface Props {
  text: string;
  className?: string;
}

export function CopyButton({ text, className = '' }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      /* clipboard unavailable — fail silently */
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied!' : 'Copy to clipboard'}
      className={[
        'flex items-center justify-center w-7 h-7 rounded-md transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lens',
        copied
          ? 'text-success bg-success/10'
          : 'text-muted-fg hover:text-foreground hover:bg-surface-2',
        className,
      ].join(' ')}
    >
      {copied ? (
        /* Checkmark */
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.5 12.75 10.5 18.75 19.5 5.25" />
        </svg>
      ) : (
        /* Clipboard */
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
        </svg>
      )}
    </button>
  );
}
