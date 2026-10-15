-- Keep app bans and Supabase Auth bans atomic, including direct admin updates.
CREATE OR REPLACE FUNCTION public.sync_profile_auth_ban()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NEW.is_banned THEN
    UPDATE auth.users SET banned_until = now() + interval '100 years', updated_at = now() WHERE id = NEW.id;
    DELETE FROM auth.refresh_tokens WHERE user_id = NEW.id::text;
    DELETE FROM auth.sessions WHERE user_id = NEW.id;
  ELSIF TG_OP = 'UPDATE' AND OLD.is_banned THEN
    UPDATE auth.users SET banned_until = NULL, updated_at = now() WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_profile_auth_ban() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS profiles_sync_auth_ban ON public.profiles;
CREATE TRIGGER profiles_sync_auth_ban AFTER INSERT OR UPDATE OF is_banned ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_auth_ban();

-- Reconcile users banned before this protection existed.
UPDATE auth.users u SET banned_until = now() + interval '100 years', updated_at = now()
FROM public.profiles p WHERE p.id = u.id AND p.is_banned;
DELETE FROM auth.refresh_tokens t USING public.profiles p WHERE t.user_id = p.id::text AND p.is_banned;
DELETE FROM auth.sessions s USING public.profiles p WHERE s.user_id = p.id AND p.is_banned;

-- Already-issued JWTs cannot bypass the application via direct Supabase access.
CREATE OR REPLACE FUNCTION public.is_account_active()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id = p.id
    WHERE p.id = (SELECT auth.uid()) AND NOT p.is_banned
      AND (u.banned_until IS NULL OR u.banned_until <= now()));
$$;
REVOKE ALL ON FUNCTION public.is_account_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_account_active() TO authenticated;
DO $$ DECLARE t RECORD; BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS active_account_required ON public.%I',t.relname);
    EXECUTE format('CREATE POLICY active_account_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.is_account_active())) WITH CHECK ((SELECT public.is_account_active()))',t.relname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS active_account_required ON storage.objects;
CREATE POLICY active_account_required ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
USING ((SELECT public.is_account_active())) WITH CHECK ((SELECT public.is_account_active()));
