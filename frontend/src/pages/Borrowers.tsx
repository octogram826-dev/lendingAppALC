import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { Alert, Badge, Card, Empty, Facts, Field, Filters, Loading, PageHeader, Pager } from '../components/ui';
import { api, errorText } from '../lib/api';
import { blankToNull, formatDate, formatWhen, money, qs } from '../lib/format';
import { useResource } from '../lib/resource';
import type { Borrower, One, Page } from '../lib/types';

const GENDERS = ['unspecified', 'female', 'male', 'other'];
const CIVIL = ['unspecified', 'single', 'married', 'widowed', 'separated'];
const EMPLOYMENT = ['', 'employed', 'self_employed', 'business_owner', 'retired', 'unemployed', 'other'];
const DOCUMENTS = ['national_id', 'passport', 'drivers_license', 'tax_id', 'social_security', 'other'];

export function BorrowersPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') || 1);
  const q = params.get('q') ?? '';
  const verification = params.get('verification') ?? '';
  const [draft, setDraft] = useState(q);
  const list = useResource<Page<Borrower>>(`/api/borrowers${qs({ page, pageSize: 20, q, verificationStatus: verification })}`);

  function search(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams(params);
    if (draft.trim()) next.set('q', draft.trim());
    else next.delete('q');
    next.delete('page');
    setParams(next);
  }

  function setVerification(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set('verification', value);
    else next.delete('verification');
    next.delete('page');
    setParams(next);
  }

  return (
    <>
      <PageHeader
        eyebrow="Lending"
        title="Borrowers"
        lede="Profiles, contact details, and identity records."
        actions={can('borrowers.write') ? <Link className="btn btn-primary" to="/borrowers/new">New borrower</Link> : null}
      />
      <Card>
        <Filters query={draft} onQuery={setDraft} onSearch={search}>
          <select aria-label="Verification" value={verification} onChange={(event) => setVerification(event.target.value)}>
            <option value="">All verification</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
        </Filters>
        {list.error ? <Alert>{list.error}</Alert> : null}
        {list.loading && !list.data ? <Loading /> : null}
        {list.data && list.data.data.length === 0 ? <Empty title="No borrowers match" body="Try another name, number, or verification status." /> : null}
        {list.data && list.data.data.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Borrower</th>
                  <th>Contact</th>
                  <th>City</th>
                  <th>Income</th>
                  <th>Verification</th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((borrower) => (
                  <tr key={borrower.id}>
                    <td>
                      <Link to={`/borrowers/${borrower.id}`}>{borrower.fullName}</Link>
                      <div className="hint">{borrower.borrowerNumber}</div>
                    </td>
                    <td>
                      {borrower.mobile || '—'}
                      <div className="hint">{borrower.email || 'No email'}</div>
                    </td>
                    <td>{borrower.city || '—'}</td>
                    <td className="num">{money(borrower.monthlyIncome)}</td>
                    <td><Badge value={borrower.verificationStatus} /></td>
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

type BorrowerDraft = {
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  civilStatus: string;
  email: string;
  mobile: string;
  addressLine: string;
  city: string;
  province: string;
  postalCode: string;
  employmentStatus: string;
  employerName: string;
  monthlyIncome: string;
};

const EMPTY_BORROWER: BorrowerDraft = {
  firstName: '',
  middleName: '',
  lastName: '',
  dateOfBirth: '',
  gender: 'unspecified',
  civilStatus: 'unspecified',
  email: '',
  mobile: '',
  addressLine: '',
  city: '',
  province: '',
  postalCode: '',
  employmentStatus: '',
  employerName: '',
  monthlyIncome: '',
};

function payload(draft: BorrowerDraft) {
  return {
    firstName: draft.firstName.trim(),
    middleName: blankToNull(draft.middleName),
    lastName: draft.lastName.trim(),
    dateOfBirth: blankToNull(draft.dateOfBirth),
    gender: draft.gender,
    civilStatus: draft.civilStatus,
    email: blankToNull(draft.email),
    mobile: blankToNull(draft.mobile),
    addressLine: blankToNull(draft.addressLine),
    city: blankToNull(draft.city),
    province: blankToNull(draft.province),
    postalCode: blankToNull(draft.postalCode),
    employmentStatus: draft.employmentStatus || null,
    employerName: blankToNull(draft.employerName),
    monthlyIncome: draft.monthlyIncome.trim() ? Number(draft.monthlyIncome) : null,
  };
}

export function BorrowerFormPage() {
  const { id } = useParams();
  const creating = !id;
  const navigate = useNavigate();
  const existing = useResource<One<Borrower>>(id ? `/api/borrowers/${id}` : null);
  const [draft, setDraft] = useState<BorrowerDraft>(EMPTY_BORROWER);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const borrower = existing.data?.data;
    if (!borrower) return;
    setDraft({
      firstName: borrower.firstName,
      middleName: borrower.middleName ?? '',
      lastName: borrower.lastName,
      dateOfBirth: borrower.dateOfBirth ?? '',
      gender: borrower.gender,
      civilStatus: borrower.civilStatus,
      email: borrower.email ?? '',
      mobile: borrower.mobile ?? '',
      addressLine: borrower.addressLine ?? '',
      city: borrower.city ?? '',
      province: borrower.province ?? '',
      postalCode: borrower.postalCode ?? '',
      employmentStatus: borrower.employmentStatus ?? '',
      employerName: borrower.employerName ?? '',
      monthlyIncome: borrower.monthlyIncome == null ? '' : String(borrower.monthlyIncome),
    });
  }, [existing.data]);

  function set<K extends keyof BorrowerDraft>(key: K, value: BorrowerDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (creating) {
        const created = await api<One<Borrower>>('/api/borrowers', { method: 'POST', body: payload(draft) });
        navigate(`/borrowers/${created.data.id}`);
      } else {
        await api(`/api/borrowers/${id}`, { method: 'PATCH', body: payload(draft) });
        navigate(`/borrowers/${id}`);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Borrowers" title={creating ? 'New borrower' : 'Edit borrower'} lede="Verification is recorded on the borrower page, not in this form." />
      {existing.error ? <Alert>{existing.error}</Alert> : null}
      {existing.loading && !creating ? <Loading /> : null}
      {creating || existing.data ? (
        <Card>
          <form className="form-grid" onSubmit={onSubmit}>
            <div className="span-2"><Alert>{error}</Alert></div>
            <Field label="First name"><input value={draft.firstName} onChange={(event) => set('firstName', event.target.value)} required /></Field>
            <Field label="Middle name"><input value={draft.middleName} onChange={(event) => set('middleName', event.target.value)} /></Field>
            <Field label="Last name"><input value={draft.lastName} onChange={(event) => set('lastName', event.target.value)} required /></Field>
            <Field label="Date of birth"><input type="date" value={draft.dateOfBirth} onChange={(event) => set('dateOfBirth', event.target.value)} /></Field>
            <Field label="Gender">
              <select value={draft.gender} onChange={(event) => set('gender', event.target.value)}>
                {GENDERS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Civil status">
              <select value={draft.civilStatus} onChange={(event) => set('civilStatus', event.target.value)}>
                {CIVIL.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
              </select>
            </Field>
            <Field label="Email"><input type="email" value={draft.email} onChange={(event) => set('email', event.target.value)} /></Field>
            <Field label="Mobile"><input value={draft.mobile} onChange={(event) => set('mobile', event.target.value)} /></Field>
            <Field className="span-2" label="Address"><input value={draft.addressLine} onChange={(event) => set('addressLine', event.target.value)} /></Field>
            <Field label="City"><input value={draft.city} onChange={(event) => set('city', event.target.value)} /></Field>
            <Field label="Province"><input value={draft.province} onChange={(event) => set('province', event.target.value)} /></Field>
            <Field label="Postal code"><input value={draft.postalCode} onChange={(event) => set('postalCode', event.target.value)} /></Field>
            <Field label="Employment">
              <select value={draft.employmentStatus} onChange={(event) => set('employmentStatus', event.target.value)}>
                <option value="">Not recorded</option>
                {EMPLOYMENT.filter(Boolean).map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
              </select>
            </Field>
            <Field label="Employer"><input value={draft.employerName} onChange={(event) => set('employerName', event.target.value)} /></Field>
            <Field label="Stated monthly income"><input inputMode="decimal" value={draft.monthlyIncome} onChange={(event) => set('monthlyIncome', event.target.value)} /></Field>
            <div className="span-2 actions">
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : creating ? 'Create borrower' : 'Save borrower'}</button>
              <Link className="btn" to={id ? `/borrowers/${id}` : '/borrowers'}>Cancel</Link>
            </div>
          </form>
        </Card>
      ) : null}
    </>
  );
}

export function BorrowerRecordPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const record = useResource<One<Borrower>>(id ? `/api/borrowers/${id}` : null);
  const borrower = record.data?.data;
  const [status, setStatus] = useState('pending');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDoc, setShowDoc] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    if (!borrower) return;
    setStatus(borrower.verificationStatus);
    setNotes(borrower.verificationNotes ?? '');
  }, [borrower]);

  async function saveVerification(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await api(`/api/borrowers/${id}/verification`, { method: 'POST', body: { status, notes: blankToNull(notes) } });
      setNotice('Verification saved.');
      record.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (!borrower && record.loading) return <Loading />;
  if (!borrower) return <Alert>{record.error ?? 'Borrower not found.'}</Alert>;

  return (
    <>
      <PageHeader
        eyebrow={borrower.borrowerNumber}
        title={borrower.fullName}
        lede={<Badge value={borrower.verificationStatus} />}
        actions={
          <>
            {can('borrowers.write') ? <Link className="btn" to={`/borrowers/${borrower.id}/edit`}>Edit profile</Link> : null}
            {can('applications.write') ? <Link className="btn btn-primary" to={`/applications/new?borrowerId=${borrower.id}`}>New application</Link> : null}
          </>
        }
      />
      <Alert>{error}</Alert>
      <Alert kind="ok">{notice}</Alert>
      <div className="grid-2">
        <Card title="Profile">
          <Facts items={[
            { label: 'Date of birth', value: formatDate(borrower.dateOfBirth) },
            { label: 'Gender', value: borrower.gender },
            { label: 'Civil status', value: borrower.civilStatus.replaceAll('_', ' ') },
            { label: 'Mobile', value: borrower.mobile || '—' },
            { label: 'Email', value: borrower.email || '—' },
            { label: 'Address', value: [borrower.addressLine, borrower.city, borrower.province, borrower.postalCode].filter(Boolean).join(', ') || '—' },
            { label: 'Employment', value: borrower.employmentStatus?.replaceAll('_', ' ') || '—' },
            { label: 'Employer', value: borrower.employerName || '—' },
            { label: 'Stated monthly income', value: money(borrower.monthlyIncome) },
            { label: 'Recorded', value: formatWhen(borrower.createdAt) },
          ]} />
        </Card>
        <Card title="Verification">
          <p className="hint">An application can be submitted only after the borrower is verified. Individual document checks are recorded here and are not a submit gate.</p>
          {can('borrowers.verify') ? (
            <form className="stack" style={{ marginTop: 12 }} onSubmit={saveVerification}>
              <Field label="Status">
                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="pending">Pending</option>
                  <option value="verified">Verified</option>
                  <option value="rejected">Rejected</option>
                </select>
              </Field>
              <Field label="Notes"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save verification'}</button>
            </form>
          ) : (
            <div style={{ marginTop: 12 }}>
              <Badge value={borrower.verificationStatus} />
              <p style={{ marginTop: 8 }}>{borrower.verificationNotes || 'No notes.'}</p>
              {borrower.verifiedAt ? <p className="hint">Updated {formatWhen(borrower.verifiedAt)}</p> : null}
            </div>
          )}
        </Card>
      </div>
      <Card
        title="Identity documents"
        action={can('borrowers.write') ? <button type="button" className="btn" onClick={() => setShowDoc((value) => !value)}>{showDoc ? 'Close' : 'Record document'}</button> : null}
      >
        {showDoc ? <DocumentForm borrowerId={borrower.id} onDone={() => { setShowDoc(false); record.reload(); }} /> : null}
        {(borrower.documents ?? []).length === 0 ? <Empty title="No identity documents" body="Record a national ID, passport, or other document." /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Number</th>
                  <th>Issued</th>
                  <th>Expiry</th>
                  <th>Reference</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(borrower.documents ?? []).map((document) => (
                  <tr key={document.id}>
                    <td>{document.documentType.replaceAll('_', ' ')}</td>
                    <td>{document.documentNumber}</td>
                    <td>{formatDate(document.issuedDate)}</td>
                    <td>{formatDate(document.expiryDate)}</td>
                    <td>{document.fileReference || '—'}</td>
                    <td><Badge value={document.verificationStatus} /></td>
                    <td>
                      {can('borrowers.write') || can('borrowers.verify') ? (
                        <button type="button" className="btn" onClick={() => setEditingId(editingId === document.id ? null : document.id)}>Edit</button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {editingId ? (
          <DocumentEdit
            borrowerId={borrower.id}
            document={(borrower.documents ?? []).find((item) => item.id === editingId)!}
            canWrite={can('borrowers.write')}
            canVerify={can('borrowers.verify')}
            onDone={() => { setEditingId(null); record.reload(); }}
          />
        ) : null}
      </Card>
    </>
  );
}

function DocumentForm({ borrowerId, onDone }: { borrowerId: number; onDone: () => void }) {
  const [documentType, setDocumentType] = useState('national_id');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issuedDate, setIssuedDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [fileReference, setFileReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/borrowers/${borrowerId}/documents`, {
        method: 'POST',
        body: {
          documentType,
          documentNumber,
          issuedDate: blankToNull(issuedDate),
          expiryDate: blankToNull(expiryDate),
          fileReference: blankToNull(fileReference),
          notes: blankToNull(notes),
        },
      });
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-grid" style={{ marginBottom: 16 }} onSubmit={onSubmit}>
      <div className="span-2"><Alert>{error}</Alert></div>
      <Field label="Type">
        <select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>
          {DOCUMENTS.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
        </select>
      </Field>
      <Field label="Number"><input value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} required /></Field>
      <Field label="Issued"><input type="date" value={issuedDate} onChange={(event) => setIssuedDate(event.target.value)} /></Field>
      <Field label="Expiry"><input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} /></Field>
      <Field className="span-2" label="File reference" hint="A path or reference. Files are not uploaded.">
        <input value={fileReference} onChange={(event) => setFileReference(event.target.value)} />
      </Field>
      <Field className="span-2" label="Notes"><input value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
      <div className="span-2"><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Add document'}</button></div>
    </form>
  );
}

function DocumentEdit({
  borrowerId,
  document,
  canWrite,
  canVerify,
  onDone,
}: {
  borrowerId: number;
  document: NonNullable<Borrower['documents']>[number];
  canWrite: boolean;
  canVerify: boolean;
  onDone: () => void;
}) {
  const [documentNumber, setDocumentNumber] = useState(document.documentNumber);
  const [fileReference, setFileReference] = useState(document.fileReference ?? '');
  const [notes, setNotes] = useState(document.notes ?? '');
  const [verificationStatus, setVerificationStatus] = useState(document.verificationStatus);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, string | null> = {};
      if (canWrite) {
        body.documentNumber = documentNumber;
        body.fileReference = blankToNull(fileReference);
        body.notes = blankToNull(notes);
      }
      if (canVerify) body.verificationStatus = verificationStatus;
      await api(`/api/borrowers/${borrowerId}/documents/${document.id}`, { method: 'PATCH', body });
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-grid" style={{ marginTop: 14 }} onSubmit={onSubmit}>
      <div className="span-2"><Alert>{error}</Alert></div>
      <Field label="Number"><input value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} disabled={!canWrite} required /></Field>
      <Field label="File reference"><input value={fileReference} onChange={(event) => setFileReference(event.target.value)} disabled={!canWrite} /></Field>
      <Field label="Notes"><input value={notes} onChange={(event) => setNotes(event.target.value)} disabled={!canWrite} /></Field>
      <Field label="Document verification">
        <select value={verificationStatus} onChange={(event) => setVerificationStatus(event.target.value)} disabled={!canVerify}>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
        </select>
      </Field>
      <div className="span-2 actions">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save document'}</button>
        <button type="button" className="btn" onClick={onDone}>Close</button>
      </div>
    </form>
  );
}
