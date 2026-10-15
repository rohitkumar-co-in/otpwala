BEGIN;
DO $$
DECLARE u UUID:=gen_random_uuid(); s UUID:=gen_random_uuid(); n INTEGER; BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(u,concat('ban-test-',u,'@example.invalid'),'{}');
  INSERT INTO public.profiles(id,email) VALUES(u,concat('ban-test-',u,'@example.invalid')) ON CONFLICT(id) DO NOTHING;
  INSERT INTO auth.sessions(id,user_id) VALUES(s,u);
  INSERT INTO auth.refresh_tokens(token,user_id,session_id,revoked) VALUES(gen_random_uuid()::text,u::text,s,false);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  IF NOT public.is_account_active() THEN RAISE EXCEPTION 'Active account rejected'; END IF;
  UPDATE public.profiles SET is_banned=true WHERE id=u;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u AND banned_until>now()) THEN RAISE EXCEPTION 'Auth ban not synchronized'; END IF;
  IF EXISTS(SELECT 1 FROM auth.sessions WHERE user_id=u) OR EXISTS(SELECT 1 FROM auth.refresh_tokens WHERE user_id=u::text) THEN
    RAISE EXCEPTION 'Banned sessions survived';
  END IF;
  IF public.is_account_active() THEN RAISE EXCEPTION 'Banned JWT remains active'; END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.profiles WHERE id=u;
  EXECUTE 'RESET ROLE';
  IF n<>0 THEN RAISE EXCEPTION 'Banned JWT bypasses RLS'; END IF;
  UPDATE public.profiles SET is_banned=false WHERE id=u;
  IF EXISTS(SELECT 1 FROM auth.users WHERE id=u AND banned_until>now()) THEN RAISE EXCEPTION 'Unban did not synchronize'; END IF;
  IF NOT public.is_account_active() THEN RAISE EXCEPTION 'Unbanned account rejected'; END IF;
END $$;
ROLLBACK;
