import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useOrders } from "../../hooks/useOrders";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mocking Supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnValue(Promise.resolve({ data: [{ id: 1 }], count: 1, error: null })),
    })),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query") as Record<string, unknown>;
  return {
    ...actual,
    useInfiniteQuery: vi.fn(() => ({
      data: { pages: [{ data: [{ id: '1', order_number: 'ORD-1', status: 'pending_approval', total: 100 }], count: 1 }] },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
      isSuccess: true,
      isStale: false,
    })),
  };
});

describe("Orders Performance & Reactivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles infinite query results correctly", async () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useOrders("", "All", true), { wrapper });

    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data?.pages[0].data[0].order_number).toBe('ORD-1');
  });
});
