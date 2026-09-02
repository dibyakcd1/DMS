-- Re-define fn_sync_invoice_paid_amount with SECURITY DEFINER, payment_status (text), and status (enum) sync
CREATE OR REPLACE FUNCTION public.fn_sync_invoice_paid_amount()
RETURNS trigger AS $$
DECLARE
  v_invoice_id UUID;
  v_total_paid NUMERIC;
  v_invoice_total NUMERIC;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  -- Calculate total paid for this invoice (excluding void payments)
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM public.payments 
  WHERE invoice_id = v_invoice_id
  AND is_void = false;

  -- Get the total amount of the invoice
  SELECT total INTO v_invoice_total
  FROM public.invoices
  WHERE id = v_invoice_id;

  -- Update the invoice (bypassing RLS because of SECURITY DEFINER)
  UPDATE public.invoices
  SET 
    amount_paid = v_total_paid,
    payment_status = CASE 
      WHEN v_total_paid >= v_invoice_total THEN 'paid'
      WHEN v_total_paid > 0 THEN 'partial'
      ELSE 'unpaid'
    END,
    status = CASE 
      WHEN v_total_paid >= v_invoice_total THEN 'paid'::public.payment_status
      WHEN v_total_paid > 0 THEN 'partial'::public.payment_status
      ELSE 'pending'::public.payment_status
    END
  WHERE id = v_invoice_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-define update_invoice_payment_stats with SECURITY DEFINER, payment_status (text), and status (enum) sync
CREATE OR REPLACE FUNCTION public.update_invoice_payment_stats()
RETURNS TRIGGER AS $body$
DECLARE
    v_total_paid NUMERIC;
    v_invoice_total NUMERIC;
    v_target_invoice_id UUID;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        v_target_invoice_id := OLD.invoice_id;
    ELSE
        v_target_invoice_id := NEW.invoice_id;
    END IF;

    -- Calculate total paid for this invoice (excluding void payments)
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM public.payments
    WHERE invoice_id = v_target_invoice_id
    AND is_void = false;

    -- Get invoice total
    SELECT total INTO v_invoice_total
    FROM public.invoices
    WHERE id = v_target_invoice_id;

    -- Update invoice
    UPDATE public.invoices
    SET 
        amount_paid = v_total_paid,
        payment_status = CASE 
            WHEN v_total_paid >= v_invoice_total THEN 'paid'
            WHEN v_total_paid > 0 THEN 'partial'
            ELSE 'unpaid'
        END,
        status = CASE 
            WHEN v_total_paid >= v_invoice_total THEN 'paid'::public.payment_status
            WHEN v_total_paid > 0 THEN 'partial'::public.payment_status
            ELSE 'pending'::public.payment_status
        END
    WHERE id = v_target_invoice_id;

    RETURN NULL;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- Repair all existing invoices to align amount_paid, payment_status (text), and status (enum) with actual payment sums
UPDATE public.invoices i
SET 
    amount_paid = (
      SELECT COALESCE(SUM(amount), 0) 
      FROM public.payments p 
      WHERE p.invoice_id = i.id 
      AND p.is_void = false
    ),
    payment_status = CASE 
        WHEN (
          SELECT COALESCE(SUM(amount), 0) 
          FROM public.payments p 
          WHERE p.invoice_id = i.id 
          AND p.is_void = false
        ) >= i.total THEN 'paid'
        WHEN (
          SELECT COALESCE(SUM(amount), 0) 
          FROM public.payments p 
          WHERE p.invoice_id = i.id 
          AND p.is_void = false
        ) > 0 THEN 'partial'
        ELSE 'unpaid'
    END,
    status = CASE 
        WHEN (
          SELECT COALESCE(SUM(amount), 0) 
          FROM public.payments p 
          WHERE p.invoice_id = i.id 
          AND p.is_void = false
        ) >= i.total THEN 'paid'::public.payment_status
        WHEN (
          SELECT COALESCE(SUM(amount), 0) 
          FROM public.payments p 
          WHERE p.invoice_id = i.id 
          AND p.is_void = false
        ) > 0 THEN 'partial'::public.payment_status
        ELSE 'pending'::public.payment_status
    END;
