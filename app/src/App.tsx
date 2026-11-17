import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { WalletProvider } from './lib/wallet';
import { HomeScreen } from './screens/home/HomeScreen';
import { NotFoundScreen } from './screens/NotFoundScreen';

// Route ownership (one owner per folder, so parallel work never collides):
//   screens/home/    -> /, /how-it-works
//   screens/create/  -> /new
//   screens/plan/    -> /plan (plan link in the URL fragment), /try (judge path)
//
// A data router, so screens can use useBlocker (the plan-link gate on the create flow's success screen) and the
// shell can restore scroll (a new page starts at the top; Back returns to where you were).
// Only the home page is in the first download; the other pages load when first opened (the router keeps the
// current page on screen meanwhile, so there is no blank flash).
/** While the first lazily loaded page arrives, the splash (index.html) stays up; nothing to draw under it. */
function FirstLoad() {
  return null;
}

export const router = createBrowserRouter([
  {
    lazy: async () => ({ Component: (await import('./screens/wallet/WalletApp')).WalletLayout }),
    HydrateFallback: FirstLoad,
    children: [
      { path: 'wallet', lazy: async () => ({ Component: (await import('./screens/wallet/WalletApp')).WalletScreen }) },
      { path: 'wallet/plan', lazy: async () => ({ Component: (await import('./screens/wallet/WalletApp')).WalletScreen }) },
      { path: 'wallet/activity', lazy: async () => ({ Component: (await import('./screens/wallet/WalletApp')).WalletScreen }) },
      { path: 'wallet/demo', lazy: async () => ({ Component: (await import('./screens/wallet/WalletApp')).WalletScreen }) },
      { path: 'wallet/new', lazy: async () => ({ Component: (await import('./screens/wallet/WalletApp')).SetupScreen }) },
      { path: 'new', lazy: async () => ({ Component: (await import('./screens/wallet/WalletApp')).SetupScreen }) },
      { path: 'wallet/swap', lazy: async () => ({ Component: (await import('./screens/wallet/SwapScreen')).SwapScreen }) },
      { path: 'wallet/edit', lazy: async () => { const { SetupScreen } = await import('./screens/wallet/WalletApp'); return { Component: () => <SetupScreen edit /> }; } },
      { path: 'v2/plan', lazy: async () => ({ Component: (await import('./screens/wallet/WalletApp')).WalletScreen }) },
    ],
  },
  {
    element: <AppShell />,
    HydrateFallback: FirstLoad,
    children: [
      { index: true, element: <HomeScreen /> },
      { path: 'how-it-works', lazy: async () => ({ Component: (await import('./screens/home/HowItWorksScreen')).HowItWorksScreen }) },
      { path: 'legacy/new', lazy: async () => ({ Component: (await import('./screens/create/CreateScreen')).CreateScreen }) },
      { path: 'plan', lazy: async () => ({ Component: (await import('./screens/plan/PlanScreen')).PlanScreen }) },
      {
        path: 'try',
        lazy: async () => {
          const { PlanScreen } = await import('./screens/plan/PlanScreen');
          return { Component: () => <PlanScreen demo /> };
        },
      },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
], { basename: import.meta.env.BASE_URL });

export default function App() {
  return (
    <WalletProvider>
      <RouterProvider router={router} />
    </WalletProvider>
  );
}
