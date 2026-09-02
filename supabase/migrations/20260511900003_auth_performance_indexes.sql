-- MIGRATION: 20260511900003_auth_performance_indexes.sql
-- Optimizing profiles and user_roles for high-speed authentication

-- Index for UID lookups
CREATE INDEX IF NOT EXISTS idx_profiles_id ON public.profiles(id);
-- Index for role-based filtered queries
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
-- Fast lookup for role checks
CREATE INDEX IF NOT EXISTS idx_user_roles_composite ON public.user_roles(user_id, role);
-- Index for salesperson lookups
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON public.profiles(role, id);
