/**
 * Password strength calculation utility.
 * Pure function — no dependencies, no side effects.
 */

export interface PasswordStrengthResult {
  strength: number;
  label: string;
  color: string;
}

const LEVELS = [
  { label: '太弱' as const, color: '#ef4444' },
  { label: '较弱' as const, color: '#f97316' },
  { label: '一般' as const, color: '#eab308' },
  { label: '较强' as const, color: '#22c55e' },
  { label: '很强' as const, color: '#10b981' },
];

export function getPasswordStrength(password: string): PasswordStrengthResult {
  if (!password) return { strength: 0, label: '', color: '' };

  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  const level = LEVELS[score] ?? LEVELS[0]!;
  return { strength: score, label: level.label, color: level.color };
}
