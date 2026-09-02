import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { Capacitor } from "@capacitor/core";
import { BrowserRouter, HashRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import { PinAuthProvider } from "@/context/PinAuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import Auth from "./pages/Auth";
import PinLogin from "./pages/PinLogin";
import MyDay from "./pages/MyDay";
import RoleHome from "./pages/RoleHome";
import Shops from "./pages/Shops";
import ShopDetail from "./pages/ShopDetail";
import Products from "./pages/Products";
import ProductDetail from "./pages/ProductDetail";
import ProductImport from "./pages/ProductImport";
import Stock from "./pages/Stock";
import StockImport from "./pages/StockImport";
import StockGRNs from "./pages/StockGRNs";
import StockAdjustments from "./pages/StockAdjustments";
import StockTransfers from "./pages/StockTransfers";
import WarehouseTransfers from "./pages/WarehouseTransfers";
import Warehouses from "./pages/Warehouses";
import StockMovement from "./pages/StockMovement";
import StockAudit from "./pages/StockAudit";
import StockAuditDetail from "./pages/StockAuditDetail";
import Orders from "./pages/Orders";
import NewOrder from "./pages/NewOrder";
import OrderDetail from "./pages/OrderDetail";
import Invoices from "./pages/Invoices";
import InvoiceDetail from "./pages/InvoiceDetail";
import Collections from "./pages/Collections";
import Reports from "./pages/Reports";
import Users from "./pages/Users";
import PriceTiers from "./pages/PriceTiers";
import Settings from "./pages/Settings";
import FmcgCatalog from "./pages/FmcgCatalog";
import CompanyProducts from "./pages/CompanyProducts";
import NotFound from "./pages/NotFound";
import { PrinterProvider } from "./printer/PrinterProvider";

import { ErrorBoundary } from "./components/ErrorBoundary";

const Router = Capacitor.isNativePlatform() ? HashRouter : BrowserRouter;
const browserBasename = import.meta.env.BASE_URL === "./" ? undefined : import.meta.env.BASE_URL;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: (failureCount, error: unknown) => {
        // Don't retry client auth errors, retry up to 2 times for network
        const msg = error instanceof Error ? error.message.toLowerCase() : "";
        if (msg.includes("401") || msg.includes("403") || msg.includes("permission") || msg.includes("invalid_pin")) {
          return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      console.error("Query Error:", error);
      Sentry.captureException(error);
      // Suppress noisy network toast popups for silent background queries unless meta.showToast is set
      if (query.meta?.showToast) {
        toast.error(friendlyError(error));
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      console.error("Mutation Error:", error);
      Sentry.captureException(error);
      toast.error(friendlyError(error));
    },
  }),
});

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Sonner position="top-center" expand visibleToasts={6} richColors closeButton />
        <PrinterProvider>
          <Router basename={Capacitor.isNativePlatform() ? undefined : browserBasename}>
            <PinAuthProvider>
              <AuthProvider>
                <Routes>
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/pin-login" element={<PinLogin />} />
                  <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route index element={<RoleHome />} />
                <Route path="orders" element={<Orders />} />
                <Route path="orders/new" element={<NewOrder />} />
                <Route path="orders/:id/edit" element={<NewOrder />} />
                <Route path="orders/:id" element={<OrderDetail />} />
                <Route path="shops" element={<Shops />} />
                <Route path="shops/:id" element={<ShopDetail />} />
                <Route path="my-day" element={<MyDay />} />
                <Route path="products" element={<Products />} />
                <Route path="products/new" element={<ProductDetail />} />
                <Route path="products/:id" element={<ProductDetail />} />
                <Route path="products/import" element={<ProtectedRoute adminOnly><ProductImport /></ProtectedRoute>} />
                <Route path="stock" element={<ProtectedRoute adminOnly><Stock /></ProtectedRoute>} />
                <Route path="stock/import" element={<ProtectedRoute adminOnly><StockImport /></ProtectedRoute>} />
                <Route path="stock/grns" element={<ProtectedRoute adminOnly><StockGRNs /></ProtectedRoute>} />
                <Route path="stock/adjustments" element={<ProtectedRoute adminOnly><StockAdjustments /></ProtectedRoute>} />
                <Route path="stock/transfers" element={<ProtectedRoute adminOnly><StockTransfers /></ProtectedRoute>} />
                <Route path="stock/warehouse-transfers" element={<ProtectedRoute adminOnly><WarehouseTransfers /></ProtectedRoute>} />
                <Route path="stock/warehouses" element={<ProtectedRoute adminOnly><Warehouses /></ProtectedRoute>} />
                <Route path="stock/audits" element={<ProtectedRoute adminOnly><StockAudit /></ProtectedRoute>} />
                <Route path="stock/audits/:id" element={<ProtectedRoute adminOnly><StockAuditDetail /></ProtectedRoute>} />
                <Route path="stock/movement" element={<ProtectedRoute adminOnly><StockMovement /></ProtectedRoute>} />
                <Route path="invoices" element={<ProtectedRoute adminOnly><Invoices /></ProtectedRoute>} />
                <Route path="invoices/:id" element={<ProtectedRoute adminOnly><InvoiceDetail /></ProtectedRoute>} />
                <Route path="collections" element={<ProtectedRoute adminOnly><Collections /></ProtectedRoute>} />
                <Route path="reports" element={<ProtectedRoute adminOnly><Reports /></ProtectedRoute>} />
                <Route path="users" element={<ProtectedRoute adminOnly><Users /></ProtectedRoute>} />
                <Route path="price-tiers" element={<ProtectedRoute adminOnly><PriceTiers /></ProtectedRoute>} />
                <Route path="settings" element={<Settings />} />
                <Route path="catalog" element={<FmcgCatalog />} />
                <Route path="catalog/:id" element={<CompanyProducts />} />
                <Route path="catalog/company/:id" element={<CompanyProducts />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </PinAuthProvider>
      </Router>
      </PrinterProvider>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
