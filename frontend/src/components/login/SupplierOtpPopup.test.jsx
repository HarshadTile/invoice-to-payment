import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SupplierOtpPopup from './SupplierOtpPopup';

const mockApi = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../../api/client', () => ({ api: mockApi }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function popup(props = {}) {
  HTMLDialogElement.prototype.showModal = vi.fn(function () { this.setAttribute('open', ''); });
  const callbacks = { onVerify: vi.fn(), onCancel: vi.fn(), onChallenge: vi.fn() };
  render(<SupplierOtpPopup challenge={{ challenge_id: 'challenge', phone_last4: '0123', resend_after: 0 }}
    {...callbacks} {...props} />);
  return callbacks;
}

describe('supplier OTP popup', () => {
  it('shows a masked phone and submits a six-digit code', () => {
    const callbacks = popup();
    expect(screen.getByText('Enter the code sent to ****0123.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(callbacks.onVerify).toHaveBeenCalledWith('123456');
  });

  it('resends and cancels through the backend', async () => {
    mockApi.post.mockResolvedValue({ challenge_id: 'replacement' });
    const callbacks = popup();
    fireEvent.click(screen.getByRole('button', { name: 'Resend' }));
    await waitFor(() => expect(callbacks.onChallenge).toHaveBeenCalledWith({ challenge_id: 'replacement' }));
    expect(mockApi.post).toHaveBeenCalledWith('/v1/auth/supplier/otp/resend', { challenge_id: 'challenge' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(callbacks.onCancel).toHaveBeenCalled());
    expect(mockApi.post).toHaveBeenCalledWith('/v1/auth/supplier/otp/cancel', { challenge_id: 'challenge' });
  });

  it('shows verification errors and disables resend during cooldown', () => {
    popup({ error: 'Incorrect code.', challenge: { challenge_id: 'challenge', phone_last4: '0123', resend_after: 60 } });
    expect(screen.getByRole('alert')).toHaveTextContent('Incorrect code.');
    expect(screen.getByRole('button', { name: 'Resend (60s)' })).toBeDisabled();
  });

  it('keeps the popup open when cancellation fails', async () => {
    mockApi.post.mockRejectedValue(new Error('Connection failed'));
    const callbacks = popup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Connection failed')).toBeInTheDocument();
    expect(callbacks.onCancel).not.toHaveBeenCalled();
  });
});
