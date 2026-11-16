import { BrowserRouter, Route, Routes } from 'react-router-dom';
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
export default function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomeScreen />} />
            <Route path="how-it-works" element={<HowItWorksScreen />} />
            <Route path="new" element={<CreateScreen />} />
            <Route path="plan" element={<PlanScreen />} />
            <Route path="try" element={<PlanScreen demo />} />
            <Route path="*" element={<NotFoundScreen />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </WalletProvider>
  );
}
