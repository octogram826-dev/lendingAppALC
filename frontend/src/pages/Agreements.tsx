import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { Alert, Loading } from '../components/ui';
import { api, errorText } from '../lib/api';
import { blankToNull, formatWhen, label, localDate, money, qs } from '../lib/format';
import type { Agreement, One, Page } from '../lib/types';

const STATUSES = ['draft', 'executed', 'disbursed', 'cancelled'];
const PAGE_SIZE = 10;
const STATUS_TEXT: Record<string, string> = {
  draft: 'DRAFT',
  executed: 'EXECUTED',
  disbursed: 'DISBURSED',
  cancelled: 'CANCELLED',
};
const STATUS_CLASS: Record<string, string> = {
  draft: 'is-draft',
  executed: 'is-executed',
  disbursed: 'is-disbursed',
  cancelled: 'is-cancelled',
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

function dueLabel(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || '—';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: '2-digit', year: 'numeric' }).format(new Date(year, month - 1, day));
}

export function AgreementsPage() {
  const [rows, setRows] = useState<Agreement[]>([]);
  const [meta, setMeta] = useState<Page<Agreement>['meta'] | null>(null);
  const [catalog, setCatalog] = useState<Agreement[]>([]);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
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
    async function loadCatalog() {
      const collected: Agreement[] = [];
      let next = 1;
      let total = 0;
      do {
        const result = await api<Page<Agreement>>(`/api/agreements${qs({ page: next, pageSize: 100 })}`);
        collected.push(...result.data);
        total = result.meta.total;
        next += 1;
      } while (collected.length < total && next <= 20);
      if (!ignore) setCatalog(collected);
    }
    loadCatalog().catch(() => {
      if (!ignore) setCatalog([]);
    });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    api<Page<Agreement>>(`/api/agreements${qs({
      page,
      pageSize: PAGE_SIZE,
      q: search || undefined,
      status: status || undefined,
      from: from || undefined,
      to: to || undefined,
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
  }, [page, search, status, from, to]);

  const cancelled = catalog.filter((item) => item.status === 'cancelled').length;
  const disbursed = catalog.filter((item) => item.status === 'disbursed').length;
  const average = catalog.length > 0 ? catalog.reduce((sum, item) => sum + Number(item.principal), 0) / catalog.length : 0;
  const start = meta && meta.total > 0 ? (meta.page - 1) * meta.pageSize + 1 : 0;
  const end = meta ? Math.min(meta.page * meta.pageSize, meta.total) : 0;
  const pages = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;

  return (
    <div className="users-page">
      <header className="users-head">
        <div>
          <h1>Agreements</h1>
          <p>Prepare agreements, verify conditions, and simulate fund release.</p>
        </div>
      </header>
      <div className="products-stack">
        <div className="product-metrics">
          <article className="product-metric">
            <header>Total Agreements<img src="/shell/metric-agreements.svg" alt="" width={24} height={24} /></header>
            <strong>{catalog.length}</strong>
          </article>
          <article className="product-metric">
            <header>Average Principal<img src="/shell/metric-principal.svg" alt="" width={24} height={24} /></header>
            <strong>{peso(average)}</strong>
          </article>
          <article className="product-metric">
            <header>Total Cancelled<img src="/shell/metric-cancelled.svg" alt="" width={24} height={24} /></header>
            <strong>{cancelled}</strong>
          </article>
          <article className="product-metric">
            <header>Total Disbursed<img src="/shell/metric-disbursed.svg" alt="" width={24} height={24} /></header>
            <strong>{disbursed}</strong>
          </article>
        </div>
        <section className="users-card">
          <div className="users-toolbar">
            <label className="users-search">
              <img src="/shell/search.svg" alt="" width={20} height={20} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search anything..." />
            </label>
            <div className="users-head-actions">
              <label className="agr-range">
                <input type="date" aria-label="First due from" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
                <span>-</span>
                <input type="date" aria-label="First due to" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
              </label>
              <label className="users-filter">
                Status: {status ? label(status) : 'All Record'}
                <img src="/shell/chevron-down.svg" alt="" width={20} height={20} />
                <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
                  <option value="">All Record</option>
                  {STATUSES.map((item) => <option key={item} value={item}>{label(item)}</option>)}
                </select>
              </label>
            </div>
          </div>
          {error ? <Alert>{error}</Alert> : null}
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Agreement Number</th>
                  <th>Borrower</th>
                  <th>Application Number</th>
                  <th>Principal</th>
                  <th>First Due Date</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((agreement) => (
                  <tr key={agreement.id}>
                    <td><Link className="app-number" to={`/agreements/${agreement.id}`}>{agreement.agreementNumber}</Link></td>
                    <td>
                      <div className="app-person">
                        <span className="app-avatar">{initials(agreement.borrowerFirstName, agreement.borrowerLastName)}</span>
                        <span className="app-stack">
                          <strong>
                            <Link to={`/borrowers/${agreement.borrowerId}`}>
                              {borrowerLabel(agreement.borrowerFirstName, agreement.borrowerMiddleName, agreement.borrowerLastName)}
                            </Link>
                          </strong>
                        </span>
                      </div>
                    </td>
                    <td><Link className="app-number" to={`/applications/${agreement.applicationId}`}>{agreement.applicationNumber}</Link></td>
                    <td>{peso(agreement.principal)}</td>
                    <td>{dueLabel(agreement.firstDueDate)}</td>
                    <td><span className={`users-pill app-pill agr-pill ${STATUS_CLASS[agreement.status] ?? ''}`}>{STATUS_TEXT[agreement.status] ?? label(agreement.status)}</span></td>
                    <td>
                      <Link className="users-edit" to={`/agreements/${agreement.id}`} aria-label={`${agreement.status === 'draft' ? 'Edit' : 'View'} ${agreement.agreementNumber}`}>
                        <img src={agreement.status === 'draft' ? '/shell/edit.svg' : '/shell/eye.svg'} alt="" width={20} height={20} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={7}>No agreements match this view.</td></tr>
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

export function AgreementRecordPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const record = useResourceSafe(id);
  const agreement = record.data?.data;
  const [dueDate, setDueDate] = useState('');
  const [documentType, setDocumentType] = useState('Promissory note');
  const [fileReference, setFileReference] = useState('');
  const [docNotes, setDocNotes] = useState('');
  const [cancelNotes, setCancelNotes] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const writable = can('agreements.write');

  useEffect(() => {
    if (agreement) setDueDate(agreement.firstDueDate);
  }, [agreement]);

  async function act(action: () => Promise<void>) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await action();
      record.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (record.loading && !agreement) return <Loading />;
  if (!agreement) return <Alert>{record.error ?? 'Agreement not found.'}</Alert>;
  const canEditDue = writable && (agreement.status === 'draft' || agreement.status === 'executed');

  return (
    <div className="users-page user-form">
      <header className="users-head">
        <div>
          <h1>{agreement.agreementNumber}</h1>
          <p>{borrowerLabel(agreement.borrowerFirstName, agreement.borrowerMiddleName, agreement.borrowerLastName)} · {agreement.applicationNumber}</p>
        </div>
        <span className={`users-pill app-pill agr-pill ${STATUS_CLASS[agreement.status] ?? ''}`}>{STATUS_TEXT[agreement.status] ?? label(agreement.status)}</span>
      </header>
      <Alert>{error}</Alert>
      <Alert kind="ok">{notice}</Alert>
      <section className="user-card">
        <h2><i />Terms</h2>
        <dl className="borrower-facts">
          <div><dt>Principal</dt><dd>{peso(agreement.principal)}</dd></div>
          <div><dt>Monthly rate</dt><dd>{Number(agreement.monthlyInterestRate).toFixed(2)}%</dd></div>
          <div><dt>Term</dt><dd>{agreement.termMonths} Months</dd></div>
          <div><dt>Total interest</dt><dd>{money(agreement.totalInterest)}</dd></div>
          <div><dt>Total payable</dt><dd>{money(agreement.totalPayable)}</dd></div>
          <div><dt>Regular installment</dt><dd>{money(agreement.installmentAmount)}</dd></div>
          <div><dt>Final installment</dt><dd>{money(agreement.finalInstallmentAmount)}</dd></div>
          <div><dt>Product</dt><dd>{agreement.productCode}</dd></div>
          <div><dt>Executed</dt><dd>{formatWhen(agreement.executedAt)}</dd></div>
          <div><dt>Cancelled</dt><dd>{agreement.cancelledAt ? `${formatWhen(agreement.cancelledAt)}${agreement.cancellationNotes ? ` · ${agreement.cancellationNotes}` : ''}` : '—'}</dd></div>
        </dl>
      </section>
      <section className="user-card">
        <h2><i />First Due Date</h2>
        {canEditDue ? (
          <form className="user-grid" onSubmit={(event) => {
            event.preventDefault();
            void act(async () => {
              await api(`/api/agreements/${agreement.id}`, { method: 'PATCH', body: { firstDueDate: dueDate } });
              setNotice('First due date saved.');
            });
          }}>
            <label>
              <span>Due date <b>*</b></span>
              <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required />
              <small>The fund release date has to be on or before this date.</small>
            </label>
            <div><button className="users-primary" disabled={busy}>Save due date</button></div>
          </form>
        ) : <p>{dueLabel(agreement.firstDueDate)}</p>}
        {agreement.status === 'draft' ? <p className="user-role-fallback">Record at least one document before execution.</p> : null}
        {showCancel ? (
          <form className="user-grid" onSubmit={(event) => {
            event.preventDefault();
            void act(async () => {
              await api(`/api/agreements/${agreement.id}/cancel`, { method: 'POST', body: { notes: blankToNull(cancelNotes) } });
              setShowCancel(false);
              setNotice('Agreement cancelled. A new agreement can be created from the application.');
            });
          }}>
            <label className="product-wide">
              <span>Cancellation notes</span>
              <textarea value={cancelNotes} onChange={(event) => setCancelNotes(event.target.value)} />
            </label>
            <div><button className="users-outline" disabled={busy}>{busy ? 'Cancelling…' : 'Confirm cancellation'}</button></div>
          </form>
        ) : null}
      </section>
      <section className="user-card">
        <h2><i />Documents</h2>
        {(agreement.documents ?? []).length === 0 ? <p className="user-role-fallback">No documents recorded.</p> : (
          <div className="users-table-wrap">
            <table className="users-table">
              <thead><tr><th>Type</th><th>Reference</th><th>Notes</th><th>Recorded</th></tr></thead>
              <tbody>
                {agreement.documents?.map((document) => (
                  <tr key={document.id}>
                    <td>{document.documentType}</td>
                    <td>{document.fileReference || '—'}</td>
                    <td>{document.notes || '—'}</td>
                    <td>{formatWhen(document.recordedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {writable && agreement.status !== 'cancelled' ? (
          <form className="user-grid" onSubmit={(event) => {
            event.preventDefault();
            void act(async () => {
              await api(`/api/agreements/${agreement.id}/documents`, {
                method: 'POST',
                body: { documentType, fileReference: blankToNull(fileReference), notes: blankToNull(docNotes) },
              });
              setFileReference('');
              setDocNotes('');
              setNotice('Document recorded.');
            });
          }}>
            <label>
              <span>Document type <b>*</b></span>
              <input value={documentType} onChange={(event) => setDocumentType(event.target.value)} required />
            </label>
            <label>
              <span>File reference</span>
              <input value={fileReference} onChange={(event) => setFileReference(event.target.value)} placeholder="Path or reference" />
            </label>
            <label className="product-wide">
              <span>Notes</span>
              <input value={docNotes} onChange={(event) => setDocNotes(event.target.value)} />
            </label>
            <div><button className="users-outline" disabled={busy}>Record document</button></div>
          </form>
        ) : null}
      </section>
      <div className="user-actions">
        <button type="button" className="users-outline" onClick={() => navigate('/agreements')}>Back</button>
        <Link className="users-outline" to={`/applications/${agreement.applicationId}`}>Application</Link>
        {writable && agreement.status === 'draft' ? (
          <button type="button" className="users-primary" disabled={busy} onClick={() => void act(async () => {
            await api(`/api/agreements/${agreement.id}/execute`, { method: 'POST' });
            setNotice('Agreement executed.');
          })}>Execute</button>
        ) : null}
        {agreement.status === 'executed' && can('disbursements.write') ? <Link className="users-primary" to={`/agreements/${agreement.id}/disburse`}>Release funds</Link> : null}
        {agreement.status === 'disbursed' && can('loans.read') ? <Link className="users-primary" to={`/loans?q=${agreement.agreementNumber}`}>Open loan</Link> : null}
        {writable && (agreement.status === 'draft' || agreement.status === 'executed') ? (
          <button type="button" className="users-outline" onClick={() => setShowCancel((value) => !value)}>Cancel agreement</button>
        ) : null}
      </div>
    </div>
  );
}

function useResourceSafe(id: string | undefined) {
  const [data, setData] = useState<One<Agreement> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!id) return;
    let ignore = false;
    setLoading(true);
    api<One<Agreement>>(`/api/agreements/${id}`)
      .then((result) => {
        if (ignore) return;
        setData(result);
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
  }, [id, tick]);

  return { data, error, loading, reload: () => setTick((value) => value + 1) };
}

export function DisbursePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const record = useResourceSafe(id);
  const agreement = record.data?.data;
  const [releaseDate, setReleaseDate] = useState(localDate());
  const [method, setMethod] = useState('bank_transfer');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!agreement) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<One<{ loanAccountId: number; accountNumber: string }>>(`/api/agreements/${agreement.id}/disburse`, {
        method: 'POST',
        body: { releaseDate, method, referenceNumber: blankToNull(referenceNumber), notes: blankToNull(notes) },
      });
      navigate(`/loans/${result.data.loanAccountId}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (record.loading && !agreement) return <Loading />;
  if (!agreement) return <Alert>{record.error ?? 'Agreement not found.'}</Alert>;

  return (
    <form className="users-page user-form" onSubmit={onSubmit}>
      <header className="users-head">
        <div>
          <h1>Release Funds</h1>
          <p>{agreement.agreementNumber} · {borrowerLabel(agreement.borrowerFirstName, agreement.borrowerMiddleName, agreement.borrowerLastName)} · {peso(agreement.principal)}</p>
        </div>
      </header>
      {agreement.status !== 'executed' ? (
        <Alert kind="info">
          {agreement.status === 'disbursed'
            ? 'Funds for this agreement are already released.'
            : 'Only an executed agreement can be disbursed.'}
        </Alert>
      ) : (
        <section className="user-card">
          <h2><i />Disbursement</h2>
          <Alert>{error}</Alert>
          <div className="user-grid">
            <label>
              <span>Release date <b>*</b></span>
              <input type="date" value={releaseDate} max={agreement.firstDueDate} onChange={(event) => setReleaseDate(event.target.value)} required />
              <small>On or before {dueLabel(agreement.firstDueDate)}. The amount is the full principal.</small>
            </label>
            <label>
              <span>Method</span>
              <select value={method} onChange={(event) => setMethod(event.target.value)}>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="check">Check</option>
              </select>
            </label>
            <label>
              <span>Reference number</span>
              <input value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} />
            </label>
            <label>
              <span>Notes</span>
              <input value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
          </div>
        </section>
      )}
      <div className="user-actions">
        <Link className="users-outline" to={`/agreements/${agreement.id}`}>Back</Link>
        {agreement.status === 'executed' ? (
          <button className="users-primary" disabled={busy}>{busy ? 'Releasing…' : `Release ${peso(agreement.principal)}`}</button>
        ) : null}
      </div>
    </form>
  );
}
