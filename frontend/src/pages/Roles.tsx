import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Loading } from '../components/ui';
import { api, errorText } from '../lib/api';
import { roleTitle } from '../lib/format';
import { useResource } from '../lib/resource';
import type { One, Role } from '../lib/types';

const SEEDED = ['admin', 'loan_officer', 'credit_analyst', 'approver', 'finance_officer', 'cashier', 'viewer'];

const PERMISSIONS: Array<{ code: string; label: string }> = [
  { code: 'dashboard.read', label: 'Dashboard' },
  { code: 'users.read', label: 'Users' },
  { code: 'users.write', label: 'User form' },
  { code: 'roles.manage', label: 'Roles' },
  { code: 'settings.manage', label: 'System settings' },
  { code: 'borrowers.read', label: 'Borrower' },
  { code: 'borrowers.write', label: 'Borrower form' },
  { code: 'borrowers.verify', label: 'Verify borrower' },
  { code: 'products.read', label: 'Loan product' },
  { code: 'products.write', label: 'Product form' },
  { code: 'applications.read', label: 'Application' },
  { code: 'applications.write', label: 'New application' },
  { code: 'credit.evaluate', label: 'Credit evaluation' },
  { code: 'credit.approve', label: 'Approval' },
  { code: 'agreements.write', label: 'Agreement' },
  { code: 'disbursements.write', label: 'Fund release' },
  { code: 'loans.read', label: 'Loan accounts' },
  { code: 'payments.post', label: 'Post payment' },
  { code: 'loans.close', label: 'Close loan' },
];

function roleSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 63);
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function exportRoles(rows: Role[]) {
  const lines = [
    ['Name', 'Description', 'Permissions'].join(','),
    ...rows.map((role) =>
      [roleTitle(role.name), role.description, role.permissions.join('; ')].map(csvCell).join(','),
    ),
  ];
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'roles.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export function RolesPage() {
  const roles = useResource<One<Role[]>>('/api/roles');
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<Role | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const query = search.trim().toLowerCase();
  const rows = useMemo(() => {
    const list = [...(roles.data?.data ?? [])].sort((a, b) => {
      const rankA = SEEDED.indexOf(a.name);
      const rankB = SEEDED.indexOf(b.name);
      if (rankA !== rankB) return (rankA === -1 ? SEEDED.length : rankA) - (rankB === -1 ? SEEDED.length : rankB);
      return roleTitle(a.name).localeCompare(roleTitle(b.name));
    });
    if (!query) return list;
    return list.filter((role) =>
      `${roleTitle(role.name)} ${role.name} ${role.description}`.toLowerCase().includes(query),
    );
  }, [roles.data, query]);

  async function removeRole() {
    if (!pending) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/roles/${pending.id}`, { method: 'DELETE' });
      setPending(null);
      await roles.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="users-page">
      <div className="users-head">
        <div>
          <h1>Roles</h1>
          <p>Manage system roles, define access permissions, and control user privileges across different modules.</p>
        </div>
        <div className="users-head-actions">
          <button className="users-outline" type="button" onClick={() => exportRoles(rows)}>
            <img src="/shell/export.svg" alt="" width="20" height="20" />
            Export CSV
          </button>
          <Link className="users-primary" to="/roles/new">
            <img src="/shell/plus.svg" alt="" width="20" height="20" />
            Add Role
          </Link>
        </div>
      </div>
      {roles.error ? <Alert>{roles.error}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}
      <div className="users-card">
        <div className="users-toolbar">
          <label className="users-search">
            <img src="/shell/search.svg" alt="" width="20" height="20" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search anything..."
              aria-label="Search roles"
            />
          </label>
        </div>
        {roles.loading && !roles.data ? <Loading /> : null}
        <div className="roles-list">
          {rows.map((role) => (
            <article className="role-row" key={role.id}>
              <div>
                <h2>
                  {roleTitle(role.name)}
                  <img className="role-chevron" src="/shell/chevron-right.svg" alt="" width="14" height="14" />
                </h2>
                <p>{role.description || 'No description'}</p>
              </div>
              <div className="role-actions">
                <Link className="role-icon" to={`/roles/${role.id}`} aria-label={`Edit ${roleTitle(role.name)}`}>
                  <img src="/shell/edit.svg" alt="" width="20" height="20" />
                </Link>
                {SEEDED.includes(role.name) ? null : (
                  <button
                    className="role-icon"
                    type="button"
                    aria-label={`Delete ${roleTitle(role.name)}`}
                    onClick={() => setPending(role)}
                  >
                    <img src="/shell/trash.svg" alt="" width="20" height="20" />
                  </button>
                )}
              </div>
            </article>
          ))}
          {!roles.loading && rows.length === 0 ? <p className="roles-empty">No roles match that search.</p> : null}
        </div>
      </div>
      {pending ? (
        <div className="role-modal-backdrop" role="presentation" onClick={() => (busy ? null : setPending(null))}>
          <div className="role-modal" role="dialog" aria-modal="true" aria-labelledby="role-delete-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="role-delete-title">Confirmation</h2>
            <p>Are you sure you want to proceed with this action?</p>
            <div className="role-modal-actions">
              <button className="users-outline" type="button" disabled={busy} onClick={() => setPending(null)}>
                Cancel
              </button>
              <button className="users-primary" type="button" disabled={busy} onClick={() => void removeRole()}>
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function RoleFormPage() {
  const { id } = useParams();
  const creating = !id;
  const navigate = useNavigate();
  const roles = useResource<One<Role[]>>(creating ? null : '/api/roles');
  const role = roles.data?.data.find((item) => String(item.id) === id);
  const seeded = role ? SEEDED.includes(role.name) : false;
  const locked = role?.name === 'admin';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!role) return;
    setDescription(role.description);
    setSelected(new Set(role.permissions));
  }, [role]);

  const fields = useMemo(() => {
    const known = new Set(PERMISSIONS.map((item) => item.code));
    const extras = [...selected].filter((code) => !known.has(code)).map((code) => ({ code, label: roleTitle(code) }));
    return [...PERMISSIONS, ...extras];
  }, [selected]);

  function toggle(code: string) {
    if (locked) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const nextDescription = description.trim();
    if (!nextDescription) {
      setError('Description is required.');
      return;
    }
    setBusy(true);
    try {
      if (creating) {
        const slug = roleSlug(name);
        if (!/^[a-z][a-z0-9_]{1,62}$/.test(slug)) {
          setError('Role name must start with a letter and use letters, numbers, or underscores.');
          setBusy(false);
          return;
        }
        await api('/api/roles', {
          method: 'POST',
          body: { name: slug, description: nextDescription, permissionCodes: [...selected] },
        });
      } else if (role) {
        await api(`/api/roles/${role.id}`, {
          method: 'PATCH',
          body: locked
            ? { description: nextDescription }
            : { description: nextDescription, permissionCodes: [...selected] },
        });
      }
      navigate('/roles');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (!creating && roles.loading && !role) return <Loading />;
  if (!creating && roles.error) return <Alert>{roles.error}</Alert>;
  if (!creating && !roles.loading && !role) return <Alert>Role not found.</Alert>;

  return (
    <form className="users-page user-form role-form" onSubmit={onSubmit}>
      <h1>{creating ? 'Add Role' : 'Update Role'}</h1>
      {error ? <Alert>{error}</Alert> : null}
      {seeded ? (
        <div className="role-banner">
          <img src="/shell/info.svg" alt="" width="20" height="20" />
          <p>This is a default system role. Some details and permissions are locked and cannot be modified.</p>
        </div>
      ) : null}
      <section className="user-card">
        <h2>
          <i />
          <span>
            {creating ? 'Role Details' : 'Roles Details'}
          </span>
        </h2>
        <div className="role-fields">
          <label>
            <span>
              Role Name
              {creating ? <b> *</b> : null}
            </span>
            <input
              value={creating ? name : roleTitle(role?.name ?? '')}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g., Administrator"
              disabled={!creating}
              required={creating}
            />
          </label>
          <label>
            <span>
              Description <b>*</b>
            </span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Write your Description here..."
              maxLength={255}
              required
            />
          </label>
        </div>
      </section>
      <section className="user-card">
        <h2>
          <i />
          <span>
            Permission
            <small>Define and manage access permissions to control which system features users can view or modify.</small>
          </span>
        </h2>
        <div className="role-perms">
          {fields.map((item) => (
            <label key={item.code}>
              <input
                type="checkbox"
                checked={selected.has(item.code)}
                disabled={locked}
                onChange={() => toggle(item.code)}
              />
              <span className="user-box">
                {selected.has(item.code) ? <img src="/login/check.svg" alt="" width="12" height="12" /> : null}
              </span>
              {item.label}
            </label>
          ))}
        </div>
      </section>
      <div className="user-actions">
        <Link className="users-outline" to="/roles">
          {creating ? 'Cancel' : 'Discard'}
        </Link>
        <button className="users-primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : creating ? 'Submit' : 'Save'}
        </button>
      </div>
    </form>
  );
}
