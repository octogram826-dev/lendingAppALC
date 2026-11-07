import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { Alert, Badge, Card, Empty, Facts, Field, Filters, Loading, PageHeader, Pager } from '../components/ui';
import { api, errorText } from '../lib/api';
import { blankToNull, formatDate, formatWhen, label, localDate, money, qs } from '../lib/format';
import { useResource } from '../lib/resource';
import type { Agreement, One, Page } from '../lib/types';

const STATUSES = ['draft', 'executed', 'disbursed', 'cancelled'];

export function AgreementsPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') || 1);
  const q = params.get('q') ?? '';
  const status = params.get('status') ?? '';
  const [draft, setDraft] = useState(q);
  const list = useResource<Page<Agreement>>(`/api/agreements${qs({ page, pageSize: 20, q, status })}`);

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
      <PageHeader eyebrow="Lending" title="Agreements" lede="An agreement is created from an approved application. Fund release happens after it is executed." />
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
        {list.data && list.data.data.length === 0 ? <Empty title="No agreements match" /> : null}
        {list.data && list.data.data.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Agreement</th>
                  <th>Borrower</th>
                  <th className="num">Principal</th>
                  <th className="num">Installment</th>
                  <th>First due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((agreement) => (
                  <tr key={agreement.id}>
                    <td>
                      <Link to={`/agreements/${agreement.id}`}>{agreement.agreementNumber}</Link>
                      <div className="hint">{agreement.applicationNumber}</div>
                    </td>
                    <td>{agreement.borrowerName}</td>
                    <td className="num">{money(agreement.principal)}</td>
                    <td className="num">{money(agreement.installmentAmount)}</td>
                    <td>{formatDate(agreement.firstDueDate)}</td>
                    <td><Badge value={agreement.status} /></td>
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

export function AgreementRecordPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const record = useResource<One<Agreement>>(id ? `/api/agreements/${id}` : null);
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
    <>
      <PageHeader
        eyebrow={agreement.agreementNumber}
        title={agreement.borrowerName}
        lede={<Badge value={agreement.status} />}
        actions={
          <>
            <Link className="btn" to={`/applications/${agreement.applicationId}`}>Application</Link>
            <Link className="btn" to={`/borrowers/${agreement.borrowerId}`}>Borrower</Link>
            {agreement.status === 'executed' && can('disbursements.write') ? <Link className="btn btn-primary" to={`/agreements/${agreement.id}/disburse`}>Release funds</Link> : null}
            {agreement.status === 'disbursed' && can('loans.read') ? <Link className="btn btn-primary" to={`/loans?q=${agreement.agreementNumber}`}>Open loan</Link> : null}
          </>
        }
      />
      <Alert>{error}</Alert>
      <Alert kind="ok">{notice}</Alert>
      <div className="grid-2">
        <Card title="Terms">
          <Facts items={[
            { label: 'Principal', value: money(agreement.principal) },
            { label: 'Monthly rate', value: `${agreement.monthlyInterestRate}%` },
            { label: 'Term', value: `${agreement.termMonths} months` },
            { label: 'Total interest', value: money(agreement.totalInterest) },
            { label: 'Total payable', value: money(agreement.totalPayable) },
            { label: 'Regular installment', value: money(agreement.installmentAmount) },
            { label: 'Final installment', value: money(agreement.finalInstallmentAmount) },
            { label: 'Product', value: agreement.productCode },
            { label: 'Executed', value: formatWhen(agreement.executedAt) },
            { label: 'Cancelled', value: agreement.cancelledAt ? `${formatWhen(agreement.cancelledAt)}${agreement.cancellationNotes ? ` · ${agreement.cancellationNotes}` : ''}` : '—' },
          ]} />
        </Card>
        <Card title="First due date">
          {canEditDue ? (
            <form className="stack" onSubmit={(event) => {
              event.preventDefault();
              void act(async () => {
                await api(`/api/agreements/${agreement.id}`, { method: 'PATCH', body: { firstDueDate: dueDate } });
                setNotice('First due date saved.');
              });
            }}>
              <Field label="Due date" hint="The fund release date has to be on or before this date.">
                <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required />
              </Field>
              <button className="btn btn-primary" disabled={busy}>Save due date</button>
            </form>
          ) : (
            <p>{formatDate(agreement.firstDueDate)}</p>
          )}
          <div className="stack" style={{ marginTop: 16 }}>
            {writable && agreement.status === 'draft' ? (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act(async () => {
                await api(`/api/agreements/${agreement.id}/execute`, { method: 'POST' });
                setNotice('Agreement executed.');
              })}>Execute agreement</button>
            ) : null}
            {writable && (agreement.status === 'draft' || agreement.status === 'executed') ? (
              <button type="button" className="btn btn-danger" onClick={() => setShowCancel((value) => !value)}>Cancel agreement</button>
            ) : null}
            {agreement.status === 'draft' ? <p className="hint">Record at least one document before execution.</p> : null}
          </div>
          {showCancel ? (
            <form className="stack" style={{ marginTop: 12 }} onSubmit={(event) => {
              event.preventDefault();
              void act(async () => {
                await api(`/api/agreements/${agreement.id}/cancel`, { method: 'POST', body: { notes: blankToNull(cancelNotes) } });
                setShowCancel(false);
                setNotice('Agreement cancelled. A new agreement can be created from the application.');
              });
            }}>
              <Field label="Cancellation notes"><textarea value={cancelNotes} onChange={(event) => setCancelNotes(event.target.value)} /></Field>
              <button className="btn btn-danger" disabled={busy}>{busy ? 'Cancelling…' : 'Confirm cancellation'}</button>
            </form>
          ) : null}
        </Card>
      </div>
      <Card title="Documents">
        {(agreement.documents ?? []).length === 0 ? <Empty title="No documents recorded" /> : (
          <div className="table-wrap">
            <table>
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
          <form className="form-grid" style={{ marginTop: 16 }} onSubmit={(event) => {
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
            <Field label="Document type"><input value={documentType} onChange={(event) => setDocumentType(event.target.value)} required /></Field>
            <Field label="File reference" hint="A path or reference. Files are not uploaded."><input value={fileReference} onChange={(event) => setFileReference(event.target.value)} /></Field>
            <Field className="span-2" label="Notes"><input value={docNotes} onChange={(event) => setDocNotes(event.target.value)} /></Field>
            <div><button className="btn" disabled={busy}>Record document</button></div>
          </form>
        ) : null}
      </Card>
    </>
  );
}

export function DisbursePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const record = useResource<One<Agreement>>(id ? `/api/agreements/${id}` : null);
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
    <>
      <PageHeader
        eyebrow={agreement.agreementNumber}
        title="Release funds"
        lede={`${agreement.borrowerName} · principal ${money(agreement.principal)}`}
        actions={<Link className="btn" to={`/agreements/${agreement.id}`}>Agreement</Link>}
      />
      {agreement.status !== 'executed' ? (
        <Alert kind="info">
          {agreement.status === 'disbursed'
            ? 'Funds for this agreement are already released.'
            : 'Only an executed agreement can be disbursed.'}
        </Alert>
      ) : (
        <Card>
          <form className="form-grid" onSubmit={onSubmit}>
            <div className="span-2"><Alert>{error}</Alert></div>
            <Field label="Release date" hint={`On or before the first due date, ${formatDate(agreement.firstDueDate)}. The amount is the full principal.`}>
              <input type="date" value={releaseDate} max={agreement.firstDueDate} onChange={(event) => setReleaseDate(event.target.value)} required />
            </Field>
            <Field label="Method">
              <select value={method} onChange={(event) => setMethod(event.target.value)}>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="check">Check</option>
              </select>
            </Field>
            <Field label="Reference number"><input value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} /></Field>
            <Field label="Notes"><input value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
            <div className="span-2">
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Releasing…' : `Release ${money(agreement.principal)}`}</button>
            </div>
          </form>
        </Card>
      )}
    </>
  );
}
