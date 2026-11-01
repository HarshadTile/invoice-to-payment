import { describe, it, expect } from 'vitest';
import { messageSide } from './tickets.js';

describe('ticket conversation alignment', () => {
  it('places each viewer party on the right and the other party on the left', () => {
    expect(messageSide('SUPPLIER', true)).toBe('own');
    expect(messageSide('ASSIGNEE', true)).toBe('other');
    expect(messageSide('SUPPLIER', false)).toBe('other');
    expect(messageSide('ASSIGNEE', false)).toBe('own');
  });
});
