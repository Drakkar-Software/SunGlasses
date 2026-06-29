interface Props {
  message?: string;
  icon?: React.ReactNode;
}

export function Empty({ message = 'No data for this range.', icon }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-fg">
      {icon ? (
        <span aria-hidden="true" className="text-3xl opacity-40">{icon}</span>
      ) : (
        <svg aria-hidden="true" className="w-8 h-8 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" />
        </svg>
      )}
      <p className="text-sm">{message}</p>
    </div>
  );
}
