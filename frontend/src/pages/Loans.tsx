import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { Alert, Card, Facts, Field, Loading, PageHeader } from '../components/ui';
import { api, errorText } from '../lib/api';
import { blankToNull, formatDate, formatWhen, label, localDate, money, qs } from '../lib/format';
import { useResource } from '../lib/resource';
import type { Loan, One, Page, Receipt } from '../lib/types';

const PAGE_SIZE = 10;
const STATUSES = ['active', 'overdue', 'closed'];
const STATUS_TEXT: Record<string, string> = { active: 'ACTIVE', overdue: 'OVERDUE', closed: 'CLOSED' };
const STATUS_CLASS: Record<string, string> = { active: 'is-active', overdue: 'is-overdue', closed: 'is-closed' };
const LINE_TEXT: Record<string, string> = { paid: 'PAID', partial: 'PARTIAL', overdue: 'OVERDUE', pending: 'PENDING' };
const LINE_CLASS: Record<string, string> = { paid: 'is-paid', partial: 'is-partial', overdue: 'is-overdue', pending: 'is-pending' };

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
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: '2-digit', year: 'numeric' }).format(new Date(year, month - 1, day));
}

export function LoansPage() {
  const [params] = useSearchParams();
  const [rows, setRows] = useState<Loan[]>([]);
  const [meta, setMeta] = useState<Page<Loan>['meta'] | null>(null);
  const [catalog, setCatalog] = useState<Loan[]>([]);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [status, setStatus] = useState(params.get('status') ?? '');
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
      const collected: Loan[] = [];
      let next = 1;
      let total = 0;
      do {
        const result = await api<Page<Loan>>(`/api/loans${qs({ page: next, pageSize: 100 })}`);
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
    api<Page<Loan>>(`/api/loans${qs({ page, pageSize: PAGE_SIZE, q: search || undefined, status: status || undefined })}`)
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
  }, [page, search, status]);

  const active = catalog.filter((loan) => loan.status === 'active').length;
  const overdue = catalog.filter((loan) => loan.status === 'overdue').length;
  const average = catalog.length > 0 ? Math.round(catalog.reduce((sum, loan) => sum + Number(loan.outstandingBalance), 0) / catalog.length) : 0;
  const start = meta && meta.total > 0 ? (meta.page - 1) * meta.pageSize + 1 : 0;
  const end = meta ? Math.min(meta.page * meta.pageSize, meta.total) : 0;
  const pages = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;

  return (
    <div className="users-page">
      <header className="users-head">
        <div>
          <h1>Loan Accounts</h1>
          <p>Manage and monitor active loans, track repayment schedules, and record payments.</p>
        </div>
      </header>
      <div className="products-stack">
        <div className="product-metrics is-three">
          <article className="product-metric">
            <header>Total Active Loan Accounts<img src="/shell/metric-evaluation.svg" alt="" width={24} height={24} /></header>
            <strong>{active}</strong>
          </article>
          <article className="product-metric">
            <header>Total Overdue<img src="/shell/metric-overdue.svg" alt="" width={24} height={24} /></header>
            <strong>{overdue}</strong>
          </article>
          <article className="product-metric">
            <header>Average Outstanding Balance<img src="/shell/metric-principal.svg" alt="" width={24} height={24} /></header>
            <strong>{peso(average)}</strong>
          </article>
        </div>
        <section className="users-card">
          <div className="users-toolbar">
            <label className="users-search">
              <img src="/shell/search.svg" alt="" width={20} height={20} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search anything..." />
            </label>
            <label className="users-filter">
              <span>Status:</span>
              <select aria-label="Status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
                <option value="">All Record</option>
                {STATUSES.map((item) => <option key={item} value={item}>{STATUS_TEXT[item]}</option>)}
              </select>
              <img src="/shell/chevron-down.svg" alt="" width={20} height={20} />
            </label>
          </div>
          {error ? <Alert>{error}</Alert> : null}
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Account Number</th>
                  <th>Borrower</th>
                  <th>Outstanding Balance</th>
                  <th>Status</th>
                  <th>Maturity Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((loan) => (
                  <tr key={loan.id}>
                    <td><Link className="app-number" to={`/loans/${loan.id}`}>{loan.accountNumber}</Link></td>
                    <td>
                      <div className="app-person">
                        <span className="app-avatar">{initials(loan.borrowerFirstName, loan.borrowerLastName)}</span>
                        <span className="app-stack">
                          <strong><Link to={`/borrowers/${loan.borrowerId}`}>{borrowerLabel(loan.borrowerFirstName, loan.borrowerMiddleName, loan.borrowerLastName)}</Link></strong>
                        </span>
                      </div>
                    </td>
                    <td>{peso(loan.outstandingBalance)}</td>
                    <td><span className={`users-pill app-pill ${STATUS_CLASS[loan.status] ?? ''}`}>{STATUS_TEXT[loan.status] ?? label(loan.status)}</span></td>
                    <td>{dueLabel(loan.maturityDate)}</td>
                    <td>
                      <Link className="users-edit" to={`/loans/${loan.id}`} aria-label={`View ${loan.accountNumber}`}>
                        <img src="/shell/eye.svg" alt="" width={20} height={20} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && <tr><td colSpan={6}>No loan accounts match this view.</td></tr>}
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

export function LoanAccountPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const record = useResource<One<Loan>>(id ? `/api/loans/${id}` : null);
  const [paying, setPaying] = useState(false);
  const [closing, setClosing] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(localDate());
  const [method, setMethod] = useState('cash');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loan = record.data?.data;

  async function closeLoan() {
    if (!loan) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/loans/${loan.id}/close`, { method: 'POST' });
      setClosing(false);
      record.reload();
    } catch (err) {
      setError(errorText(err));
      setClosing(false);
    } finally {
      setBusy(false);
    }
  }

  async function postPayment(event: FormEvent) {
    event.preventDefault();
    if (!loan) return;
    setBusy(true);
    setError(null);
    try {
      const posted = await api<One<{ receipt: { receiptNumber: string } }>>(`/api/loans/${loan.id}/payments`, {
        method: 'POST',
        body: {
          amount: Number(amount),
          paymentDate,
          method,
          referenceNumber: blankToNull(referenceNumber),
          notes: blankToNull(notes),
        },
      });
      navigate(`/receipts/${posted.data.receipt.receiptNumber}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (record.loading && !loan) return <Loading />;
  if (!loan) return <Alert>{record.error ?? 'Loan account not found.'}</Alert>;
  const name = borrowerLabel(loan.borrowerFirstName, loan.borrowerMiddleName, loan.borrowerLastName);

  return (
    <div className="users-page user-form">
      <header className="users-head">
        <div>
          <h1>View Loan Account</h1>
          <p>{name} · {loan.accountNumber}</p>
        </div>
        <div className="users-head-actions">
          <span className={`users-pill app-pill ${STATUS_CLASS[loan.status] ?? ''}`}>{STATUS_TEXT[loan.status] ?? label(loan.status)}</span>
          {can('payments.post') && loan.status !== 'closed' ? (
            <button type="button" className="users-primary" onClick={() => setPaying(true)}>Record Payment</button>
          ) : null}
        </div>
      </header>
      {error && !paying ? <Alert>{error}</Alert> : null}
      {loan.readyToClose ? <Alert kind="info">The balance is zero. Close the account when the file is finished.</Alert> : null}
      <section className="user-card">
        <h2><i />Amortization Schedule</h2>
        <div className="users-table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                <th>Installment Number</th>
                <th>Due Date</th>
                <th>Principal</th>
                <th>Interest</th>
                <th>Total Due</th>
                <th>Amount Paid</th>
                <th>Outstanding</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loan.schedule?.map((line) => (
                <tr key={line.id}>
                  <td>{line.installmentNumber}</td>
                  <td>{dueLabel(line.dueDate)}</td>
                  <td>{money(line.principalDue)}</td>
                  <td>{money(line.interestDue)}</td>
                  <td>{money(line.totalDue)}</td>
                  <td>{money(line.totalPaid)}</td>
                  <td>{money(Math.max(0, line.totalDue - line.totalPaid))}</td>
                  <td><span className={`users-pill app-pill ${LINE_CLASS[line.status] ?? ''}`}>{LINE_TEXT[line.status] ?? label(line.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="app-split">
        <section className="user-card">
          <h2><i />Loan Details</h2>
          <dl className="borrower-facts">
            <div><dt>Principal</dt><dd>{peso(loan.principal)}</dd></div>
            <div><dt>Interest</dt><dd>{peso(loan.totalInterest)}</dd></div>
            <div><dt>Total Payable</dt><dd>{peso(loan.totalPayable)}</dd></div>
            <div><dt>Outstanding Principal</dt><dd>{peso(loan.outstandingPrincipal)}</dd></div>
            <div><dt>Outstanding Interest</dt><dd>{peso(loan.outstandingInterest)}</dd></div>
            <div><dt>Outstanding Balance</dt><dd>{peso(loan.outstandingBalance)}</dd></div>
            <div><dt>Maturity</dt><dd>{dueLabel(loan.maturityDate)}</dd></div>
            <div><dt>Agreement</dt><dd><Link to={`/agreements/${loan.agreementId}`}>{loan.agreementNumber}</Link></dd></div>
          </dl>
        </section>
        <section className="user-card">
          <h2><i />Disbursement Details</h2>
          <dl className="borrower-facts">
            <div><dt>Amount</dt><dd>{loan.disbursement ? peso(loan.disbursement.amount) : '—'}</dd></div>
            <div><dt>Release Date</dt><dd>{loan.disbursement ? dueLabel(loan.disbursement.releaseDate) : formatWhen(loan.disbursedAt)}</dd></div>
            <div><dt>Method</dt><dd>{loan.disbursement ? label(loan.disbursement.method) : '—'}</dd></div>
            <div><dt>Reference</dt><dd>{loan.disbursement?.referenceNumber || '—'}</dd></div>
            <div><dt>Note</dt><dd>{loan.disbursement?.notes || '—'}</dd></div>
          </dl>
        </section>
      </div>
      <div className="user-actions">
        <Link className="users-outline" to="/loans">Back</Link>
        <Link className="users-outline" to={`/borrowers/${loan.borrowerId}`}>Borrower</Link>
        {can('loans.close') && loan.readyToClose ? (
          <button type="button" className="users-primary is-danger" disabled={busy} onClick={() => setClosing(true)}>Close loan</button>
        ) : null}
      </div>
      {paying ? (
        <div className="role-modal-backdrop" role="presentation" onClick={() => (busy ? null : setPaying(false))}>
          <form className="role-modal product-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()} onSubmit={postPayment}>
            <header><h2>Record Payment</h2></header>
            <div className="product-modal-body">
              {error ? <Alert>{error}</Alert> : null}
              <label>Amount <b>*</b><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required /><small>Outstanding {peso(loan.outstandingBalance)}</small></label>
              <label>Payment Date <b>*</b><input type="date" value={paymentDate} max={localDate(1)} onChange={(event) => setPaymentDate(event.target.value)} required /></label>
              <label>Method <b>*</b>
                <select value={method} onChange={(event) => setMethod(event.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="check">Check</option>
                </select>
              </label>
              <label>Reference<input value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} /></label>
              <label>Note<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Write your Note here..." /></label>
            </div>
            <footer>
              <button type="button" className="users-outline" disabled={busy} onClick={() => setPaying(false)}>Cancel</button>
              <button className="users-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            </footer>
          </form>
        </div>
      ) : null}
      {closing ? (
        <div className="role-modal-backdrop" role="presentation" onClick={() => (busy ? null : setClosing(false))}>
          <div className="role-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2>Confirmation</h2>
            <p>Are you sure you want to close {loan.accountNumber}? This cannot be undone.</p>
            <div className="role-modal-actions">
              <button type="button" className="users-outline" disabled={busy} onClick={() => setClosing(false)}>Cancel</button>
              <button type="button" className="users-primary is-danger" disabled={busy} onClick={() => void closeLoan()}>{busy ? 'Closing…' : 'Yes, Close'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PostPaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const record = useResource<One<Loan>>(id ? `/api/loans/${id}` : null);
  const loan = record.data?.data;
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(localDate());
  const [method, setMethod] = useState('cash');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!loan) return;
    setBusy(true);
    setError(null);
    try {
      const posted = await api<One<{ receipt: { receiptNumber: string } }>>(`/api/loans/${loan.id}/payments`, {
        method: 'POST',
        body: {
          amount: Number(amount),
          paymentDate,
          method,
          referenceNumber: blankToNull(referenceNumber),
          notes: blankToNull(notes),
        },
      });
      navigate(`/receipts/${posted.data.receipt.receiptNumber}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (record.loading && !loan) return <Loading />;
  if (!loan) return <Alert>{record.error ?? 'Loan account not found.'}</Alert>;

  return (
    <>
      <PageHeader
        eyebrow={loan.accountNumber}
        title="Post payment"
        lede={`Outstanding ${money(loan.outstandingBalance)}. Interest is applied before principal, oldest installment first.`}
        actions={<Link className="btn" to={`/loans/${loan.id}`}>Loan account</Link>}
      />
      {loan.status === 'closed' ? <Alert kind="info">This loan is closed. Payments are no longer accepted.</Alert> : (
        <Card>
          <form className="form-grid" onSubmit={onSubmit}>
            <div className="span-2"><Alert>{error}</Alert></div>
            <Field label="Amount">
              <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required />
            </Field>
            <Field label="Payment date" hint="Today or yesterday in local time. The server allows up to one day ahead of UTC.">
              <input type="date" value={paymentDate} max={localDate(1)} onChange={(event) => setPaymentDate(event.target.value)} required />
            </Field>
            <Field label="Method">
              <select value={method} onChange={(event) => setMethod(event.target.value)}>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="check">Check</option>
              </select>
            </Field>
            <Field label="Reference number"><input value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} /></Field>
            <Field className="span-2" label="Notes"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
            <div className="span-2 actions">
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Posting…' : 'Post payment'}</button>
              <button type="button" className="btn" onClick={() => setAmount(String(loan.outstandingBalance))}>Use outstanding balance</button>
            </div>
          </form>
        </Card>
      )}
    </>
  );
}

export function ReceiptPage() {
  const { receiptNumber = '' } = useParams();
  const receipt = useResource<One<Receipt>>(`/api/receipts/${encodeURIComponent(receiptNumber)}`);
  const data = receipt.data?.data;

  return (
    <>
      <PageHeader
        eyebrow="Receipt"
        title={receiptNumber}
        actions={<button type="button" className="btn no-print" onClick={() => window.print()}>Print</button>}
      />
      {receipt.error ? <Alert>{receipt.error}</Alert> : null}
      {receipt.loading && !data ? <Loading /> : null}
      {data ? (
        <article className="receipt">
          <div className="receipt-top">
            <img src="/alc-logo.png" alt="Albyna's Lending Corporation" />
            <div>
              <h2>{data.receiptNumber}</h2>
              <p className="muted">Official receipt</p>
            </div>
          </div>
          <Facts items={[
            { label: 'Loan account', value: <Link to={`/loans/${data.loanAccountId}`}>{data.accountNumber}</Link> },
            { label: 'Amount', value: money(data.amount) },
            { label: 'Payment date', value: formatDate(data.paymentDate) },
            { label: 'Method', value: label(data.method) },
            { label: 'Reference', value: data.referenceNumber || '—' },
            { label: 'Posted', value: formatWhen(data.createdAt) },
            { label: 'Notes', value: data.notes || '—' },
            { label: 'Current outstanding', value: money(data.currentOutstandingBalance) },
          ]} />
          <p className="hint" style={{ margin: '12px 0' }}>Current outstanding is the balance on the loan now, not the balance immediately after this receipt.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Installment</th>
                  <th className="num">Interest</th>
                  <th className="num">Principal</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.allocations.map((allocation) => (
                  <tr key={allocation.installmentNumber}>
                    <td>{allocation.installmentNumber}</td>
                    <td className="num">{money(allocation.interestApplied)}</td>
                    <td className="num">{money(allocation.principalApplied)}</td>
                    <td className="num">{money(allocation.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}
    </>
  );
}
