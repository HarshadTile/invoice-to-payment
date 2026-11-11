import { describe, it, expect } from 'vitest';
import { passwordProblem } from './passwordRules';

describe('new password basic rules (mirrors the server)', () => {
  it('accepts a long password with a mix of character types', () => {
    expect(passwordProblem('Blue-Harbor-71')).toBe('');
    expect(passwordProblem('monsoon Train 4 tea')).toBe('');
  });
  it('explains what is missing', () => {
    expect(passwordProblem('Short1!')).toMatch(/at least 12/);
    expect(passwordProblem('alllowercaseletters')).toMatch(/3 of/);
    expect(passwordProblem('A1!'.repeat(30))).toMatch(/at most 64/);
  });
});
