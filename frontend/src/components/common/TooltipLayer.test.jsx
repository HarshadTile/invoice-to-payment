import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TooltipLayer from './TooltipLayer.jsx';

const setup = () => render(<div><button title="Collapse menu">Menu</button><button>No tip</button><TooltipLayer /></div>);

describe('TooltipLayer', () => {
  it('shows a styled tip after hovering, and hands the browser tooltip back afterwards', async () => {
    setup();
    const button = screen.getByText('Menu');
    fireEvent.mouseOver(button);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Collapse menu');
    expect(button).not.toHaveAttribute('title'); // the browser's own tooltip is suppressed meanwhile
    fireEvent.mouseOut(button, { relatedTarget: document.body });
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    expect(button).toHaveAttribute('title', 'Collapse menu'); // restored for accessibility and tests
  });

  it('does nothing for elements without a title', async () => {
    setup();
    fireEvent.mouseOver(screen.getByText('No tip'));
    await new Promise((resolve) => { setTimeout(resolve, 400); });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows on keyboard focus and hides on Escape', async () => {
    setup();
    const button = screen.getByText('Menu');
    const user = userEvent.setup();
    await user.tab(); // keyboard focus lands on the first button
    expect(button).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    expect(button).toHaveAttribute('title', 'Collapse menu');
  });

  it('a pointer moving between the element and its children keeps one tip', async () => {
    render(<div><button title="Outer"><span>Inner</span></button><TooltipLayer /></div>);
    fireEvent.mouseOver(screen.getByText('Inner'));
    await screen.findByRole('tooltip');
    fireEvent.mouseOut(screen.getByText('Inner'), { relatedTarget: screen.getByRole('button') });
    fireEvent.mouseOver(screen.getByRole('button'));
    expect(screen.getAllByRole('tooltip')).toHaveLength(1);
  });
});
