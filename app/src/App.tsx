import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { WalletProvider } from './lib/wallet';

// A data router, so screens can use useBlocker (the plan-link gate on the create flow's success screen) and the
// shell can restore scroll (a new page starts at the top; Back returns to where you were).
// Load only the matched screen and shell, including on direct links to the wallet.
/** While the first lazily loaded page arrives, the splash (index.html) stays up; nothing to draw under it. */
function FirstLoad() {
  return null;
}

export const router = createBrowserRouter(
  [
    {
      lazy: async () => ({
        Component: (await import('./screens/wallet/WalletLayout')).WalletLayout,
      }),
      HydrateFallback: FirstLoad,
      children: [
        {
          lazy: async () => ({
            Component: (await import('./screens/wallet/WalletPlanLayout'))
              .WalletPlanLayout,
          }),
          children: [
            ...[
              'wallet',
              'wallet/plan',
              'wallet/activity',
              'wallet/demo',
              'v2/plan',
            ].map((path) => ({
              path,
              lazy: async () => ({
                Component: (await import('./screens/wallet/WalletApp'))
                  .WalletScreen,
              }),
            })),
            ...['new', 'wallet/new'].map((path) => ({
              path,
              lazy: async () => ({
                Component: (await import('./screens/wallet/SetupScreen'))
                  .SetupScreen,
              }),
            })),
            {
              path: 'wallet/swap',
              lazy: async () => ({
                Component: (await import('./screens/wallet/SwapScreen'))
                  .SwapScreen,
              }),
            },
            {
              path: 'wallet/edit',
              lazy: async () => {
                const { SetupScreen } =
                  await import('./screens/wallet/SetupScreen');
                return { Component: () => <SetupScreen edit /> };
              },
            },
          ],
        },
        {
          path: 'legacy/new',
          lazy: async () => ({
            Component: (await import('./screens/create/CreateScreen'))
              .CreateScreen,
          }),
        },
        {
          path: 'plan',
          lazy: async () => ({
            Component: (await import('./screens/plan/PlanScreen')).PlanScreen,
          }),
        },
        {
          path: 'try',
          lazy: async () => {
            const { PlanScreen } = await import('./screens/plan/PlanScreen');
            return { Component: () => <PlanScreen demo /> };
          },
        },
      ],
    },
    {
      lazy: async () => ({ Component: (await import('./components/AppShell')).AppShell }),
      HydrateFallback: FirstLoad,
      children: [
        {
          index: true,
          lazy: async () => ({ Component: (await import('./screens/home/HomeScreen')).HomeScreen }),
        },
        {
          path: 'how-it-works',
          lazy: async () => ({
            Component: (await import('./screens/home/HowItWorksScreen'))
              .HowItWorksScreen,
          }),
        },
        {
          path: '*',
          lazy: async () => ({ Component: (await import('./screens/NotFoundScreen')).NotFoundScreen }),
        },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL },
);

export default function App() {
  return (
    <WalletProvider>
      <RouterProvider router={router} />
    </WalletProvider>
  );
}
