'use client';

import React from 'react';
import { Check, X, ShieldAlert, ShieldCheck } from 'lucide-react';
import {
  validatePasswordPolicy,
  estimatePasswordStrength,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from '@sidprep/contracts';

interface PasswordRequirementsProps {
  password: string;
  showStrength?: boolean;
}

export function PasswordRequirements({ password, showStrength = true }: PasswordRequirementsProps) {
  const policy = validatePasswordPolicy(password);
  const strength = estimatePasswordStrength(password);

  const criteria = [
    {
      label: `${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters`,
      met: policy.criteria.minLength && policy.criteria.maxLength,
      failed: password.length > PASSWORD_MAX_LENGTH,
      failMessage: `Too long (max ${PASSWORD_MAX_LENGTH})`,
    },
    {
      label: 'At least one uppercase letter (A–Z)',
      met: policy.criteria.hasUppercase,
    },
    {
      label: 'At least one lowercase letter (a–z)',
      met: policy.criteria.hasLowercase,
    },
    {
      label: 'At least one number (0–9)',
      met: policy.criteria.hasNumber,
    },
    {
      label: 'At least one special symbol (!@#$%...)',
      met: policy.criteria.hasSymbol,
    },
  ];

  const strengthColor =
    strength.level === 'Strong'
      ? 'bg-emerald-500 text-emerald-400'
      : strength.level === 'Medium'
      ? 'bg-amber-500 text-amber-400'
      : 'bg-red-500 text-red-400';

  const strengthBarWidth = `${Math.min(100, Math.max(10, strength.score))}%`;

  return (
    <div className="mt-2.5 p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs space-y-2.5">
      {showStrength && password.length > 0 && (
        <div>
          <div className="flex items-center justify-between text-[11px] mb-1 font-medium">
            <span className="text-slate-400">Strength:</span>
            <span className={strengthColor.split(' ')[1]}>{strength.level} ({strength.feedback})</span>
          </div>
          <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${strengthColor.split(' ')[0]}`}
              style={{ width: strengthBarWidth }}
            />
          </div>
        </div>
      )}

      <div>
        <p className="text-[11px] font-semibold text-slate-300 mb-1.5">Password requirements:</p>
        <ul className="space-y-1">
          {criteria.map((item, idx) => (
            <li key={idx} className="flex items-center gap-1.5 text-[11px]">
              {item.failed ? (
                <>
                  <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span className="text-red-400 font-medium">
                    {item.label} — {item.failMessage}
                  </span>
                </>
              ) : item.met ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-slate-300">{item.label}</span>
                </>
              ) : (
                <>
                  <span className="w-3.5 h-3.5 flex items-center justify-center text-slate-500 text-[10px]">○</span>
                  <span className="text-slate-400">{item.label}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
