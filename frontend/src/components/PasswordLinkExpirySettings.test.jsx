import { it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import reducer from '../features/settings/settingsSlice';
import PasswordLinkExpirySettings from './PasswordLinkExpirySettings';
import { api } from '../api/client';
vi.mock('../api/client', () => ({ api: { put: vi.fn() } }));

it('saves the selected durations and preserves them when the settings form remounts', async () => {
  api.put.mockResolvedValue({ msg: 'Settings updated' });
  const store = configureStore({ reducer: { settings: reducer } });
  const view = () => <Provider store={store}><PasswordLinkExpirySettings /></Provider>;
  const first = render(view());
  expect(screen.getByLabelText('Password reset')).toHaveValue('1440');
  fireEvent.change(screen.getByLabelText('Password reset'), { target: { value: '4320' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save expiry settings' }));
  expect(await screen.findByRole('status')).toHaveTextContent('expiry saved');
  expect(api.put).toHaveBeenCalledWith('/v1/settings', { inviteLinkExpiryMinutes: 10080, resetLinkExpiryMinutes: 4320 });
  first.unmount();
  render(view());
  expect(screen.getByLabelText('Password reset')).toHaveValue('4320');
});

it('keeps saved settings unchanged when saving fails', async () => {
  api.put.mockRejectedValue(new Error('Unable to save'));
  const store = configureStore({ reducer: { settings: reducer } });
  render(<Provider store={store}><PasswordLinkExpirySettings /></Provider>);
  fireEvent.change(screen.getByLabelText('Password reset'), { target: { value: '60' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save expiry settings' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to save');
  expect(store.getState().settings.resetLinkExpiryMinutes).toBe(1440);
});
