-- Phase 1 internal LMS.
-- Workflow: borrower registration, credit evaluation, one-level approval,
-- agreement and manual disbursement, servicing, repayment, and closure.

CREATE TABLE IF NOT EXISTS roles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(64) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissions_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles (id),
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id INT UNSIGNED NOT NULL,
  role_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(64) NOT NULL,
  setting_value VARCHAR(255) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS number_sequences (
  name VARCHAR(32) NOT NULL,
  next_value INT UNSIGNED NOT NULL,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS borrowers (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  borrower_number VARCHAR(32) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100) NULL,
  last_name VARCHAR(100) NOT NULL,
  date_of_birth DATE NULL,
  gender ENUM('male', 'female', 'other', 'unspecified') NOT NULL DEFAULT 'unspecified',
  civil_status ENUM('single', 'married', 'widowed', 'separated', 'unspecified') NOT NULL DEFAULT 'unspecified',
  email VARCHAR(255) NULL,
  mobile VARCHAR(32) NULL,
  address_line VARCHAR(255) NULL,
  city VARCHAR(100) NULL,
  province VARCHAR(100) NULL,
  postal_code VARCHAR(20) NULL,
  employment_status ENUM('employed', 'self_employed', 'business_owner', 'retired', 'unemployed', 'other') NULL,
  employer_name VARCHAR(150) NULL,
  monthly_income DECIMAL(15, 2) NULL,
  verification_status ENUM('pending', 'verified', 'rejected') NOT NULL DEFAULT 'pending',
  verification_notes VARCHAR(500) NULL,
  verified_by INT UNSIGNED NULL,
  verified_at DATETIME NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_borrowers_number (borrower_number),
  UNIQUE KEY uq_borrowers_email (email),
  KEY idx_borrowers_status (verification_status),
  KEY idx_borrowers_name (last_name, first_name),
  CONSTRAINT fk_borrowers_verified_by FOREIGN KEY (verified_by) REFERENCES users (id),
  CONSTRAINT fk_borrowers_created_by FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS identity_documents (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  borrower_id INT UNSIGNED NOT NULL,
  document_type ENUM('national_id', 'passport', 'drivers_license', 'tax_id', 'social_security', 'other') NOT NULL,
  document_number VARCHAR(64) NOT NULL,
  issued_date DATE NULL,
  expiry_date DATE NULL,
  file_reference VARCHAR(255) NULL,
  verification_status ENUM('pending', 'verified', 'rejected') NOT NULL DEFAULT 'pending',
  notes VARCHAR(500) NULL,
  verified_by INT UNSIGNED NULL,
  verified_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_identity_document (borrower_id, document_type, document_number),
  CONSTRAINT fk_identity_documents_borrower FOREIGN KEY (borrower_id) REFERENCES borrowers (id),
  CONSTRAINT fk_identity_documents_verified_by FOREIGN KEY (verified_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loan_products (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(150) NOT NULL,
  description VARCHAR(500) NULL,
  interest_method ENUM('flat') NOT NULL DEFAULT 'flat',
  monthly_interest_rate DECIMAL(8, 4) NOT NULL,
  min_amount DECIMAL(15, 2) NOT NULL,
  max_amount DECIMAL(15, 2) NOT NULL,
  min_term_months INT UNSIGNED NOT NULL,
  max_term_months INT UNSIGNED NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_loan_products_code (code),
  CONSTRAINT chk_product_rate CHECK (monthly_interest_rate >= 0 AND monthly_interest_rate <= 20),
  CONSTRAINT chk_product_amounts CHECK (min_amount > 0 AND max_amount >= min_amount),
  CONSTRAINT chk_product_terms CHECK (min_term_months >= 1 AND max_term_months >= min_term_months AND max_term_months <= 360)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_requirements (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id INT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  description VARCHAR(255) NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_product_requirements_product (product_id),
  CONSTRAINT fk_product_requirements_product FOREIGN KEY (product_id) REFERENCES loan_products (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loan_applications (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_number VARCHAR(32) NOT NULL,
  borrower_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  requested_amount DECIMAL(15, 2) NOT NULL,
  term_months INT UNSIGNED NOT NULL,
  monthly_interest_rate DECIMAL(8, 4) NOT NULL,
  purpose VARCHAR(255) NULL,
  status ENUM('draft', 'submitted', 'under_review', 'approved', 'rejected', 'withdrawn', 'disbursed') NOT NULL DEFAULT 'draft',
  submitted_at DATETIME NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_applications_number (application_number),
  KEY idx_applications_status (status),
  KEY idx_applications_borrower (borrower_id),
  CONSTRAINT fk_applications_borrower FOREIGN KEY (borrower_id) REFERENCES borrowers (id),
  CONSTRAINT fk_applications_product FOREIGN KEY (product_id) REFERENCES loan_products (id),
  CONSTRAINT fk_applications_created_by FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS application_requirements (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_id INT UNSIGNED NOT NULL,
  product_requirement_id INT UNSIGNED NULL,
  name VARCHAR(150) NOT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 1,
  status ENUM('pending', 'submitted', 'waived') NOT NULL DEFAULT 'pending',
  notes VARCHAR(255) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_application_requirements_application (application_id),
  CONSTRAINT fk_application_requirements_application FOREIGN KEY (application_id) REFERENCES loan_applications (id),
  CONSTRAINT fk_application_requirements_product_requirement FOREIGN KEY (product_requirement_id) REFERENCES product_requirements (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS credit_evaluations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_id INT UNSIGNED NOT NULL,
  evaluator_id INT UNSIGNED NOT NULL,
  stated_monthly_income DECIMAL(15, 2) NOT NULL,
  verified_monthly_income DECIMAL(15, 2) NOT NULL,
  existing_monthly_obligations DECIMAL(15, 2) NOT NULL DEFAULT 0,
  disposable_income DECIMAL(15, 2) NOT NULL,
  proposed_installment DECIMAL(15, 2) NOT NULL,
  recommendation ENUM('approve', 'reject') NOT NULL,
  notes VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_evaluations_application (application_id),
  CONSTRAINT fk_evaluations_application FOREIGN KEY (application_id) REFERENCES loan_applications (id),
  CONSTRAINT fk_evaluations_evaluator FOREIGN KEY (evaluator_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS capacity_checklist_items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  evaluation_id INT UNSIGNED NOT NULL,
  item_code VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  result ENUM('pass', 'fail', 'na') NOT NULL,
  notes VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_checklist_item (evaluation_id, item_code),
  CONSTRAINT fk_checklist_evaluation FOREIGN KEY (evaluation_id) REFERENCES credit_evaluations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS approvals (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_id INT UNSIGNED NOT NULL,
  evaluation_id INT UNSIGNED NOT NULL,
  approver_id INT UNSIGNED NOT NULL,
  decision ENUM('approved', 'rejected') NOT NULL,
  comments VARCHAR(1000) NULL,
  decided_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_approvals_application (application_id),
  CONSTRAINT fk_approvals_application FOREIGN KEY (application_id) REFERENCES loan_applications (id),
  CONSTRAINT fk_approvals_evaluation FOREIGN KEY (evaluation_id) REFERENCES credit_evaluations (id),
  CONSTRAINT fk_approvals_approver FOREIGN KEY (approver_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loan_agreements (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agreement_number VARCHAR(32) NOT NULL,
  application_id INT UNSIGNED NOT NULL,
  borrower_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  principal DECIMAL(15, 2) NOT NULL,
  monthly_interest_rate DECIMAL(8, 4) NOT NULL,
  term_months INT UNSIGNED NOT NULL,
  total_interest DECIMAL(15, 2) NOT NULL,
  total_payable DECIMAL(15, 2) NOT NULL,
  installment_amount DECIMAL(15, 2) NOT NULL,
  first_due_date DATE NOT NULL,
  status ENUM('draft', 'executed', 'disbursed', 'cancelled') NOT NULL DEFAULT 'draft',
  executed_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  cancellation_notes VARCHAR(500) NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_agreements_number (agreement_number),
  KEY idx_agreements_application (application_id),
  CONSTRAINT fk_agreements_application FOREIGN KEY (application_id) REFERENCES loan_applications (id),
  CONSTRAINT fk_agreements_borrower FOREIGN KEY (borrower_id) REFERENCES borrowers (id),
  CONSTRAINT fk_agreements_product FOREIGN KEY (product_id) REFERENCES loan_products (id),
  CONSTRAINT fk_agreements_created_by FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agreement_documents (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agreement_id INT UNSIGNED NOT NULL,
  document_type VARCHAR(64) NOT NULL,
  file_reference VARCHAR(255) NULL,
  notes VARCHAR(500) NULL,
  recorded_by INT UNSIGNED NULL,
  recorded_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_agreement_documents_agreement (agreement_id),
  CONSTRAINT fk_agreement_documents_agreement FOREIGN KEY (agreement_id) REFERENCES loan_agreements (id),
  CONSTRAINT fk_agreement_documents_recorded_by FOREIGN KEY (recorded_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loan_accounts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  account_number VARCHAR(32) NOT NULL,
  agreement_id INT UNSIGNED NOT NULL,
  borrower_id INT UNSIGNED NOT NULL,
  principal DECIMAL(15, 2) NOT NULL,
  total_interest DECIMAL(15, 2) NOT NULL,
  total_payable DECIMAL(15, 2) NOT NULL,
  outstanding_principal DECIMAL(15, 2) NOT NULL,
  outstanding_interest DECIMAL(15, 2) NOT NULL,
  outstanding_balance DECIMAL(15, 2) NOT NULL,
  status ENUM('active', 'overdue', 'closed') NOT NULL DEFAULT 'active',
  disbursed_at DATETIME NOT NULL,
  maturity_date DATE NOT NULL,
  closed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_loans_account_number (account_number),
  UNIQUE KEY uq_loans_agreement (agreement_id),
  KEY idx_loans_status (status),
  KEY idx_loans_borrower (borrower_id),
  CONSTRAINT fk_loans_agreement FOREIGN KEY (agreement_id) REFERENCES loan_agreements (id),
  CONSTRAINT fk_loans_borrower FOREIGN KEY (borrower_id) REFERENCES borrowers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS disbursements (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agreement_id INT UNSIGNED NOT NULL,
  loan_account_id INT UNSIGNED NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  release_date DATE NOT NULL,
  method ENUM('cash', 'bank_transfer', 'check') NOT NULL,
  reference_number VARCHAR(64) NULL,
  notes VARCHAR(500) NULL,
  released_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_disbursements_agreement (agreement_id),
  UNIQUE KEY uq_disbursements_loan (loan_account_id),
  CONSTRAINT fk_disbursements_agreement FOREIGN KEY (agreement_id) REFERENCES loan_agreements (id),
  CONSTRAINT fk_disbursements_loan FOREIGN KEY (loan_account_id) REFERENCES loan_accounts (id),
  CONSTRAINT fk_disbursements_released_by FOREIGN KEY (released_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS repayment_schedules (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  loan_account_id INT UNSIGNED NOT NULL,
  installment_number INT UNSIGNED NOT NULL,
  due_date DATE NOT NULL,
  principal_due DECIMAL(15, 2) NOT NULL,
  interest_due DECIMAL(15, 2) NOT NULL,
  total_due DECIMAL(15, 2) NOT NULL,
  principal_paid DECIMAL(15, 2) NOT NULL DEFAULT 0,
  interest_paid DECIMAL(15, 2) NOT NULL DEFAULT 0,
  total_paid DECIMAL(15, 2) NOT NULL DEFAULT 0,
  status ENUM('pending', 'partial', 'paid', 'overdue') NOT NULL DEFAULT 'pending',
  paid_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_schedule_installment (loan_account_id, installment_number),
  KEY idx_schedule_due (due_date, status),
  CONSTRAINT fk_schedule_loan FOREIGN KEY (loan_account_id) REFERENCES loan_accounts (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  loan_account_id INT UNSIGNED NOT NULL,
  receipt_number VARCHAR(32) NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  payment_date DATE NOT NULL,
  method ENUM('cash', 'bank_transfer', 'check') NOT NULL,
  reference_number VARCHAR(64) NULL,
  notes VARCHAR(500) NULL,
  posted_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_receipt (receipt_number),
  KEY idx_payments_loan (loan_account_id),
  KEY idx_payments_date (payment_date),
  CONSTRAINT fk_payments_loan FOREIGN KEY (loan_account_id) REFERENCES loan_accounts (id),
  CONSTRAINT fk_payments_posted_by FOREIGN KEY (posted_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_allocations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_id INT UNSIGNED NOT NULL,
  schedule_id INT UNSIGNED NOT NULL,
  interest_applied DECIMAL(15, 2) NOT NULL,
  principal_applied DECIMAL(15, 2) NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_allocations_payment (payment_id),
  CONSTRAINT fk_allocations_payment FOREIGN KEY (payment_id) REFERENCES payments (id),
  CONSTRAINT fk_allocations_schedule FOREIGN KEY (schedule_id) REFERENCES repayment_schedules (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO number_sequences (name, next_value) VALUES
  ('borrower', 1),
  ('application', 1),
  ('agreement', 1),
  ('loan', 1),
  ('receipt', 1);
