import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { Alert, Badge, Card, Empty, Facts, Field, Filters, Loading, PageHeader, Pager } from '../components/ui';
import { api, errorText } from '../lib/api';
import { blankToNull, formatDate, formatWhen, label, localDate, money, qs } from '../lib/format';
import { useResource } from '../lib/resource';
import type { Loan, One, Page, Payment, Receipt } from '../lib/types';

const STATUSES = ['active', 'overdue', 'closed'];

export function LoansPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') || 1);
  const q = params.get('q') ?? '';
  const status = params.get('status') ?? '';
  const [draft, setDraft] = useState(q);
  const list = useResource<Page<Loan>>(`/api/loans${qs({ page, pageSize: 20, q, status })}`);

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
      <PageHeader eyebrow="Lending" title="Loan accounts" lede="Balances follow the repayment schedule. A fully paid loan stays open until it is closed." />
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
        {list.data && list.data.data.length === 0 ? <Empty title="No loan accounts match" /> : null}
        {list.data && list.data.data.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Borrower</th>
                  <th className="num">Outstanding</th>
                  <th>Maturity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((loan) => (
                  <tr key={loan.id}>
                    <td>
                      <Link to={`/loans/${loan.id}`}>{loan.accountNumber}</Link>
                      <div className="hint">{loan.agreementNumber}</div>
                    </td>
                    <td>{loan.borrowerName}</td>
                    <td className="num">{money(loan.outstandingBalance)}</td>
                    <td>{formatDate(loan.maturityDate)}</td>
                    <td>
                      <Badge value={loan.status} />
                      {loan.readyToClose ? <div className="hint">Ready to close</div> : null}
                    </td>
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

export function LoanAccountPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const [payPage, setPayPage] = useState(1);
  const record = useResource<One<Loan>>(id ? `/api/loans/${id}` : null);
  const payments = useResource<Page<Payment>>(id ? `/api/loans/${id}/payments${qs({ page: payPage, pageSize: 10 })}` : null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loan = record.data?.data;

  async function closeLoan() {
    if (!loan || !window.confirm(`Close ${loan.accountNumber}? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/loans/${loan.id}/close`, { method: 'POST' });
      record.reload();
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
        title={loan.borrowerName}
        lede={<Badge value={loan.status} />}
        actions={
          <>
            <Link className="btn" to={`/agreements/${loan.agreementId}`}>Agreement</Link>
            <Link className="btn" to={`/borrowers/${loan.borrowerId}`}>Borrower</Link>
            {can('payments.post') && loan.status !== 'closed' ? <Link className="btn btn-primary" to={`/loans/${loan.id}/payments/new`}>Post payment</Link> : null}
          </>
        }
      />
      <Alert>{error}</Alert>
      {loan.readyToClose ? <Alert kind="info">The balance is zero. Close the account when the file is finished.</Alert> : null}
      <div className="stats">
        <div className="stat"><span>Outstanding</span><strong>{money(loan.outstandingBalance)}</strong></div>
        <div className="stat"><span>Principal left</span><strong>{money(loan.outstandingPrincipal)}</strong></div>
        <div className="stat"><span>Interest left</span><strong>{money(loan.outstandingInterest)}</strong></div>
        <div className="stat"><span>Total payable</span><strong>{money(loan.totalPayable)}</strong></div>
      </div>
      <div className="grid-2" style={{ marginTop: 14 }}>
        <Card title="Account">
          <Facts items={[
            { label: 'Agreement', value: loan.agreementNumber },
            { label: 'Principal', value: money(loan.principal) },
            { label: 'Total interest', value: money(loan.totalInterest) },
            { label: 'Disbursed', value: formatWhen(loan.disbursedAt) },
            { label: 'Maturity', value: formatDate(loan.maturityDate) },
            { label: 'Closed', value: formatWhen(loan.closedAt) },
            { label: 'Release method', value: loan.disbursement ? label(loan.disbursement.method) : '—' },
            { label: 'Release reference', value: loan.disbursement?.referenceNumber || '—' },
          ]} />
          {can('loans.close') && loan.readyToClose ? (
            <button type="button" className="btn btn-danger" style={{ marginTop: 14 }} disabled={busy} onClick={() => void closeLoan()}>
              {busy ? 'Closing…' : 'Close loan'}
            </button>
          ) : null}
        </Card>
        <Card title="Payments" action={payments.data && payments.data.meta.total > 10 ? <span className="hint">{payments.data.meta.total} posted</span> : null}>
          {payments.error ? <Alert>{payments.error}</Alert> : null}
          {(payments.data?.data.length ?? 0) === 0 ? <Empty title="No payments posted" /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Receipt</th><th>Date</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {payments.data?.data.map((payment) => (
                    <tr key={payment.id}>
                      <td><Link to={`/receipts/${payment.receiptNumber}`}>{payment.receiptNumber}</Link></td>
                      <td>{formatDate(payment.paymentDate)}</td>
                      <td className="num">{money(payment.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {payments.data && payments.data.meta.total > payments.data.meta.pageSize ? (
            <Pager page={payments.data.meta.page} pageSize={payments.data.meta.pageSize} total={payments.data.meta.total} onPage={setPayPage} />
          ) : null}
        </Card>
      </div>
      <Card title="Repayment schedule">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Due</th>
                <th className="num">Principal</th>
                <th className="num">Interest</th>
                <th className="num">Total</th>
                <th className="num">Paid</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loan.schedule?.map((line) => (
                <tr key={line.id}>
                  <td>{line.installmentNumber}</td>
                  <td>{formatDate(line.dueDate)}</td>
                  <td className="num">{money(line.principalDue)}</td>
                  <td className="num">{money(line.interestDue)}</td>
                  <td className="num">{money(line.totalDue)}</td>
                  <td className="num">{money(line.totalPaid)}</td>
                  <td><Badge value={line.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
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
