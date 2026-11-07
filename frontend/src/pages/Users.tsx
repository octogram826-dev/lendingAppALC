import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { Alert, Empty, Loading } from '../components/ui';
import { api, errorText } from '../lib/api';
import { fullName, qs, roleTitle } from '../lib/format';
import { useResource } from '../lib/resource';
import type { One, Page, Role, UserAccount } from '../lib/types';

const PAGE_SIZE = 10;
const ROLE_RANK = ['admin', 'loan_officer', 'credit_analyst', 'approver', 'finance_officer', 'cashier', 'viewer'];

function byRole(left: { name: string }, right: { name: string }) {
  const leftRank = ROLE_RANK.indexOf(left.name);
  const rightRank = ROLE_RANK.indexOf(right.name);
  return (leftRank === -1 ? 99 : leftRank) - (rightRank === -1 ? 99 : rightRank);
}

function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function UsersPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') || 1);
  const q = params.get('q') ?? '';
  const status = params.get('status') ?? '';
  const roleId = params.get('roleId') ?? '';
  const [draft, setDraft] = useState(q);
  const [rowError, setRowError] = useState<string | null>(null);
  const [openStatus, setOpenStatus] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const roles = useResource<One<Role[]>>(can('roles.manage') ? '/api/roles' : null);
  const list = useResource<Page<UserAccount>>(
    `/api/users${qs({ page, pageSize: PAGE_SIZE, q, status, roleId: roleId ? Number(roleId) : undefined })}`,
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

  function setFilter(key: 'status' | 'roleId', value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParams(next);
  }

  function setPage(nextPage: number) {
    const next = new URLSearchParams(params);
    next.set('page', String(nextPage));
    setParams(next);
  }

  async function changeStatus(user: UserAccount, nextStatus: 'active' | 'inactive') {
    setOpenStatus(null);
    if (user.status === nextStatus) return;
    setRowError(null);
    try {
      await api(`/api/users/${user.id}`, { method: 'PATCH', body: { status: nextStatus } });
      list.reload();
    } catch (err) {
      setRowError(errorText(err));
    }
  }

  async function exportCsv() {
    setExporting(true);
    setRowError(null);
    try {
      const rows: UserAccount[] = [];
      let nextPage = 1;
      let total = 0;
      do {
        const result = await api<Page<UserAccount>>(
          `/api/users${qs({ page: nextPage, pageSize: 100, q, status, roleId: roleId ? Number(roleId) : undefined })}`,
        );
        rows.push(...result.data);
        total = result.meta.total;
        nextPage += 1;
      } while (rows.length < total && nextPage <= 20);
      const lines = [
        ['Name', 'Email', 'Roles', 'Status'],
        ...rows.map((user) => [
          fullName(user.firstName, user.lastName),
          user.email,
          [...user.roles].sort(byRole).map((role) => roleTitle(role.name)).join('; '),
          user.status === 'active' ? 'Active' : 'Deactivated',
        ]),
      ];
      const csv = lines.map((line) => line.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'users.csv';
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
  const roleOptions = [...(roles.data?.data ?? [])].sort(byRole);

  return (
    <div className="users-page">
      <header className="users-head">
        <div>
          <h1>Users</h1>
          <p>Manage system users, assign roles.</p>
        </div>
        <div className="users-head-actions">
          <button type="button" className="users-outline" onClick={exportCsv} disabled={exporting}>
            <img src="/shell/export.svg" alt="" width="20" height="20" />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          {can('users.write') ? (
            <Link className="users-primary" to="/users/new">
              <img src="/shell/plus.svg" alt="" width="20" height="20" />
              Add User
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
              aria-label="Search users"
            />
          </label>
          <div className="users-filters">
            {roleOptions.length > 0 ? (
              <label className="users-filter">
                <span>Roles:</span>
                <select aria-label="Roles" value={roleId} onChange={(event) => setFilter('roleId', event.target.value)}>
                  <option value="">All Record</option>
                  {roleOptions.map((role) => (
                    <option key={role.id} value={role.id}>
                      {roleTitle(role.name)}
                    </option>
                  ))}
                </select>
                <img src="/shell/chevron-down.svg" alt="" width="20" height="20" />
              </label>
            ) : null}
            <label className="users-filter">
              <span>Status:</span>
              <select aria-label="Status" value={status} onChange={(event) => setFilter('status', event.target.value)}>
                <option value="">All Record</option>
                <option value="active">Active</option>
                <option value="inactive">Deactivated</option>
              </select>
              <img src="/shell/chevron-down.svg" alt="" width="20" height="20" />
            </label>
          </div>
        </div>
        {list.error ? <Alert>{list.error}</Alert> : null}
        {rowError ? <Alert>{rowError}</Alert> : null}
        {list.loading && !list.data ? <Loading /> : null}
        {list.data && list.data.data.length === 0 ? <Empty title="No users match" /> : null}
        {list.data && list.data.data.length > 0 ? (
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Users</th>
                  <th>Roles</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="users-person">
                        <span className="avatar">{initials(user.firstName, user.lastName)}</span>
                        <span>
                          <strong>{fullName(user.firstName, user.lastName)}</strong>
                          <small>{user.email}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="users-tags">
                        {[...user.roles].sort(byRole).map((role) => (
                          <span key={role.id} className="users-tag">
                            {roleTitle(role.name)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="users-status">
                        <button
                          type="button"
                          className={user.status === 'active' ? 'users-pill is-active' : 'users-pill is-off'}
                          disabled={!can('users.write')}
                          onClick={() => setOpenStatus((current) => (current === user.id ? null : user.id))}
                        >
                          {user.status === 'active' ? 'ACTIVE' : 'DEACTIVATED'}
                          {can('users.write') ? <img src="/shell/chevron-status.svg" alt="" width="15" height="15" /> : null}
                        </button>
                        {openStatus === user.id ? (
                          <div className="users-status-menu">
                            <button type="button" onClick={() => changeStatus(user, 'active')}>
                              Active
                            </button>
                            <button type="button" onClick={() => changeStatus(user, 'inactive')}>
                              Deactivated
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <Link className="users-edit" to={`/users/${user.id}`} aria-label={`Edit ${fullName(user.firstName, user.lastName)}`}>
                        <img src="/shell/edit.svg" alt="" width="20" height="20" />
                      </Link>
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
                      <button type={number === page ? 'button' : 'button'} className={number === page ? 'is-current' : ''} onClick={() => setPage(number)}>
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

export function UserFormPage() {
  const { id } = useParams();
  const creating = !id;
  const navigate = useNavigate();
  const { can } = useAuth();
  const existing = useResource<One<UserAccount>>(id ? `/api/users/${id}` : null);
  const roles = useResource<One<Role[]>>(can('roles.manage') ? '/api/roles' : null);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const user = existing.data?.data;
    if (!user) return;
    setFirstName(user.firstName);
    setLastName(user.lastName);
    setStatus(user.status);
    setRoleIds(user.roles.map((role) => role.id));
  }, [existing.data]);

  function toggleRole(roleId: number) {
    setRoleIds((current) => (current.includes(roleId) ? current.filter((item) => item !== roleId) : [...current, roleId]));
  }

  function useDefaultPassword() {
    const name = firstName.trim();
    if (!name) {
      setError('Enter a first name before using the default password.');
      return;
    }
    setError(null);
    setPassword(`${name}-${new Date().getFullYear()}`);
    setShowPassword(true);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!can('users.write')) return;
    setError(null);
    if (roleIds.length === 0) {
      setError('Select at least one role.');
      return;
    }
    setBusy(true);
    try {
      if (creating) {
        await api<One<UserAccount>>('/api/users', {
          method: 'POST',
          body: { email, password, firstName, lastName, status, roleIds },
        });
        navigate('/users', { replace: true });
        return;
      }
      const user = existing.data?.data;
      const profile: Record<string, string> = {};
      if (user && firstName !== user.firstName) profile.firstName = firstName;
      if (user && lastName !== user.lastName) profile.lastName = lastName;
      if (user && status !== user.status) profile.status = status;
      if (password) profile.password = password;
      const sameRoles = user && roleIds.length === user.roles.length && roleIds.every((roleId) => user.roles.some((role) => role.id === roleId));
      if (Object.keys(profile).length === 0 && sameRoles) {
        setError('Nothing changed.');
        return;
      }
      if (Object.keys(profile).length > 0) {
        await api(`/api/users/${id}`, { method: 'PATCH', body: profile });
      }
      if (!sameRoles) {
        await api(`/api/users/${id}/roles`, { method: 'PUT', body: { roleIds } });
      }
      navigate('/users', { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const writable = can('users.write');
  const roleOptions = [...(roles.data?.data ?? [])].sort(byRole);

  return (
    <form className="users-page user-form" onSubmit={onSubmit}>
      <h1>{creating ? 'Add User' : 'Update User'}</h1>
      {existing.error ? <Alert>{existing.error}</Alert> : null}
      {roles.error ? <Alert>{roles.error}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}
      {existing.loading && !creating ? <Loading /> : null}
      {creating || existing.data ? (
        <>
          <section className="user-card">
            <h2>
              <i />
              User Information
            </h2>
            <div className="user-grid">
              <label>
                <span>First Name <b>*</b></span>
                <input value={firstName} placeholder="e.g., Juan" onChange={(event) => setFirstName(event.target.value)} required disabled={!writable} />
              </label>
              <label>
                <span>Last Name <b>*</b></span>
                <input value={lastName} placeholder="e.g., Dela Cruz" onChange={(event) => setLastName(event.target.value)} required disabled={!writable} />
              </label>
              <label>
                <span>Email {creating ? <b>*</b> : null}</span>
                <span className="user-control">
                  <img src="/shell/mail.svg" alt="" width="20" height="20" />
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={creating ? email : existing.data?.data.email ?? ''}
                    onChange={(event) => setEmail(event.target.value)}
                    required={creating}
                    disabled={!creating || !writable}
                  />
                </span>
              </label>
              <label className="user-password">
                <span className="user-password-label">
                  <span>Password <b>*</b></span>
                  {writable ? (
                    <button type="button" onClick={useDefaultPassword}>
                      Use Default
                    </button>
                  ) : null}
                </span>
                <span className="user-control">
                  <img src="/shell/lock.svg" alt="" width="20" height="20" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter Password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required={creating}
                    disabled={!writable}
                    autoComplete="new-password"
                  />
                  <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>
                    <img src="/shell/eye-off.svg" alt="" width="20" height="20" />
                  </button>
                </span>
                <small>Default Password: First Name + Year Today</small>
              </label>
            </div>
          </section>
          <section className="user-card">
            <h2>
              <i />
              <span>
                Roles
                <small>Select at least one role.</small>
              </span>
            </h2>
            {roleOptions.length > 0 ? (
              <div className="user-roles">
                {roleOptions.map((role) => (
                  <label key={role.id}>
                    <span>
                      <input type="checkbox" checked={roleIds.includes(role.id)} onChange={() => toggleRole(role.id)} disabled={!writable} />
                      <span className="user-box" aria-hidden="true">
                        {roleIds.includes(role.id) ? <img src="/login/check.svg" alt="" width="12" height="12" /> : null}
                      </span>
                      {roleTitle(role.name)}
                    </span>
                    <small>{role.description}</small>
                  </label>
                ))}
              </div>
            ) : (
              <p className="user-role-fallback">
                {(existing.data?.data.roles ?? []).map((role) => roleTitle(role.name)).join(', ') || 'Roles could not be loaded.'}
              </p>
            )}
          </section>
          <section className="user-active">
            <button
              type="button"
              className={status === 'active' ? 'user-switch is-on' : 'user-switch'}
              aria-pressed={status === 'active'}
              disabled={!writable}
              onClick={() => setStatus((current) => (current === 'active' ? 'inactive' : 'active'))}
            >
              <span />
            </button>
            <span>
              <strong>Mark User as Active?</strong>
              <small>Turn ON to activate this user and allow access to the system based on assigned permissions.</small>
            </span>
          </section>
          <div className="user-actions">
            <button type="button" className="users-outline" onClick={() => navigate('/users')}>
              {creating ? 'Cancel' : 'Discard'}
            </button>
            {writable ? (
              <button className="users-primary" disabled={busy}>
                {busy ? 'Saving…' : creating ? 'Submit' : 'Save'}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </form>
  );
}
