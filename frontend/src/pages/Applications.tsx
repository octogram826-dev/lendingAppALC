import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { Alert, Badge, Card, Empty, Facts, Field, Filters, Loading, PageHeader, Pager, Steps } from '../components/ui';
import { api, errorText } from '../lib/api';
import { blankToNull, formatDate, formatWhen, label, money, qs, ratioPercent } from '../lib/format';
import { useResource } from '../lib/resource';
import type { Application, ApplicationRequirement, Borrower, Evaluation, One, Page, Product } from '../lib/types';

const STATUSES = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'withdrawn', 'disbursed'];
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
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') || 1);
  const q = params.get('q') ?? '';
  const status = params.get('status') ?? '';
  const [draft, setDraft] = useState(q);
  const list = useResource<Page<Application>>(`/api/applications${qs({ page, pageSize: 20, q, status })}`);

  function search(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams(params);
    if (draft.trim()) next.set('q', draft.trim());
    else next.delete('q');
    next.delete('page');
    setParams(next);
  }

  return (
    <>
      <PageHeader
        eyebrow="Lending"
        title="Applications"
        lede="Drafts, credit review, and the decision that opens an agreement."
        actions={can('applications.write') ? <Link className="btn btn-primary" to="/applications/new">New application</Link> : null}
      />
      <Card>
        <Filters query={draft} onQuery={setDraft} onSearch={search}>
          <select aria-label="Status" value={status} onChange={(event) => {
            const next = new URLSearchParams(params);
            if (event.target.value) next.set('status', event.target.value);
            else next.delete('status');
            next.delete('page');
            setParams(next);
          }}>
            <option value="">All statuses</option>
            {STATUSES.map((item) => <option key={item} value={item}>{label(item)}</option>)}
          </select>
        </Filters>
        {list.error ? <Alert>{list.error}</Alert> : null}
        {list.loading && !list.data ? <Loading /> : null}
        {list.data && list.data.data.length === 0 ? <Empty title="No applications match" /> : null}
        {list.data && list.data.data.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Application</th>
                  <th>Borrower</th>
                  <th>Product</th>
                  <th className="num">Amount</th>
                  <th className="num">Term</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((application) => (
                  <tr key={application.id}>
                    <td><Link to={`/applications/${application.id}`}>{application.applicationNumber}</Link></td>
                    <td>
                      <Link to={`/borrowers/${application.borrowerId}`}>{application.borrowerName}</Link>
                      <div className="hint">{application.borrowerNumber}</div>
                    </td>
                    <td>{application.productCode}</td>
                    <td className="num">{money(application.requestedAmount)}</td>
                    <td className="num">{application.termMonths} mo</td>
                    <td><Badge value={application.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {list.data ? (
          <Pager page={list.data.meta.page} pageSize={list.data.meta.pageSize} total={list.data.meta.total} onPage={(nextPage) => {
            const next = new URLSearchParams(params);
            next.set('page', String(nextPage));
            setParams(next);
          }} />
        ) : null}
      </Card>
    </>
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
      void api<Page<Borrower>>(`/api/borrowers${qs({ q: query, pageSize: 8 })}`)
        .then((result) => setResults(result.data))
        .catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  const product = products.data?.data.find((item) => String(item.id) === productId);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!borrower || !product) {
      setError('Choose a borrower and a product.');
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
    <>
      <PageHeader eyebrow="Applications" title="New application" lede="Borrower and product stay fixed after this draft is created. The rate is copied from the product." />
      <Card>
        <form className="stack" onSubmit={onSubmit}>
          <Alert>{error}</Alert>
          {preset.error ? <Alert>{preset.error}</Alert> : null}
          <Field label="Borrower" hint="Search by name or borrower number.">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search borrowers" />
          </Field>
          <div className="pick-list">
            {borrower ? (
              <div className="pick on">
                <strong>{borrower.fullName}</strong>
                <span className="hint">{borrower.borrowerNumber} · {label(borrower.verificationStatus)}</span>
              </div>
            ) : null}
            {results.filter((item) => item.id !== borrower?.id).map((item) => (
              <button type="button" key={item.id} className="pick" onClick={() => setBorrower(item)}>
                <strong>{item.fullName}</strong>
                <span className="hint">{item.borrowerNumber} · {label(item.verificationStatus)}</span>
              </button>
            ))}
          </div>
          {borrower && borrower.verificationStatus !== 'verified' ? (
            <Alert kind="info">This borrower is not verified yet. You can save a draft, and submit it after verification.</Alert>
          ) : null}
          <Field label="Product">
            <select value={productId} onChange={(event) => setProductId(event.target.value)} required>
              <option value="">Choose a product</option>
              {products.data?.data.map((item) => (
                <option key={item.id} value={item.id}>{item.code} · {item.name}</option>
              ))}
            </select>
          </Field>
          {product ? (
            <p className="hint">
              {product.monthlyInterestRate}% monthly flat · {money(product.minAmount)}–{money(product.maxAmount)} · {product.minTermMonths}–{product.maxTermMonths} months
            </p>
          ) : null}
          <div className="form-grid">
            <Field label="Requested amount"><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required /></Field>
            <Field label="Term (months)"><input inputMode="numeric" value={term} onChange={(event) => setTerm(event.target.value)} required /></Field>
            <Field className="span-2" label="Purpose"><input value={purpose} onChange={(event) => setPurpose(event.target.value)} /></Field>
          </div>
          <div className="actions">
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Create draft'}</button>
            <Link className="btn" to="/applications">Cancel</Link>
          </div>
        </form>
      </Card>
    </>
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

  return (
    <>
      <PageHeader
        eyebrow={application.applicationNumber}
        title={application.borrowerName}
        lede={<><Badge value={application.status} /> <span className="hint">{application.productCode} · {application.productName}</span></>}
        actions={
          <>
            <Link className="btn" to={`/borrowers/${application.borrowerId}`}>Borrower</Link>
            {application.evaluation || ['submitted', 'under_review', 'approved', 'rejected', 'disbursed'].includes(application.status) ? (
              <Link className="btn" to={`/applications/${application.id}/evaluation`}>Evaluation</Link>
            ) : null}
            {application.evaluation || application.approval ? <Link className="btn" to={`/applications/${application.id}/approval`}>Approval</Link> : null}
          </>
        }
      />
      <Steps items={stepsFor(application)} />
      <Alert>{error}</Alert>
      <Alert kind="ok">{notice}</Alert>
      {application.borrowerVerificationStatus !== 'verified' && ['draft', 'submitted'].includes(application.status) ? (
        <Alert kind="info">Borrower verification is {label(application.borrowerVerificationStatus)}. Submit stays blocked until the borrower is verified.</Alert>
      ) : null}
      <div className="grid-2">
        <Card title="Terms">
          {application.status === 'draft' && writable ? (
            <form className="form-grid" onSubmit={(event) => {
              event.preventDefault();
              void act(async () => {
                await api(`/api/applications/${application.id}`, {
                  method: 'PATCH',
                  body: { requestedAmount: Number(amount), termMonths: Number(term), purpose: blankToNull(purpose) },
                });
                setNotice('Draft saved. The rate was refreshed from the product.');
              });
            }}>
              <Field label="Amount"><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required /></Field>
              <Field label="Term (months)"><input inputMode="numeric" value={term} onChange={(event) => setTerm(event.target.value)} required /></Field>
              <Field className="span-2" label="Purpose"><input value={purpose} onChange={(event) => setPurpose(event.target.value)} /></Field>
              <div className="span-2"><button className="btn btn-primary" disabled={busy}>Save draft</button></div>
            </form>
          ) : (
            <Facts items={[
              { label: 'Amount', value: money(application.requestedAmount) },
              { label: 'Term', value: `${application.termMonths} months` },
              { label: 'Monthly rate', value: `${application.monthlyInterestRate}%` },
              { label: 'Purpose', value: application.purpose || '—' },
              { label: 'Submitted', value: formatWhen(application.submittedAt) },
              { label: 'Borrower check', value: label(application.borrowerVerificationStatus) },
            ]} />
          )}
          {application.status === 'draft' ? <p className="hint" style={{ marginTop: 10 }}>Rate on file: {application.monthlyInterestRate}% monthly, copied from the product.</p> : null}
        </Card>
        <Card title="Next step">
          <div className="stack">
            {application.status === 'draft' && writable ? (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act(async () => {
                await api(`/api/applications/${application.id}/submit`, { method: 'POST' });
                setNotice('Application submitted.');
              })}>Submit application</button>
            ) : null}
            {['draft', 'submitted'].includes(application.status) && writable ? (
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void act(async () => {
                await api(`/api/applications/${application.id}/withdraw`, { method: 'POST' });
                setNotice('Application withdrawn.');
              })}>Withdraw</button>
            ) : null}
            {['submitted', 'under_review'].includes(application.status) ? (
              <Link className="btn btn-primary" to={`/applications/${application.id}/evaluation`}>
                {can('credit.evaluate') ? 'Record evaluation' : 'View evaluation'}
              </Link>
            ) : null}
            {application.status === 'under_review' ? (
              <Link className="btn" to={`/applications/${application.id}/approval`}>
                {can('credit.approve') ? 'Record decision' : 'View decision'}
              </Link>
            ) : null}
            {application.status === 'approved' && !application.agreement && can('agreements.write') ? (
              <form className="stack" onSubmit={(event) => {
                event.preventDefault();
                void act(async () => {
                  const created = await api<One<{ id: number }>>(`/api/applications/${application.id}/agreement`, {
                    method: 'POST',
                    body: { firstDueDate: dueDate },
                  });
                  navigate(`/agreements/${created.data.id}`);
                });
              }}>
                <Field label="First due date" hint="The release date cannot be after this date.">
                  <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required />
                </Field>
                <button className="btn btn-primary" disabled={busy}>Create agreement</button>
              </form>
            ) : null}
            {application.agreement ? (
              <Link className="btn btn-primary" to={`/agreements/${application.agreement.id}`}>
                Agreement {application.agreement.agreementNumber}
              </Link>
            ) : null}
            {application.approval ? <p>Decision: {label(application.approval.decision)} by {application.approval.approverName}.</p> : null}
            {application.status === 'rejected' ? <p className="muted">This application is closed.</p> : null}
            {application.status === 'withdrawn' ? <p className="muted">This application was withdrawn.</p> : null}
          </div>
        </Card>
      </div>
      <Card title="Requirements">
        <p className="hint" style={{ marginBottom: 10 }}>Required items must be submitted or waived before the application can be submitted.</p>
        {(application.requirements ?? []).length === 0 ? <Empty title="No requirements were copied from the product" /> : (
          <div className="stack">
            {application.requirements?.map((requirement) => (
              <RequirementEditor
                key={requirement.id}
                applicationId={application.id}
                requirement={requirement}
                editable={writable && openForRequirements}
                onSaved={() => record.reload()}
              />
            ))}
          </div>
        )}
      </Card>
    </>
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

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/applications/${applicationId}/requirements/${requirement.id}`, {
        method: 'PATCH',
        body: { status, notes: blankToNull(notes) },
      });
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="check-item" onSubmit={save}>
      <Alert>{error}</Alert>
      <header>
        <strong>{requirement.name}{requirement.isRequired ? '' : ' · optional'}</strong>
        <Badge value={requirement.status} />
      </header>
      {editable ? (
        <div className="form-grid">
          <Field label="Status">
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="pending">Pending</option>
              <option value="submitted">Submitted</option>
              <option value="waived">Waived</option>
            </select>
          </Field>
          <Field label="Notes"><input value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
          <div><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save requirement'}</button></div>
        </div>
      ) : <p className="hint">{requirement.notes || 'No notes.'}</p>}
    </form>
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
