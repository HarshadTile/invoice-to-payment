import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Outlet, useLocation } from 'react-router-dom';
import { closeSidebar } from '../../features/ui/uiSlice';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import ModalHost from '../modals/ModalHost.jsx';

export default function AppLayout() {
  const dispatch = useDispatch();
  const { pathname } = useLocation();
  const navOpen = useSelector((s) => s.ui.sidebarOpen);

  // the off-canvas menu (narrow screens) closes whenever the route changes
  useEffect(() => { dispatch(closeSidebar()); }, [pathname, dispatch]);

  return (
    <div className={`app-shell${navOpen ? ' nav-open' : ''}`}>
      <Sidebar />
      <button type="button" className="nav-backdrop" tabIndex={-1} aria-hidden="true" onClick={() => dispatch(closeSidebar())} />
      <div className="main">
        {/* single scroll area: the top bar sticks, the page content scrolls under it */}
        <div className="main-scroll">
          <Topbar />
          <div id="content">
            <Outlet />
          </div>
        </div>
      </div>
      <ModalHost />
    </div>
  );
}
