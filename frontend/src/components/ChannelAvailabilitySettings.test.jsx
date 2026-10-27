import { it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import settings from '../features/settings/settingsSlice';
import ui from '../features/ui/uiSlice';
import { api } from '../api/client';
import ChannelAvailabilitySettings from './ChannelAvailabilitySettings';
vi.mock('../api/client', () => ({ api: { put: vi.fn() } }));

function setup() {
  const store = configureStore({ reducer: { settings, ui } });
  render(<Provider store={store}><ChannelAvailabilitySettings /></Provider>);
  return store;
}

it('starts with MFOX disabled and saves enable/disable changes', async () => {
  api.put.mockResolvedValue({});
  const store = setup();
  expect(screen.getByRole('switch', { name: 'Enable Msetu / SRM' })).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByRole('switch', { name: 'Enable PO Portal' })).toHaveAttribute('aria-checked', 'true');
  const mfox = screen.getByRole('switch', { name: 'Enable MFOX Portal' });
  expect(mfox).toHaveAttribute('aria-checked', 'false');
  fireEvent.click(mfox);
  expect(await screen.findByRole('status')).toHaveTextContent('MFOX Portal enabled.');
  expect(store.getState().settings.channelAvailability.mfoxPortal).toBe(true);
  expect(api.put).toHaveBeenLastCalledWith('/v1/settings', { channelAvailability: { msetuSrm: true, poPortal: true, mfoxPortal: true } });
  fireEvent.click(mfox);
  expect(await screen.findByRole('status')).toHaveTextContent('MFOX Portal disabled.');
  expect(mfox).toHaveAttribute('aria-checked', 'false');
});

it('retains the saved availability when the server rejects a change', async () => {
  api.put.mockRejectedValue(new Error('Cannot save'));
  const store = setup();
  fireEvent.click(screen.getByRole('switch', { name: 'Enable MFOX Portal' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Cannot save');
  expect(store.getState().settings.channelAvailability.mfoxPortal).toBe(false);
});
