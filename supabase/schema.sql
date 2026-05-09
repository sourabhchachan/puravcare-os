-- ============================================================================
-- PuravCare OS — Supabase database schema (Agastya Care, Gurgaon)
-- Paste into Supabase SQL Editor and run once (safe to re-run: drops first)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) Reset — drop in dependency order (children before parents)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.notices CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.indents CASCADE;
DROP TABLE IF EXISTS public.billable_items CASCADE;
DROP TABLE IF EXISTS public.cash_entries CASCADE;
DROP TABLE IF EXISTS public.cashbook_fields CASCADE;
DROP TABLE IF EXISTS public.cashbook_members CASCADE;
DROP TABLE IF EXISTS public.cashbooks CASCADE;
DROP TABLE IF EXISTS public.task_chain_steps CASCADE;
DROP TABLE IF EXISTS public.task_chains CASCADE;
DROP TABLE IF EXISTS public.task_events CASCADE;
DROP TABLE IF EXISTS public.tasks CASCADE;
DROP TABLE IF EXISTS public.task_master CASCADE;
DROP TABLE IF EXISTS public.psi_nodes CASCADE;
DROP TABLE IF EXISTS public.items CASCADE;
DROP TABLE IF EXISTS public.vendors CASCADE;
DROP TABLE IF EXISTS public.patients CASCADE;
DROP TABLE IF EXISTS public.permissions CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

DROP FUNCTION IF EXISTS public.generate_staff_id() CASCADE;
DROP FUNCTION IF EXISTS public.generate_uhid() CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;

DROP SEQUENCE IF EXISTS public.staff_id_seq CASCADE;
DROP SEQUENCE IF EXISTS public.uhid_seq CASCADE;

-- ----------------------------------------------------------------------------
-- 1) Extensions
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 2) Sequences for id generators (used by helper functions)
-- ----------------------------------------------------------------------------
CREATE SEQUENCE public.staff_id_seq
  AS integer
  START WITH 100001
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

CREATE SEQUENCE public.uhid_seq
  AS integer
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

-- ----------------------------------------------------------------------------
-- 3) Helper functions
-- ----------------------------------------------------------------------------

-- Next staff_id as text: 100001, 100002, ...
CREATE OR REPLACE FUNCTION public.generate_staff_id()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT nextval('public.staff_id_seq')::text;
$$;

-- Next UHID: PC-00001, PC-00002, ...
CREATE OR REPLACE FUNCTION public.generate_uhid()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT 'PC-' || lpad(nextval('public.uhid_seq')::text, 5, '0');
$$;

-- Auto-touch updated_at on UPDATE
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4) TABLES (exact order specified)
-- ----------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- 4.1 users
-- --------------------------------------------------------------------------
CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id text NOT NULL UNIQUE,
  login_id text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  must_change_password boolean NOT NULL DEFAULT true,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('ceo', 'ops', 'staff', 'vendor')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 4.2 permissions
-- --------------------------------------------------------------------------
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users (id) ON DELETE CASCADE,
  can_create_tasks boolean NOT NULL DEFAULT true,
  can_create_items boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 4.3 patients
-- --------------------------------------------------------------------------
CREATE TABLE public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uhid text NOT NULL UNIQUE,
  full_name text NOT NULL,
  age integer,
  gender text CHECK (gender IN ('male', 'female', 'other')),
  phone text,
  admission_type text CHECK (admission_type IN ('opd', 'ipd')),
  bed_number text,
  ipd_number text,
  admission_date timestamptz NOT NULL DEFAULT now(),
  discharge_date timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'discharged')),
  created_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 4.4 vendors
-- --------------------------------------------------------------------------
CREATE TABLE public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text,
  phone text,
  user_id uuid REFERENCES public.users (id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 4.5 items
-- --------------------------------------------------------------------------
CREATE TABLE public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric(10, 2) NOT NULL,
  vendor_id uuid REFERENCES public.vendors (id),
  is_patient_linked boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 4.6 psi_nodes
-- --------------------------------------------------------------------------
CREATE TABLE public.psi_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('problem', 'solution', 'indicator')),
  title text NOT NULL,
  description text,
  parent_id uuid REFERENCES public.psi_nodes (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected')),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users (id),
  approved_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 4.7 task_master
-- --------------------------------------------------------------------------
CREATE TABLE public.task_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  task_type text CHECK (task_type IN ('ops', 'clinical', 'patient')),
  default_assignee_role text,
  proof_type text CHECK (proof_type IN ('tap', 'photo', 'countersign')),
  recurrence text CHECK (recurrence IN ('one-time', 'hourly', '2h', '4h', '6h', '8h', 'daily', 'weekly')),
  priority text CHECK (priority IN ('critical', 'high', 'normal', 'low')),
  is_patient_linked boolean NOT NULL DEFAULT false,
  psi_node_id uuid REFERENCES public.psi_nodes (id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 4.8 tasks
-- --------------------------------------------------------------------------
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  task_type text CHECK (task_type IN ('ops', 'clinical', 'patient')),
  assignee_id uuid NOT NULL REFERENCES public.users (id),
  created_by uuid NOT NULL REFERENCES public.users (id),
  patient_id uuid REFERENCES public.patients (id),
  psi_node_id uuid REFERENCES public.psi_nodes (id),
  task_master_id uuid REFERENCES public.task_master (id),
  due_at timestamptz,
  priority text CHECK (priority IN ('critical', 'high', 'normal', 'low')),
  proof_type text CHECK (proof_type IN ('tap', 'photo', 'countersign')),
  countersign_user_id uuid REFERENCES public.users (id),
  recurrence text CHECK (recurrence IN ('one-time', 'hourly', '2h', '4h', '6h', '8h', 'daily', 'weekly')),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'pending',
      'acknowledged',
      'in_progress',
      'done',
      'confirmed',
      'closed',
      'blocked',
      'cancelled',
      'waiting'
    )
  ),
  proof_photo_url text,
  reassign_reason text,
  cancel_reason text,
  cancelled_by uuid REFERENCES public.users (id),
  cancelled_at timestamptz,
  block_reason text,
  blocked_at timestamptz,
  from_chain boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 4.9 task_events
-- --------------------------------------------------------------------------
CREATE TABLE public.task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.users (id),
  event_type text NOT NULL CHECK (
    event_type IN (
      'created',
      'assigned',
      'acknowledged',
      'status_changed',
      'reassigned',
      'proof_uploaded',
      'countersigned',
      'confirmed',
      'closed',
      'blocked',
      'force_skipped',
      'cancelled',
      'unblocked'
    )
  ),
  old_value text,
  new_value text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 4.10 task_chains
-- --------------------------------------------------------------------------
CREATE TABLE public.task_chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  chain_type text CHECK (chain_type IN ('vertical', 'horizontal')),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'active', 'paused', 'completed', 'cancelled')),
  created_by uuid REFERENCES public.users (id),
  approved_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 4.11 task_chain_steps
-- --------------------------------------------------------------------------
CREATE TABLE public.task_chain_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id uuid NOT NULL REFERENCES public.task_chains (id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks (id) ON DELETE SET NULL,
  task_master_id uuid REFERENCES public.task_master (id) ON DELETE SET NULL,
  default_assignee_role text,
  step_order integer NOT NULL,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed', 'skipped')),
  skip_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 4.12 cashbooks
-- --------------------------------------------------------------------------
CREATE TABLE public.cashbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 4.13 cashbook_members
-- --------------------------------------------------------------------------
CREATE TABLE public.cashbook_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashbook_id uuid NOT NULL REFERENCES public.cashbooks (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  role text CHECK (role IN ('primary_admin', 'admin', 'data_operator')),
  can_backdate text NOT NULL DEFAULT 'never' CHECK (can_backdate IN ('always', 'never', '1day')),
  can_edit_own boolean NOT NULL DEFAULT false,
  hide_balance boolean NOT NULL DEFAULT false,
  hide_others_entries boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cashbook_id, user_id)
);

-- --------------------------------------------------------------------------
-- 4.14 cashbook_fields
-- --------------------------------------------------------------------------
CREATE TABLE public.cashbook_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashbook_id uuid NOT NULL REFERENCES public.cashbooks (id) ON DELETE CASCADE,
  field_name text NOT NULL,
  field_type text CHECK (field_type IN ('text', 'number', 'select')),
  is_required boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 4.15 cash_entries
-- --------------------------------------------------------------------------
CREATE TABLE public.cash_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashbook_id uuid NOT NULL REFERENCES public.cashbooks (id) ON DELETE CASCADE,
  entry_type text CHECK (entry_type IN ('in', 'out')),
  amount numeric(12, 2) NOT NULL,
  description text,
  entry_date timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.users (id),
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 4.16 billable_items
-- --------------------------------------------------------------------------
CREATE TABLE public.billable_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients (id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items (id),
  quantity numeric(10, 2) NOT NULL DEFAULT 1,
  unit_price numeric(10, 2) NOT NULL,
  total_price numeric(10, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  billed_by uuid REFERENCES public.users (id),
  billed_at timestamptz NOT NULL DEFAULT now(),
  note text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  cancel_reason text,
  cancelled_by uuid REFERENCES public.users (id),
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 4.17 indents
-- --------------------------------------------------------------------------
CREATE TABLE public.indents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors (id),
  item_description text NOT NULL,
  quantity numeric(10, 2),
  unit text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dispatched', 'delivered', 'cancelled')),
  cancel_reason text,
  cancelled_by uuid REFERENCES public.users (id),
  cancelled_at timestamptz,
  created_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 4.18 notifications
-- --------------------------------------------------------------------------
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  is_read boolean NOT NULL DEFAULT false,
  related_task_id uuid REFERENCES public.tasks (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 5) INDEXES
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX items_name_lower_uidx ON public.items (lower(name));

CREATE INDEX tasks_assignee_id_idx ON public.tasks (assignee_id);
CREATE INDEX tasks_status_idx ON public.tasks (status);
CREATE INDEX tasks_due_at_idx ON public.tasks (due_at);

CREATE INDEX task_events_task_id_idx ON public.task_events (task_id);

CREATE INDEX cash_entries_cashbook_id_idx ON public.cash_entries (cashbook_id);
CREATE INDEX cash_entries_entry_date_idx ON public.cash_entries (entry_date);

CREATE INDEX billable_items_patient_id_idx ON public.billable_items (patient_id);
CREATE INDEX billable_items_status_idx ON public.billable_items (status);

CREATE INDEX notifications_user_id_is_read_idx ON public.notifications (user_id, is_read);

CREATE INDEX notices_created_at_idx ON public.notices (created_at DESC);

CREATE INDEX indents_vendor_id_idx ON public.indents (vendor_id);
CREATE INDEX indents_status_idx ON public.indents (status);

-- ----------------------------------------------------------------------------
-- 6) updated_at triggers
--    Applied to: users, patients, items, tasks, cashbooks, cash_entries, indents
--    (billable_items has no updated_at column per schema)
-- ----------------------------------------------------------------------------
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

CREATE TRIGGER patients_set_updated_at
  BEFORE UPDATE ON public.patients
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

CREATE TRIGGER items_set_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

CREATE TRIGGER cashbooks_set_updated_at
  BEFORE UPDATE ON public.cashbooks
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

CREATE TRIGGER cash_entries_set_updated_at
  BEFORE UPDATE ON public.cash_entries
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

CREATE TRIGGER indents_set_updated_at
  BEFORE UPDATE ON public.indents
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 7) ROW LEVEL SECURITY — enable on all tables + permissive authenticated policy
-- ----------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.psi_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_chain_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashbook_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashbook_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billable_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated users"
  ON public.users
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users"
  ON public.permissions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users"
  ON public.patients
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users"
  ON public.vendors
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users"
  ON public.items
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users"
  ON public.psi_nodes
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users"
  ON public.task_master
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users"
  ON public.tasks
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users"
  ON public.task_events
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users"
  ON public.task_chains
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users"
  ON public.task_chain_steps
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users"
  ON public.cashbooks
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users"
  ON public.cashbook_members
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users"
  ON public.cashbook_fields
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users"
  ON public.cash_entries
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users"
  ON public.billable_items
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users"
  ON public.indents
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users"
  ON public.notifications
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users"
  ON public.notices
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- Post-deploy safety migrations
-- ----------------------------------------------------------------------------
ALTER TABLE public.psi_nodes
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

ALTER TABLE public.task_master
ADD COLUMN IF NOT EXISTS psi_node_id uuid REFERENCES public.psi_nodes (id);

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS cancel_reason text;

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.users (id);

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS block_reason text;

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS blocked_at timestamptz;

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS from_chain boolean NOT NULL DEFAULT false;

ALTER TABLE public.task_chain_steps
ADD COLUMN IF NOT EXISTS task_master_id uuid REFERENCES public.task_master (id);

ALTER TABLE public.task_chain_steps
ADD COLUMN IF NOT EXISTS default_assignee_role text;

-- Note: existing databases must widen CHECK constraints manually if upgrades fail, e.g. tasks.status and task_events.event_type.

-- ============================================================================
-- Done — schema ready for Phase 3 (role-specific RLS tightening)
-- ============================================================================
