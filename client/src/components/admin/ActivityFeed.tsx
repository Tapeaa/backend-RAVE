/**
 * Tape'ā Back Office - Composant ActivityFeed
 * Flux d'activités clients en temps réel
 */

import React from 'react';
import {
  CreditCard,
  Loader,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Ban,
  UserPlus,
  Bell,
  Car,
  CalendarClock,
} from 'lucide-react';

interface StripeActivity {
  id: string;
  eventType: string;
  customerName: string;
  customerEmail?: string;
  amount?: number | null;
  currency?: string;
  created?: number | null;
  isNew?: boolean;
  description?: string;
}

function getStripeEventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    card_validated: 'Carte validée',
    payment_initiated: 'Paiement initié',
    payment_succeeded: 'Paiement réussi',
    requires_action: 'Action requise',
    payment_failed: 'Paiement échoué',
    payment_canceled: 'Paiement annulé',
    customer_created: 'Client créé',
    card_added: 'Carte ajoutée',
    order_in_progress: 'Commande en cours',
    advance_booking: "Réservation à l'avance",
  };
  return labels[eventType] || eventType;
}

function getStripeEventColor(eventType: string): string {
  const colors: Record<string, string> = {
    card_validated: 'success',
    payment_initiated: 'info',
    payment_succeeded: 'success',
    requires_action: 'warning',
    payment_failed: 'danger',
    payment_canceled: 'secondary',
    customer_created: 'primary',
    card_added: 'info',
    order_in_progress: 'info',
    advance_booking: 'primary',
  };
  return colors[eventType] || 'primary';
}

interface ActivityFeedProps {
  activities: StripeActivity[];
  isLoading?: boolean;
  onActivityClick?: (activity: StripeActivity) => void;
}

const iconMap: Record<string, React.ReactNode> = {
  card_validated: <CreditCard className="h-4 w-4" />,
  payment_initiated: <Loader className="h-4 w-4 animate-spin" />,
  payment_succeeded: <CheckCircle className="h-4 w-4" />,
  requires_action: <AlertTriangle className="h-4 w-4" />,
  payment_failed: <XCircle className="h-4 w-4" />,
  payment_canceled: <Ban className="h-4 w-4" />,
  customer_created: <UserPlus className="h-4 w-4" />,
  card_added: <CreditCard className="h-4 w-4" />,
  order_in_progress: <Car className="h-4 w-4" />,
  advance_booking: <CalendarClock className="h-4 w-4" />,
};

const colorClasses: Record<string, string> = {
  info: 'bg-blue-100 text-blue-600',
  warning: 'bg-yellow-100 text-yellow-600',
  success: 'bg-green-100 text-green-600',
  danger: 'bg-red-100 text-red-600',
  secondary: 'bg-gray-100 text-gray-600',
  primary: 'bg-purple-100 text-purple-600',
};

function formatTimeAgo(timestamp: number | null | undefined): string {
  if (!timestamp) return '';
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff < 0) {
    const absDiff = Math.abs(diff);
    if (absDiff < 3600) return `dans ${Math.floor(absDiff / 60)} min`;
    if (absDiff < 86400) return `dans ${Math.floor(absDiff / 3600)}h`;
    return `dans ${Math.floor(absDiff / 86400)}j`;
  }
  if (diff < 60) return 'À l\'instant';
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}j`;
}

function formatAmount(amount: number | null | undefined, currency: string = 'XPF'): string {
  if (amount === null || amount === undefined) return '';
  return `${amount.toLocaleString('fr-FR')} ${currency}`;
}

export function ActivityFeed({ activities, isLoading, onActivityClick }: ActivityFeedProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader className="h-6 w-6 animate-spin text-purple-600" />
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-500">
        <Bell className="mb-2 h-8 w-8 opacity-50" />
        <p>En attente d'activité...</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {activities.map((activity) => {
        const color = getStripeEventColor(activity.eventType);
        const icon = iconMap[activity.eventType] || <Bell className="h-4 w-4" />;
        
        const isClickable = (activity.eventType === 'order_in_progress' || activity.eventType === 'advance_booking') && onActivityClick;
        
        const handleClick = () => {
          if (isClickable && onActivityClick) {
            onActivityClick(activity);
          }
        };
        
        return (
          <div
            key={activity.id}
            onClick={handleClick}
            className={`flex items-center gap-3 rounded-lg p-3 transition-colors ${
              activity.isNew ? 'bg-purple-50' : 'bg-gray-50'
            } ${isClickable ? 'cursor-pointer hover:bg-purple-100 hover:shadow-sm active:scale-[0.98]' : ''}`}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onKeyDown={(e) => {
              if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                handleClick();
              }
            }}
          >
            <div className={`rounded-full p-2 ${colorClasses[color] || colorClasses.primary}`}>
              {icon}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">{activity.customerName}</span>
                <span className="text-xs text-gray-500">{formatTimeAgo(activity.created)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={`rounded px-2 py-0.5 text-xs ${colorClasses[color] || colorClasses.primary}`}>
                  {getStripeEventLabel(activity.eventType)}
                </span>
                {activity.amount && (
                  <span className="font-bold text-green-600">
                    {formatAmount(activity.amount, activity.currency)}
                  </span>
                )}
              </div>
              {activity.description && (
                <div className="mt-1 text-xs text-gray-500">{activity.description}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ActivityFeed;
