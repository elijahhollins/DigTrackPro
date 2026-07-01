-- =============================================================================
-- Migration: Foreman invoice templates + tighten job_invoices mutate policies
--
-- Part A — job_invoice_templates lets a foreman save a named set of crew +
-- equipment (just the IDs, so applying a template always resolves current
-- names/rates from the live employees/inventory_items lists — never a stale
-- snapshot). One foreman can save many templates. Mirrors the ownership
-- pattern already used by time_clock_crews (20260619000000_add_foreman_crews.sql):
-- the owning foreman manages their own rows, admins manage every row in the
-- company so they can view/reuse any foreman's templates.
--
-- Part B — job_invoices UPDATE/DELETE were previously open to any company
-- member (get_user_company_id() only). Now that foremen can create invoices
-- from the Job Hub, restrict mutation of already-saved invoices to admins so
-- a foreman can submit an invoice but not edit or delete it afterward.
-- SELECT/INSERT stay company-wide (foremen still need to create + view them).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Part A. FOREMAN INVOICE TEMPLATES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_invoice_templates (
  id               BIGSERIAL PRIMARY KEY,
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  owner_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name             TEXT NOT NULL DEFAULT 'My Template',
  -- References into the live employees / inventory_items catalogs. Names and
  -- rates are always resolved at apply-time, never stored here.
  employee_ids     BIGINT[] NOT NULL DEFAULT '{}',
  equipment_ids    TEXT[] NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS job_invoice_templates_company_idx ON job_invoice_templates (company_id);
CREATE INDEX IF NOT EXISTS job_invoice_templates_owner_idx ON job_invoice_templates (owner_profile_id);

ALTER TABLE job_invoice_templates ENABLE ROW LEVEL SECURITY;

-- A foreman can read/write only their own templates (and only within their company).
DROP POLICY IF EXISTS "job_invoice_templates_owner_manage" ON job_invoice_templates;
CREATE POLICY "job_invoice_templates_owner_manage" ON job_invoice_templates
  FOR ALL TO authenticated
  USING (owner_profile_id = auth.uid() AND company_id = get_user_company_id())
  WITH CHECK (owner_profile_id = auth.uid() AND company_id = get_user_company_id());

-- Admins (ADMIN / SUPER_ADMIN) can read/write any template in their company so
-- they can apply a foreman's template when building an invoice themselves.
DROP POLICY IF EXISTS "job_invoice_templates_admin_manage" ON job_invoice_templates;
CREATE POLICY "job_invoice_templates_admin_manage" ON job_invoice_templates
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('ADMIN', 'SUPER_ADMIN')
        AND (p.role = 'SUPER_ADMIN' OR p.company_id = job_invoice_templates.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('ADMIN', 'SUPER_ADMIN')
        AND (p.role = 'SUPER_ADMIN' OR p.company_id = job_invoice_templates.company_id)
    )
  );

GRANT ALL ON job_invoice_templates TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ---------------------------------------------------------------------------
-- Part B. RESTRICT job_invoices UPDATE/DELETE TO ADMINS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "job_invoices_update" ON job_invoices;
CREATE POLICY "job_invoices_update" ON job_invoices
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('ADMIN', 'SUPER_ADMIN')
        AND (p.role = 'SUPER_ADMIN' OR p.company_id = job_invoices.company_id)
    )
  );

DROP POLICY IF EXISTS "job_invoices_delete" ON job_invoices;
CREATE POLICY "job_invoices_delete" ON job_invoices
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('ADMIN', 'SUPER_ADMIN')
        AND (p.role = 'SUPER_ADMIN' OR p.company_id = job_invoices.company_id)
    )
  );
