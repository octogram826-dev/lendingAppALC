import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Alert, Loading } from '../components/ui';
import { money, setCurrency } from '../lib/format';
import { useResource } from '../lib/resource';
import type { Dashboard, One } from '../lib/types';

const APPLICATION_STATUSES = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'withdrawn', 'disbursed'] as const;

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  disbursed: 'Disbursed',
};

export function DashboardPage() {
  const { user, can } = useAuth();
  const { data, error, loading } = useResource<One<Dashboard>>(can('dashboard.read') ? '/api/dashboard' : null);
  if (data) setCurrency(data.data.currency);

  if (!can('dashboard.read')) {
    return (
      <div className="users-page">
        <header className="users-head">
          <div>
            <h1>Hello, {user?.firstName ?? ''}</h1>
            <p>Open a section from the menu.</p>
          </div>
        </header>
      </div>
    );
  }

  const dash = data?.data;
  return (
    <div className="users-page">
      <header className="users-head">
        <div>
          <h1>Hello, {user?.firstName ?? ''}</h1>
          <p>Portfolio, applications, collections, and overdue accounts.</p>
        </div>
      </header>
      {error ? <Alert>{error}</Alert> : null}
      {loading && !dash ? <Loading /> : null}
      {dash ? (
        <div className="grid-main">
          {dash.overdue.accounts > 0 ? (
            <div className="banner">
              <div>
                <strong>{dash.overdue.accounts} overdue {dash.overdue.accounts === 1 ? 'account' : 'accounts'}</strong>
                <div>{money(dash.overdue.outstandingBalance)} outstanding across {dash.overdue.installments} installments.</div>
              </div>
              <Link to="/loans?status=overdue">Review loans</Link>
            </div>
          ) : null}
          <div className="stats">
            <Link className="stat" to="/borrowers">
              <span>Borrowers</span>
              <strong>{dash.portfolio.borrowerCount}</strong>
            </Link>
            <Link className="stat" to="/loans?status=active">
              <span>Active loans</span>
              <strong>{dash.portfolio.accountsActive}</strong>
              <em>{money(dash.portfolio.outstandingBalance)} outstanding</em>
            </Link>
            <Link className={`stat ${dash.portfolio.accountsOverdue ? 'alert-stat' : ''}`} to="/loans?status=overdue">
              <span>Overdue</span>
              <strong>{dash.portfolio.accountsOverdue}</strong>
              <em>{money(dash.overdue.installmentAmount)} in overdue installments</em>
            </Link>
            <Link className="stat" to="/loans?status=closed">
              <span>Closed</span>
              <strong>{dash.portfolio.accountsClosed}</strong>
              <em>{dash.portfolio.fullyPaidPendingClosure} fully paid, still open</em>
            </Link>
          </div>
          <div className="stats">
            <div className="stat">
              <span>Principal disbursed</span>
              <strong>{money(dash.portfolio.principalDisbursed)}</strong>
            </div>
            <div className="stat">
              <span>Released this month</span>
              <strong>{money(dash.portfolio.disbursedThisMonth)}</strong>
              <em>{dash.portfolio.disbursementCountThisMonth} releases</em>
            </div>
            <div className="stat">
              <span>Collected today</span>
              <strong>{money(dash.collections.postedToday)}</strong>
              <em>{money(dash.collections.postedThisMonth)} this month</em>
            </div>
            <div className="stat">
              <span>Due this month</span>
              <strong>{money(dash.collections.dueThisMonth)}</strong>
              <em>{money(dash.collections.collectedOnDuesThisMonth)} collected on those dues</em>
            </div>
          </div>
          <section className="user-card">
            <h2>
              <i />
              <span>
                Applications
                <small><Link to="/applications">All applications</Link></small>
              </span>
            </h2>
            <div className="status-row">
              {APPLICATION_STATUSES.map((status) => (
                <Link key={status} to={`/applications?status=${status}`}>
                  {STATUS_LABEL[status]} · {dash.applications.byStatus[status] ?? 0}
                </Link>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
