import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { roleTitle } from '../lib/format';

type NavItem = {
  to?: string;
  label: string;
  icon: string;
  activeIcon?: string;
  allow: string[];
};

const NAV: Array<{ id: string; label: string; items: NavItem[] }> = [
  {
    id: 'analytics',
    label: 'Analytics',
    items: [
      { to: '/', label: 'Dashboard', icon: '/shell/dashboard.svg', allow: ['dashboard.read'] },
      { label: 'Reports', icon: '/shell/reports.svg', allow: ['dashboard.read'] },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    items: [
      { to: '/users', label: 'Users', icon: '/shell/users-muted.svg', activeIcon: '/shell/users.svg', allow: ['users.read'] },
      { to: '/roles', label: 'Roles', icon: '/shell/roles.svg', allow: ['roles.manage'] },
    ],
  },
  {
    id: 'management',
    label: 'Management',
    items: [
      { to: '/borrowers', label: 'Borrowers', icon: '/shell/borrowers.svg', allow: ['borrowers.read'] },
      { to: '/products', label: 'Loan Products', icon: '/shell/products.svg', allow: ['products.read'] },
      { to: '/applications', label: 'Applications', icon: '/shell/applications.svg', allow: ['applications.read'] },
      { to: '/credit-evaluations', label: 'Credit Evaluations', icon: '/shell/credit.svg', allow: ['applications.read'] },
      { to: '/approvals', label: 'Approval', icon: '/shell/approval.svg', allow: ['applications.read'] },
      { to: '/agreements', label: 'Agreements', icon: '/shell/agreements.svg', allow: ['agreements.write', 'disbursements.write', 'loans.read'] },
      { to: '/loans', label: 'Loan Account', icon: '/shell/loans.svg', allow: ['loans.read'] },
    ],
  },
];

const ROLE_RANK = ['admin', 'loan_officer', 'credit_analyst', 'approver', 'finance_officer', 'cashier', 'viewer'];

function crumbs(pathname: string): Array<{ label: string; to?: string }> {
  if (pathname === '/') return [{ label: 'Dashboard' }];
  if (pathname.startsWith('/roles/new')) {
    return [
      { label: 'Dashboard', to: '/' },
      { label: 'Roles', to: '/roles' },
      { label: 'Add Role' },
    ];
  }
  if (/^\/roles\/\d+/.test(pathname)) {
    return [
      { label: 'Dashboard', to: '/' },
      { label: 'Roles', to: '/roles' },
      { label: 'Update Role' },
    ];
  }
  if (pathname.startsWith('/borrowers/new')) {
    return [
      { label: 'Dashboard', to: '/' },
      { label: 'Borrowers', to: '/borrowers' },
      { label: 'Add Borrower' },
    ];
  }
  if (/^\/borrowers\/\d+\/edit/.test(pathname)) {
    return [
      { label: 'Dashboard', to: '/' },
      { label: 'Borrowers', to: '/borrowers' },
      { label: 'Update Borrower' },
    ];
  }
  if (/^\/borrowers\/\d+/.test(pathname)) {
    return [
      { label: 'Dashboard', to: '/' },
      { label: 'Borrowers', to: '/borrowers' },
      { label: 'Borrower' },
    ];
  }
  if (pathname.startsWith('/products/new')) {
    return [
      { label: 'Dashboard', to: '/' },
      { label: 'Loan Products', to: '/products' },
      { label: 'Add Loan Product' },
    ];
  }
  if (/^\/products\/\d+\/edit/.test(pathname)) {
    return [
      { label: 'Dashboard', to: '/' },
      { label: 'Loan Products', to: '/products' },
      { label: 'Update Loan Product' },
    ];
  }
  if (/^\/products\/\d+/.test(pathname)) {
    return [
      { label: 'Dashboard', to: '/' },
      { label: 'Loan Products', to: '/products' },
      { label: 'View Loan Product' },
    ];
  }
  if (pathname.startsWith('/applications/new')) {
    return [
      { label: 'Dashboard', to: '/' },
      { label: 'Applications', to: '/applications' },
      { label: 'Add Application' },
    ];
  }
  if (/^\/applications\/\d+\/evaluation/.test(pathname)) {
    return [
      { label: 'Dashboard', to: '/' },
      { label: 'Credit Evaluations', to: '/credit-evaluations' },
      { label: 'Update Credit Evaluation' },
    ];
  }
  if (/^\/applications\/\d+\/approval/.test(pathname)) {
    return [
      { label: 'Dashboard', to: '/' },
      { label: 'Approval', to: '/approvals' },
      { label: 'Update Approval' },
    ];
  }
  if (/^\/applications\/\d+/.test(pathname)) {
    return [
      { label: 'Dashboard', to: '/' },
      { label: 'Applications', to: '/applications' },
      { label: 'Application' },
    ];
  }
  if (/^\/agreements\/\d+\/disburse/.test(pathname)) {
    return [
      { label: 'Dashboard', to: '/' },
      { label: 'Agreements', to: '/agreements' },
      { label: 'Release Funds' },
    ];
  }
  if (/^\/agreements\/\d+/.test(pathname)) {
    return [
      { label: 'Dashboard', to: '/' },
      { label: 'Agreements', to: '/agreements' },
      { label: 'Agreement' },
    ];
  }
  if (/^\/loans\/\d+\/payments/.test(pathname)) {
    return [
      { label: 'Dashboard', to: '/' },
      { label: 'Loan Account', to: '/loans' },
      { label: 'Record Payment' },
    ];
  }
  if (/^\/loans\/\d+/.test(pathname)) {
    return [
      { label: 'Dashboard', to: '/' },
      { label: 'Loan Account', to: '/loans' },
      { label: 'View Loan Account' },
    ];
  }
  const current = pathname.startsWith('/users/new')
    ? 'Add User'
    : pathname.startsWith('/users/')
      ? 'User'
      : pathname.startsWith('/users')
        ? 'Users'
        : pathname.startsWith('/roles')
          ? 'Roles'
          : pathname.startsWith('/settings')
            ? 'Settings'
            : pathname.startsWith('/borrowers')
              ? 'Borrowers'
              : pathname.startsWith('/products')
                ? 'Loan Products'
                : pathname.startsWith('/approvals')
                  ? 'Approval'
                  : pathname.startsWith('/credit-evaluations')
                    ? 'Credit Evaluations'
                  : pathname.startsWith('/applications')
                    ? 'Applications'
                  : pathname.startsWith('/agreements')
                    ? 'Agreements'
                    : pathname.startsWith('/loans')
                      ? 'Loan Account'
                      : pathname.startsWith('/account/password')
                        ? 'Change Password'
                        : pathname.startsWith('/receipts')
                          ? 'Receipt'
                          : 'Dashboard';
  return [{ label: 'Dashboard', to: '/' }, { label: current }];
}

function navActive(pathname: string, to: string) {
  if (to === '/') return pathname === '/';
  if (to === '/applications') return pathname.startsWith('/applications') && !/\/evaluation|\/approval/.test(pathname);
  if (to === '/credit-evaluations') return pathname.startsWith('/credit-evaluations') || /\/applications\/\d+\/evaluation/.test(pathname);
  if (to === '/approvals') return pathname.startsWith('/approvals') || /\/applications\/\d+\/approval/.test(pathname);
  return pathname === to || pathname.startsWith(`${to}/`);
}

function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function Shell() {
  const { user, logout, can } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [closedGroups, setClosedGroups] = useState<string[]>([]);

  useEffect(() => {
    setMenuOpen(false);
    setAccountOpen(false);
  }, [location.pathname]);

  const primaryRole = [...(user?.roles ?? [])].sort(
    (left, right) => ROLE_RANK.indexOf(left) - ROLE_RANK.indexOf(right),
  )[0];

  return (
    <div className={`app-shell${collapsed ? ' is-collapsed' : ''}${menuOpen ? ' is-menu-open' : ''}`}>
      <header className="topbar">
        <button type="button" className="top-menu-btn" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
          <img src="/shell/collapse.svg" alt="" width="14" height="14" />
        </button>
        <img className="top-logo" src="/alc-logo.png" alt="Albyna's Lending Corporation" />
        <div className="top-actions">
          <button type="button" className="icon-btn" aria-label="Notifications">
            <img src="/shell/bell.svg" alt="" width="17" height="19" />
          </button>
          {can('settings.manage') ? (
            <NavLink className="icon-btn" to="/settings" aria-label="Settings">
              <img src="/shell/settings.svg" alt="" width="20" height="20" />
            </NavLink>
          ) : null}
          <div className="account-menu">
            <button type="button" className="account-chip" onClick={() => setAccountOpen((open) => !open)}>
              <span className="avatar">{user ? initials(user.firstName, user.lastName) : ''}</span>
              <span className="account-meta">
                <strong>
                  {user?.firstName} {user?.lastName}
                </strong>
                <small>{primaryRole ? roleTitle(primaryRole) : 'Staff'}</small>
              </span>
            </button>
            {accountOpen ? (
              <div className="account-pop">
                <NavLink to="/account/password">Change password</NavLink>
                <button type="button" onClick={logout}>
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      {menuOpen ? <button type="button" className="app-backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} /> : null}
      <aside className="sidenav">
        <nav>
          {NAV.map((group) => {
            const items = group.items.filter((item) => can(...item.allow));
            if (items.length === 0) return null;
            const closed = closedGroups.includes(group.id);
            return (
              <div key={group.id} className="nav-group">
                <button
                  type="button"
                  className="nav-heading"
                  aria-expanded={!closed}
                  onClick={() =>
                    setClosedGroups((current) =>
                      current.includes(group.id) ? current.filter((id) => id !== group.id) : [...current, group.id],
                    )
                  }
                >
                  {group.label}
                  <img className={closed ? '' : 'is-open'} src="/shell/chevron-section.svg" alt="" width="14" height="14" />
                </button>
                {closed
                  ? null
                  : items.map((item) => {
                      const icon = (active: boolean) => (active && item.activeIcon ? item.activeIcon : item.icon);
                      if (!item.to) {
                        return (
                          <span key={item.label} className="nav-item">
                            <img src={item.icon} alt="" width="20" height="20" />
                            {item.label}
                          </span>
                        );
                      }
                      const active = navActive(location.pathname, item.to);
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          className={active ? 'nav-item is-active' : 'nav-item'}
                        >
                          <img src={icon(active)} alt="" width="20" height="20" />
                          <span>{item.label}</span>
                          {active ? <i className="nav-mark" /> : null}
                        </NavLink>
                      );
                    })}
              </div>
            );
          })}
        </nav>
      </aside>
      <button
        type="button"
        className="sidenav-toggle"
        aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
        onClick={() => setCollapsed((value) => !value)}
      >
        <img className={collapsed ? 'is-closed' : ''} src="/shell/collapse.svg" alt="" width="14" height="14" />
      </button>
      <div className="workspace">
        <div className="crumbs">
          {crumbs(location.pathname).map((item, index) => (
            <span key={`${item.label}-${index}`} className="crumb">
              {index > 0 ? <img src="/shell/chevron-right.svg" alt="" width="14" height="14" /> : null}
              {item.to ? <NavLink to={item.to}>{item.label}</NavLink> : <strong>{item.label}</strong>}
            </span>
          ))}
        </div>
        <main className="main">
          <Outlet />
        </main>
      </div>
      <footer className="app-foot">
        <div>
          <strong>&lt;System&gt;</strong>
          <p>Version: 1.0.0 | Build: June 23, 2026</p>
        </div>
        <em>&lt;Website Link&gt;</em>
      </footer>
    </div>
  );
}
