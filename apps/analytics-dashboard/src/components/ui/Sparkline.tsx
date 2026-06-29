interface Props {
  data: number[];
  color?: string;
  height?: number;
}

export function Sparkline({ data, color = 'var(--color-primary)', height = 24 }: Props) {
  if (data.length === 0) return <span className="block w-14 h-5" aria-hidden="true" />;

  const max = Math.max(...data, 1);
  return (
    <span
      className="inline-flex items-end gap-px"
      style={{ height }}
      aria-hidden="true"
    >
      {data.map((v, i) => (
        <span
          key={i}
          className="inline-block w-1 rounded-sm opacity-80"
          style={{
            height: `${Math.max(2, Math.round((v / max) * height))}px`,
            backgroundColor: color,
          }}
        />
      ))}
    </span>
  );
}
