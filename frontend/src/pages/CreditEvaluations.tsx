import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '../components/ui';
import { api, errorText } from '../lib/api';
import { label, qs } from '../lib/format';
import type { Page } from '../lib/types';

type EvaluationRow = {
  applicationId: number;
  applicationNumber: string;
  borrowerId: number;
  borrowerFirstName: string;
  borrowerMiddleName: string | null;
  borrowerLastName: string;
  disposableIncome: number;
  proposedInstallment: number;
  withinPolicy: boolean;
  status: string;
};

const PAGE_SIZE = 10;
const STATUS_TEXT: Record<string, string> = {
  under_review: 'UNDER REVIEW',
  approved: 'APPROVED',
  rejected: 'REJECTED',
  disbursed: 'DISBURSED',
};
const STATUS_CLASS: Record<string, string> = {
  under_review: 'is-review',
  approved: 'is-approved',
  rejected: 'is-rejected',
  disbursed: 'is-disbursed',
};

function borrowerLabel(firstName: string, middleName: string | null, lastName: string) {
  const initial = middleName?.trim() ? `${middleName.trim()[0]?.toUpperCase()}.` : '';
  return [firstName, initial, lastName].filter((part) => part.length > 0).join(' ');
}

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

function peso(value: number) {
  const whole = Math.abs(value - Math.round(value)) < 0.001;
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(value);
}

export function CreditEvaluationsPage() {
  const [view, setView] = useState<'queue' | 'history'>('queue');
  const [rows, setRows] = useState<EvaluationRow[]>([]);
  const [meta, setMeta] = useState<Page<EvaluationRow>['meta'] | null>(null);
  const [queue, setQueue] = useState<EvaluationRow[]>([]);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [policy, setPolicy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let ignore = false;
    async function loadQueue() {
      const collected: EvaluationRow[] = [];
      let next = 1;
      let total = 0;
      do {
        const result = await api<Page<EvaluationRow>>(`/api/applications/evaluations${qs({ view: 'queue', page: next, pageSize: 100 })}`);
        collected.push(...result.data);
        total = result.meta.total;
        next += 1;
      } while (collected.length < total && next <= 20);
      if (!ignore) setQueue(collected);
    }
    loadQueue().catch(() => {
      if (!ignore) setQueue([]);
    });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    api<Page<EvaluationRow>>(`/api/applications/evaluations${qs({
      view,
      page,
      pageSize: PAGE_SIZE,
      q: search || undefined,
      policy: policy || undefined,
    })}`)
      .then((result) => {
        if (ignore) return;
        setRows(result.data);
        setMeta(result.meta);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!ignore) setError(errorText(err));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [view, page, search, policy]);

  const average = queue.length > 0 ? Math.round(queue.reduce((sum, item) => sum + Number(item.disposableIncome), 0) / queue.length) : 0;
  const proposed = queue.reduce((sum, item) => sum + Number(item.proposedInstallment), 0);
  const start = meta && meta.total > 0 ? (meta.page - 1) * meta.pageSize + 1 : 0;
  const end = meta ? Math.min(meta.page * meta.pageSize, meta.total) : 0;
  const pages = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;

  return (
    <div className="users-page">
      <header className="users-head">
        <div>
          <h1>Credit Evaluations</h1>
          <p>Evaluate borrower creditworthiness, assess financial capacity, and determine loan eligibility and risk.</p>
        </div>
        <div className="eval-tabs" role="tablist">
          <button type="button" className={view === 'queue' ? 'is-current' : ''} onClick={() => { setView('queue'); setPage(1); }}>Queue</button>
          <button type="button" className={view === 'history' ? 'is-current' : ''} onClick={() => { setView('history'); setPage(1); }}>History</button>
        </div>
      </header>
      <div className="products-stack">
        <div className="product-metrics is-three">
          <article className="product-metric">
            <header>Queued Credit Evaluations<img src="/shell/metric-evaluation.svg" alt="" width={24} height={24} /></header>
            <strong>{queue.length}</strong>
          </article>
          <article className="product-metric">
            <header>Average Disposable Income<img src="/shell/metric-principal.svg" alt="" width={24} height={24} /></header>
            <strong>{peso(average)}</strong>
          </article>
          <article className="product-metric">
            <header>Total Proposed Installment<img src="/shell/metric-installment.svg" alt="" width={24} height={24} /></header>
            <strong>{peso(proposed)}</strong>
          </article>
        </div>
        <section className="users-card">
          <div className="users-toolbar">
            <label className="users-search">
              <img src="/shell/search.svg" alt="" width={20} height={20} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search anything..." />
            </label>
            <label className="users-filter">
              Inside Policy: {policy === 'yes' ? 'Yes' : policy === 'no' ? 'No' : 'All Record'}
              <img src="/shell/chevron-down.svg" alt="" width={20} height={20} />
              <select value={policy} onChange={(event) => { setPolicy(event.target.value); setPage(1); }}>
                <option value="">All Record</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
          </div>
          {error ? <Alert>{error}</Alert> : null}
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Application Number</th>
                  <th>Borrower</th>
                  <th>Disposable Income</th>
                  <th>Proposed Installment</th>
                  <th>Inside Policy</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.applicationId}>
                    <td><Link className="app-number" to={`/applications/${item.applicationId}`}>{item.applicationNumber}</Link></td>
                    <td>
                      <div className="app-person">
                        <span className="app-avatar">{initials(item.borrowerFirstName, item.borrowerLastName)}</span>
                        <span className="app-stack">
                          <strong>
                            <Link to={`/borrowers/${item.borrowerId}`}>
                              {borrowerLabel(item.borrowerFirstName, item.borrowerMiddleName, item.borrowerLastName)}
                            </Link>
                          </strong>
                        </span>
                      </div>
                    </td>
                    <td>{peso(item.disposableIncome)}</td>
                    <td>{peso(item.proposedInstallment)}</td>
                    <td><span className={item.withinPolicy ? 'eval-yes' : 'eval-no'}>{item.withinPolicy ? 'YES' : 'NO'}</span></td>
                    <td><span className={`users-pill app-pill ${STATUS_CLASS[item.status] ?? ''}`}>{STATUS_TEXT[item.status] ?? label(item.status)}</span></td>
                    <td>
                      <Link className="users-edit" to={`/applications/${item.applicationId}/evaluation`} aria-label={`${view === 'queue' ? 'Edit' : 'View'} ${item.applicationNumber}`}>
                        <img src={view === 'queue' ? '/shell/edit.svg' : '/shell/eye.svg'} alt="" width={20} height={20} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={7}>No credit evaluations match this view.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <footer className="users-pager">
            <span>Showing {start} to {end} of {meta?.total ?? 0} entries</span>
            <div>
              <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} aria-label="Previous page">
                <img src="/shell/chevron-left.svg" alt="" width={16} height={16} />
              </button>
              {Array.from({ length: pages }, (_, index) => index + 1).slice(0, 5).map((number) => (
                <button key={number} type="button" className={number === page ? 'is-current' : ''} onClick={() => setPage(number)}>{number}</button>
              ))}
              <button type="button" disabled={!meta || page >= pages} onClick={() => setPage((current) => current + 1)} aria-label="Next page">
                <img src="/shell/chevron-page.svg" alt="" width={16} height={16} />
              </button>
              <em>Page: {page}</em>
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
}
