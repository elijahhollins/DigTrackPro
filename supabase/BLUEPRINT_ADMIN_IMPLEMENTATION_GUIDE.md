# Blueprint Admin Access Control — Implementation Guide

## Overview

This guide explains how to restrict blueprint (job_prints) and print marker write operations
to **company ADMIN and SUPER_ADMIN roles only**. Regular CREW members retain read-only access.

## Access Levels

| Operation            | CREW | ADMIN | SUPER_ADMIN |
|----------------------|------|-------|-------------|
| View Blueprints      | ✅   | ✅    | ✅          |
| Add Blueprint        | ❌   | ✅    | ✅          |
| Edit Blueprint       | ❌   | ✅    | ✅          |
| Delete Blueprint     | ❌   | ✅    | ✅          |
| Add/Delete Markers   | ❌   | ✅    | ✅          |
| Manage Team Roles    | ❌   | ✅    | ✅          |

## Files Modified / Added

| File | Purpose |
|------|---------|
| `supabase/blueprints_admin_rls_enhanced.sql` | SQL policy and helper function definitions |
| `supabase/BLUEPRINT_ADMIN_IMPLEMENTATION_GUIDE.md` | This guide |
| `supabase/MIGRATION_STEPS.md` | Step-by-step migration instructions |
| `components/JobPrintMarkup.tsx` | UI respects `isAdmin` prop |
| `App.tsx` | Passes `isAdmin` to `JobPrintMarkup` |

---

## Database Layer

### New Helper Functions

#### `is_company_admin()`

Returns `true` when the current user's role is `ADMIN` or `SUPER_ADMIN`.

```sql
SELECT is_company_admin();
```

#### `is_admin_of_company(p_company_id uuid)`

Returns `true` when the current user is an admin of the specified company.
Useful for cross-company checks in SUPER_ADMIN flows.

```sql
SELECT is_admin_of_company('your-company-uuid');
```

### RLS Policy Changes

#### `job_prints` table

The single `tenant_isolation_job_prints` policy (ALL operations) is replaced by four
role-aware policies:

| Policy | Operation | Who |
|--------|-----------|-----|
| `job_prints_select` | SELECT | All company members |
| `job_prints_insert_admin` | INSERT | ADMIN / SUPER_ADMIN only |
| `job_prints_update_admin` | UPDATE | ADMIN / SUPER_ADMIN only |
| `job_prints_delete_admin` | DELETE | ADMIN / SUPER_ADMIN only |

#### `print_markers` table

Same pattern — one policy per operation:

| Policy | Operation | Who |
|--------|-----------|-----|
| `print_markers_select` | SELECT | All company members |
| `print_markers_insert_admin` | INSERT | ADMIN / SUPER_ADMIN only |
| `print_markers_update_admin` | UPDATE | ADMIN / SUPER_ADMIN only |
| `print_markers_delete_admin` | DELETE | ADMIN / SUPER_ADMIN only |

#### `profiles` table

A new `admin_manage_team_profiles` UPDATE policy lets admins update other team members'
profiles (e.g. to change their role). Admins cannot update their own profile through this
policy — that continues to be handled by the existing `allow_own_profile` policy.

---

## Frontend Layer (TypeScript/React)

The `JobPrintMarkup` component receives an `isAdmin` boolean prop.

### Behaviour when `isAdmin = false` (CREW user)

- The **Upload Blueprint** button is hidden.
- The **Pin Mode** (place markers) button is hidden.
- The **Delete Marker** button inside each marker tooltip is hidden.
- The blueprint and all existing markers are still fully viewable and navigable.

### Behaviour when `isAdmin = true` (ADMIN / SUPER_ADMIN)

Full access — identical to the pre-change behaviour.

### Checking admin status in other components

```typescript
import { UserRole } from '../types.ts';

// Given the sessionUser object from App state:
const isSuperAdmin = sessionUser.role === UserRole.SUPER_ADMIN;
const isAdmin = sessionUser.role === UserRole.ADMIN || isSuperAdmin;
```

---

## Testing

### Database Tests

```sql
-- As a CREW user (role = 'CREW'):
INSERT INTO job_prints (company_id, job_number, storage_path, file_name)
VALUES (get_user_company_id(), '1001', 'path/file.pdf', 'file.pdf');
-- Expected: ERROR — new row violates row-level security policy

SELECT * FROM job_prints WHERE company_id = get_user_company_id();
-- Expected: Returns all blueprints for the company (read works fine)
```

```sql
-- As an ADMIN user (role = 'ADMIN'):
INSERT INTO job_prints (company_id, job_number, storage_path, file_name)
VALUES (get_user_company_id(), '1001', 'path/file.pdf', 'file.pdf');
-- Expected: Success
```

### Frontend Tests

1. Log in as a CREW user and navigate to a job's Blueprint view.
2. Verify the Upload and Pin Mode buttons are absent.
3. Log in as an ADMIN user and repeat — both buttons should be present.

---

## Troubleshooting

### "Policy already exists" error

The SQL script uses `DROP POLICY IF EXISTS` before `CREATE POLICY`, so this should not
occur. If it does, run the DROP statements manually then re-run the script.

### Admin user cannot upload blueprints

Verify the user's role in the `profiles` table:

```sql
SELECT id, role FROM profiles WHERE id = auth.uid();
-- role should be 'ADMIN' or 'SUPER_ADMIN'
```

If the role is wrong, see `MIGRATION_STEPS.md` for how to promote a user.

### Functions not found

Ensure `blueprints_admin_rls_enhanced.sql` was run **after** `complete_rls_setup.sql`.
The `get_user_company_id()` function it depends on is defined in `complete_rls_setup.sql`.
