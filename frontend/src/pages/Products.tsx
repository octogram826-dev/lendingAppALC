import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { Alert, Splash } from '../components/ui';
import { api, errorText } from '../lib/api';
import { qs } from '../lib/format';
import type { PageMeta, Product, ProductRequirement } from '../lib/types';

const PAGE_SIZE = 10;

type DraftRequirement = {
  key: string;
  id?: number;
  name: string;
  description: string;
  isRequired: boolean;
};

function rateLabel(value: number) {
  return `${Number(value).toFixed(2)}%`;
}

function peso(value: number) {
  const whole = Number.isInteger(value);
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(value);
}

function toDrafts(requirements: ProductRequirement[] | undefined): DraftRequirement[] {
  return (requirements ?? []).map((item) => ({
    key: String(item.id),
    id: item.id,
    name: item.name,
    description: item.description ?? '',
    isRequired: item.isRequired,
  }));
}

export function ProductsPage() {
  const { can } = useAuth();
  const [rows, setRows] = useState<Product[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [openStatus, setOpenStatus] = useState<number | null>(null);
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
      const collected: Product[] = [];
      let next = 1;
      let total = 0;
      do {
        const result = await api<{ data: Product[]; meta: PageMeta }>(`/api/products${qs({ page: next, pageSize: 100 })}`);
        collected.push(...result.data);
        total = result.meta.total;
        next += 1;
      } while (collected.length < total);
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
    api<{ data: Product[]; meta: PageMeta }>(
      `/api/products${qs({ page, pageSize: PAGE_SIZE, q: search || undefined, status: status || undefined })}`,
    )
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

  const activeCount = catalog.filter((item) => item.status === 'active').length;
  const average = catalog.length
    ? catalog.reduce((sum, item) => sum + Number(item.monthlyInterestRate), 0) / catalog.length
    : 0;
  const start = meta && meta.total > 0 ? (meta.page - 1) * meta.pageSize + 1 : 0;
  const end = meta ? Math.min(meta.page * meta.pageSize, meta.total) : 0;
  const pages = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;

  async function changeStatus(product: Product, next: 'active' | 'inactive') {
    setOpenStatus(null);
    if (product.status === next) return;
    try {
      const result = await api<{ data: Product }>(`/api/products/${product.id}`, {
        method: 'PATCH',
        body: { status: next },
      });
      setRows((current) => current.map((item) => (item.id === product.id ? { ...item, status: result.data.status } : item)));
      setCatalog((current) => current.map((item) => (item.id === product.id ? { ...item, status: result.data.status } : item)));
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function exportCsv() {
    const collected: Product[] = [];
    let next = 1;
    let total = 0;
    try {
    do {
      const result = await api<{ data: Product[]; meta: PageMeta }>(
        `/api/products${qs({ page: next, pageSize: 100, q: search || undefined, status: status || undefined })}`,
      );
      collected.push(...result.data);
      total = result.meta.total;
      next += 1;
    } while (collected.length < total && next <= 20);
    const header = ['Name', 'Code', 'Monthly Flat Rate', 'Min Amount', 'Max Amount', 'Min Term', 'Max Term', 'Status'];
    const lines = collected.map((item) =>
      [item.name, item.code, item.monthlyInterestRate, item.minAmount, item.maxAmount, item.minTermMonths, item.maxTermMonths, item.status]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'loan-products.csv';
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
          <h1>Loan Products</h1>
          <p>Shape transparent products for the needs of your borrowers.</p>
        </div>
        <div className="users-head-actions">
          <button className="users-outline" type="button" onClick={exportCsv}>
            <img src="/shell/export.svg" alt="" width={20} height={20} />
            Export CSV
          </button>
          {can('products.write') && (
            <Link className="users-primary" to="/products/new">
              <img src="/shell/plus.svg" alt="" width={20} height={20} />
              Add Loan Product
            </Link>
          )}
        </div>
      </header>
      <div className="products-stack">
        <div className="product-metrics">
          <article className="product-metric">
            <header>
              Registered Loan Products
              <img src="/shell/metric-registered.svg" alt="" width={24} height={24} />
            </header>
            <strong>{catalog.length}</strong>
          </article>
          <article className="product-metric">
            <header>
              Active Loan Products
              <img src="/shell/metric-active.svg" alt="" width={24} height={24} />
            </header>
            <strong>{activeCount}</strong>
          </article>
          <article className="product-metric">
            <header>
              Inactive Loan Products
              <img src="/shell/metric-inactive.svg" alt="" width={24} height={24} />
            </header>
            <strong>{catalog.length - activeCount}</strong>
          </article>
          <article className="product-metric">
            <header>
              Average Flat Rate
              <img src="/shell/metric-rate.svg" alt="" width={24} height={24} />
            </header>
            <strong>{rateLabel(average)}</strong>
          </article>
        </div>
        <section className="users-card">
          <div className="users-toolbar">
            <label className="users-search">
              <img src="/shell/search.svg" alt="" width={20} height={20} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search anything..." />
            </label>
            <label className="users-filter">
              Status: {status === 'active' ? 'Active' : status === 'inactive' ? 'Inactive' : 'All Record'}
              <img src="/shell/chevron-down.svg" alt="" width={20} height={20} />
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Record</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
          {error ? <Alert>{error}</Alert> : null}
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Products</th>
                  <th>Monthly Flat Rate</th>
                  <th>Amount Range</th>
                  <th>Term Range</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <div className="users-person">
                        <strong>
                          <Link to={`/products/${product.id}`}>{product.name}</Link>
                        </strong>
                        <small>{product.code}</small>
                      </div>
                    </td>
                    <td>{rateLabel(product.monthlyInterestRate)}</td>
                    <td>{peso(product.minAmount)} - {peso(product.maxAmount)}</td>
                    <td>{product.minTermMonths} - {product.maxTermMonths} Months</td>
                    <td>
                      <div className="users-status">
                        <button
                          className={`users-pill ${product.status === 'active' ? 'is-active' : 'is-off'}`}
                          type="button"
                          disabled={!can('products.write')}
                          onClick={() => setOpenStatus(openStatus === product.id ? null : product.id)}
                        >
                          {product.status === 'active' ? 'ACTIVE' : 'INACTIVE'}
                          {can('products.write') && <img src="/shell/chevron-status.svg" alt="" width={15} height={15} />}
                        </button>
                        {openStatus === product.id && (
                          <div className="users-status-menu">
                            <button type="button" onClick={() => changeStatus(product, 'active')}>Active</button>
                            <button type="button" onClick={() => changeStatus(product, 'inactive')}>Inactive</button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <Link className="users-edit" to={`/products/${product.id}`} aria-label={`View ${product.name}`}>
                        <img src="/shell/eye.svg" alt="" width={20} height={20} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={6}>No loan products match this view.</td>
                  </tr>
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
                <button key={number} type="button" className={number === page ? 'is-current' : ''} onClick={() => setPage(number)}>
                  {number}
                </button>
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

function ProductFields({
  code,
  name,
  rate,
  minAmount,
  maxAmount,
  minTerm,
  maxTerm,
  description,
  onCode,
  onName,
  onRate,
  onMinAmount,
  onMaxAmount,
  onMinTerm,
  onMaxTerm,
  onDescription,
  lockCode,
  readOnly,
}: {
  code: string;
  name: string;
  rate: string;
  minAmount: string;
  maxAmount: string;
  minTerm: string;
  maxTerm: string;
  description: string;
  onCode?: (value: string) => void;
  onName?: (value: string) => void;
  onRate?: (value: string) => void;
  onMinAmount?: (value: string) => void;
  onMaxAmount?: (value: string) => void;
  onMinTerm?: (value: string) => void;
  onMaxTerm?: (value: string) => void;
  onDescription?: (value: string) => void;
  lockCode?: boolean;
  readOnly?: boolean;
}) {
  return (
    <div className="user-grid">
      <label>
        Product Code <b>*</b>
        <input value={code} readOnly={readOnly || lockCode} onChange={(event) => onCode?.(event.target.value.toUpperCase())} placeholder="e.g., PERSONAL" required />
      </label>
      <label>
        Product Name <b>*</b>
        <input value={name} readOnly={readOnly} onChange={(event) => onName?.(event.target.value)} placeholder="e.g., Personal Loan" required />
      </label>
      <label>
        Monthly Flat Rate <b>*</b>
        <input value={rate} readOnly={readOnly} onChange={(event) => onRate?.(event.target.value)} inputMode="decimal" placeholder="e.g., 2.50" required />
      </label>
      <label className="product-range">
        Amount Range <b>*</b>
        <div>
          <input value={minAmount} readOnly={readOnly} onChange={(event) => onMinAmount?.(event.target.value)} inputMode="decimal" placeholder="10000" required />
          <em>-</em>
          <input value={maxAmount} readOnly={readOnly} onChange={(event) => onMaxAmount?.(event.target.value)} inputMode="decimal" placeholder="20000" required />
        </div>
      </label>
      <label className="product-range">
        Term Range <b>*</b>
        <div>
          <input value={minTerm} readOnly={readOnly} onChange={(event) => onMinTerm?.(event.target.value)} inputMode="numeric" placeholder="1" required />
          <em>-</em>
          <input value={maxTerm} readOnly={readOnly} onChange={(event) => onMaxTerm?.(event.target.value)} inputMode="numeric" placeholder="6" required />
        </div>
      </label>
      <label className="product-wide">
        Description
        <textarea value={description} readOnly={readOnly} onChange={(event) => onDescription?.(event.target.value)} maxLength={500} placeholder="Write your description here..." />
      </label>
    </div>
  );
}

function RequirementTable({
  rows,
  canWrite,
  onToggle,
  onEdit,
  onDelete,
}: {
  rows: DraftRequirement[];
  canWrite: boolean;
  onToggle: (row: DraftRequirement) => void;
  onEdit: (row: DraftRequirement) => void;
  onDelete: (row: DraftRequirement) => void;
}) {
  return (
    <div className="users-table-wrap">
      <table className="users-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Required?</th>
            {canWrite && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.name}</td>
              <td>{row.description || '—'}</td>
              <td>
                <button
                  className={`user-switch ${row.isRequired ? 'is-on' : ''}`}
                  type="button"
                  aria-pressed={row.isRequired}
                  disabled={!canWrite}
                  onClick={() => onToggle(row)}
                >
                  <span />
                </button>
              </td>
              {canWrite && (
                <td>
                  <div className="req-actions">
                    <button className="users-edit" type="button" aria-label={`Edit ${row.name}`} onClick={() => onEdit(row)}>
                      <img src="/shell/edit.svg" alt="" width={20} height={20} />
                    </button>
                    <button className="users-edit" type="button" aria-label={`Delete ${row.name}`} onClick={() => onDelete(row)}>
                      <img src="/shell/trash.svg" alt="" width={20} height={20} />
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={canWrite ? 4 : 3}>No requirements yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ProductFormPage() {
  const { id } = useParams();
  const creating = !id;
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [minTerm, setMinTerm] = useState('');
  const [maxTerm, setMaxTerm] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [requirements, setRequirements] = useState<DraftRequirement[]>([]);
  const [modal, setModal] = useState<{ key: string | null; name: string; description: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DraftRequirement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!creating);

  useEffect(() => {
    if (!id) return;
    api<{ data: Product }>(`/api/products/${id}`)
      .then((result) => {
        const item = result.data;
        setProduct(item);
        setCode(item.code);
        setName(item.name);
        setRate(String(item.monthlyInterestRate));
        setMinAmount(String(item.minAmount));
        setMaxAmount(String(item.maxAmount));
        setMinTerm(String(item.minTermMonths));
        setMaxTerm(String(item.maxTermMonths));
        setDescription(item.description ?? '');
        setActive(item.status === 'active');
        setRequirements(toDrafts(item.requirements));
      })
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => setLoading(false));
  }, [id]);

  function payload() {
    return {
      name: name.trim(),
      description: description.trim() || null,
      monthlyInterestRate: Number(rate),
      minAmount: Number(minAmount),
      maxAmount: Number(maxAmount),
      minTermMonths: Number(minTerm),
      maxTermMonths: Number(maxTerm),
      status: active ? 'active' : 'inactive',
    };
  }

  function validateForm() {
    if (creating && !/^[A-Za-z0-9_-]{2,32}$/.test(code.trim())) return 'Product code must be 2–32 letters, numbers, hyphens, or underscores.';
    if (!name.trim()) return 'Product name is required.';
    const parsedRate = Number(rate);
    if (!Number.isFinite(parsedRate) || parsedRate < 0 || parsedRate > 20) return 'Monthly flat rate must be between 0 and 20.';
    const lowAmount = Number(minAmount);
    const highAmount = Number(maxAmount);
    if (!(lowAmount > 0) || !(highAmount >= lowAmount)) return 'Amount range needs a positive minimum and a maximum at least that high.';
    const lowTerm = Number(minTerm);
    const highTerm = Number(maxTerm);
    if (!Number.isInteger(lowTerm) || lowTerm < 1 || lowTerm > 360 || !Number.isInteger(highTerm) || highTerm < lowTerm || highTerm > 360) {
      return 'Term range must be whole months from 1 to 360, with the maximum at least the minimum.';
    }
    return null;
  }

  async function saveRequirement(row: DraftRequirement) {
    if (!id) return;
    const body = { name: row.name, description: row.description || null, isRequired: row.isRequired };
    const result = row.id
      ? await api<{ data: Product }>(`/api/products/${id}/requirements/${row.id}`, { method: 'PATCH', body })
      : await api<{ data: Product }>(`/api/products/${id}/requirements`, { method: 'POST', body });
    setRequirements(toDrafts(result.data.requirements));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const problem = validateForm();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (creating) {
        const created = await api<{ data: Product }>('/api/products', {
          method: 'POST',
          body: { ...payload(), code: code.trim().toUpperCase() },
        });
        for (const row of requirements) {
          await api(`/api/products/${created.data.id}/requirements`, {
            method: 'POST',
            body: { name: row.name, description: row.description || null, isRequired: row.isRequired },
          });
        }
      } else {
        await api(`/api/products/${id}`, { method: 'PATCH', body: payload() });
      }
      navigate('/products');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveModal() {
    if (!modal || !modal.name.trim()) {
      setError('Requirement name is required.');
      return;
    }
    const next: DraftRequirement = {
      key: modal.key ?? `new-${Date.now()}`,
      id: requirements.find((row) => row.key === modal.key)?.id,
      name: modal.name.trim(),
      description: modal.description.trim(),
      isRequired: requirements.find((row) => row.key === modal.key)?.isRequired ?? true,
    };
    try {
      if (id) await saveRequirement(next);
      else {
        setRequirements((current) => (modal.key ? current.map((row) => (row.key === modal.key ? next : row)) : [...current, next]));
      }
      setModal(null);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function toggleRequirement(row: DraftRequirement) {
    const next = { ...row, isRequired: !row.isRequired };
    try {
      if (id && row.id) await saveRequirement(next);
      else setRequirements((current) => current.map((item) => (item.key === row.key ? next : item)));
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function removeRequirement() {
    if (!pendingDelete) return;
    try {
      if (id && pendingDelete.id) {
        await api(`/api/products/${id}/requirements/${pendingDelete.id}`, { method: 'DELETE' });
        setRequirements((current) => current.filter((row) => row.key !== pendingDelete.key));
      } else {
        setRequirements((current) => current.filter((row) => row.key !== pendingDelete.key));
      }
      setPendingDelete(null);
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (loading) return <Splash />;
  if (!creating && !product && error) return <Alert>{error}</Alert>;

  return (
    <form className="users-page user-form" onSubmit={onSubmit}>
      <h1>{creating ? 'Add Loan Product' : 'Update Loan Product'}</h1>
      {error ? <Alert>{error}</Alert> : null}
      <section className="user-card">
        <h2><i />Product Details</h2>
        <ProductFields
          code={code}
          name={name}
          rate={rate}
          minAmount={minAmount}
          maxAmount={maxAmount}
          minTerm={minTerm}
          maxTerm={maxTerm}
          description={description}
          onCode={setCode}
          onName={setName}
          onRate={setRate}
          onMinAmount={setMinAmount}
          onMaxAmount={setMaxAmount}
          onMinTerm={setMinTerm}
          onMaxTerm={setMaxTerm}
          onDescription={setDescription}
          lockCode={!creating}
        />
      </section>
      <section className="user-card">
        <div className="product-req-head">
          <h2>
            <i />
            <span>
              Requirements
              <small>Define the documents and eligibility criteria borrowers must meet for each loan product.</small>
            </span>
          </h2>
          <button className="users-primary" type="button" onClick={() => setModal({ key: null, name: '', description: '' })}>
            <img src="/shell/plus.svg" alt="" width={20} height={20} />
            Add Requirement
          </button>
        </div>
        <RequirementTable
          rows={requirements}
          canWrite
          onToggle={toggleRequirement}
          onEdit={(row) => setModal({ key: row.key, name: row.name, description: row.description })}
          onDelete={setPendingDelete}
        />
      </section>
      <div className="user-active">
        <button className={`user-switch ${active ? 'is-on' : ''}`} type="button" aria-pressed={active} onClick={() => setActive((value) => !value)}>
          <span />
        </button>
        <div>
          <strong>Mark Loan Product as Active?</strong>
          <small>Turn ON to activate this loan product and make it available for new loan applications.</small>
        </div>
      </div>
      <div className="user-actions">
        <button className="users-outline" type="button" onClick={() => navigate('/products')}>{creating ? 'Cancel' : 'Discard'}</button>
        <button className="users-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : creating ? 'Submit' : 'Save'}</button>
      </div>
      {modal && (
        <div className="role-modal-backdrop" role="presentation" onClick={() => setModal(null)}>
          <div className="role-modal product-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>{modal.key ? 'Edit Requirement' : 'Add Requirement'}</h2>
              <button className="users-edit" type="button" aria-label="Close" onClick={() => setModal(null)}>×</button>
            </header>
            <div className="product-modal-body">
              <label>
                Name <b>*</b>
                <input value={modal.name} onChange={(event) => setModal({ ...modal, name: event.target.value })} maxLength={150} />
              </label>
              <label>
                Description
                <textarea value={modal.description} onChange={(event) => setModal({ ...modal, description: event.target.value })} maxLength={255} />
              </label>
            </div>
            <footer>
              <button className="users-outline" type="button" onClick={() => setModal(null)}>Cancel</button>
              <button className="users-primary" type="button" onClick={saveModal}>Save</button>
            </footer>
          </div>
        </div>
      )}
      {pendingDelete && (
        <div className="role-modal-backdrop" role="presentation" onClick={() => setPendingDelete(null)}>
          <div className="role-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2>Confirmation</h2>
            <p>Are you sure you want to proceed with this action?</p>
            <div className="role-modal-actions">
              <button className="users-outline" type="button" onClick={() => setPendingDelete(null)}>Cancel</button>
              <button className="users-primary" type="button" onClick={removeRequirement}>Proceed</button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

export function ProductViewPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ data: Product }>(`/api/products/${id}`)
      .then((result) => setProduct(result.data))
      .catch((err: unknown) => setError(errorText(err)));
  }, [id]);

  if (error) return <Alert>{error}</Alert>;
  if (!product) return <Splash />;

  return (
    <div className="users-page user-form">
      <div className="product-view-head">
        <Link className="product-back" to="/products">
          <img src="/shell/chevron-left.svg" alt="" width={20} height={20} />
          View Loan Product
        </Link>
        {can('products.write') && (
          <Link className="users-primary product-update" to={`/products/${product.id}/edit`}>
            <img src="/shell/plus.svg" alt="" width={20} height={20} />
            Update Loan Product
          </Link>
        )}
      </div>
      <section className="user-card">
        <h2>
          <i />
          Product Details
          <span className={`users-pill ${product.status === 'active' ? 'is-active' : 'is-off'}`}>
            {product.status === 'active' ? 'ACTIVE' : 'INACTIVE'}
          </span>
        </h2>
        <ProductFields
          code={product.code}
          name={product.name}
          rate={rateLabel(product.monthlyInterestRate).replace('%', '')}
          minAmount={String(product.minAmount)}
          maxAmount={String(product.maxAmount)}
          minTerm={String(product.minTermMonths)}
          maxTerm={String(product.maxTermMonths)}
          description={product.description ?? ''}
          readOnly
        />
      </section>
      <section className="user-card">
        <h2>
          <i />
          <span>
            Requirements
            <small>Define the documents and eligibility criteria borrowers must meet for each loan product.</small>
          </span>
        </h2>
        <RequirementTable rows={toDrafts(product.requirements)} canWrite={false} onToggle={() => undefined} onEdit={() => undefined} onDelete={() => undefined} />
        <p className="users-pager"><span>Showing {product.requirements?.length ? 1 : 0} to {product.requirements?.length ?? 0} of {product.requirements?.length ?? 0} entries</span></p>
      </section>
    </div>
  );
}
