-- Run this in the Supabase SQL Editor to update the role constraint and set the superadmin role.

-- 1. Drop the existing constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 2. Add the new constraint allowing 'superadmin'
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin', 'superadmin'));

-- 3. Set the specific user to superadmin
UPDATE profiles SET role = 'superadmin' WHERE email = 'banhoga@gmail.com';
