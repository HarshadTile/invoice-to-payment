/* Instant feedback for a new password. The server (backend app/core/password_policy.py) is the
 * authority and also rejects common and personal passwords; this mirrors its basic rules so
 * people see them before submitting. */

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 64;
export const PASSWORD_HINT = `At least ${PASSWORD_MIN} characters, with 3 of: uppercase, lowercase, number, symbol`;

const TYPES = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/];

/** The first rule the password breaks, as a message; '' when the basic rules are met. */
export function passwordProblem(password) {
  const value = password || '';
  if (value.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (value.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters.`;
  if (TYPES.filter((pattern) => pattern.test(value)).length < 3) {
    return 'Use at least 3 of: uppercase letters, lowercase letters, numbers, symbols.';
  }
  return '';
}
