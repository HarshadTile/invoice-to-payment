import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import UserSetupLinkModal from './UserSetupLinkModal';

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
afterEach(() => {
  vi.useRealTimers();
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
  else delete navigator.clipboard;
});
const props = {
  user: { name: 'New Person', email: 'new@example.com' }, linkType: 'invite',
  setupLink: 'http://192.168.1.10:5173/reset-password?token=secret-test-token',
  expiryMinutes: 10080,
  expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), onClose: vi.fn(),
};
function show(overrides = {}) {
  const store = configureStore({ reducer: { ui: () => ({}) } });
  render(<Provider store={store}><UserSetupLinkModal {...props} {...overrides} /></Provider>);
}

describe('manual password link popup', () => {
  it('shows the email, expiry and LAN limitation, and copies the complete link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    show();
    expect(screen.getByText('new@example.com')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('7 days');
    expect(screen.getByRole('note')).toHaveTextContent('LAN link');
    fireEvent.click(screen.getByRole('button', { name: 'Copy invitation' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining(`Sign-in email: ${props.user.email}`)));
    expect(writeText.mock.calls[0][0]).toContain(props.setupLink);
    expect(await screen.findByRole('status')).toHaveTextContent('Invitation copied');
    expect(screen.getByLabelText('One-time setup link')).toHaveValue(props.setupLink);
  });

  it('offers manual selection when clipboard access is blocked over LAN HTTP', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Copy invitation' }));
    expect(await screen.findByRole('status')).toHaveTextContent('copy it manually');
    const field = screen.getByLabelText(/Invitation message/);
    expect(field.closest('details')).toHaveAttribute('open');
    fireEvent.focus(field);
    expect(field.selectionEnd - field.selectionStart).toBe(field.value.length);
  });

  it('uses reset expiry and warns for localhost instead of claiming remote access', () => {
    show({ linkType: 'reset', expiryMinutes: 1440, setupLink: 'http://localhost:5173/reset-password?token=test' });
    expect(screen.getByText('Password reset link ready')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('24 hours');
    expect(screen.getByRole('note')).toHaveTextContent('Local demo only');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('prevents copying an expired invitation', () => {
    show({ expiresAt: new Date(Date.now() - 60000).toISOString() });
    expect(screen.getByRole('timer')).toHaveTextContent('Link expired');
    expect(screen.getByRole('button', { name: 'Copy invitation' })).toBeDisabled();
  });

  it('keeps the message collapsed initially and shows it on request', () => {
    show();
    const field = screen.getByLabelText(/Invitation message/);
    expect(field.closest('details')).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('View invitation message'));
    expect(field.closest('details')).toHaveAttribute('open');
    expect(field.value).toContain(props.user.email);
    expect(field.value).toContain(props.setupLink);
  });

  it('uses singular day wording for a 24-hour link', () => {
    show({ expiresAt: new Date(Date.now() + 86400000).toISOString(), expiryMinutes: 1440 });
    expect(screen.getByRole('timer')).toHaveTextContent('1 day');
    expect(screen.getByRole('timer')).not.toHaveTextContent('1 days');
  });

  it('shows Copied in green for three seconds only after successful copying', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    show();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy invitation' })); });
    expect(screen.getByRole('button', { name: '✓ Copied' })).toHaveClass('setup-link-copied');
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByRole('button', { name: 'Copy invitation' })).not.toHaveClass('setup-link-copied');
  });
});
