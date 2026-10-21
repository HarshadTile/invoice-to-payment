import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ResetPasswordPage from './ResetPasswordPage.jsx';

vi.mock('react-redux', () => ({ useDispatch: () => vi.fn() }));
vi.mock('../api/client', () => ({ api: { hasToken: () => false } }));
vi.mock('../api/authApi', () => ({ authApi: { passwordLinkInfo: vi.fn(), resetPassword: vi.fn() } }));
vi.mock('../components/login/AppHeader.jsx', () => ({ default: () => null }));
vi.mock('../components/login/BrandPanel.jsx', () => ({ default: () => null }));
import { authApi } from '../api/authApi';

beforeEach(() => vi.resetAllMocks());
function show() { render(<MemoryRouter initialEntries={['/reset-password?token=valid-link']}><ResetPasswordPage /></MemoryRouter>); }

describe('password setup identity', () => {
  it('shows the verified email before and after setting a password', async () => {
    authApi.passwordLinkInfo.mockResolvedValue({ email: 'jon@example.com', name: 'Jon Snow', linkType: 'invite' });
    authApi.resetPassword.mockResolvedValue({ msg: 'Updated' });
    show();
    expect(await screen.findByText('jon@example.com')).toBeInTheDocument();
    expect(authApi.passwordLinkInfo).toHaveBeenCalledWith('valid-link');
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'NewPassword123!' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'NewPassword123!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Password updated');
    expect(screen.getByText('jon@example.com')).toBeInTheDocument();
  });
  it('does not show a password form for a rejected link', async () => {
    authApi.passwordLinkInfo.mockRejectedValue(new Error('This reset link is invalid or has expired.'));
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or has expired');
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });
});
