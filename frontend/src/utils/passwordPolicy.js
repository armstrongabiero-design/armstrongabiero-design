/**
 * Client-side checks aligned with backend `auth_service.validate_password_strength`.
 * Returns an error message string, or null if the password satisfies the policy.
 */
const SPECIAL = '!@#$%^&*()_+-=[]{}|;:,.<>?';

export function getPasswordPolicyError(password) {
  if (password == null || password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!/\d/.test(password)) {
    return 'Password must contain at least one digit';
  }
  if (![...SPECIAL].some((c) => password.includes(c))) {
    return `Password must contain at least one special character (${SPECIAL})`;
  }
  return null;
}

export const PASSWORD_POLICY_HINT =
  'Use at least 8 characters with upper & lower case, a number, and a special character ' +
  `(${SPECIAL.split('').slice(0, 8).join(' ')} …).`;
