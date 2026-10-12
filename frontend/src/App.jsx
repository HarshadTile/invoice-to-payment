import AppRoutes from './routes/AppRoutes.jsx';
import ToastStack from './components/common/ToastStack.jsx';
import Bootstrapper from './features/bootstrap/Bootstrapper.jsx';
import TooltipLayer from './components/common/TooltipLayer.jsx';

export default function App() {
  return (
    <>
      <Bootstrapper>
        <AppRoutes />
      </Bootstrapper>
      <ToastStack />
      <TooltipLayer />
    </>
  );
}
