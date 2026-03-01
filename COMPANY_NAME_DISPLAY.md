# Company Name Display Feature

## Overview
The application displays the company name associated with the logged-in user in the top-left corner of the header. This is a key feature of the multi-tenant architecture.

## Implementation Location

### Display Component
**File**: `App.tsx` (Line 389)
```typescript
<h1 className="text-sm font-black uppercase tracking-tight group-hover:text-brand transition-colors">
  {company?.name || 'DigTrack Pro'}
</h1>
```

### Company Loading Logic
**File**: `App.tsx` (Lines 126-128)
```typescript
if (matchedProfile.companyId) {
  const companyData = await apiService.getCompany(matchedProfile.companyId);
  setCompany(companyData);
}
```

### API Service
**File**: `services/apiService.ts` (Lines 232-241)
```typescript
async getCompany(id: string): Promise<Company | null> {
  const { data, error } = await supabase.from('companies').select('*').eq('id', id).single();
  if (error) return null;
  return {
    id: data.id,
    name: data.name,
    brandColor: data.brand_color,
    createdAt: new Date(data.created_at).getTime()
  };
}
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     User Authentication                      │
│                    (Supabase Auth)                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Fetch User Profile from Database                │
│                  profiles.company_id                         │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│            Fetch Company Data from Database                  │
│         SELECT * FROM companies WHERE id = ?                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  Set Company State                           │
│              setCompany(companyData)                         │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Display in UI Header                            │
│             {company?.name || 'DigTrack Pro'}                │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### Companies Table
```sql
CREATE TABLE companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  brand_color text DEFAULT '#3b82f6',
  created_at  timestamp with time zone DEFAULT now()
);
```

### Profiles Table (User Company Association)
```sql
CREATE TABLE profiles (
  id         uuid PRIMARY KEY,  -- matches auth.users.id
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  name       text,
  username   text,
  role       text DEFAULT 'CREW',
  created_at timestamp with time zone DEFAULT now()
);
```

## Multi-Tenant Isolation

The feature works with Row Level Security (RLS) policies to ensure:

1. **Per-User Company Display**: Each user sees only their company's name
2. **Database-Driven**: No hardcoded company names in the code
3. **Secure Access**: RLS policies prevent cross-company data access
4. **Graceful Fallback**: Shows "DigTrack Pro" if company data unavailable

### RLS Policy Example
```sql
CREATE POLICY "tenant_isolation_companies" 
  ON companies
  FOR SELECT 
  TO authenticated
  USING (id = get_user_company_id());
```

## Behavior Examples

### Scenario 1: User with Company
- User logs in → Profile has `companyId: "abc-123"`
- System fetches company → `{ id: "abc-123", name: "Thorne Electric" }`
- Header displays → **"THORNE ELECTRIC"**

### Scenario 2: User without Company
- User logs in → Profile has `companyId: ""`
- System skips company fetch → `company = null`
- Header displays → **"DIGTRACK PRO"** (fallback)

### Scenario 3: Company Load Error
- User logs in → Profile has `companyId: "abc-123"`
- Database error occurs → `apiService.getCompany()` returns `null`
- Header displays → **"DIGTRACK PRO"** (fallback)

## Testing

To verify the feature works correctly:

1. **Create a test company**:
   ```sql
   INSERT INTO companies (name, brand_color) 
   VALUES ('Test Company Inc', '#3b82f6');
   ```

2. **Assign user to company**:
   ```sql
   UPDATE profiles 
   SET company_id = (SELECT id FROM companies WHERE name = 'Test Company Inc')
   WHERE id = 'your-user-id';
   ```

3. **Refresh the application**:
   - Log out and log back in
   - Header should display "TEST COMPANY INC"

## Troubleshooting

### Problem: Shows "DigTrack Pro" instead of company name

**Possible Causes**:
1. User's profile doesn't have a `companyId` set
2. Company doesn't exist in database
3. Database connection issue
4. RLS policies blocking access

**Solution**:
```sql
-- Check user's company_id
SELECT id, name, company_id FROM profiles WHERE id = 'your-user-id';

-- Verify company exists
SELECT * FROM companies WHERE id = 'company-id-from-above';

-- Check RLS policies are enabled
SELECT tablename, policyname FROM pg_policies WHERE tablename = 'companies';
```

### Problem: Shows wrong company name

**Possible Causes**:
1. User assigned to wrong company in database
2. Multiple users sharing wrong company_id

**Solution**:
```sql
-- Update user's company assignment
UPDATE profiles 
SET company_id = 'correct-company-id'
WHERE id = 'user-id';
```

## Code Comments

The implementation includes inline documentation:

```typescript
// Load Company Data - fetches the company associated with this user
// The company name will be displayed in the top-left header (line 389)
if (matchedProfile.companyId) {
  const companyData = await apiService.getCompany(matchedProfile.companyId);
  setCompany(companyData);
}

// ...

{/* Display the company name associated with the logged-in user. 
    Company is loaded from database based on user's companyId (see lines 126-128).
    Falls back to 'DigTrack Pro' if company data is unavailable. */}
<h1>{company?.name || 'DigTrack Pro'}</h1>
```

## Related Files

- `App.tsx` - Main application component with header
- `services/apiService.ts` - API methods including `getCompany()`
- `types.ts` - Company and User type definitions
- `supabase/complete_rls_setup.sql` - Database schema and RLS policies
- `supabase/ARCHITECTURE.md` - Multi-tenant architecture documentation

## Security Considerations

✅ **SQL Injection Protected**: Uses parameterized queries via Supabase
✅ **XSS Protected**: React automatically escapes rendered text
✅ **Access Control**: RLS policies enforce company isolation
✅ **No Hardcoded Credentials**: Company names from database only

## Performance

- **Caching**: Company data loaded once per session
- **Indexed Queries**: `idx_profiles_company_id` ensures fast lookups
- **Lazy Loading**: Company fetched only after user authentication
- **Fallback**: Instant rendering with fallback text if data unavailable

## Future Enhancements

Potential improvements to consider:

1. **Company Logo**: Display company logo instead of/alongside name
2. **Caching**: Cache company data in localStorage for faster loads
3. **Real-time Updates**: Subscribe to company changes via Supabase realtime
4. **Custom Branding**: Allow more extensive company-specific theming
5. **Internationalization**: Support multiple languages for company names

---

**Last Updated**: 2026-02-28  
**Feature Status**: ✅ Fully Implemented and Tested  
**Security**: ✅ No Vulnerabilities Found
