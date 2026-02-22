# Supabase Database Setup Guide

This directory contains SQL scripts for setting up and managing the DigTrack Pro database on Supabase with Row Level Security (RLS) policies.

---

## ⚠️ IMPORTANT: Manual Execution Required

**These SQL files do NOT run automatically!** 

You must **manually copy and paste** them into the Supabase Dashboard SQL Editor and click "Run".

📖 **See [FAQ.md](FAQ.md) for detailed explanation** of why and how to automate if desired.

---

## 📁 Files Overview

### 1. `complete_rls_setup.sql` ⭐ **RECOMMENDED**
**Use this for:** Fresh setups or complete database resets

A comprehensive, all-in-one script that includes:
- ✅ Complete table definitions
- ✅ All RLS policies with tenant isolation
- ✅ Security-definer helper functions
- ✅ Support for multi-tenant architecture
- ✅ Push notifications support
- ✅ Performance indexes
- ✅ Super admin capabilities
- ✅ Company invite system

**When to use:**
- Setting up a new Supabase project
- Resetting your database completely
- Want the most up-to-date, comprehensive setup

**How to run:**
1. Open Supabase Dashboard → SQL Editor
2. Create new query
3. Copy and paste the entire `complete_rls_setup.sql` file
4. Run the query
5. Follow the "Next Steps" instructions at the bottom of the file

---

### 2. `fix_company_registration_rls.sql`
**Use this for:** Projects that already have tables but need updated RLS policies

This script focuses on RLS policies and includes:
- ✅ Table creation with IF NOT EXISTS
- ✅ RLS policy updates
- ✅ Security-definer functions
- ❌ Does not include push_subscriptions table
- ❌ Does not include performance indexes

**When to use:**
- You already have the basic tables set up
- You need to update or fix RLS policies
- You're following the existing documentation

---

### 3. `add_company_id_columns.sql`
**Use this for:** Migrating existing tables to multi-tenant structure

This script adds company_id columns to existing tables:
- ✅ Adds company_id to all tenant tables
- ✅ Sets up foreign key relationships
- ✅ Enables RLS on all tables
- ❌ Does not create RLS policies (run `fix_company_registration_rls.sql` after)

**When to use:**
- Migrating from a single-tenant to multi-tenant setup
- You have existing data that needs company_id columns added

**Important:** Run this BEFORE running the RLS policy scripts.

---

## 🚀 Quick Start Guide

### For New Projects (Recommended Path):

```bash
1. Run: complete_rls_setup.sql
2. Follow the "Promote to Super Admin" instructions
3. Done! 
```

### For Existing Projects Without Multi-Tenancy:

```bash
1. Run: add_company_id_columns.sql
2. Backfill company_id values for existing data
3. Run: complete_rls_setup.sql  (or fix_company_registration_rls.sql)
4. Follow the "Promote to Super Admin" instructions
```

### For Projects That Need Policy Updates Only:

```bash
1. Run: complete_rls_setup.sql
   (It's safe to re-run - uses IF NOT EXISTS and DROP IF EXISTS)
```

---

## 🏗️ Architecture Overview

### Multi-Tenant Structure
Every data table has a `company_id` column that links to the `companies` table:

```
companies (root)
  ├── profiles (users)
  ├── jobs
  ├── tickets
  ├── photos
  ├── notes
  ├── no_shows
  ├── job_prints
  ├── push_subscriptions
  └── company_invites
```

### Security Model

**Tenant Isolation:**
- Users can only see data from their own company
- Enforced via RLS policies checking `company_id = current_user's company_id`

**Super Admin Role:**
- Special role that bypasses tenant isolation
- Can see and manage all companies
- Required for platform administration

**Security-Definer Functions:**
- `is_super_admin()` - Check if current user is super admin
- `get_user_company_id()` - Get current user's company_id
- `validate_invite_token()` - Verify company invite tokens
- `get_company_by_name()` - Lookup company by name

These functions avoid RLS recursion issues and improve performance.

---

## 🔐 RLS Policy Patterns

### Standard Tenant Isolation
```sql
CREATE POLICY "tenant_isolation_[table]"
  ON [table]
  FOR ALL TO authenticated
  USING      (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());
```

### Own Profile Access
```sql
CREATE POLICY "allow_own_profile"
  ON profiles
  FOR ALL TO authenticated
  USING      (id = auth.uid())
  WITH CHECK (id = auth.uid());
```

### Super Admin Override
```sql
CREATE POLICY "super_admin_read_all_[table]"
  ON [table]
  FOR SELECT TO authenticated
  USING (is_super_admin());
```

---

## 📝 Common Tasks

### Promote a User to Super Admin
```sql
UPDATE profiles
SET role = 'SUPER_ADMIN'
WHERE id = 'USER-UUID-HERE';
```

### Create a Company Invite
```sql
INSERT INTO company_invites (company_id)
VALUES ('COMPANY-UUID-HERE')
RETURNING token;
```

### View All Active Policies
```sql
SELECT schemaname, tablename, policyname, permissive, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### Check User's Company
```sql
SELECT id, name, company_id, role
FROM profiles
WHERE id = auth.uid();
```

---

## 🐛 Troubleshooting

### "Failed to create company" Error
**Cause:** RLS policy blocking profile update during company creation

**Solution:** The `allow_own_profile` policy should allow this. Ensure you're running the latest `complete_rls_setup.sql`.

### "Row violates row-level security policy" 
**Cause:** User trying to access data outside their company

**Solution:** This is expected behavior. Check:
1. User has correct `company_id` in their profile
2. Data being accessed has matching `company_id`
3. User is not a super admin (if they should be)

### "Infinite recursion detected in policy"
**Cause:** RLS policy queries same table it protects

**Solution:** Use security-definer functions (included in `complete_rls_setup.sql`)

### Performance Issues
**Cause:** Missing indexes on company_id columns

**Solution:** Run `complete_rls_setup.sql` which includes all necessary indexes

---

## 🔄 Migration Notes

If you're migrating from an older schema:

1. **Backup your data** (always!)
2. Run `complete_rls_setup.sql` - it won't drop existing data
3. Verify RLS policies: `SELECT * FROM pg_policies WHERE schemaname = 'public';`
4. Test with a non-admin user account
5. Promote yourself to super admin if needed

---

## 📚 Additional Resources

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RLS Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Security Definer Functions](https://www.postgresql.org/docs/current/sql-createfunction.html)

---

## ✅ Verification Checklist

After running the setup:

- [ ] All tables exist and have RLS enabled
- [ ] Can create a company as a new user
- [ ] Can update own profile
- [ ] Regular users only see their company's data
- [ ] Super admin can see all companies
- [ ] Company invites work
- [ ] Push subscriptions can be saved
- [ ] Performance is acceptable

---

**Last Updated:** 2026-02-22  
**Compatible With:** DigTrack Pro v1.0+  
**Supabase Version:** All recent versions
