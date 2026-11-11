import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert } from '../components/ui';
import { api, errorText } from '../lib/api';

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="user-password">
      <span>
        {label} <b>*</b>
      </span>
      <span className="user-control">
        <img src="/shell/lock.svg" alt="" width="20" height="20" />
        <input
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          placeholder="Enter Password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
        />
        <button type="button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible((current) => !current)}>
          <img src={visible ? '/shell/eye.svg' : '/shell/eye-off.svg'} alt="" width="20" height="20" />
        </button>
      </span>
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function PasswordPage() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await api('/api/auth/password', { method: 'POST', body: { currentPassword, newPassword } });
      setCurrentPassword('');
      setNewPassword('');
      setNotice('Password updated. Use it the next time you sign in.');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="users-page user-form password-form" onSubmit={onSubmit}>
      <header className="users-head">
        <div>
          <h1>Change Password</h1>
          <p>Your current session stays signed in.</p>
        </div>
      </header>
      <Alert>{error}</Alert>
      <Alert kind="ok">{notice}</Alert>
      <section className="user-card">
        <h2>
          <i />
          Password
        </h2>
        <div className="user-grid">
          <PasswordField label="Current Password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
          <PasswordField
            label="New Password"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            hint="At least 8 characters, with a letter and a number."
          />
        </div>
      </section>
      <div className="user-actions">
        <button type="button" className="users-outline" onClick={() => navigate('/')}>
          Discard
        </button>
        <button className="users-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
