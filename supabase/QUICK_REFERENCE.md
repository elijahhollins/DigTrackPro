# Quick Reference - Common SQL Operations

## 🚀 Quick Setup (New Project)

```sql
-- 1. Run the complete setup
\i complete_rls_setup.sql

-- 2. Promote yourself to Super Admin (replace YOUR-UUID)
UPDATE profiles
SET role = 'SUPER_ADMIN'
WHERE id = 'YOUR-UUID-HERE';

-- Done! ✅
```

## 👤 User Management

### Promote User to Super Admin
```sql
UPDATE profiles
SET role = 'SUPER_ADMIN'
WHERE id = 'USER-UUID';
```

### Promote User to Admin
```sql
UPDATE profiles
SET role = 'ADMIN'
WHERE id = 'USER-UUID';
```

### Demote User to Crew
```sql
UPDATE profiles
SET role = 'CREW'
WHERE id = 'USER-UUID';
```

### List All Users in a Company
```sql
SELECT id, name, username, role, company_id
FROM profiles
WHERE company_id = 'COMPANY-UUID'
ORDER BY role, name;
```

### Find User by Email
```sql
SELECT p.id, p.name, p.username, p.role, p.company_id, c.name as company_name
FROM profiles p
LEFT JOIN companies c ON c.id = p.company_id
WHERE p.username ILIKE '%email@example.com%';
```

## 🏢 Company Management

### Create a Company
```sql
INSERT INTO companies (name, brand_color)
VALUES ('Acme Construction', '#3b82f6')
RETURNING id, name, brand_color;
```

### List All Companies
```sql
SELECT id, name, brand_color, created_at,
       (SELECT COUNT(*) FROM profiles WHERE company_id = companies.id) as user_count
FROM companies
ORDER BY created_at DESC;
```

### Update Company Brand Color
```sql
UPDATE companies
SET brand_color = '#10b981'
WHERE id = 'COMPANY-UUID';
```

### Delete a Company (and all related data!)
```sql
-- ⚠️ WARNING: This deletes ALL company data!
-- Make sure you have a backup first!
DELETE FROM companies WHERE id = 'COMPANY-UUID';
```

## 🎟️ Company Invites

### Create Invite Token
```sql
INSERT INTO company_invites (company_id)
VALUES ('COMPANY-UUID')
RETURNING token, company_id, created_at;
```

### List All Active Invites for a Company
```sql
SELECT ci.token, ci.created_at, c.name as company_name
FROM company_invites ci
JOIN companies c ON c.id = ci.company_id
WHERE ci.company_id = 'COMPANY-UUID'
  AND ci.used_at IS NULL
ORDER BY ci.created_at DESC;
```

### Mark Invite as Used
```sql
UPDATE company_invites
SET used_at = now()
WHERE token = 'TOKEN-UUID';
```

### Revoke (Delete) Invite
```sql
DELETE FROM company_invites
WHERE token = 'TOKEN-UUID'
  AND used_at IS NULL;
```

## 📊 Statistics & Analytics

### Count Resources by Company
```sql
SELECT 
  c.name as company,
  COUNT(DISTINCT p.id) as users,
  COUNT(DISTINCT j.id) as jobs,
  COUNT(DISTINCT t.id) as tickets,
  COUNT(DISTINCT ph.id) as photos
FROM companies c
LEFT JOIN profiles p ON p.company_id = c.id
LEFT JOIN jobs j ON j.company_id = c.id
LEFT JOIN tickets t ON t.company_id = c.id
LEFT JOIN photos ph ON ph.company_id = c.id
GROUP BY c.id, c.name
ORDER BY c.name;
```

### Find Most Active Companies
```sql
SELECT 
  c.name,
  COUNT(DISTINCT t.id) as ticket_count,
  MAX(t.created_at) as last_ticket_date
FROM companies c
LEFT JOIN tickets t ON t.company_id = c.id
WHERE t.created_at > now() - interval '30 days'
GROUP BY c.id, c.name
ORDER BY ticket_count DESC
LIMIT 10;
```

### Find Orphaned Data (Data Without Company)
```sql
-- Check jobs without company
SELECT COUNT(*) as orphaned_jobs
FROM jobs
WHERE company_id IS NULL;

-- Check tickets without company
SELECT COUNT(*) as orphaned_tickets
FROM tickets
WHERE company_id IS NULL;

-- Check profiles without company
SELECT COUNT(*) as users_without_company,
       array_agg(username) as usernames
FROM profiles
WHERE company_id IS NULL;
```

## 🔐 Security & RLS

### View All Active Policies
```sql
SELECT 
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### Test RLS as Specific User
```sql
-- Set current user context for testing
SET request.jwt.claims.sub = 'USER-UUID';

-- Now run queries to see what this user can see
SELECT * FROM companies;  -- Should only see user's company
SELECT * FROM jobs;       -- Should only see user's jobs
```

### Check if User is Super Admin
```sql
SELECT is_super_admin() as is_super_admin;
-- Returns: true or false
```

### Get Current User's Company ID
```sql
SELECT get_user_company_id() as my_company_id;
-- Returns: UUID of current user's company
```

### Verify Policy is Working
```sql
-- As regular user, try to insert into another company
-- This should FAIL with RLS error:
INSERT INTO jobs (id, company_id, job_number, customer)
VALUES (
  gen_random_uuid(),
  'DIFFERENT-COMPANY-UUID',  -- Not your company!
  'TEST-001',
  'Test Customer'
);
-- Expected: ERROR: new row violates row-level security policy
```

## 🔧 Maintenance

### Rebuild All Indexes
```sql
-- Only needed if you suspect index corruption
REINDEX TABLE profiles;
REINDEX TABLE companies;
REINDEX TABLE jobs;
REINDEX TABLE tickets;
REINDEX TABLE photos;
REINDEX TABLE notes;
REINDEX TABLE no_shows;
REINDEX TABLE job_prints;
REINDEX TABLE print_markers;
REINDEX TABLE push_subscriptions;
```

### Analyze Tables for Query Optimization
```sql
ANALYZE profiles;
ANALYZE companies;
ANALYZE jobs;
ANALYZE tickets;
ANALYZE photos;
ANALYZE notes;
ANALYZE no_shows;
ANALYZE job_prints;
ANALYZE print_markers;
ANALYZE push_subscriptions;
```

### Check Table Sizes
```sql
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY size_bytes DESC;
```

### Check Index Usage
```sql
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

## 📱 Push Notifications

### Add Push Subscription for User
```sql
INSERT INTO push_subscriptions (user_id, company_id, subscription_json)
VALUES (
  'USER-UUID',
  'COMPANY-UUID',
  '{"endpoint": "https://...", "keys": {...}}'
);
```

### Get All Push Subscriptions for a Company
```sql
SELECT ps.id, ps.user_id, p.name as user_name, ps.created_at
FROM push_subscriptions ps
JOIN profiles p ON p.id = ps.user_id
WHERE ps.company_id = 'COMPANY-UUID'
ORDER BY ps.created_at DESC;
```

### Remove User's Push Subscriptions
```sql
DELETE FROM push_subscriptions
WHERE user_id = 'USER-UUID';
```

## 🐛 Troubleshooting

### Check Recent Errors
```sql
-- If you have logging enabled:
SELECT * FROM postgres_logs
WHERE level = 'ERROR'
ORDER BY timestamp DESC
LIMIT 20;
```

### Verify User Profile Exists
```sql
SELECT * FROM profiles WHERE id = 'USER-UUID';
```

### Check User's Current Company
```sql
SELECT 
  p.id,
  p.name,
  p.username,
  p.role,
  p.company_id,
  c.name as company_name
FROM profiles p
LEFT JOIN companies c ON c.id = p.company_id
WHERE p.id = auth.uid();  -- Current user
```

### Find Data Access Issues
```sql
-- Check if company_id is properly set on all records
SELECT 
  'jobs' as table_name,
  COUNT(*) as total,
  COUNT(company_id) as with_company,
  COUNT(*) - COUNT(company_id) as missing_company
FROM jobs
UNION ALL
SELECT 
  'tickets',
  COUNT(*),
  COUNT(company_id),
  COUNT(*) - COUNT(company_id)
FROM tickets
UNION ALL
SELECT 
  'photos',
  COUNT(*),
  COUNT(company_id),
  COUNT(*) - COUNT(company_id)
FROM photos;
```

## 🔄 Data Migration

### Move User to Different Company
```sql
-- ⚠️ Use with caution! This moves a user to a different company.
UPDATE profiles
SET company_id = 'NEW-COMPANY-UUID'
WHERE id = 'USER-UUID';
```

### Bulk Update Company ID for Legacy Data
```sql
-- If you have old data without company_id, assign it:
UPDATE jobs
SET company_id = 'DEFAULT-COMPANY-UUID'
WHERE company_id IS NULL;

UPDATE tickets
SET company_id = 'DEFAULT-COMPANY-UUID'
WHERE company_id IS NULL;

-- Repeat for other tables...
```

### Export Company Data
```sql
-- Export all data for a specific company
COPY (
  SELECT * FROM jobs WHERE company_id = 'COMPANY-UUID'
) TO '/tmp/company_jobs.csv' CSV HEADER;

COPY (
  SELECT * FROM tickets WHERE company_id = 'COMPANY-UUID'
) TO '/tmp/company_tickets.csv' CSV HEADER;
```

## 🎯 Performance Tips

### Find Slow Queries
```sql
-- Check query statistics (if pg_stat_statements is enabled)
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
WHERE query LIKE '%tickets%' OR query LIKE '%jobs%'
ORDER BY mean_time DESC
LIMIT 10;
```

### Check Missing Indexes
```sql
-- Find tables that might benefit from additional indexes
SELECT 
  schemaname,
  tablename,
  seq_scan,
  seq_tup_read,
  idx_scan,
  idx_tup_fetch
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND seq_scan > idx_scan  -- More sequential scans than index scans
ORDER BY seq_scan DESC;
```

## 📝 Notes

- Replace `USER-UUID`, `COMPANY-UUID`, `TOKEN-UUID` with actual UUIDs
- Always backup before running DELETE or UPDATE operations
- Test queries in development before running in production
- Use transactions for multi-step operations
- Super admin permissions are powerful - use carefully

## 🆘 Emergency Operations

### Disable All RLS (Emergency Only!)
```sql
-- ⚠️ DANGER: Only use for emergency debugging!
ALTER TABLE companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
-- ... disable on other tables

-- Don't forget to re-enable:
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
-- ... re-enable on other tables
```

### Reset All Policies (Use complete_rls_setup.sql instead)
```sql
-- ⚠️ Not recommended - use complete_rls_setup.sql instead
-- This is here for reference only
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) 
                || ' ON ' || quote_ident(r.tablename);
    END LOOP;
END $$;

-- Then run complete_rls_setup.sql to recreate them properly
```

---

**📚 For More Information:**
- See [README.md](README.md) for detailed documentation
- See [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) for upgrade paths
- See [complete_rls_setup.sql](complete_rls_setup.sql) for the complete schema
