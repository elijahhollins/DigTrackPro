# Blueprint Admin Access — Migration Steps

## Prerequisites

- `complete_rls_setup.sql` must already be applied to your Supabase project.
- You need project owner / admin access to the Supabase dashboard.

---

## Step 1 — Apply the SQL

1. Open [Supabase Dashboard](https://supabase.com/dashboard) and select your project.
2. Click **SQL Editor** in the left sidebar.
3. Click **New query**.
4. Copy the contents of `supabase/blueprints_admin_rls_enhanced.sql` and paste them in.
5. Click **Run** (or press `Ctrl/Cmd + Enter`).
6. Verify the output shows **"Success. No rows returned."**

---

## Step 2 — Identify Existing Admins

Run this query to see users who should have admin access:

```sql
SELECT id, name, username, role, company_id
FROM profiles
ORDER BY company_id, role;
```

---

## Step 3 — Promote Users to ADMIN (if needed)

For each user who should be able to manage blueprints, update their role:

```sql
-- Promote a single user by their UUID
UPDATE profiles
SET role = 'ADMIN'
WHERE id = 'REPLACE-WITH-USER-UUID';

-- Promote a user by their username / email
UPDATE profiles
SET role = 'ADMIN'
WHERE username = 'user@example.com';
```

To find a user's UUID from the Supabase dashboard:

1. Navigate to **Authentication → Users**.
2. Locate the user and copy their **User UID**.

---

## Step 4 — Verify Policies

Confirm the new policies are in place:

```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('job_prints', 'print_markers', 'profiles')
ORDER BY tablename, policyname;
```

Expected output includes:

| tablename      | policyname                     | cmd    |
|----------------|-------------------------------|--------|
| job_prints     | job_prints_delete_admin        | DELETE |
| job_prints     | job_prints_insert_admin        | INSERT |
| job_prints     | job_prints_select              | SELECT |
| job_prints     | job_prints_update_admin        | UPDATE |
| print_markers  | print_markers_delete_admin     | DELETE |
| print_markers  | print_markers_insert_admin     | INSERT |
| print_markers  | print_markers_select           | SELECT |
| print_markers  | print_markers_update_admin     | UPDATE |
| profiles       | admin_manage_team_profiles     | UPDATE |

---

## Step 5 — Verify Helper Functions

```sql
-- Should return true for your admin account, false for crew accounts
SELECT is_company_admin();

-- Should return true when passing your own company_id
SELECT is_admin_of_company(get_user_company_id());
```

---

## Step 6 — Smoke Test

### As a CREW user

```sql
-- Should succeed (SELECT is allowed for all)
SELECT * FROM job_prints LIMIT 1;

-- Should fail with RLS error (INSERT is admin-only)
INSERT INTO job_prints (company_id, job_number, storage_path, file_name)
VALUES (get_user_company_id(), 'TEST', 'test/file.pdf', 'file.pdf');
```

### As an ADMIN user

```sql
-- Both should succeed
SELECT * FROM job_prints LIMIT 1;

INSERT INTO job_prints (company_id, job_number, storage_path, file_name)
VALUES (get_user_company_id(), 'TEST', 'test/file.pdf', 'file.pdf');

-- Clean up the test row
DELETE FROM job_prints WHERE job_number = 'TEST';
```

---

## Rollback

If you need to revert to the previous behaviour (all authenticated users can write):

```sql
-- Remove the new policies
DROP POLICY IF EXISTS "job_prints_select"          ON job_prints;
DROP POLICY IF EXISTS "job_prints_insert_admin"    ON job_prints;
DROP POLICY IF EXISTS "job_prints_update_admin"    ON job_prints;
DROP POLICY IF EXISTS "job_prints_delete_admin"    ON job_prints;

DROP POLICY IF EXISTS "print_markers_select"        ON print_markers;
DROP POLICY IF EXISTS "print_markers_insert_admin"  ON print_markers;
DROP POLICY IF EXISTS "print_markers_update_admin"  ON print_markers;
DROP POLICY IF EXISTS "print_markers_delete_admin"  ON print_markers;

DROP POLICY IF EXISTS "admin_manage_team_profiles"  ON profiles;

-- Restore the original all-access policies
CREATE POLICY "tenant_isolation_job_prints"
  ON job_prints FOR ALL TO authenticated
  USING      (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "tenant_isolation_print_markers"
  ON print_markers FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.job_prints jp
      WHERE jp.id = print_markers.print_id
        AND jp.company_id = get_user_company_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.job_prints jp
      WHERE jp.id = print_markers.print_id
        AND jp.company_id = get_user_company_id()
    )
  );
```
