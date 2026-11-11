import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { Alert, Badge, Card, Facts, Field, Loading, PageHeader, Steps } from '../components/ui';
import { api, errorText } from '../lib/api';
import { blankToNull, formatDate, formatWhen, label, money, qs, ratioPercent } from '../lib/format';
import { useResource } from '../lib/resource';
import type { Application, ApplicationRequirement, Borrower, Evaluation, One, Page, Product } from '../lib/types';

const STATUSES = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'withdrawn', 'disbursed'];
const PAGE_SIZE = 10;
const STATUS_TEXT: Record<string, string> = {
  draft: 'DRAFT',
  submitted: 'SUBMITTED',
  under_review: 'UNDER REVIEW',
  approved: 'APPROVED',
  rejected: 'REJECTED',
  withdrawn: 'WITHDRAWN',
  disbursed: 'DISBURSED',
};
const STATUS_CLASS: Record<string, string> = {
  draft: 'is-draft',
  submitted: 'is-submitted',
  under_review: 'is-review',
  approved: 'is-approved',
  rejected: 'is-rejected',
  withdrawn: 'is-withdrawn',
  disbursed: 'is-disbursed',
};

function borrowerLabel(firstName: string, middleName: string | null, lastName: string) {
  const initial = middleName?.trim() ? `${middleName.trim()[0]?.toUpperCase()}.` : '';
  return [firstName, initial, lastName].filter((part) => part.length > 0).join(' ');
}

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

function quotePreview(principal: number, rate: number, term: number) {
  if (!(principal > 0) || !(rate >= 0) || !Number.isInteger(term) || term < 1) return null;
  const principalCents = Math.round(principal * 100);
  const [whole, fraction = ''] = rate.toFixed(4).split('.');
  const rateScaled = Number(whole) * 10000 + Number(fraction);
  const numerator = BigInt(principalCents) * BigInt(rateScaled) * BigInt(term);
  const divisor = 1_000_000n;
  const remainder = numerator % divisor;
  let interest = numerator / divisor;
  if (remainder * 2n >= divisor) interest += 1n;
  const interestCents = Number(interest);
  const monthlyInterest = Math.floor(interestCents / term);
  const monthlyPrincipal = Math.floor(principalCents / term);
  return {
    monthlyInterest: monthlyInterest / 100,
    totalInterest: interestCents / 100,
    total: (principalCents + interestCents) / 100,
    installment: (monthlyPrincipal + monthlyInterest) / 100,
  };
}
const CHECKLIST = [
  { code: 'identity_verified', label: 'Identity documents verified' },
  { code: 'income_reviewed', label: 'Income documents reviewed' },
  { code: 'source_of_income_confirmed', label: 'Source of income confirmed' },
  { code: 'obligations_reviewed', label: 'Existing monthly obligations reviewed' },
  { code: 'installment_within_capacity', label: 'Proposed installment is within repayment capacity' },
  { code: 'no_adverse_internal_record', label: 'No adverse internal credit record' },
];

export function ApplicationsPage() {
  const { can } = useAuth();
  const [params] = useSearchParams();
  const [rows, setRows] = useState<Application[]>([]);
  const [meta, setMeta] = useState<Page<Application>['meta'] | null>(null);
  const [catalog, setCatalog] = useState<Application[]>([]);
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
      const collected: Application[] = [];
      let next = 1;
      let total = 0;
      do {
        const result = await api<Page<Application>>(`/api/applications${qs({ page: next, pageSize: 100 })}`);
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
    api<Page<Application>>(`/api/applications${qs({ page, pageSize: PAGE_SIZE, q: search || undefined, status: status || undefined })}`)
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

  const awaiting = catalog.filter((item) => item.status === 'submitted').length;
  const forApproval = catalog.filter((item) => item.status === 'under_review').length;
  const requested = catalog.reduce((sum, item) => sum + Number(item.requestedAmount), 0);
  const start = meta && meta.total > 0 ? (meta.page - 1) * meta.pageSize + 1 : 0;
  const end = meta ? Math.min(meta.page * meta.pageSize, meta.total) : 0;
  const pages = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;

  async function exportCsv() {
    const collected: Application[] = [];
    let next = 1;
    let total = 0;
    try {
      do {
        const result = await api<Page<Application>>(
          `/api/applications${qs({ page: next, pageSize: 100, q: search || undefined, status: status || undefined })}`,
        );
        collected.push(...result.data);
        total = result.meta.total;
        next += 1;
      } while (collected.length < total && next <= 20);
      const header = ['Application', 'Borrower', 'Borrower Number', 'Product', 'Amount', 'Term', 'Rate', 'Status'];
      const lines = collected.map((item) =>
        [item.applicationNumber, item.borrowerName, item.borrowerNumber, item.productName, item.requestedAmount, item.termMonths, item.monthlyInterestRate, item.status]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(','),
      );
      const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'applications.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="users-page">
      <header className="users-head">
        <div>
          <h1>Applications</h1>
          <p>Manage, review, and track borrower loan applications.</p>
        </div>
        <div className="users-head-actions">
          <button className="users-outline" type="button" onClick={exportCsv}>
            <img src="/shell/export.svg" alt="" width={20} height={20} />
            Export CSV
          </button>
          {can('applications.write') && (
            <Link className="users-primary" to="/applications/new">
              <img src="/shell/plus.svg" alt="" width={20} height={20} />
              Add Application
            </Link>
          )}
        </div>
      </header>
      <div className="products-stack">
        <div className="product-metrics">
          <article className="product-metric"><header>Total Applications</header><strong>{catalog.length}</strong></article>
          <article className="product-metric"><header>Awaiting Evaluation</header><strong>{awaiting}</strong></article>
          <article className="product-metric"><header>For Approval</header><strong>{forApproval}</strong></article>
          <article className="product-metric"><header>Total Requested Amount</header><strong>{money(requested)}</strong></article>
        </div>
        <section className="users-card">
          <div className="users-toolbar">
            <label className="users-search">
              <img src="/shell/search.svg" alt="" width={20} height={20} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search anything..." />
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
          {error ? <Alert>{error}</Alert> : null}
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Application Number</th>
                  <th>Borrower</th>
                  <th>Product</th>
                  <th>Amount</th>
                  <th>Term</th>
                  <th>Rate</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((application) => (
                  <tr key={application.id}>
                    <td><Link className="app-number" to={`/applications/${application.id}`}>{application.applicationNumber}</Link></td>
                    <td>
                      <div className="app-person">
                        <span className="app-avatar">{initials(application.borrowerFirstName, application.borrowerLastName)}</span>
                        <span className="app-stack">
                          <strong><Link to={`/borrowers/${application.borrowerId}`}>{borrowerLabel(application.borrowerFirstName, application.borrowerMiddleName, application.borrowerLastName)}</Link></strong>
                          <small>{application.borrowerNumber}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="app-stack">
                        <strong>{application.productName}</strong>
                        <small>{application.productCode}</small>
                      </span>
                    </td>
                    <td>{money(application.requestedAmount)}</td>
                    <td>{application.termMonths} Months</td>
                    <td>{Number(application.monthlyInterestRate).toFixed(2)}%</td>
                    <td><span className={`users-pill app-pill ${STATUS_CLASS[application.status] ?? ''}`}>{STATUS_TEXT[application.status] ?? label(application.status)}</span></td>
                    <td>
                      <Link className="users-edit" to={`/applications/${application.id}`} aria-label={`View ${application.applicationNumber}`}>
                        <img src="/shell/eye.svg" alt="" width={20} height={20} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={8}>No applications match this view.</td></tr>
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

function LoanEstimate({ rate, amount, term }: { rate: number; amount: string; term: string }) {
  const quote = quotePreview(Number(amount), rate, Number(term));
  return (
    <aside className="user-card app-estimate">
      <h2><i />Loan Estimate</h2>
      <div><span>Requested Amount</span><strong>{quote ? money(Number(amount)) : '₱0'}</strong></div>
      <div><span>Interest Rate ({rate.toFixed(2)}%)</span><strong>{quote ? `${money(quote.monthlyInterest)}/Month` : '₱0/Month'}</strong></div>
      <div><span>Loan Term</span><strong>{Number(term) > 0 ? `${Number(term)} Month` : '0 Month'}</strong></div>
      <div><span>Interest Amount</span><strong>{quote ? money(quote.totalInterest) : '₱0'}</strong></div>
      <div><span>Total Repayment</span><strong>{quote ? money(quote.total) : '₱0'}</strong></div>
      <p className="app-installment"><span>Monthly installment</span><b>{quote ? money(quote.installment) : '₱0.00'}</b></p>
    </aside>
  );
}

export function NewApplicationPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const presetId = params.get('borrowerId');
  const preset = useResource<One<Borrower>>(presetId ? `/api/borrowers/${presetId}` : null);
  const products = useResource<Page<Product>>('/api/products?status=active&pageSize=100');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Borrower[]>([]);
  const [borrower, setBorrower] = useState<Borrower | null>(null);
  const [productId, setProductId] = useState('');
  const [detail, setDetail] = useState<Product | null>(null);
  const [amount, setAmount] = useState('');
  const [term, setTerm] = useState('');
  const [purpose, setPurpose] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (preset.data) setBorrower(preset.data.data);
  }, [preset.data]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      void api<Page<Borrower>>(`/api/borrowers${qs({ q: query, pageSize: 8 })}`)
        .then((result) => setResults(result.data))
        .catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (!productId) {
      setDetail(null);
      return;
    }
    api<One<Product>>(`/api/products/${productId}`)
      .then((result) => setDetail(result.data))
      .catch(() => setDetail(null));
  }, [productId]);

  const product = detail ?? products.data?.data.find((item) => String(item.id) === productId) ?? null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!borrower || !product) {
      setError('Choose a borrower and a loan product.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await api<One<Application>>('/api/applications', {
        method: 'POST',
        body: {
          borrowerId: borrower.id,
          productId: product.id,
          requestedAmount: Number(amount),
          termMonths: Number(term),
          purpose: blankToNull(purpose),
        },
      });
      navigate(`/applications/${created.data.id}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="users-page user-form" onSubmit={onSubmit}>
      <h1>Add Application</h1>
      {error ? <Alert>{error}</Alert> : null}
      {preset.error ? <Alert>{preset.error}</Alert> : null}
      {borrower && borrower.verificationStatus !== 'verified' ? (
        <Alert kind="info">This borrower is not verified yet. You can save a draft, and submit it after verification.</Alert>
      ) : null}
      <section className="user-card">
        <h2><i />Application Details</h2>
        <div className="user-grid">
          <label>
            Borrower <b>*</b>
            <input value={borrower ? borrower.fullName : query} onChange={(event) => { setBorrower(null); setQuery(event.target.value); }} placeholder="Select Borrower" required />
            {!borrower && results.length > 0 ? (
              <div className="app-results">
                {results.map((item) => (
                  <button type="button" key={item.id} onClick={() => { setBorrower(item); setResults([]); }}>
                    <strong>{item.fullName}</strong>
                    <span>{item.borrowerNumber} · {label(item.verificationStatus)}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </label>
          <label>
            Loan Product <b>*</b>
            <select value={productId} onChange={(event) => setProductId(event.target.value)} required>
              <option value="">Select Loan Product</option>
              {products.data?.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label>
            Requested Amount (MAX {product ? money(product.maxAmount) : '--'}) <b>*</b>
            <span className="app-affix">
              <span>₱</span>
              <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" required />
              <em>PHP</em>
            </span>
          </label>
          <label>
            Term (MAX {product ? product.maxTermMonths : '--'}) <b>*</b>
            <span className="app-affix">
              <input inputMode="numeric" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="0" required />
              <em>MONTHS</em>
            </span>
          </label>
          <label className="product-wide">
            Purpose <b>*</b>
            <textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Write your Purpose here..." required />
          </label>
        </div>
      </section>
      <div className="app-split">
        <section className="user-card">
          <h2><i />Supporting Requirements</h2>
          {(product?.requirements ?? []).length === 0 ? <p>Select a loan product to see its requirements.</p> : product?.requirements?.map((item) => (
            <div className="app-req" key={item.id}>
              <div>
                <strong>{item.name}{item.isRequired ? ' *' : ''}</strong>
                <small>{item.description || 'Required for this loan product.'}</small>
              </div>
              <span className="users-pill app-pill is-pending">PENDING</span>
            </div>
          ))}
        </section>
        <LoanEstimate rate={Number(product?.monthlyInterestRate ?? 0)} amount={amount} term={term} />
      </div>
      <div className="user-actions">
        <Link className="users-outline" to="/applications">Cancel</Link>
        <button className="users-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save as Draft'}</button>
      </div>
    </form>
  );
}

function stepsFor(application: Application) {
  const status = application.status;
  const decided = status === 'approved' || status === 'rejected' || status === 'disbursed';
  const evaluated = Boolean(application.evaluation) || decided;
  return [
    { label: 'Application', state: status === 'draft' || status === 'submitted' ? 'current' as const : 'done' as const, to: `/applications/${application.id}` },
    { label: 'Evaluation', state: !evaluated ? 'upcoming' as const : status === 'under_review' ? 'current' as const : 'done' as const, to: `/applications/${application.id}/evaluation` },
    { label: 'Approval', state: application.approval || status === 'disbursed' ? 'done' as const : status === 'under_review' ? 'current' as const : 'upcoming' as const, to: `/applications/${application.id}/approval` },
    { label: 'Agreement', state: application.agreement ? 'done' as const : status === 'approved' ? 'current' as const : 'upcoming' as const, to: application.agreement ? `/agreements/${application.agreement.id}` : undefined },
  ];
}

export function ApplicationRecordPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const record = useResource<One<Application>>(id ? `/api/applications/${id}` : null);
  const application = record.data?.data;
  const [amount, setAmount] = useState('');
  const [term, setTerm] = useState('');
  const [purpose, setPurpose] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!application) return;
    setAmount(String(application.requestedAmount));
    setTerm(String(application.termMonths));
    setPurpose(application.purpose ?? '');
  }, [application]);

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

  if (record.loading && !application) return <Loading />;
  if (!application) return <Alert>{record.error ?? 'Application not found.'}</Alert>;

  const writable = can('applications.write');
  const openForRequirements = ['draft', 'submitted', 'under_review'].includes(application.status);

  const draft = application.status === 'draft' && writable;

  return (
    <form className="users-page user-form" onSubmit={(event) => {
      event.preventDefault();
      if (!draft) return;
      void act(async () => {
        await api(`/api/applications/${application.id}`, {
          method: 'PATCH',
          body: { requestedAmount: Number(amount), termMonths: Number(term), purpose: blankToNull(purpose) },
        });
        setNotice('Draft saved. The rate was refreshed from the product.');
      });
    }}>
      <header className="users-head">
        <div>
          <h1>{application.applicationNumber}</h1>
          <p>{application.borrowerName} · {application.productName}</p>
        </div>
        <span className={`users-pill app-pill ${STATUS_CLASS[application.status] ?? ''}`}>{STATUS_TEXT[application.status] ?? label(application.status)}</span>
      </header>
      <Steps items={stepsFor(application)} />
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert kind="ok">{notice}</Alert> : null}
      {application.borrowerVerificationStatus !== 'verified' && ['draft', 'submitted'].includes(application.status) ? (
        <Alert kind="info">Borrower verification is {label(application.borrowerVerificationStatus)}. Submit stays blocked until the borrower is verified.</Alert>
      ) : null}
      <section className="user-card">
        <h2><i />Application Details</h2>
        <div className="user-grid">
          <label>Borrower<input value={application.borrowerName} readOnly /></label>
          <label>Loan Product<input value={application.productName} readOnly /></label>
          <label>
            Requested Amount <b>*</b>
            <span className="app-affix">
              <span>₱</span>
              <input inputMode="decimal" value={amount} readOnly={!draft} onChange={(event) => setAmount(event.target.value)} required />
              <em>PHP</em>
            </span>
          </label>
          <label>
            Term <b>*</b>
            <span className="app-affix">
              <input inputMode="numeric" value={term} readOnly={!draft} onChange={(event) => setTerm(event.target.value)} required />
              <em>MONTHS</em>
            </span>
          </label>
          <label className="product-wide">
            Purpose
            <textarea value={purpose} readOnly={!draft} onChange={(event) => setPurpose(event.target.value)} />
          </label>
        </div>
      </section>
      <div className="app-split">
        <section className="user-card">
          <h2><i />Supporting Requirements</h2>
          {(application.requirements ?? []).length === 0 ? <p>No requirements were copied from the product.</p> : application.requirements?.map((requirement) => (
            <RequirementEditor
              key={requirement.id}
              applicationId={application.id}
              requirement={requirement}
              editable={writable && openForRequirements}
              onSaved={() => record.reload()}
            />
          ))}
        </section>
        <LoanEstimate rate={Number(application.monthlyInterestRate)} amount={amount} term={term} />
      </div>
      <div className="user-actions">
        <Link className="users-outline" to="/applications">Back</Link>
        {draft ? <button className="users-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save as Draft'}</button> : null}
        {application.status === 'draft' && writable ? (
          <button type="button" className="users-primary" disabled={busy} onClick={() => void act(async () => {
            await api(`/api/applications/${application.id}/submit`, { method: 'POST' });
            setNotice('Application submitted.');
          })}>Submit</button>
        ) : null}
        {['draft', 'submitted'].includes(application.status) && writable ? (
          <button type="button" className="users-outline" disabled={busy} onClick={() => void act(async () => {
            await api(`/api/applications/${application.id}/withdraw`, { method: 'POST' });
            setNotice('Application withdrawn.');
          })}>Withdraw</button>
        ) : null}
        {['submitted', 'under_review'].includes(application.status) ? (
          <Link className="users-primary" to={`/applications/${application.id}/evaluation`}>
            {can('credit.evaluate') ? 'Record evaluation' : 'View evaluation'}
          </Link>
        ) : null}
        {application.status === 'under_review' ? (
          <Link className="users-outline" to={`/applications/${application.id}/approval`}>
            {can('credit.approve') ? 'Record decision' : 'View decision'}
          </Link>
        ) : null}
        {application.agreement ? <Link className="users-primary" to={`/agreements/${application.agreement.id}`}>Agreement {application.agreement.agreementNumber}</Link> : null}
      </div>
      {application.status === 'approved' && !application.agreement && can('agreements.write') ? (
        <section className="user-card">
          <h2><i />Agreement</h2>
          <label>
            First due date
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required />
          </label>
          <button type="button" className="users-primary" disabled={busy || !dueDate} onClick={() => void act(async () => {
            const created = await api<One<{ id: number }>>(`/api/applications/${application.id}/agreement`, {
              method: 'POST',
              body: { firstDueDate: dueDate },
            });
            navigate(`/agreements/${created.data.id}`);
          })}>Create agreement</button>
        </section>
      ) : null}
      {application.approval ? <p>Decision: {label(application.approval.decision)} by {application.approval.approverName}.</p> : null}
    </form>
  );
}

function RequirementEditor({
  applicationId,
  requirement,
  editable,
  onSaved,
}: {
  applicationId: number;
  requirement: ApplicationRequirement;
  editable: boolean;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState(requirement.status);
  const [notes, setNotes] = useState(requirement.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStatus(requirement.status);
    setNotes(requirement.notes ?? '');
  }, [requirement]);

  async function save(nextStatus: string) {
    setStatus(nextStatus);
    setBusy(true);
    setError(null);
    try {
      await api(`/api/applications/${applicationId}/requirements/${requirement.id}`, {
        method: 'PATCH',
        body: { status: nextStatus, notes: blankToNull(notes) },
      });
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-req">
      <div>
        <strong>{requirement.name}{requirement.isRequired ? ' *' : ''}</strong>
        <small>{requirement.notes || 'Document copied from the loan product.'}</small>
        {error ? <Alert>{error}</Alert> : null}
      </div>
      {editable ? (
        <select value={status} disabled={busy} aria-label={`${requirement.name} status`} onChange={(event) => void save(event.target.value)}>
          <option value="pending">PENDING</option>
          <option value="submitted">SUBMITTED</option>
          <option value="waived">WAIVED</option>
        </select>
      ) : <span className="users-pill app-pill is-pending">{requirement.status.toUpperCase()}</span>}
    </div>
  );
}

export function EvaluationPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const record = useResource<One<Application>>(id ? `/api/applications/${id}` : null);
  const application = record.data?.data;
  const borrower = useResource<One<Borrower>>(application ? `/api/borrowers/${application.borrowerId}` : null);
  const [income, setIncome] = useState('');
  const [obligations, setObligations] = useState('0');
  const [recommendation, setRecommendation] = useState<'approve' | 'reject'>('approve');
  const [notes, setNotes] = useState('');
  const [checklist, setChecklist] = useState(CHECKLIST.map((item) => ({ ...item, result: 'pass', notes: '' })));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const evaluation = application?.evaluation;
    if (!evaluation) return;
    setIncome(String(evaluation.verifiedMonthlyIncome));
    setObligations(String(evaluation.existingMonthlyObligations));
    setRecommendation(evaluation.recommendation);
    setNotes(evaluation.notes ?? '');
    setChecklist(CHECKLIST.map((item) => {
      const saved = evaluation.checklist.find((entry) => entry.code === item.code);
      return { ...item, result: saved?.result ?? 'pass', notes: saved?.notes ?? '' };
    }));
  }, [application]);

  if (record.loading && !application) return <Loading />;
  if (!application) return <Alert>{record.error ?? 'Application not found.'}</Alert>;

  const editable = can('credit.evaluate') && ['submitted', 'under_review'].includes(application.status) && !application.approval;
  const evaluation = application.evaluation;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api(`/api/applications/${application!.id}/evaluation`, {
        method: 'POST',
        body: {
          verifiedMonthlyIncome: Number(income),
          existingMonthlyObligations: obligations.trim() ? Number(obligations) : 0,
          recommendation,
          notes: blankToNull(notes),
          checklist: checklist.map((item) => ({ code: item.code, result: item.result, notes: blankToNull(item.notes) })),
        },
      });
      setNotice('Evaluation saved. The application is under review.');
      record.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={application.applicationNumber}
        title="Credit evaluation"
        lede={`${application.borrowerName} · ${money(application.requestedAmount)} for ${application.termMonths} months at ${application.monthlyInterestRate}%`}
        actions={<Link className="btn" to={`/applications/${application.id}`}>Application</Link>}
      />
      <Alert>{error}</Alert>
      <Alert kind="ok">{notice}</Alert>
      {!editable && !evaluation ? <Alert kind="info">An evaluation can be recorded after the application is submitted, and before a decision.</Alert> : null}
      <div className="grid-2">
        <Card title="Income">
          <form className="stack" onSubmit={onSubmit}>
            <p className="hint">Stated monthly income on the borrower record: {money(borrower.data?.data.monthlyIncome)}. The proposed installment is calculated when this evaluation is saved.</p>
            <Field label="Verified monthly income">
              <input inputMode="decimal" value={income} onChange={(event) => setIncome(event.target.value)} required disabled={!editable} />
            </Field>
            <Field label="Existing monthly obligations">
              <input inputMode="decimal" value={obligations} onChange={(event) => setObligations(event.target.value)} disabled={!editable} />
            </Field>
            <Field label="Recommendation">
              <select value={recommendation} onChange={(event) => setRecommendation(event.target.value as 'approve' | 'reject')} disabled={!editable}>
                <option value="approve">Approve</option>
                <option value="reject">Reject</option>
              </select>
            </Field>
            <p className="hint">Approve requires every checklist item to be Pass or N/A, and “within repayment capacity” must be Pass.</p>
            <Field label="Notes"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} disabled={!editable} /></Field>
            {editable ? <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save evaluation'}</button> : null}
          </form>
        </Card>
        <Card title="Result">
          {evaluation ? <EvaluationSummary evaluation={evaluation} /> : <p className="muted">Save the evaluation to see the installment, disposable income, and policy result.</p>}
        </Card>
      </div>
      <Card title="Capacity checklist">
        <div className="check-list">
          {checklist.map((item, index) => (
            <div key={item.code} className="check-item">
              <header>
                <strong>{item.label}</strong>
                <div className="segment">
                  {(['pass', 'fail', 'na'] as const).map((result) => (
                    <button
                      type="button"
                      key={result}
                      className={item.result === result ? 'on' : ''}
                      disabled={!editable}
                      onClick={() => setChecklist((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, result } : entry))}
                    >
                      {label(result)}
                    </button>
                  ))}
                </div>
              </header>
              <input value={item.notes} placeholder="Notes" disabled={!editable} onChange={(event) => setChecklist((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, notes: event.target.value } : entry))} />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function EvaluationSummary({ evaluation }: { evaluation: Evaluation }) {
  return (
    <Facts items={[
      { label: 'Proposed installment', value: money(evaluation.proposedInstallment) },
      { label: 'Disposable income', value: money(evaluation.disposableIncome) },
      { label: 'Installment to income', value: ratioPercent(evaluation.installmentToIncomeRatio) },
      { label: 'Policy maximum', value: ratioPercent(evaluation.maxInstallmentToIncome) },
      { label: 'Within policy', value: evaluation.withinPolicy ? 'Yes' : 'No' },
      { label: 'Recommendation', value: label(evaluation.recommendation) },
      { label: 'Evaluator', value: evaluation.evaluatorName },
      { label: 'Updated', value: formatWhen(evaluation.updatedAt) },
    ]} />
  );
}

export function ApprovalPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const record = useResource<One<Application>>(id ? `/api/applications/${id}` : null);
  const application = record.data?.data;
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [comments, setComments] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (record.loading && !application) return <Loading />;
  if (!application) return <Alert>{record.error ?? 'Application not found.'}</Alert>;
  const evaluation = application.evaluation;
  const approval = application.approval;
  const canDecide = can('credit.approve') && application.status === 'under_review' && evaluation && !approval;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/applications/${application!.id}/approval`, {
        method: 'POST',
        body: { decision, comments: blankToNull(comments) },
      });
      record.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={application.applicationNumber}
        title="Approval"
        lede="One decision. It cannot be changed after it is recorded."
        actions={<Link className="btn" to={`/applications/${application.id}`}>Application</Link>}
      />
      <Alert>{error}</Alert>
      <div className="grid-2">
        <Card title="Evaluation">
          {evaluation ? <EvaluationSummary evaluation={evaluation} /> : <Alert kind="info">Record an evaluation before a decision can be made.</Alert>}
          {evaluation ? (
            <div className="stack" style={{ marginTop: 14 }}>
              {evaluation.checklist.map((item) => (
                <div key={item.code} className="actions">
                  <Badge value={item.result} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          ) : null}
        </Card>
        <Card title="Decision">
          {approval ? (
            <Facts items={[
              { label: 'Decision', value: <Badge value={approval.decision} /> },
              { label: 'Approver', value: approval.approverName },
              { label: 'When', value: formatWhen(approval.decidedAt) },
              { label: 'Comments', value: approval.comments || '—' },
            ]} />
          ) : canDecide ? (
            <form className="stack" onSubmit={onSubmit}>
              <Field label="Decision">
                <select value={decision} onChange={(event) => setDecision(event.target.value as 'approved' | 'rejected')}>
                  <option value="approved">Approve</option>
                  <option value="rejected">Reject</option>
                </select>
              </Field>
              <Field label="Comments"><textarea value={comments} onChange={(event) => setComments(event.target.value)} /></Field>
              {evaluation && !evaluation.withinPolicy && decision === 'approved' ? (
                <Alert kind="info">The installment is above the income policy. You can still approve.</Alert>
              ) : null}
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Record decision'}</button>
            </form>
          ) : (
            <p className="muted">
              {application.status === 'submitted' ? 'The evaluation has to be saved before this application can be decided.' : 'A decision is available once the application is under review.'}
            </p>
          )}
          {approval?.decision === 'approved' && can('agreements.write') ? (
            <div style={{ marginTop: 14 }}><Link className="btn btn-primary" to={`/applications/${application.id}`}>Create the agreement</Link></div>
          ) : null}
        </Card>
      </div>
      <p className="hint">Recorded {formatDate(application.createdAt)}.</p>
    </>
  );
}
