import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { Alert, Empty, Loading } from '../components/ui';
import { api, errorText } from '../lib/api';
import { blankToNull, formatDate, label, money, qs } from '../lib/format';
import { useResource } from '../lib/resource';
import type { Borrower, IdentityDocument, One, Page } from '../lib/types';

const PAGE_SIZE = 10;
const GENDERS = ['unspecified', 'female', 'male', 'other'];
const CIVIL = ['unspecified', 'single', 'married', 'widowed', 'separated'];
const EMPLOYMENT = ['employed', 'self_employed', 'business_owner', 'retired', 'unemployed', 'other'];
const DOCUMENTS = ['national_id', 'passport', 'drivers_license', 'tax_id', 'social_security', 'other'];
const STATUSES = ['pending', 'verified', 'rejected'] as const;

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

function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function statusClass(status: string) {
  if (status === 'verified') return 'users-pill is-active';
  if (status === 'rejected') return 'users-pill is-off';
  return 'users-pill is-pending';
}

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

export function BorrowersPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') || 1);
  const q = params.get('q') ?? '';
  const verification = params.get('verification') ?? '';
  const [draft, setDraft] = useState(q);
  const [rowError, setRowError] = useState<string | null>(null);
  const [openStatus, setOpenStatus] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const list = useResource<Page<Borrower>>(
    `/api/borrowers${qs({ page, pageSize: PAGE_SIZE, q, verificationStatus: verification })}`,
  );

  useEffect(() => {
    setDraft(q);
  }, [q]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (draft.trim() === q) return;
      const next = new URLSearchParams(params);
      if (draft.trim()) next.set('q', draft.trim());
      else next.delete('q');
      next.delete('page');
      setParams(next);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [draft, params, q, setParams]);

  function setVerification(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set('verification', value);
    else next.delete('verification');
    next.delete('page');
    setParams(next);
  }

  function setPage(nextPage: number) {
    const next = new URLSearchParams(params);
    next.set('page', String(nextPage));
    setParams(next);
  }

  async function changeStatus(borrower: Borrower, status: (typeof STATUSES)[number]) {
    setOpenStatus(null);
    if (borrower.verificationStatus === status) return;
    setRowError(null);
    try {
      await api(`/api/borrowers/${borrower.id}/verification`, { method: 'POST', body: { status } });
      list.reload();
    } catch (err) {
      setRowError(errorText(err));
    }
  }

  async function exportCsv() {
    setExporting(true);
    setRowError(null);
    try {
      const rows: Borrower[] = [];
      let nextPage = 1;
      let total = 0;
      do {
        const result = await api<Page<Borrower>>(
          `/api/borrowers${qs({ page: nextPage, pageSize: 100, q, verificationStatus: verification })}`,
        );
        rows.push(...result.data);
        total = result.meta.total;
        nextPage += 1;
      } while (rows.length < total && nextPage <= 20);
      const lines = [
        ['Number', 'Name', 'Mobile', 'Email', 'City', 'Status'],
        ...rows.map((borrower) => [
          borrower.borrowerNumber,
          borrower.fullName,
          borrower.mobile ?? '',
          borrower.email ?? '',
          borrower.city ?? '',
          label(borrower.verificationStatus),
        ]),
      ];
      const csv = lines.map((line) => line.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'borrowers.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setRowError(errorText(err));
    } finally {
      setExporting(false);
    }
  }

  const total = list.data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="users-page">
      <header className="users-head">
        <div>
          <h1>Borrowers</h1>
          <p>Manage borrower profiles, identity records, and verification status.</p>
        </div>
        <div className="users-head-actions">
          <button type="button" className="users-outline" onClick={exportCsv} disabled={exporting}>
            <img src="/shell/export.svg" alt="" width="20" height="20" />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          {can('borrowers.write') ? (
            <Link className="users-primary" to="/borrowers/new">
              <img src="/shell/plus.svg" alt="" width="20" height="20" />
              Add Borrower
            </Link>
          ) : null}
        </div>
      </header>
      <section className="users-card">
        <div className="users-toolbar">
          <label className="users-search">
            <img src="/shell/search.svg" alt="" width="20" height="20" />
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Search anything..."
              aria-label="Search borrowers"
            />
          </label>
          <div className="users-filters">
            <label className="users-filter">
              <span>Status:</span>
              <select aria-label="Status" value={verification} onChange={(event) => setVerification(event.target.value)}>
                <option value="">All Record</option>
                <option value="pending">Pending</option>
                <option value="verified">Verified</option>
                <option value="rejected">Rejected</option>
              </select>
              <img src="/shell/chevron-down.svg" alt="" width="20" height="20" />
            </label>
          </div>
        </div>
        {list.error ? <Alert>{list.error}</Alert> : null}
        {rowError ? <Alert>{rowError}</Alert> : null}
        {list.loading && !list.data ? <Loading /> : null}
        {list.data && list.data.data.length === 0 ? <Empty title="No borrowers match" /> : null}
        {list.data && list.data.data.length > 0 ? (
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Borrower</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((borrower) => (
                  <tr key={borrower.id}>
                    <td>
                      <div className="users-person">
                        <span className="avatar">{initials(borrower.firstName, borrower.lastName)}</span>
                        <span>
                          <strong>
                            <Link to={`/borrowers/${borrower.id}`}>{borrower.fullName}</Link>
                          </strong>
                          <small>{borrower.borrowerNumber}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="users-person">
                        <span>
                          <strong>{borrower.mobile || '—'}</strong>
                          <small>{borrower.email || 'No email'}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="users-status">
                        <button
                          type="button"
                          className={statusClass(borrower.verificationStatus)}
                          disabled={!can('borrowers.verify')}
                          onClick={() => setOpenStatus((current) => (current === borrower.id ? null : borrower.id))}
                        >
                          {borrower.verificationStatus.toUpperCase()}
                          {can('borrowers.verify') ? <img src="/shell/chevron-status.svg" alt="" width="15" height="15" /> : null}
                        </button>
                        {openStatus === borrower.id ? (
                          <div className="users-status-menu">
                            {STATUSES.map((status) => (
                              <button key={status} type="button" onClick={() => void changeStatus(borrower, status)}>
                                {label(status)}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      {can('borrowers.write') ? (
                        <Link className="users-edit" to={`/borrowers/${borrower.id}/edit`} aria-label={`Edit ${borrower.fullName}`}>
                          <img src="/shell/edit.svg" alt="" width="20" height="20" />
                        </Link>
                      ) : (
                        <Link className="users-edit" to={`/borrowers/${borrower.id}`} aria-label={`Open ${borrower.fullName}`}>
                          <img src="/shell/edit.svg" alt="" width="20" height="20" />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {list.data ? (
          <div className="users-pager">
            <p>
              Showing <strong>{start} to {end}</strong> of <strong>{total} entries</strong>
            </p>
            <div>
              <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <img src="/shell/chevron-left.svg" alt="" width="16" height="16" />
              </button>
              {Array.from({ length: pageCount }, (_, index) => index + 1)
                .filter((number) => number === 1 || number === pageCount || Math.abs(number - page) <= 1)
                .map((number, index, numbers) => {
                  const previous = numbers[index - 1];
                  return (
                    <span key={number}>
                      {previous && number - previous > 1 ? <span className="users-ellipsis">…</span> : null}
                      <button type="button" className={number === page ? 'is-current' : ''} onClick={() => setPage(number)}>
                        {number}
                      </button>
                    </span>
                  );
                })}
              <label className="users-page-pick">
                Page:
                <select aria-label="Page" value={page} onChange={(event) => setPage(Number(event.target.value))}>
                  {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
                    <option key={number} value={number}>
                      {number}
                    </option>
                  ))}
                </select>
                <img src="/shell/chevron-page.svg" alt="" width="14" height="14" />
              </label>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
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
        await api<One<Borrower>>('/api/borrowers', { method: 'POST', body: payload(draft) });
      } else {
        await api(`/api/borrowers/${id}`, { method: 'PATCH', body: payload(draft) });
      }
      navigate('/borrowers');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (!creating && existing.loading && !existing.data) return <Loading />;
  if (!creating && existing.error) return <Alert>{existing.error}</Alert>;

  return (
    <form className="users-page user-form borrower-form" onSubmit={onSubmit}>
      <h1>{creating ? 'Add Borrower' : 'Update Borrower'}</h1>
      {error ? <Alert>{error}</Alert> : null}
      <section className="user-card">
        <h2>
          <i />
          Personal Information
        </h2>
        <div className="user-grid">
          <label>
            <span>First Name <b>*</b></span>
            <input value={draft.firstName} placeholder="e.g., Juan" onChange={(event) => set('firstName', event.target.value)} required />
          </label>
          <label>
            <span>Middle Name</span>
            <input value={draft.middleName} placeholder="e.g., Santos" onChange={(event) => set('middleName', event.target.value)} />
          </label>
          <label>
            <span>Last Name <b>*</b></span>
            <input value={draft.lastName} placeholder="e.g., Dela Cruz" onChange={(event) => set('lastName', event.target.value)} required />
          </label>
          <label>
            <span>Date of Birth</span>
            <input type="date" value={draft.dateOfBirth} onChange={(event) => set('dateOfBirth', event.target.value)} />
          </label>
          <label>
            <span>Gender</span>
            <select value={draft.gender} onChange={(event) => set('gender', event.target.value)}>
              {GENDERS.map((item) => (
                <option key={item} value={item}>{label(item)}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Civil Status</span>
            <select value={draft.civilStatus} onChange={(event) => set('civilStatus', event.target.value)}>
              {CIVIL.map((item) => (
                <option key={item} value={item}>{label(item)}</option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <section className="user-card">
        <h2>
          <i />
          Contact Details
        </h2>
        <div className="user-grid">
          <label>
            <span>Email</span>
            <span className="user-control">
              <img src="/shell/mail.svg" alt="" width="20" height="20" />
              <input type="email" value={draft.email} placeholder="you@example.com" onChange={(event) => set('email', event.target.value)} />
            </span>
          </label>
          <label>
            <span>Mobile</span>
            <input value={draft.mobile} placeholder="09xxxxxxxxx" onChange={(event) => set('mobile', event.target.value)} />
          </label>
          <label>
            <span>Address</span>
            <input value={draft.addressLine} placeholder="Street, barangay" onChange={(event) => set('addressLine', event.target.value)} />
          </label>
          <label>
            <span>City</span>
            <input value={draft.city} placeholder="e.g., Quezon City" onChange={(event) => set('city', event.target.value)} />
          </label>
          <label>
            <span>Province</span>
            <input value={draft.province} placeholder="e.g., Metro Manila" onChange={(event) => set('province', event.target.value)} />
          </label>
          <label>
            <span>Postal Code</span>
            <input value={draft.postalCode} placeholder="e.g., 1100" onChange={(event) => set('postalCode', event.target.value)} />
          </label>
        </div>
      </section>
      <section className="user-card">
        <h2>
          <i />
          Employment
        </h2>
        <div className="user-grid">
          <label>
            <span>Employment Status</span>
            <select value={draft.employmentStatus} onChange={(event) => set('employmentStatus', event.target.value)}>
              <option value="">Not recorded</option>
              {EMPLOYMENT.map((item) => (
                <option key={item} value={item}>{label(item)}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Employer</span>
            <input value={draft.employerName} placeholder="Company or business name" onChange={(event) => set('employerName', event.target.value)} />
          </label>
          <label>
            <span>Monthly Income</span>
            <input inputMode="decimal" value={draft.monthlyIncome} placeholder="0.00" onChange={(event) => set('monthlyIncome', event.target.value)} />
          </label>
        </div>
      </section>
      <div className="user-actions">
        <button type="button" className="users-outline" onClick={() => navigate('/borrowers')}>
          {creating ? 'Cancel' : 'Discard'}
        </button>
        <button className="users-primary" disabled={busy}>
          {busy ? 'Saving…' : creating ? 'Submit' : 'Save'}
        </button>
      </div>
    </form>
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

  const address = [borrower.addressLine, borrower.city, borrower.province, borrower.postalCode].filter(Boolean).join(', ');

  return (
    <div className="users-page user-form borrower-form">
      <header className="users-head">
        <div>
          <h1>{borrower.fullName}</h1>
          <p>{borrower.borrowerNumber}</p>
        </div>
        <div className="users-head-actions">
          {can('borrowers.write') ? (
            <Link className="users-outline" to={`/borrowers/${borrower.id}/edit`}>
              Update Borrower
            </Link>
          ) : null}
          {can('applications.write') ? (
            <Link className="users-primary" to={`/applications/new?borrowerId=${borrower.id}`}>
              <img src="/shell/plus.svg" alt="" width="20" height="20" />
              New Application
            </Link>
          ) : null}
        </div>
      </header>
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert kind="ok">{notice}</Alert> : null}
      <section className="user-card">
        <h2>
          <i />
          Profile
        </h2>
        <dl className="borrower-facts">
          <div><dt>Date of Birth</dt><dd>{formatDate(borrower.dateOfBirth)}</dd></div>
          <div><dt>Gender</dt><dd>{label(borrower.gender)}</dd></div>
          <div><dt>Civil Status</dt><dd>{label(borrower.civilStatus)}</dd></div>
          <div><dt>Mobile</dt><dd>{borrower.mobile || '—'}</dd></div>
          <div><dt>Email</dt><dd>{borrower.email || '—'}</dd></div>
          <div><dt>Address</dt><dd>{address || '—'}</dd></div>
          <div><dt>Employment</dt><dd>{label(borrower.employmentStatus)}</dd></div>
          <div><dt>Employer</dt><dd>{borrower.employerName || '—'}</dd></div>
          <div><dt>Monthly Income</dt><dd>{money(borrower.monthlyIncome)}</dd></div>
        </dl>
      </section>
      <section className="user-card">
        <h2>
          <i />
          <span>
            Verification
            <small>An application can be submitted only after the borrower is verified.</small>
          </span>
        </h2>
        {can('borrowers.verify') ? (
          <form className="user-grid" onSubmit={saveVerification}>
            <label>
              <span>Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                {STATUSES.map((item) => (
                  <option key={item} value={item}>{label(item)}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Notes</span>
              <input value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
            <label>
              <span>&nbsp;</span>
              <button className="users-primary" disabled={busy}>{busy ? 'Saving…' : 'Save verification'}</button>
            </label>
          </form>
        ) : (
          <p>{borrower.verificationNotes || label(borrower.verificationStatus)}</p>
        )}
      </section>
      <section className="user-card">
        <h2>
          <i />
          Identity Documents
        </h2>
        {can('borrowers.write') ? (
          <p style={{ marginTop: -8 }}>
            <button type="button" className="users-outline" onClick={() => setShowDoc((value) => !value)}>
              {showDoc ? 'Close' : 'Record document'}
            </button>
          </p>
        ) : null}
        {showDoc ? <DocumentForm borrowerId={borrower.id} onDone={() => { setShowDoc(false); record.reload(); }} /> : null}
        {(borrower.documents ?? []).length === 0 ? <Empty title="No identity documents" /> : (
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Number</th>
                  <th>Issued</th>
                  <th>Expiry</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {(borrower.documents ?? []).map((document) => (
                  <tr key={document.id}>
                    <td>{label(document.documentType)}</td>
                    <td>{document.documentNumber}</td>
                    <td>{formatDate(document.issuedDate)}</td>
                    <td>{formatDate(document.expiryDate)}</td>
                    <td><span className={statusClass(document.verificationStatus)}>{document.verificationStatus.toUpperCase()}</span></td>
                    <td>
                      {can('borrowers.write') || can('borrowers.verify') ? (
                        <button type="button" className="users-edit" onClick={() => setEditingId(editingId === document.id ? null : document.id)} aria-label="Edit document">
                          <img src="/shell/edit.svg" alt="" width="20" height="20" />
                        </button>
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
      </section>
    </div>
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
    <form className="user-grid" style={{ marginBottom: 16 }} onSubmit={onSubmit}>
      {error ? <Alert>{error}</Alert> : null}
      <label>
        <span>Type</span>
        <select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>
          {DOCUMENTS.map((item) => (
            <option key={item} value={item}>{label(item)}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Number <b>*</b></span>
        <input value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} required />
      </label>
      <label>
        <span>Issued</span>
        <input type="date" value={issuedDate} onChange={(event) => setIssuedDate(event.target.value)} />
      </label>
      <label>
        <span>Expiry</span>
        <input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} />
      </label>
      <label>
        <span>File reference</span>
        <input value={fileReference} onChange={(event) => setFileReference(event.target.value)} />
      </label>
      <label>
        <span>Notes</span>
        <input value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <label>
        <span>&nbsp;</span>
        <button className="users-primary" disabled={busy}>{busy ? 'Saving…' : 'Add document'}</button>
      </label>
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
  document: IdentityDocument;
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
    <form className="user-grid" style={{ marginTop: 16 }} onSubmit={onSubmit}>
      {error ? <Alert>{error}</Alert> : null}
      <label>
        <span>Number</span>
        <input value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} disabled={!canWrite} required />
      </label>
      <label>
        <span>File reference</span>
        <input value={fileReference} onChange={(event) => setFileReference(event.target.value)} disabled={!canWrite} />
      </label>
      <label>
        <span>Notes</span>
        <input value={notes} onChange={(event) => setNotes(event.target.value)} disabled={!canWrite} />
      </label>
      <label>
        <span>Document verification</span>
        <select value={verificationStatus} onChange={(event) => setVerificationStatus(event.target.value)} disabled={!canVerify}>
          {STATUSES.map((item) => (
            <option key={item} value={item}>{label(item)}</option>
          ))}
        </select>
      </label>
      <label>
        <span>&nbsp;</span>
        <span style={{ display: 'flex', gap: 10 }}>
          <button className="users-primary" disabled={busy}>{busy ? 'Saving…' : 'Save document'}</button>
          <button type="button" className="users-outline" onClick={onDone}>Close</button>
        </span>
      </label>
    </form>
  );
}
