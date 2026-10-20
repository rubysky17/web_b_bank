import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router';

import { LoadingView } from '@/components/app/states';
import { AppShell } from '@/components/layout/app-shell';
import { useIsSignedIn } from '@/stores/auth-store';

/** Signed-in only: anything else (or a 401 that ends the session) goes to the login page. */
function RequireAuth() {
  const isSignedIn = useIsSignedIn();
  const location = useLocation();
  if (!isSignedIn) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

/** Signed-out only: signing in jumps back to where the user was headed. */
function GuestOnly() {
  const isSignedIn = useIsSignedIn();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string; search: string } } | null)?.from;
  if (isSignedIn) return <Navigate to={from ? `${from.pathname}${from.search}` : '/'} replace />;
  return <Outlet />;
}

/** Each screen is its own chunk, loaded when its route is first visited. */
function screen<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M) {
  return async () => ({ Component: (await load())[name] as ComponentType });
}

const router = createBrowserRouter([
  {
    element: <GuestOnly />,
    children: [
      { path: '/login', lazy: screen(() => import('@/screens/login'), 'LoginScreen') },
      { path: '/register', lazy: screen(() => import('@/screens/register'), 'RegisterScreen') },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        hydrateFallbackElement: <LoadingView />,
        children: [
          { path: '/', lazy: screen(() => import('@/screens/home'), 'HomeScreen') },
          { path: '/bank', lazy: screen(() => import('@/screens/bank'), 'BankScreen') },
          { path: '/vocab', lazy: screen(() => import('@/screens/vocab'), 'VocabScreen') },
          { path: '/history', lazy: screen(() => import('@/screens/history'), 'HistoryScreen') },
          { path: '/reports', lazy: screen(() => import('@/screens/reports'), 'ReportsScreen') },
          { path: '/settings', lazy: screen(() => import('@/screens/settings'), 'SettingsScreen') },
          { path: '/exams/:id', lazy: screen(() => import('@/screens/exam-detail'), 'ExamDetailRoute') },
          { path: '/attempts/:id/result', lazy: screen(() => import('@/screens/result'), 'ResultRoute') },
          { path: '/attempts/:id/review', lazy: screen(() => import('@/screens/review'), 'ReviewRoute') },
          { path: '/profile', lazy: screen(() => import('@/screens/account/profile-screen'), 'ProfileScreen') },
          { path: '/change-password', lazy: screen(() => import('@/screens/account/change-password-screen'), 'ChangePasswordScreen') },
          { path: '/delete-account', lazy: screen(() => import('@/screens/account/delete-account-screen'), 'DeleteAccountScreen') },
        ],
      },
      // Focus screens: no navigation chrome while answering.
      { path: '/attempts/:id', lazy: screen(() => import('@/screens/attempt'), 'AttemptRoute') },
      { path: '/practice', lazy: screen(() => import('@/screens/practice'), 'PracticeRoute') },
    ],
  },
  { path: '*', lazy: screen(() => import('@/screens/not-found'), 'NotFoundScreen') },
]);

export function App() {
  return <RouterProvider router={router} />;
}
