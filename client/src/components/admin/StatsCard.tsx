/**
 * Tape'ā Back Office - Composant StatsCard
 * Carte de statistiques avec icône et dégradé
 */

import React from 'react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  gradient: 'purple' | 'green' | 'blue' | 'orange' | 'pink' | 'teal';
  subtitle?: string;
}

const gradients = {
  purple: 'from-purple-600 to-purple-800',
  green: 'from-emerald-500 to-emerald-700',
  blue: 'from-blue-500 to-blue-700',
  orange: 'from-orange-500 to-orange-700',
  pink: 'from-pink-500 to-pink-700',
  teal: 'from-teal-500 to-teal-700',
};

export function StatsCard({ title, value, icon, gradient, subtitle }: StatsCardProps) {
  return (
    <div className={`rounded-xl bg-gradient-to-br ${gradients[gradient]} p-4 text-white shadow-lg`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-80">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          {subtitle && <p className="text-xs opacity-70">{subtitle}</p>}
        </div>
        <div className="rounded-full bg-white/20 p-3">
          {icon}
        </div>
      </div>
    </div>
  );
}

export default StatsCard;
