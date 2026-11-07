import { useEffect, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { label } from '../lib/format';

export function Splash() {
  return (
    <div className="splash">
      <img src="/alc-logo.png" alt="Albyna's Lending Corporation" />
    </div>
  );
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'ok' | 'info'; children: ReactNode }) {
  if (!children) return null;
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Badge({ value }: { value: string | null | undefined }) {
  return <span className={`badge tone-${value ?? 'none'}`}>{label(value)}</span>;
}

export function Loading({ label: text = 'Loading…' }: { label?: string }) {
  return <p className="loading">{text}</p>;
}

export function Denied() {
  return (
    <section className="card empty-card">
      <h2>This section is not assigned to you</h2>
      <p>Your role can open the destinations shown in the menu.</p>
    </section>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {body ? <p>{body}</p> : null}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow?: string;
  title: string;
  lede?: ReactNode;
  actions?: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} · ALC`;
  }, [title]);
  return (
    <header className="page-head">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {lede ? <div className="lede">{lede}</div> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function Card({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className ?? ''}`}>
      {title || action ? (
        <header className="card-head">
          {title ? <h2>{title}</h2> : <span />}
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Field({
  label: text,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`field ${className ?? ''}`}>
      <span>{text}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function Facts({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="facts">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <div className="pager">
      <span>
        {start}–{end} of {total}
      </span>
      <div>
        <button type="button" className="btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button type="button" className="btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

export function Filters({
  query,
  onQuery,
  onSearch,
  children,
}: {
  query: string;
  onQuery: (value: string) => void;
  onSearch: (event: FormEvent) => void;
  children?: ReactNode;
}) {
  return (
    <form className="filters" onSubmit={onSearch}>
      <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search" aria-label="Search" />
      {children}
      <button className="btn" type="submit">
        Search
      </button>
    </form>
  );
}

export function Steps({
  items,
}: {
  items: Array<{ label: string; state: 'done' | 'current' | 'upcoming'; to?: string }>;
}) {
  return (
    <ol className="steps">
      {items.map((item) => (
        <li key={item.label} className={item.state}>
          {item.to ? <Link to={item.to}>{item.label}</Link> : item.label}
        </li>
      ))}
    </ol>
  );
}
