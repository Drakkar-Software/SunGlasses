import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type {
  DateRangeParams,
  ErrorGroupRow,
  ErrorDetailData,
  ErrorSample,
} from '../../api';
import {
  fetchErrorGroups,
  fetchErrorDetail,
  relativeTime,
} from '../../api';
import { useChartTheme } from '../../hooks/useChartTheme';
import { Badge } from '../ui/Badge';
import { Empty } from '../ui/Empty';
import { Sparkline } from '../ui/Sparkline';

interface Props {
  range: DateRangeParams;
}

// ── Error group list ──────────────────────────────────────────────────────────

interface ErrorGroupListProps {
  range: DateRangeParams;
  onSelect: (g: ErrorGroupRow) => void;
  selected: ErrorGroupRow | null;
}

function ErrorGroupList({ range, onSelect, selected }: ErrorGroupListProps) {
  const [groups, setGroups]          = useState<ErrorGroupRow[]>([]);
  const [isPending, startTransition] = useTransition();
  const [level, setLevel]            = useState('');
  const [handled, setHandled]        = useState('');

  const load = useCallback(async () => {
    const params: Parameters<typeof fetchErrorGroups>[0] = { ...range };
    if (level)   params.level   = level;
    if (handled === 'true')  params.handled = true;
    if (handled === 'false') params.handled = false;
    const data = await fetchErrorGroups(params);
    startTransition(() => setGroups(data));
  }, [range, level, handled]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="flex flex-col">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 px-5 py-3 border-b border-border">
        <select
          aria-label="Filter by level"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <option value="">All levels</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
          <option value="fatal">Fatal</option>
        </select>
        <select
          aria-label="Filter by handled status"
          value={handled}
          onChange={(e) => setHandled(e.target.value)}
          className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <option value="">All</option>
          <option value="true">Handled</option>
          <option value="false">Unhandled</option>
        </select>
      </div>

      {isPending && groups.length === 0 ? (
        <div className="p-4 space-y-3">
          {[1,2,3].map((i) => <div key={i} className="skeleton h-16 rounded" />)}
        </div>
      ) : groups.length === 0 ? (
        <Empty message="No errors recorded in this range." />
      ) : (
        <ul role="list">
          {groups.map((g, i) => (
            <ErrorGroupItem
              key={i}
              group={g}
              selected={
                selected?.error_type === g.error_type &&
                selected?.message === g.message
              }
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function levelVariant(level: string | null): 'destructive' | 'warning' | 'muted' {
  if (level === 'fatal' || level === 'error') return 'destructive';
  if (level === 'warning')                    return 'warning';
  return 'muted';
}

function ErrorGroupItem({
  group,
  selected,
  onSelect,
}: {
  group: ErrorGroupRow;
  selected: boolean;
  onSelect: (g: ErrorGroupRow) => void;
}) {
  return (
    <li
      onClick={() => onSelect(group)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(group); }}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      className={`
        flex gap-4 px-5 py-4 border-b border-border/60 last:border-0
        cursor-pointer transition-colors duration-75
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-[-2px]
        ${selected ? 'bg-primary/5' : 'hover:bg-muted/60'}
      `}
    >
      {/* Severity dot */}
      <span
        aria-hidden="true"
        className={`mt-1 shrink-0 w-2 h-2 rounded-full ${
          group.level === 'fatal'   ? 'bg-destructive' :
          group.level === 'error'   ? 'bg-destructive/70' :
          group.level === 'warning' ? 'bg-warning' :
          'bg-muted-fg/40'
        }`}
      />

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-foreground truncate max-w-[300px]">
            {group.error_type ?? '(unknown type)'}
          </span>
          {group.level ? <Badge variant={levelVariant(group.level)}>{group.level}</Badge> : null}
          {group.handled === 'false' ? <Badge variant="destructive">unhandled</Badge> : null}
          {group.handled === 'true'  ? <Badge variant="muted">handled</Badge>         : null}
        </div>
        <p className="text-xs text-muted-fg mt-0.5 line-clamp-1">
          {group.message ?? '—'}
        </p>
        <p className="text-[0.6875rem] text-muted-fg mt-1">
          Last seen {relativeTime(group.last_seen ?? '')}
          {group.first_seen !== group.last_seen ? ` · first ${relativeTime(group.first_seen ?? '')}` : ''}
        </p>
      </div>

      <div className="shrink-0 text-right flex flex-col items-end gap-1">
        <span className="text-sm font-bold tabular text-foreground">
          {group.occurrences.toLocaleString()}
        </span>
        <span className="text-[0.6875rem] text-muted-fg">
          {group.affected_devices.toLocaleString()} device{group.affected_devices !== 1 ? 's' : ''}
        </span>
        <Sparkline data={[]} />
      </div>
    </li>
  );
}

// ── Error sample card ─────────────────────────────────────────────────────────

function ErrorSampleCard({ sample }: { sample: ErrorSample }) {
  const hasSomething = sample.stack || sample.component_stack || sample.cause;
  if (!hasSomething) return null;

  return (
    <div className="rounded-xl border border-border bg-muted/40 overflow-hidden">
      {/* Meta row */}
      {(sample.source || sample.fatal != null) && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border/60 bg-card/60">
          {sample.source && (
            <Badge variant="muted">{sample.source}</Badge>
          )}
          {sample.fatal === true && (
            <Badge variant="destructive">fatal</Badge>
          )}
        </div>
      )}

      {/* Stack trace */}
      {sample.stack && (
        <div className="p-4">
          <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-fg mb-1.5">Stack</p>
          <pre className="text-[0.6875rem] font-mono text-foreground overflow-x-auto whitespace-pre-wrap break-all">
            {sample.stack}
          </pre>
        </div>
      )}

      {/* Component stack */}
      {sample.component_stack && (
        <div className={`p-4 ${sample.stack ? 'border-t border-border/60' : ''}`}>
          <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-fg mb-1.5">Component stack</p>
          <pre className="text-[0.6875rem] font-mono text-foreground overflow-x-auto whitespace-pre-wrap break-all">
            {sample.component_stack}
          </pre>
        </div>
      )}

      {/* Cause chain */}
      {sample.cause && (
        <div className={`p-4 ${(sample.stack || sample.component_stack) ? 'border-t border-border/60' : ''}`}>
          <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-fg mb-1.5">Cause chain</p>
          <pre className="text-[0.6875rem] font-mono text-foreground overflow-x-auto whitespace-pre-wrap break-all">
            {sample.cause}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Error detail ──────────────────────────────────────────────────────────────

interface ErrorDetailProps {
  group: ErrorGroupRow;
  range: DateRangeParams;
  onClose: () => void;
}

function ErrorDetail({ group, range, onClose }: ErrorDetailProps) {
  const [detail, setDetail]          = useState<ErrorDetailData | null>(null);
  const [isPending, startTransition] = useTransition();
  const t                            = useChartTheme();
  const closeRef                     = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const load = useCallback(async () => {
    const data = await fetchErrorDetail({
      ...range,
      error_type:    group.error_type ?? undefined,
      error_message: group.message    ?? undefined,
    });
    startTransition(() => setDetail(data));
  }, [range, group.error_type, group.message]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div
      className="flex flex-col h-full overflow-y-auto"
      role="region"
      aria-label="Error detail"
    >
      {/* Header */}
      <div className="flex items-start gap-3 px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
        <button
          ref={closeRef}
          type="button"
          aria-label="Close detail"
          onClick={onClose}
          className="shrink-0 mt-0.5 p-1 rounded-lg text-muted-fg hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-bold text-foreground">{group.error_type ?? '(unknown type)'}</p>
            {group.level   ? <Badge variant={levelVariant(group.level)}>{group.level}</Badge> : null}
            {group.handled === 'false' ? <Badge variant="destructive">unhandled</Badge> : null}
            {group.handled === 'true'  ? <Badge variant="muted">handled</Badge>         : null}
            {detail?.samples.some((s) => s.fatal === true)  ? <Badge variant="destructive">fatal</Badge>  : null}
            {detail?.samples.some((s) => s.source != null)  ? <Badge variant="muted">{detail!.samples.find((s) => s.source != null)!.source!}</Badge> : null}
          </div>
          <p className="text-xs text-muted-fg mt-1 break-words">{group.message ?? '—'}</p>
          <p className="text-xs text-muted-fg mt-1">
            {group.occurrences.toLocaleString()} occurrence{group.occurrences !== 1 ? 's' : ''} ·{' '}
            {group.affected_devices.toLocaleString()} device{group.affected_devices !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {/* Timeline */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-fg mb-3">Occurrences over time</p>
          {isPending && !detail ? (
            <div className="skeleton rounded-lg h-[180px]" />
          ) : (detail?.timeseries.length ?? 0) > 0 ? (
            <div className="rounded-xl border border-border bg-card/50 p-4">
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={detail!.timeseries} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
                  <XAxis dataKey="dt" tick={{ fontSize: 10, fill: t.muted }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: t.muted }} tickLine={false} axisLine={false} width={32} />
                  <Tooltip />
                  <Line type="monotone" dataKey="occurrences" stroke={t.chart5} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-fg">No time data.</p>
          )}
        </div>

        {/* Error samples (stack + component stack + cause) */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-fg mb-3">Error samples</p>
          {(detail?.samples.length ?? 0) === 0 ? (
            <div className="rounded-xl border border-border bg-muted/40 p-4 text-xs text-muted-fg">
              No stack traces captured. Enable <code className="font-mono">autoCaptureErrors</code> on your
              {' '}<code className="font-mono">&lt;SunglassesProvider&gt;</code> to capture error details automatically.
            </div>
          ) : (
            <div className="space-y-4">
              {detail!.samples.map((sample, i) => (
                <ErrorSampleCard key={i} sample={sample} />
              ))}
            </div>
          )}
        </div>

        {/* Breakdowns */}
        {(detail?.breakdowns.length ?? 0) > 0 ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-fg mb-3">Version / platform breakdown</p>
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wide text-muted-fg">Version</th>
                    <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wide text-muted-fg">Platform</th>
                    <th className="px-4 py-2.5 text-right font-semibold uppercase tracking-wide text-muted-fg tabular">Occurrences</th>
                    <th className="px-4 py-2.5 text-right font-semibold uppercase tracking-wide text-muted-fg tabular">Devices</th>
                  </tr>
                </thead>
                <tbody>
                  {detail!.breakdowns.map((b, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-3 text-foreground">{b.app_version ?? '—'}</td>
                      <td className="px-4 py-3 text-foreground">{b.platform ?? '—'}</td>
                      <td className="px-4 py-3 text-right tabular text-foreground">{b.occurrences.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right tabular text-foreground">{b.affected_devices.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

export function ErrorsSection({ range }: Props) {
  const [selected, setSelected] = useState<ErrorGroupRow | null>(null);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <p className="text-sm font-semibold text-foreground">Errors</p>
        <p className="text-xs text-muted-fg mt-0.5">
          Grouped by type · click a row to inspect
        </p>
      </div>

      <div className="flex h-full" style={{ minHeight: 400 }}>
        {/* Group list */}
        <div
          className={`flex-shrink-0 overflow-y-auto border-r border-border ${
            selected ? 'hidden lg:flex lg:flex-col w-[420px]' : 'w-full flex flex-col'
          }`}
        >
          <ErrorGroupList range={range} onSelect={setSelected} selected={selected} />
        </div>

        {/* Detail panel */}
        {selected ? (
          <div className="flex-1 min-w-0 overflow-y-auto">
            <ErrorDetail
              group={selected}
              range={range}
              onClose={() => setSelected(null)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
