"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Plus, Repeat } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";
import FinanceSummaryCards from "@/components/features/finance/finance-summary-cards";
import FinanceTransactionDialog from "@/components/features/finance/finance-transaction-dialog";
import FinanceTransactionList, {
  type FinanceTransactionRow,
} from "@/components/features/finance/finance-transaction-list";
import RecurringExpenseDialog from "@/components/features/finance/recurring-expense-dialog";
import RecurringExpenseList, {
  type RecurringExpenseRow,
} from "@/components/features/finance/recurring-expense-list";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function buildPeriodOptions() {
  const now = new Date();
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("es-AR", {
      month: "long",
      year: "numeric",
    }).format(date);
    return { value, label };
  });
}

export default function IncomeExpensesPage() {
  const canQuery = useCanQueryCurrentOrganization();
  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod);
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<FinanceTransactionRow | null>(null);
  const [editingRule, setEditingRule] = useState<RecurringExpenseRow | null>(
    null,
  );

  const membership = useQuery(api.organizationMemberships.getCurrentMembership);
  const isAdmin = membership?.role === "admin";
  const canLoadFinance = canQuery && isAdmin;

  const summary = useQuery(
    api.finance.getSummary,
    canLoadFinance ? { period: selectedPeriod } : "skip",
  );
  const transactions = useQuery(
    api.finance.getTransactions,
    canLoadFinance ? { period: selectedPeriod } : "skip",
  );
  const recurringRules = useQuery(
    api.finance.getRecurringRules,
    canLoadFinance ? {} : "skip",
  );

  const periodOptions = useMemo(() => buildPeriodOptions(), []);

  const isLoadingAccess = membership === undefined;
  const isLoadingFinance =
    canLoadFinance &&
    (summary === undefined ||
      transactions === undefined ||
      recurringRules === undefined);

  if (isLoadingAccess) {
    return (
      <DashboardPageContainer className="space-y-6 py-6 md:py-10">
        <div className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
          Cargando acceso...
        </div>
      </DashboardPageContainer>
    );
  }

  if (!isAdmin) {
    return (
      <DashboardPageContainer className="space-y-6 py-6 md:py-10">
        <div className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
          Solo administradores pueden gestionar ingresos y egresos.
        </div>
      </DashboardPageContainer>
    );
  }

  return (
    <DashboardPageContainer className="space-y-6 py-6 md:py-10">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold md:text-3xl">Ingresos y egresos</h1>
          <p className="max-w-3xl text-sm text-muted-foreground md:text-base">
            Registra movimientos externos a membresías y gastos mensuales
            recurrentes.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periodOptions.map((period) => (
                <SelectItem key={period.value} value={period.value}>
                  {period.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              setEditingRule(null);
              setRecurringOpen(true);
            }}
          >
            <Repeat className="size-4" />
            Nuevo recurrente
          </Button>
          <Button
            className="gap-2"
            onClick={() => {
              setEditingTransaction(null);
              setTransactionOpen(true);
            }}
          >
            <Plus className="size-4" />
            Nuevo movimiento
          </Button>
        </div>
      </div>

      <FinanceSummaryCards
        incomeArs={summary?.incomeArs ?? 0}
        expenseArs={summary?.expenseArs ?? 0}
        netResultArs={summary?.netResultArs ?? 0}
        activeRecurringRules={summary?.activeRecurringRules ?? 0}
      />

      <Tabs defaultValue="transactions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="transactions">Movimientos</TabsTrigger>
          <TabsTrigger value="recurring">Recurrentes</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions">
          <FinanceTransactionList
            transactions={transactions}
            isLoading={isLoadingFinance}
            onEdit={(transaction) => {
              setEditingTransaction(transaction);
              setTransactionOpen(true);
            }}
          />
        </TabsContent>

        <TabsContent value="recurring">
          <RecurringExpenseList
            rules={recurringRules}
            isLoading={isLoadingFinance}
            onEdit={(rule) => {
              setEditingRule(rule);
              setRecurringOpen(true);
            }}
          />
        </TabsContent>
      </Tabs>

      <FinanceTransactionDialog
        open={transactionOpen}
        onOpenChange={setTransactionOpen}
        transaction={editingTransaction}
      />

      <RecurringExpenseDialog
        open={recurringOpen}
        onOpenChange={setRecurringOpen}
        rule={editingRule}
      />
    </DashboardPageContainer>
  );
}
