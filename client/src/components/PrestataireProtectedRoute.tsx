/**
 * Route protégée pour les prestataires
 * Vérifie que l'utilisateur est connecté en tant que prestataire
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';

interface Props {
  children: React.ReactNode;
}

export function PrestataireProtectedRoute({ children }: Props) {
  const [, setLocation] = useLocation();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const token = localStorage.getItem('admin_token');
      const userType = localStorage.getItem('user_type');

      if (!token) {
        setLocation('/admin/login');
        return;
      }

      // Vérifier le token
      const response = await fetch('/api/auth/admin/verify', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        localStorage.removeItem('admin_token');
        localStorage.removeItem('user_type');
        localStorage.removeItem('prestataire_info');
        setLocation('/admin/login');
        return;
      }

      const data = await response.json();

      // Vérifier que c'est bien un prestataire
      if (data.userType !== 'prestataire') {
        // Si c'est un admin, rediriger vers l'admin dashboard
        if (data.userType === 'admin') {
          setLocation('/admin');
        } else {
          setLocation('/admin/login');
        }
        return;
      }

      // Mettre à jour les infos du prestataire
      if (data.prestataire) {
        localStorage.setItem('prestataire_info', JSON.stringify(data.prestataire));
      }

      setIsAuthorized(true);
    } catch (error) {
      console.error('Auth check error:', error);
      setLocation('/admin/login');
    } finally {
      setIsChecking(false);
    }
  }

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  return <>{children}</>;
}
