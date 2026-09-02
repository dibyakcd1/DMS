import * as React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!id) return;
    
    const fetchOrder = async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("order_id")
        .eq("id", id)
        .maybeSingle();
      
      if (error) {
        setError(error.message);
      } else if (!data) {
        setError("Invoice not found");
      } else {
        // Redirect to Order Detail which contains Invoice info
        navigate(`/orders/${data.order_id}`, { replace: true });
      }
    };

    fetchOrder();
  }, [id, navigate]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center pt-20 gap-4">
        <FileWarning className="h-12 w-12 text-destructive opacity-50" />
        <h2 className="text-xl font-bold">{error}</h2>
        <Button onClick={() => navigate("/invoices")}>Back to Invoices</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center pt-40 gap-4">
      <Loader2 className="h-10 w-10 animate-spin text-primary opacity-50" />
      <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Locating Associated Order...</p>
    </div>
  );
}
