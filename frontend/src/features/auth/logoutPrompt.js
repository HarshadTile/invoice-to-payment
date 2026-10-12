import { openModal } from '../ui/uiSlice';

/** Opens the "Log Out?" confirmation — shared by the sidebar and the avatar menu. */
export const askLogout = () => openModal({
  kind: 'confirm',
  ctx: {
    title: 'Log Out',
    message: 'Are you sure you want to log out? You will need to sign in again to continue.',
    confirmLabel: 'Log Out',
    action: { type: 'logout' },
  },
});
