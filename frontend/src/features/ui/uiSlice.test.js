import { describe, it, expect } from 'vitest';
import reducer, { dismissToast, pushToast } from './uiSlice';

describe('toasts', () => {
  it('shows a message once even when the action repeats (regression: stacked Help toasts)', () => {
    let state = reducer(undefined, { type: 'init' });
    state = reducer(state, pushToast('Saved.'));
    state = reducer(state, pushToast('Saved.'));
    state = reducer(state, pushToast('Saved.'));
    expect(state.toasts.map((t) => t.msg)).toEqual(['Saved.']);
  });

  it('keeps different messages and dismisses one by id', () => {
    let state = reducer(undefined, { type: 'init' });
    state = reducer(state, pushToast('One'));
    state = reducer(state, pushToast('Two'));
    expect(state.toasts).toHaveLength(2);
    state = reducer(state, dismissToast(state.toasts[0].id));
    expect(state.toasts.map((t) => t.msg)).toEqual(['Two']);
  });

  it('allows the same message again after it was dismissed', () => {
    let state = reducer(undefined, { type: 'init' });
    state = reducer(state, pushToast('Saved.'));
    state = reducer(state, dismissToast(state.toasts[0].id));
    state = reducer(state, pushToast('Saved.'));
    expect(state.toasts).toHaveLength(1);
  });
});
