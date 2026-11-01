import { describe, it, expect } from 'vitest';
import { initialsOf } from './initials';

describe('initialsOf', () => {
  it('skips slashes and other symbols between words', () => {
    expect(initialsOf('Msetu / SRM team')).toBe('MS');
    expect(initialsOf('PO Portal team')).toBe('PP');
    expect(initialsOf('priya nair')).toBe('PN');
    expect(initialsOf('')).toBe('');
  });
});
