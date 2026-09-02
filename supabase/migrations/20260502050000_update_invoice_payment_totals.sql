-- Trigger to update invoice totals when payments change
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

    -- Calculate total paid for this invoice
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM public.payments
    WHERE invoice_id = v_target_invoice_id;

    -- Get invoice total
    SELECT total INTO v_invoice_total
    FROM public.invoices
    WHERE id = v_target_invoice_id;

    -- Update invoice
    UPDATE public.invoices
    SET 
        amount_paid = v_total_paid,
        payment_status = CASE 
            WHEN v_total_paid >= v_invoice_total THEN 'paid'::public.payment_status
            WHEN v_total_paid > 0 THEN 'partial'::public.payment_status
            ELSE 'unpaid'::public.payment_status
        END
    WHERE id = v_target_invoice_id;

    RETURN NULL;
END;
$body$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_invoice_payment ON public.payments;
CREATE TRIGGER trg_update_invoice_payment
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.update_invoice_payment_stats();

-- Populate existing invoices just in case
UPDATE public.invoices i
SET 
    amount_paid = (SELECT COALESCE(SUM(amount), 0) FROM public.payments p WHERE p.invoice_id = i.id),
    payment_status = CASE 
        WHEN (SELECT COALESCE(SUM(amount), 0) FROM public.payments p WHERE p.invoice_id = i.id) >= i.total THEN 'paid'::public.payment_status
        WHEN (SELECT COALESCE(SUM(amount), 0) FROM public.payments p WHERE p.invoice_id = i.id) > 0 THEN 'partial'::public.payment_status
        ELSE 'unpaid'::public.payment_status
    END;
