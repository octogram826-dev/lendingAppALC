import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { Alert, Badge, Card, Empty, Field, Loading, PageHeader, Pager } from '../components/ui';
import { api, errorText } from '../lib/api';
import { blankToNull, money, qs } from '../lib/format';
import { useResource } from '../lib/resource';
import type { One, Page, Product } from '../lib/types';

export function ProductsPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') || 1);
  const status = params.get('status') ?? '';
  const list = useResource<Page<Product>>(`/api/products${qs({ page, pageSize: 20, status })}`);

  return (
    <>
      <PageHeader
        eyebrow="Lending"
        title="Loan products"
        lede="Flat monthly interest. The rate is copied onto an application when the draft is saved or submitted."
        actions={can('products.write') ? <Link className="btn btn-primary" to="/products/new">New product</Link> : null}
      />
      <Card>
        <div className="filters">
          <select aria-label="Status" value={status} onChange={(event) => {
            const next = new URLSearchParams(params);
            if (event.target.value) next.set('status', event.target.value);
            else next.delete('status');
            next.delete('page');
            setParams(next);
          }}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        {list.error ? <Alert>{list.error}</Alert> : null}
        {list.loading && !list.data ? <Loading /> : null}
        {list.data && list.data.data.length === 0 ? <Empty title="No products" /> : null}
        {list.data && list.data.data.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Monthly rate</th>
                  <th className="num">Amount</th>
                  <th className="num">Term</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <Link to={`/products/${product.id}`}>{product.name}</Link>
                      <div className="hint">{product.code}</div>
                    </td>
                    <td className="num">{product.monthlyInterestRate}%</td>
                    <td className="num">{money(product.minAmount)} – {money(product.maxAmount)}</td>
                    <td className="num">{product.minTermMonths}–{product.maxTermMonths} mo</td>
                    <td><Badge value={product.status} /></td>
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

export function ProductFormPage() {
  const { id } = useParams();
  const creating = !id;
  const navigate = useNavigate();
  const { can } = useAuth();
  const writable = can('products.write');
  const existing = useResource<One<Product>>(id ? `/api/products/${id}` : null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rate, setRate] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [minTerm, setMinTerm] = useState('');
  const [maxTerm, setMaxTerm] = useState('');
  const [status, setStatus] = useState('active');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reqName, setReqName] = useState('');
  const [reqDescription, setReqDescription] = useState('');
  const [reqRequired, setReqRequired] = useState(true);

  useEffect(() => {
    const product = existing.data?.data;
    if (!product) return;
    setName(product.name);
    setDescription(product.description ?? '');
    setRate(String(product.monthlyInterestRate));
    setMinAmount(String(product.minAmount));
    setMaxAmount(String(product.maxAmount));
    setMinTerm(String(product.minTermMonths));
    setMaxTerm(String(product.maxTermMonths));
    setStatus(product.status);
  }, [existing.data]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!writable) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const body = {
        name,
        description: blankToNull(description),
        monthlyInterestRate: Number(rate),
        minAmount: Number(minAmount),
        maxAmount: Number(maxAmount),
        minTermMonths: Number(minTerm),
        maxTermMonths: Number(maxTerm),
        status,
      };
      if (creating) {
        const created = await api<One<Product>>('/api/products', { method: 'POST', body: { ...body, code } });
        navigate(`/products/${created.data.id}`);
      } else {
        await api(`/api/products/${id}`, { method: 'PATCH', body });
        setNotice('Product saved.');
        existing.reload();
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function addRequirement(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api(`/api/products/${id}/requirements`, {
        method: 'POST',
        body: { name: reqName, description: blankToNull(reqDescription), isRequired: reqRequired },
      });
      setReqName('');
      setReqDescription('');
      setReqRequired(true);
      existing.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function removeRequirement(requirementId: number) {
    if (!window.confirm('Remove this requirement from the product? Applications that already copied it keep their own copy.')) return;
    try {
      await api(`/api/products/${id}/requirements/${requirementId}`, { method: 'DELETE' });
      existing.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const product = existing.data?.data;
  return (
    <>
      <PageHeader
        eyebrow="Products"
        title={creating ? 'New product' : product?.name ?? 'Product'}
        lede={creating ? 'Interest is flat monthly. Add requirements after the product is saved.' : `${product?.code ?? ''} · flat monthly`}
      />
      {existing.error ? <Alert>{existing.error}</Alert> : null}
      {existing.loading && !creating ? <Loading /> : null}
      {creating || product ? (
        <>
          <Card>
            <form className="form-grid" onSubmit={onSubmit}>
              <div className="span-2"><Alert>{error}</Alert><Alert kind="ok">{notice}</Alert></div>
              <Field label="Code" hint="Letters, numbers, hyphens, or underscores. Stored in uppercase.">
                <input value={creating ? code : product?.code ?? ''} onChange={(event) => setCode(event.target.value)} required disabled={!creating || !writable} />
              </Field>
              <Field label="Status">
                <select value={status} onChange={(event) => setStatus(event.target.value)} disabled={!writable}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Field>
              <Field className="span-2" label="Name"><input value={name} onChange={(event) => setName(event.target.value)} required disabled={!writable} /></Field>
              <Field className="span-2" label="Description"><textarea value={description} onChange={(event) => setDescription(event.target.value)} disabled={!writable} /></Field>
              <Field label="Monthly interest rate (%)" hint="Up to 4 decimal places, from 0 to 20.">
                <input inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} required disabled={!writable} />
              </Field>
              <Field label="Minimum amount"><input inputMode="decimal" value={minAmount} onChange={(event) => setMinAmount(event.target.value)} required disabled={!writable} /></Field>
              <Field label="Maximum amount"><input inputMode="decimal" value={maxAmount} onChange={(event) => setMaxAmount(event.target.value)} required disabled={!writable} /></Field>
              <Field label="Minimum term (months)"><input inputMode="numeric" value={minTerm} onChange={(event) => setMinTerm(event.target.value)} required disabled={!writable} /></Field>
              <Field label="Maximum term (months)"><input inputMode="numeric" value={maxTerm} onChange={(event) => setMaxTerm(event.target.value)} required disabled={!writable} /></Field>
              {writable ? (
                <div className="span-2 actions">
                  <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : creating ? 'Create product' : 'Save product'}</button>
                  <Link className="btn" to="/products">Back to products</Link>
                </div>
              ) : <div className="span-2"><Link className="btn" to="/products">Back to products</Link></div>}
            </form>
          </Card>
          {!creating && product ? (
            <Card title="Requirements">
              {(product.requirements ?? []).length === 0 ? <Empty title="No requirements yet" /> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Name</th><th>Required</th><th></th></tr></thead>
                    <tbody>
                      {product.requirements?.map((requirement) => (
                        <tr key={requirement.id}>
                          <td>
                            {requirement.name}
                            {requirement.description ? <div className="hint">{requirement.description}</div> : null}
                          </td>
                          <td>{requirement.isRequired ? 'Required' : 'Optional'}</td>
                          <td>{writable ? <button type="button" className="btn btn-danger" onClick={() => void removeRequirement(requirement.id)}>Remove</button> : null}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {writable ? (
                <form className="form-grid" style={{ marginTop: 16 }} onSubmit={addRequirement}>
                  <Field label="Requirement name"><input value={reqName} onChange={(event) => setReqName(event.target.value)} required /></Field>
                  <Field label="Description"><input value={reqDescription} onChange={(event) => setReqDescription(event.target.value)} /></Field>
                  <label className="span-2" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="checkbox" checked={reqRequired} onChange={(event) => setReqRequired(event.target.checked)} />
                    Required before an application can be submitted
                  </label>
                  <div><button className="btn">Add requirement</button></div>
                </form>
              ) : null}
            </Card>
          ) : null}
        </>
      ) : null}
    </>
  );
}
