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
    element: <AppShell />,
    HydrateFallback: FirstLoad,
    children: [
      { index: true, element: <HomeScreen /> },
      { path: 'how-it-works', lazy: async () => ({ Component: (await import('./screens/home/HowItWorksScreen')).HowItWorksScreen }) },
      { path: 'new', lazy: async () => ({ Component: (await import('./screens/create/CreateScreen')).CreateScreen }) },
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
]);

export default function App() {
  return (
    <WalletProvider>
      <RouterProvider router={router} />
    </WalletProvider>
  );
}
