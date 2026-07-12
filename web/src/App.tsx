import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, ErrorState } from "@/components/query-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { resolveArea } from "@/lib/auth";
import { useSession, useSetupState } from "@/lib/queries";
import { DashboardPage } from "@/pages/dashboard";
import { LoginPage } from "@/pages/login";
import { RunDetailPage } from "@/pages/run-detail";
import { RunsPage } from "@/pages/runs";
import { SettingsPage } from "@/pages/settings";
import { SetupPage } from "@/pages/setup";
import { UserDetailPage } from "@/pages/user-detail";
import { UsersPage } from "@/pages/users";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Retrying a 401/403 just delays the login screen behind a spinner — the answer
      // will not change until the visitor signs in.
      retry: (failureCount, error) =>
        !(error instanceof ApiError && (error.status === 401 || error.status === 403)) &&
        failureCount < 1,
    },
  },
});

/**
 * Main-app gate: unauthenticated visitors go to /login, authenticated owners
 * with an unfinished wizard go to /setup, everyone else gets the app shell.
 */
function RequireApp() {
  const session = useSession();
  // Setup state is owner-only: asking for it before we know who this is just 401s, and the
  // visitor would sit behind a skeleton instead of being shown the login screen.
  const authenticated = session.data?.authenticated ?? false;
  const setup = useSetupState({ enabled: authenticated });

  if (session.isPending) {
    return (
      <div className="mx-auto mt-16 w-full max-w-4xl px-4">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (session.isError) {
    return (
      <div className="mx-auto mt-16 max-w-2xl px-4">
        <ErrorState
          error={session.error}
          onRetry={() => void session.refetch()}
        />
      </div>
    );
  }
  if (!authenticated) return <Navigate to="/login" replace />;
  if (setup.isPending) {
    return (
      <div className="mx-auto mt-16 w-full max-w-4xl px-4">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const area = resolveArea(authenticated, setup.data?.completed ?? false);
  if (area === "login") return <Navigate to="/login" replace />;
  if (area === "setup") return <Navigate to="/setup" replace />;
  return <AppShell />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="login" element={<LoginPage />} />
          <Route path="setup" element={<SetupPage />} />
          <Route element={<RequireApp />}>
            <Route index element={<DashboardPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="users/:id" element={<UserDetailPage />} />
            <Route path="runs" element={<RunsPage />} />
            <Route path="runs/:id" element={<RunDetailPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route
              path="*"
              element={
                <EmptyState
                  title="Page not found"
                  hint="That address doesn't exist. Use the navigation on the left."
                />
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
