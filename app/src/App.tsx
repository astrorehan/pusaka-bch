import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { WalletProvider } from './lib/wallet';
import { HomeScreen } from './screens/home/HomeScreen';
import { HowItWorksScreen } from './screens/home/HowItWorksScreen';
import { CreateScreen } from './screens/create/CreateScreen';
import { PlanScreen } from './screens/plan/PlanScreen';
import { NotFoundScreen } from './screens/NotFoundScreen';

// Route ownership (one owner per folder, so parallel work never collides):
//   screens/home/    -> /, /how-it-works
//   screens/create/  -> /new
//   screens/plan/    -> /plan (plan link in the URL fragment), /try (judge path)
//
// A data router, so screens can use useBlocker (the plan-link gate on the create flow's success screen) and the
// shell can restore scroll (a new page starts at the top; Back returns to where you were).
const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <HomeScreen /> },
      { path: 'how-it-works', element: <HowItWorksScreen /> },
      { path: 'new', element: <CreateScreen /> },
      { path: 'plan', element: <PlanScreen /> },
      { path: 'try', element: <PlanScreen demo /> },
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
