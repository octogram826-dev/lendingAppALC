import { useState, type FormEvent } from 'react';
import { Alert, Card, Field, PageHeader } from '../components/ui';
import { api, errorText } from '../lib/api';

export function PasswordPage() {
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
    <>
      <PageHeader eyebrow="Account" title="Change password" lede="Your current session stays signed in." />
      <Card>
        <form className="stack" onSubmit={onSubmit} style={{ maxWidth: 460 }}>
          <Alert>{error}</Alert>
          <Alert kind="ok">{notice}</Alert>
          <Field label="Current password">
            <input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
          </Field>
          <Field label="New password" hint="At least 8 characters, with a letter and a number.">
            <input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
          </Field>
          <div>
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
          </div>
        </form>
      </Card>
    </>
  );
}
