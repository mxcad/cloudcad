/**
 * Password strength calculation utility.
 * Pure function — no dependencies, no side effects.
 */

import { t } from '@/languages';

export interface PasswordStrengthResult {
  strength: number;
  label: string;
  color: string;
}

function getLevels() {
  return [
    { label: t('太弱'), color: '#ef4444' },
    { label: t('较弱'), color: '#f97316' },
    { label: t('一般'), color: '#eab308' },
    { label: t('较强'), color: '#22c55e' },
    { label: t('很强'), color: '#10b981' },
  ];
}

export function getPasswordStrength(password: string): PasswordStrengthResult {
  if (!password) return { strength: 0, label: '', color: '' };

  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  const levels = getLevels();
  const level = levels[score] ?? levels[0]!;
  return { strength: score, label: level.label, color: level.color };
}
