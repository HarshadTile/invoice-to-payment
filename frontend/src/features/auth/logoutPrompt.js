import { openModal } from '../ui/uiSlice';

/** Opens the "Log Out?" confirmation — shared by the sidebar and the avatar menu. */
export const askLogout = () => openModal({
  kind: 'confirm',
  ctx: {
    title: 'Log Out',
    message: 'Log out of this workspace? Any saved changes will remain available after you sign in again.',
    confirmLabel: 'Log Out',
    action: { type: 'logout' },
  },
});
