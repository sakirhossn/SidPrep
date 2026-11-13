'use client';

import { useState } from 'react';
import { getApiBaseUrl } from '@/lib/api-client';

interface StudentAvatarProps {
  avatarUrl?: string | null;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  alt?: string;
}

const sizeClasses: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', { container: string; text: string }> = {
  xs: { container: 'w-6 h-6', text: 'text-[10px]' },
  sm: { container: 'w-8 h-8', text: 'text-xs' },
  md: { container: 'w-10 h-10', text: 'text-sm' },
  lg: { container: 'w-12 h-12', text: 'text-base' },
  xl: { container: 'w-16 h-16', text: 'text-lg' },
};

function getInitials(name?: string): string {
  if (!name || !name.trim()) return 'S';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getBgColor(name?: string): string {
  const colors = [
    'bg-indigo-600/30 text-indigo-300 border-indigo-500/40',
    'bg-emerald-600/30 text-emerald-300 border-emerald-500/40',
    'bg-blue-600/30 text-blue-300 border-blue-500/40',
    'bg-purple-600/30 text-purple-300 border-purple-500/40',
    'bg-amber-600/30 text-amber-300 border-amber-500/40',
    'bg-rose-600/30 text-rose-300 border-rose-500/40',
    'bg-cyan-600/30 text-cyan-300 border-cyan-500/40',
  ];
  if (!name) return colors[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

export function StudentAvatar({
  avatarUrl,
  name,
  size = 'md',
  className = '',
  alt,
}: StudentAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = getInitials(name);
  const colorClass = getBgColor(name);
  const s = sizeClasses[size] || sizeClasses.md;

  let fullUrl: string | null = null;
  if (avatarUrl && !imgFailed) {
    if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
      fullUrl = avatarUrl;
    } else {
      const base = getApiBaseUrl().replace(/\/+$/, '');
      const path = avatarUrl.startsWith('/') ? avatarUrl : `/${avatarUrl}`;
      fullUrl = `${base}${path}`;
    }
  }

  if (fullUrl) {
    return (
      <div
        className={`relative inline-flex items-center justify-center rounded-full overflow-hidden shrink-0 border border-slate-700 bg-slate-800 ${s.container} ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fullUrl}
          alt={alt || name || 'Student avatar'}
          className="w-full h-full object-cover rounded-full"
          onError={() => setImgFailed(true)}
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center justify-center rounded-full font-bold uppercase select-none shrink-0 border ${colorClass} ${s.container} ${s.text} ${className}`}
      title={name || 'Student'}
      aria-label={name || 'Student avatar'}
    >
      {initials}
    </div>
  );
}
