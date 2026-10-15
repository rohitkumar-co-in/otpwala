-- Run only inside BEGIN/ROLLBACK. Uses a disposable account, never customer data.
BEGIN;
DO $$
DECLARE
  u UUID := gen_random_uuid();
  o UUID;
  r RECORD;
  tx UUID;
  b NUMERIC;
  req UUID := gen_random_uuid();
  blocked BOOLEAN;
BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(u,concat('debt-test-',u,'@example.invalid'),'{}');
  INSERT INTO public.profiles(id,email) VALUES(u,concat('debt-test-',u,'@example.invalid')) ON CONFLICT(id) DO NOTHING;
  PERFORM public.post_wallet_transaction(u,25.5,'admin_grant','Disposable rollback fixture',NULL,NULL,concat('seed:',u));
  FOR i IN 1..2 LOOP
    o := gen_random_uuid();
    INSERT INTO public.orders(id,user_id,activation_id,service_code,service_name,country_code,country_name,
      phone_number,cost_price_usd,cost_price_inr,fx_rate,sell_price_inr,price_inr,status,sms_code)
    VALUES(o,u,concat('fixture:',o),'fb','facebook',187,'United States','10000000000',0.448,51.52,115,4.5,4.5,'code_received','123456');
    PERFORM public.post_wallet_transaction(u,-4.5,'deduction','Fixture purchase','order',o::text,concat('purchase:',o));
    INSERT INTO public.admin_audit_logs(action,target_type,target_id,metadata)
    VALUES('pricing_recovery_pending','order',o::text,jsonb_build_object('additional_charge_inr',73,'correct_price_inr',77.5,
      'original_charge_inr',4.5,'actual_provider_cost_usd',0.448,'purchase_fx_rate',115,'markup_percentage',50,
      'idempotency_key',concat('tiger-price-recovery-20261015:',o)));
  END LOOP;
  FOR o IN SELECT id FROM public.orders WHERE user_id=u ORDER BY id LOOP
    SELECT * INTO r FROM public.apply_verified_pricing_recovery(o,'Disposable regression test approval');
    tx := r.transaction_id;
    SELECT * INTO r FROM public.apply_verified_pricing_recovery(o,'Duplicate must not debit again');
    IF r.transaction_id <> tx THEN RAISE EXCEPTION 'Duplicate recovery failed'; END IF;
  END LOOP;
  SELECT wallet_balance INTO b FROM public.profiles WHERE id=u;
  IF b <> -129.5 THEN RAISE EXCEPTION 'Expected -129.5, got %',b; END IF;
  blocked := false;
  BEGIN
    PERFORM public.post_wallet_transaction(u,-1,'deduction','Unapproved overdraft','pricing_adjustment',gen_random_uuid()::text,NULL);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'insufficient_wallet_balance' THEN RAISE; END IF;
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Unapproved overdraft was allowed'; END IF;
  INSERT INTO public.payment_requests(id,user_id,amount,transaction_id,payment_method,status)
    VALUES(req,u,50,concat('rollback-utr-',req),'upi','pending');
  SELECT * INTO r FROM public.approve_payment_request_atomic(req,'rollback-test');
  IF r.balance_after <> -79.5 THEN RAISE EXCEPTION 'Partial recharge did not reduce debt'; END IF;
  blocked := false;
  BEGIN
    PERFORM public.approve_payment_request_atomic(req,'rollback-test');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'payment_request_already_approved' THEN RAISE; END IF;
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Duplicate deposit accepted'; END IF;
  SELECT * INTO r FROM public.post_wallet_transaction(u,100,'topup','Second fixture recharge','payment_request',u::text,concat('topup-test:',u));
  IF r.balance_after <> 20.5 THEN RAISE EXCEPTION 'Recharge surplus was not made spendable'; END IF;
  SELECT * INTO r FROM public.post_wallet_transaction(u,100,'topup','Second fixture recharge','payment_request',u::text,concat('topup-test:',u));
  IF r.balance_after <> 20.5 THEN RAISE EXCEPTION 'Duplicate topup changed balance'; END IF;
  blocked := false;
  BEGIN
    PERFORM public.post_wallet_transaction(u,-21,'deduction','Overspending fixture','order',gen_random_uuid()::text,NULL);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'insufficient_wallet_balance' THEN RAISE; END IF;
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Ordinary purchase overdraft was allowed'; END IF;
  IF has_function_privilege('authenticated','public.apply_verified_pricing_recovery(uuid,text)','EXECUTE')
    OR has_function_privilege('anon','public.apply_verified_pricing_recovery(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Customer can invoke recovery';
  END IF;
END;
$$;
ROLLBACK;
