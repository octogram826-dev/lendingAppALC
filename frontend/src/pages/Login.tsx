import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Alert, Splash } from '../components/ui';
import { errorText } from '../lib/api';

export function LoginPage() {
  const { user, ready, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  if (!ready) return <Splash />;
  if (user) return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await login(email, password, remember);
      const from = (location.state as { from?: string } | null)?.from ?? '/';
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <form className="login-card" onSubmit={onSubmit}>
        <img className="login-blob login-blob-top" src="/login/ellipse.svg" alt="" width="220" height="220" />
        <img className="login-blob login-blob-bottom" src="/login/ellipse.svg" alt="" width="220" height="220" />
        <div className="login-inner">
          <header className="login-head">
            <img className="login-logo" src="/alc-logo.png" alt="Albyna's Lending Corporation" />
            <div>
              <h1>Lending Management System</h1>
              <p>Please enter your details to sign in to your account.</p>
            </div>
          </header>
          <div className="login-fields">
            <Alert>{error}</Alert>
            {notice ? <p className="login-note">{notice}</p> : null}
            <label className="login-field">
              <span className="login-label">Email</span>
              <span className="login-control">
                <img src="/login/mail.svg" alt="" width="20" height="20" />
                <input
                  type="email"
                  autoComplete="username"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </span>
            </label>
            <div className="login-field">
              <span className="login-label-row">
                <label className="login-label" htmlFor="login-password">Password</label>
                <button
                  type="button"
                  className="login-forgot"
                  onClick={() => setNotice('Ask an administrator to reset your password.')}
                >
                  Forgot Password?
                </button>
              </span>
              <span className="login-control">
                <img src="/login/lock.svg" alt="" width="20" height="20" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter Password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="login-eye"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  <img src="/login/eye-off.svg" alt="" width="20" height="20" />
                </button>
              </span>
            </div>
            <label className="login-remember">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
              <span className="login-box" aria-hidden="true">
                {remember ? <img src="/login/check.svg" alt="" width="12" height="12" /> : null}
              </span>
              Remember me?
            </label>
            <button className="login-submit" disabled={!canSubmit}>
              Log In
            </button>
          </div>
          <p className="login-foot">© 2026 Octagram. All rights reserved.</p>
        </div>
      </form>
    </main>
  );
}
