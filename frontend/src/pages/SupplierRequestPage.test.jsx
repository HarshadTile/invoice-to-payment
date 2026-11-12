import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SupplierRequestPage from './SupplierRequestPage.jsx';

vi.mock('../api/authApi.js', () => ({ authApi: { submitSupplierRequest: vi.fn() } }));
vi.mock('../components/login/AppHeader.jsx', () => ({ default: () => null }));
vi.mock('../components/login/BrandPanel.jsx', () => ({ default: () => null }));
import { authApi } from '../api/authApi.js';

beforeEach(() => vi.resetAllMocks());

describe('supplier access request PAN', () => {
  it('keeps an over-long PAN as typed and refuses it, instead of silently cutting it to 10', () => {
    render(<MemoryRouter><SupplierRequestPage /></MemoryRouter>);
    fireEvent.change(document.getElementById('req-name'), { target: { value: 'Demo Supplier' } });
    fireEvent.change(document.getElementById('req-email'), { target: { value: 'demo@example.com' } });
    const pan = document.getElementById('req-pan');
    fireEvent.change(pan, { target: { value: 'abcde1234fg' } });
    expect(pan).toHaveValue('ABCDE1234FG');
    fireEvent.change(document.getElementById('req-codes'), { target: { value: 'DIA00001AA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit request' }));
    expect(screen.getByText('Enter your 10-character PAN, like ABCDE1234F.')).toBeInTheDocument();
    expect(authApi.submitSupplierRequest).not.toHaveBeenCalled();
  });
});
