import AppRoutes from './routes/AppRoutes.jsx';
import ToastStack from './components/common/ToastStack.jsx';
import Bootstrapper from './features/bootstrap/Bootstrapper.jsx';
import TooltipLayer from './components/common/TooltipLayer.jsx';
import SessionWatcher from './features/auth/SessionWatcher.jsx';

export default function App() {
  return (
    <>
      <SessionWatcher />
      <Bootstrapper>
        <AppRoutes />
      </Bootstrapper>
      <ToastStack />
      <TooltipLayer />
    </>
  );
}
