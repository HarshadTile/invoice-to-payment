import AppRoutes from './routes/AppRoutes.jsx';
import ToastStack from './components/common/ToastStack.jsx';
import Bootstrapper from './features/bootstrap/Bootstrapper.jsx';

export default function App() {
  return (
    <>
      <Bootstrapper>
        <AppRoutes />
      </Bootstrapper>
      <ToastStack />
    </>
  );
}
