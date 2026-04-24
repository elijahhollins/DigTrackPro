-- Add notify_email column to profiles for admin email alert opt-in
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_email text;
