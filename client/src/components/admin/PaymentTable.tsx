/**
 * Tape'ā Back Office - Composant PaymentTable
 * Tableau des paiements Stripe en temps réel
 */

import React from 'react';
import { CheckCircle, Clock, XCircle, ExternalLink, User, Eye } from 'lucide-react';

interface StripePayment {
  id: string;
  customerName: string;
  customerEmail?: string;
  amount: number;
  currency: string;
  status: string;
  created?: number | null;
  description?: string;
  receiptUrl?: string;
  isNew?: boolean;
}

interface PaymentTableProps {
  payments: StripePayment[];
  isLoading?: boolean;
  onRowClick?: (paymentId: string) => void;
}

function formatAmount(amount: number, currency: string = 'XPF'): string {
  return `${amount.toLocaleString('fr-FR')} ${currency}`;
}

function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) return '-';
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'succeeded':
    case 'paid':
    case 'completed':
    case 'payment_confirmed':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
          <CheckCircle className="h-3 w-3" /> Réussi
        </span>
      );
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700">
          <Clock className="h-3 w-3" /> En cours
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
          <XCircle className="h-3 w-3" /> Échoué
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
          {status}
        </span>
      );
  }
}

export function PaymentTable({ payments, isLoading, onRowClick }: PaymentTableProps) {
  const handleRowClick = (paymentId: string) => {
    if (onRowClick) {
      onRowClick(paymentId);
    }
  };

  const clickable = !!onRowClick;

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 rounded bg-gray-200" />
        ))}
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500">
        Aucun paiement
      </div>
    );
  }

  return (
    <>
      {/* Vue Mobile - Cartes */}
      <div className="md:hidden space-y-3">
        {payments.map((payment) => (
          <div
            key={payment.id}
            onClick={() => handleRowClick(payment.id)}
            className={`rounded-xl bg-white border p-4 ${payment.isNew ? 'border-green-200 bg-green-50' : 'border-gray-100'} ${clickable ? 'cursor-pointer active:bg-gray-50' : ''}`}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-sm font-medium text-purple-600">
                  {payment.customerName !== 'Client inconnu' 
                    ? payment.customerName.charAt(0).toUpperCase()
                    : <User className="h-5 w-5" />
                  }
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{payment.customerName}</p>
                  <p className="text-xs text-gray-500">{payment.description || '-'}</p>
                </div>
              </div>
              <p className="font-bold text-green-600 text-lg">
                {formatAmount(payment.amount, payment.currency)}
              </p>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getStatusBadge(payment.status)}
                <span className="text-xs text-gray-500">{formatDate(payment.created)}</span>
              </div>
              <div className="flex items-center gap-2">
                {clickable && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRowClick(payment.id);
                    }}
                    className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                )}
                {payment.receiptUrl && (
                  <a
                    href={payment.receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Vue Desktop - Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b text-left text-sm text-gray-500">
              <th className="pb-3 font-medium">Client</th>
              <th className="pb-3 font-medium">Description</th>
              <th className="pb-3 text-right font-medium">Montant</th>
              <th className="pb-3 font-medium">Statut</th>
              <th className="pb-3 font-medium">Date</th>
              <th className="pb-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {payments.map((payment) => (
              <tr
                key={payment.id}
                onClick={() => handleRowClick(payment.id)}
                className={`transition-colors ${payment.isNew ? 'bg-green-50' : 'hover:bg-gray-50'} ${clickable ? 'cursor-pointer' : ''}`}
              >
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 text-sm font-medium text-purple-600">
                      {payment.customerName !== 'Client inconnu' 
                        ? payment.customerName.charAt(0).toUpperCase()
                        : <User className="h-4 w-4" />
                      }
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{payment.customerName}</p>
                      <p className="text-xs text-gray-500">{payment.customerEmail}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 text-sm text-gray-600">{payment.description || '-'}</td>
                <td className="py-3 text-right font-bold text-green-600">
                  {formatAmount(payment.amount, payment.currency)}
                </td>
                <td className="py-3">{getStatusBadge(payment.status)}</td>
                <td className="py-3 text-sm text-gray-500">{formatDate(payment.created)}</td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    {clickable && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRowClick(payment.id);
                        }}
                        className="text-purple-600 hover:text-purple-800"
                        title="Voir les détails"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                    {payment.receiptUrl && (
                      <a
                        href={payment.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-purple-600 hover:text-purple-800"
                        title="Voir le reçu"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default PaymentTable;
