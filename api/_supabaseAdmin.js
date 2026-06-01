import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const getAdminClient = () => {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase admin environment is not configured.');
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
};

const getBearerToken = (req) => {
  const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return '';
  }
  return token.trim();
};

export const requireAdminProfile = async (req) => {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new Error('Supabase auth environment is not configured.');
  }

  const token = getBearerToken(req);
  if (!token) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }

  const admin = getAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user?.id) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, company_id, role, name, username, notify_email')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile?.company_id) {
    const error = new Error('Profile not found.');
    error.statusCode = 403;
    throw error;
  }

  if (!['ADMIN', 'SUPER_ADMIN'].includes(String(profile.role || '').toUpperCase())) {
    const error = new Error('Admin access required.');
    error.statusCode = 403;
    throw error;
  }

  return {
    admin,
    user: userData.user,
    profile: {
      id: profile.id,
      companyId: profile.company_id,
      role: String(profile.role || '').toUpperCase(),
      name: profile.name || '',
      username: profile.username || '',
      notifyEmail: profile.notify_email || null,
    },
  };
};
