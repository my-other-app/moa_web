"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import { toastError } from "@/features/plan/errors";

import { createExpense, deleteExpense, fetchFinance, updateExpense } from "./api";
import type { ExpenseForm, FinanceScope } from "./schemas";

const key = (scope: FinanceScope) => (scope.kind === "event" ? (["finance", "event", scope.eventId] as const) : (["finance", "club"] as const));

export function useFinance(scope: FinanceScope, range: { from?: string; to?: string }) {
  return useQuery({
    queryKey: [...key(scope), range.from ?? "", range.to ?? ""],
    queryFn: () => fetchFinance(scope, range),
    staleTime: 15_000,
  });
}

/** Every finance view shares the ledger, so a change anywhere refreshes them all. */
function useRefresh() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ["finance"] });
}

export function useCreateExpense() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (form: ExpenseForm) => createExpense(form),
    onSuccess: () => {
      toast.success("Expense logged");
      refresh();
    },
    onError: toastError,
  });
}

export function useUpdateExpense() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, form }: { id: string; form: ExpenseForm }) => updateExpense(id, form),
    onSuccess: () => {
      toast.success("Expense updated");
      refresh();
    },
    onError: toastError,
  });
}

export function useDeleteExpense() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => deleteExpense(id),
    onSuccess: () => {
      toast.success("Expense removed");
      refresh();
    },
    onError: toastError,
  });
}
