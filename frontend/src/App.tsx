import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { Shell } from './components/Shell';
import { Denied, Splash } from './components/ui';
import { AgreementRecordPage, AgreementsPage, DisbursePage } from './pages/Agreements';
import { ApplicationRecordPage, ApplicationsPage, ApprovalPage, EvaluationPage, NewApplicationPage } from './pages/Applications';
import { BorrowerFormPage, BorrowerRecordPage, BorrowersPage } from './pages/Borrowers';
import { DashboardPage } from './pages/Dashboard';
import { LoanAccountPage, LoansPage, PostPaymentPage, ReceiptPage } from './pages/Loans';
import { LoginPage } from './pages/Login';
import { PasswordPage } from './pages/Password';
import { ProductFormPage, ProductsPage } from './pages/Products';
import { RoleFormPage, RolesPage } from './pages/Roles';
import { SettingsPage } from './pages/Settings';
import { UserFormPage, UsersPage } from './pages/Users';
import type { ReactNode } from 'react';

function RequireAuth() {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Splash />;
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  return <Shell />;
}

function Gate({ allow, children }: { allow: boolean; children: ReactNode }) {
  if (!allow) return <Denied />;
  return children;
}

export function App() {
  const { can } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route index element={<DashboardPage />} />
        <Route path="account/password" element={<PasswordPage />} />
        <Route path="users" element={<Gate allow={can('users.read')}><UsersPage /></Gate>} />
        <Route path="users/new" element={<Gate allow={can('users.write')}><UserFormPage /></Gate>} />
        <Route path="users/:id" element={<Gate allow={can('users.read')}><UserFormPage /></Gate>} />
        <Route path="roles" element={<Gate allow={can('roles.manage')}><RolesPage /></Gate>} />
        <Route path="roles/new" element={<Gate allow={can('roles.manage')}><RoleFormPage /></Gate>} />
        <Route path="roles/:id" element={<Gate allow={can('roles.manage')}><RoleFormPage /></Gate>} />
        <Route path="settings" element={<Gate allow={can('settings.manage')}><SettingsPage /></Gate>} />
        <Route path="borrowers" element={<Gate allow={can('borrowers.read')}><BorrowersPage /></Gate>} />
        <Route path="borrowers/new" element={<Gate allow={can('borrowers.write')}><BorrowerFormPage /></Gate>} />
        <Route path="borrowers/:id" element={<Gate allow={can('borrowers.read')}><BorrowerRecordPage /></Gate>} />
        <Route path="borrowers/:id/edit" element={<Gate allow={can('borrowers.write')}><BorrowerFormPage /></Gate>} />
        <Route path="products" element={<Gate allow={can('products.read')}><ProductsPage /></Gate>} />
        <Route path="products/new" element={<Gate allow={can('products.write')}><ProductFormPage /></Gate>} />
        <Route path="products/:id" element={<Gate allow={can('products.read')}><ProductFormPage /></Gate>} />
        <Route path="applications" element={<Gate allow={can('applications.read')}><ApplicationsPage /></Gate>} />
        <Route path="applications/new" element={<Gate allow={can('applications.write')}><NewApplicationPage /></Gate>} />
        <Route path="applications/:id" element={<Gate allow={can('applications.read')}><ApplicationRecordPage /></Gate>} />
        <Route path="applications/:id/evaluation" element={<Gate allow={can('applications.read')}><EvaluationPage /></Gate>} />
        <Route path="applications/:id/approval" element={<Gate allow={can('applications.read')}><ApprovalPage /></Gate>} />
        <Route path="agreements" element={<Gate allow={can('agreements.write', 'disbursements.write', 'loans.read')}><AgreementsPage /></Gate>} />
        <Route path="agreements/:id" element={<Gate allow={can('agreements.write', 'disbursements.write', 'loans.read')}><AgreementRecordPage /></Gate>} />
        <Route path="agreements/:id/disburse" element={<Gate allow={can('disbursements.write')}><DisbursePage /></Gate>} />
        <Route path="loans" element={<Gate allow={can('loans.read')}><LoansPage /></Gate>} />
        <Route path="loans/:id" element={<Gate allow={can('loans.read')}><LoanAccountPage /></Gate>} />
        <Route path="loans/:id/payments/new" element={<Gate allow={can('payments.post')}><PostPaymentPage /></Gate>} />
        <Route path="receipts/:receiptNumber" element={<Gate allow={can('loans.read')}><ReceiptPage /></Gate>} />
        <Route path="*" element={<Denied />} />
      </Route>
    </Routes>
  );
}
