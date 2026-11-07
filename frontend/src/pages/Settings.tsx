import { useEffect, useState } from 'react';
import { Alert, Card, Field, Loading, PageHeader } from '../components/ui';
import { api, errorText } from '../lib/api';
import { formatWhen, setCurrency } from '../lib/format';
import { useResource } from '../lib/resource';
import type { One, Setting } from '../lib/types';

const LABELS: Record<string, string> = {
  company_name: 'Company name',
  currency: 'Currency',
  max_installment_to_income: 'Maximum installment to income',
  overdue_grace_days: 'Overdue grace days',
};

const HINTS: Record<string, string> = {
  company_name: 'Shown on the dashboard. The logo remains Albyna\'s Lending Corporation.',
  currency: 'Three-letter ISO code. Amounts across the system use this code.',
  max_installment_to_income: 'A ratio from 0 to 1. 0.4000 means the installment may be up to 40% of verified monthly income.',
  overdue_grace_days: 'Days after the due date before an unpaid installment is overdue. 0 means the day after the due date.',
};

export function SettingsPage() {
  const settings = useResource<One<Setting[]>>('/api/settings');
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!settings.data) return;
    const next: Record<string, string> = {};
    for (const setting of settings.data.data) {
      next[setting.key] = setting.value;
      if (setting.key === 'currency') setCurrency(setting.value);
    }
    setValues(next);
  }, [settings.data]);

  async function save(setting: Setting) {
    setError(null);
    setNotice(null);
    setBusyKey(setting.key);
    try {
      await api(`/api/settings/${setting.key}`, { method: 'PUT', body: { value: values[setting.key] ?? '' } });
      if (setting.key === 'currency') setCurrency((values[setting.key] ?? '').toUpperCase());
      setNotice(`${LABELS[setting.key] ?? setting.key} saved.`);
      settings.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Administration" title="System settings" lede="Company name, currency, capacity policy, and overdue grace." />
      {settings.error ? <Alert>{settings.error}</Alert> : null}
      <Alert>{error}</Alert>
      <Alert kind="ok">{notice}</Alert>
      {settings.loading && !settings.data ? <Loading /> : null}
      <div className="grid-main">
        {settings.data?.data.map((setting) => (
          <Card key={setting.key} title={LABELS[setting.key] ?? setting.key}>
            <p className="muted">{setting.description}</p>
            <div className="actions" style={{ marginTop: 12, alignItems: 'end' }}>
              <Field label="Value" hint={HINTS[setting.key]}>
                <input value={values[setting.key] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [setting.key]: event.target.value }))} />
              </Field>
              <button type="button" className="btn btn-primary" disabled={busyKey === setting.key} onClick={() => void save(setting)}>
                {busyKey === setting.key ? 'Saving…' : 'Save'}
              </button>
            </div>
            <p className="hint" style={{ marginTop: 8 }}>Updated {formatWhen(setting.updatedAt)}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
