export type AuthUser = {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  status: 'active' | 'inactive';
  roles: string[];
  permissions: string[];
};

export type PageMeta = { page: number; pageSize: number; total: number };
export type Page<T> = { data: T[]; meta: PageMeta };
export type One<T> = { data: T };

export type RoleRef = { id: number; name: string };

export type UserAccount = {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  status: 'active' | 'inactive';
  roles: RoleRef[];
  createdAt: string;
  updatedAt: string;
};

export type Role = {
  id: number;
  name: string;
  description: string;
  permissions: string[];
};

export type Permission = { id: number; code: string; description: string };

export type Setting = { key: string; value: string; description: string; updatedAt: string };

export type IdentityDocument = {
  id: number;
  borrowerId: number;
  documentType: string;
  documentNumber: string;
  issuedDate: string | null;
  expiryDate: string | null;
  fileReference: string | null;
  verificationStatus: string;
  notes: string | null;
  verifiedAt: string | null;
};

export type Borrower = {
  id: number;
  borrowerNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  fullName: string;
  dateOfBirth: string | null;
  gender: string;
  civilStatus: string;
  email: string | null;
  mobile: string | null;
  addressLine: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  employmentStatus: string | null;
  employerName: string | null;
  monthlyIncome: number | null;
  verificationStatus: string;
  verificationNotes: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  documents?: IdentityDocument[];
};

export type ProductRequirement = {
  id: number;
  name: string;
  description: string | null;
  isRequired: boolean;
};

export type Product = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  interestMethod: string;
  monthlyInterestRate: number;
  minAmount: number;
  maxAmount: number;
  minTermMonths: number;
  maxTermMonths: number;
  status: string;
  requirements?: ProductRequirement[];
};

export type ApplicationRequirement = {
  id: number;
  name: string;
  isRequired: boolean;
  status: string;
  notes: string | null;
};

export type ChecklistItem = {
  code: string;
  label: string;
  result: string;
  notes: string | null;
};

export type Evaluation = {
  id: number;
  evaluatorName: string;
  statedMonthlyIncome: number | null;
  verifiedMonthlyIncome: number;
  existingMonthlyObligations: number;
  disposableIncome: number;
  proposedInstallment: number;
  installmentToIncomeRatio: number | null;
  maxInstallmentToIncome: number;
  withinPolicy: boolean;
  recommendation: 'approve' | 'reject';
  notes: string | null;
  checklist: ChecklistItem[];
  updatedAt: string;
};

export type Approval = {
  id: number;
  approverName: string;
  decision: 'approved' | 'rejected';
  comments: string | null;
  decidedAt: string;
};

export type AgreementSummary = { id: number; agreementNumber: string; status: string };

export type Application = {
  id: number;
  applicationNumber: string;
  borrowerId: number;
  borrowerNumber: string;
  borrowerFirstName: string;
  borrowerMiddleName: string | null;
  borrowerLastName: string;
  borrowerName: string;
  borrowerVerificationStatus: string;
  productId: number;
  productCode: string;
  productName: string;
  requestedAmount: number;
  termMonths: number;
  monthlyInterestRate: number;
  purpose: string | null;
  status: string;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  requirements?: ApplicationRequirement[];
  evaluation?: Evaluation | null;
  approval?: Approval | null;
  agreement?: AgreementSummary | null;
};

export type AgreementDocument = {
  id: number;
  documentType: string;
  fileReference: string | null;
  notes: string | null;
  recordedAt: string;
};

export type Agreement = {
  id: number;
  agreementNumber: string;
  applicationId: number;
  applicationNumber: string;
  borrowerId: number;
  borrowerNumber: string;
  borrowerFirstName: string;
  borrowerMiddleName: string | null;
  borrowerLastName: string;
  borrowerName: string;
  productCode: string;
  principal: number;
  monthlyInterestRate: number;
  termMonths: number;
  totalInterest: number;
  totalPayable: number;
  installmentAmount: number;
  finalInstallmentAmount: number;
  firstDueDate: string;
  status: string;
  executedAt: string | null;
  cancelledAt: string | null;
  cancellationNotes: string | null;
  documents?: AgreementDocument[];
};

export type ScheduleLine = {
  id: number;
  installmentNumber: number;
  dueDate: string;
  principalDue: number;
  interestDue: number;
  totalDue: number;
  principalPaid: number;
  interestPaid: number;
  totalPaid: number;
  status: string;
  paidAt: string | null;
};

export type Disbursement = {
  id: number;
  amount: number;
  releaseDate: string;
  method: string;
  referenceNumber: string | null;
  notes: string | null;
  createdAt: string;
};

export type Loan = {
  id: number;
  accountNumber: string;
  agreementId: number;
  agreementNumber: string;
  borrowerId: number;
  borrowerNumber: string;
  borrowerFirstName: string;
  borrowerMiddleName: string | null;
  borrowerLastName: string;
  borrowerName: string;
  principal: number;
  totalInterest: number;
  totalPayable: number;
  outstandingPrincipal: number;
  outstandingInterest: number;
  outstandingBalance: number;
  status: string;
  readyToClose: boolean;
  disbursedAt: string;
  maturityDate: string;
  closedAt: string | null;
  disbursement?: Disbursement | null;
  schedule?: ScheduleLine[];
};

export type Payment = {
  id: number;
  receiptNumber: string;
  amount: number;
  paymentDate: string;
  method: string;
  referenceNumber: string | null;
  notes: string | null;
  createdAt: string;
};

export type Allocation = {
  installmentNumber: number;
  interestApplied: number;
  principalApplied: number;
  amount: number;
};

export type Receipt = {
  id: number;
  receiptNumber: string;
  loanAccountId: number;
  accountNumber: string;
  amount: number;
  paymentDate: string;
  method: string;
  referenceNumber: string | null;
  notes: string | null;
  createdAt: string;
  currentOutstandingBalance: number;
  allocations: Allocation[];
};

export type Dashboard = {
  companyName: string;
  currency: string;
  portfolio: {
    borrowerCount: number;
    accountsActive: number;
    accountsOverdue: number;
    accountsClosed: number;
    principalDisbursed: number;
    outstandingBalance: number;
    fullyPaidPendingClosure: number;
    disbursedThisMonth: number;
    disbursementCountThisMonth: number;
  };
  applications: { total: number; byStatus: Record<string, number> };
  collections: {
    postedToday: number;
    postedThisMonth: number;
    dueThisMonth: number;
    collectedOnDuesThisMonth: number;
  };
  overdue: {
    accounts: number;
    outstandingBalance: number;
    installments: number;
    installmentAmount: number;
  };
};
