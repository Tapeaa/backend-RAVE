/**
 * Tape'a Back Office - Page Détails Prestataire
 * Affiche les détails d'un prestataire et ses chauffeurs
 */

import { useEffect, useState } from 'react';
import { Link, useParams, useLocation } from 'wouter';
import { 
  ArrowLeft, Building2, Users, Car, Phone, Mail, Hash, 
  Calendar, Power, Copy, Check, Edit, Trash2, Save, X,
  FileText, Download, ExternalLink
} from 'lucide-react';
import html2pdf from 'html2pdf.js';

interface Prestataire {
  id: string;
  nom: string;
  type: 'societe_taxi' | 'societe_tourisme' | 'patente_taxi' | 'patente_tourisme';
  numeroTahiti: string | null;
  email: string | null;
  phone: string | null;
  code: string;
  isActive: boolean;
  createdAt: string;
  docNumeroTahiti?: string | null;
  docAttestationQualification?: string | null;
  docLicenceTransport?: string | null;
  docAssurancePro?: string | null;
}

interface Chauffeur {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  code: string;
  typeChauffeur: string;
  vehicleModel: string | null;
  vehicleColor: string | null;
  vehiclePlate: string | null;
  isActive: boolean;
  totalRides: number;
  averageRating: number | null;
  createdAt: string;
}

const typeLabels: Record<string, string> = {
  societe_taxi: 'Société Taxi',
  societe_tourisme: 'Société Transport Touristique',
  patente_taxi: 'Taxi Patenté',
  patente_tourisme: 'Transport Touristique Patenté',
};

const typeColors: Record<string, string> = {
  societe_taxi: 'bg-blue-100 text-blue-800',
  societe_tourisme: 'bg-green-100 text-green-800',
  patente_taxi: 'bg-orange-100 text-orange-800',
  patente_tourisme: 'bg-purple-100 text-purple-800',
};

export function AdminPrestataireDetails() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [prestataire, setPrestataire] = useState<Prestataire | null>(null);
  const [chauffeurs, setChauffeurs] = useState<Chauffeur[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [editForm, setEditForm] = useState({
    nom: '',
    numeroTahiti: '',
    email: '',
    phone: '',
  });

  useEffect(() => {
    fetchPrestataireDetails();
  }, [params.id]);

  async function fetchPrestataireDetails() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/prestataires/${params.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setPrestataire(data.prestataire);
        setChauffeurs(data.chauffeurs || []);
        setEditForm({
          nom: data.prestataire.nom || '',
          numeroTahiti: data.prestataire.numeroTahiti || '',
          email: data.prestataire.email || '',
          phone: data.prestataire.phone || '',
        });
      } else {
        setLocation('/admin/prestataires');
      }
    } catch (error) {
      console.error('Error fetching prestataire:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave() {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/prestataires/${params.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editForm),
      });

      if (response.ok) {
        const data = await response.json();
        setPrestataire(data.prestataire);
        setIsEditing(false);
      } else {
        alert('Erreur lors de la mise à jour');
      }
    } catch (error) {
      console.error('Error updating prestataire:', error);
    }
  }

  async function handleToggleActive() {
    if (!prestataire) return;
    
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/prestataires/${params.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !prestataire.isActive }),
      });

      if (response.ok) {
        const data = await response.json();
        setPrestataire(data.prestataire);
      }
    } catch (error) {
      console.error('Error toggling prestataire status:', error);
    }
  }

  async function handleDelete() {
    if (!confirm('Supprimer ce prestataire ?')) return;

    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/prestataires/${params.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        setLocation('/admin/prestataires');
      } else {
        const data = await response.json();
        alert(data.message || 'Erreur lors de la suppression');
      }
    } catch (error) {
      console.error('Error deleting prestataire:', error);
    }
  }

  function copyCode() {
    if (prestataire) {
      navigator.clipboard.writeText(prestataire.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  }

  const DOC_ITEMS = [
    { key: 'docNumeroTahiti' as const, label: 'Numéro Tahiti ou K-BIS' },
    { key: 'docAttestationQualification' as const, label: 'Attestation de qualification professionnelle' },
    { key: 'docLicenceTransport' as const, label: 'Licence de transport ou Autorisation d\'exercer' },
    { key: 'docAssurancePro' as const, label: 'Assurances professionnelles' },
  ];

  const MIME_TO_EXT: Record<string, string> = {
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  };

  async function handleDownloadDocument(url: string, label: string) {
    const safeName = label.replace(/[^\w\s\-àâäéèêëïîôùûüç]/gi, '').replace(/\s+/g, '-').slice(0, 50);
    const urlMatch = url.match(/\.(pdf|jpg|jpeg|png|webp|gif)(\?|$)/i);
    const ext = urlMatch ? `.${urlMatch[1].toLowerCase()}` : '.pdf';
    const filename = `${safeName}${ext}`;
    const token = localStorage.getItem('admin_token');
    const proxyUrl = `/api/admin/proxy-document?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
    try {
      const res = await fetch(proxyUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Erreur téléchargement');
      const blob = await res.blob();
      const contentType = res.headers.get('Content-Type') || blob.type || '';
      const mimeExt = MIME_TO_EXT[contentType.split(';')[0].trim()];
      const finalExt = mimeExt || ext;
      const finalFilename = `${safeName}${finalExt}`;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = finalFilename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error(err);
      window.open(url, '_blank');
    }
  }

  async function downloadDocsPdf() {
    const container = document.createElement('div');
    container.id = 'prestataire-docs-pdf-source';
    Object.assign(container.style, {
      position: 'absolute',
      left: '-9999px',
      top: '0',
      width: '210mm',
      minHeight: '200px',
      padding: '20px',
      background: '#fff',
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      color: '#1f2937',
    });
    container.innerHTML = `
      <h1 style="font-size:18pt;margin-bottom:16px;">Fiche prestataire - ${(prestataire?.nom || '').replace(/</g, '&lt;')}</h1>
      <p style="color:#6b7280;margin-bottom:24px;">Exporté le ${new Date().toLocaleDateString('fr-FR')}</p>
      <h2 style="font-size:14pt;margin:16px 0 8px;">Documentation</h2>
      <ul style="list-style:none;padding:0;margin:0;">
        ${DOC_ITEMS.map(({ key, label }) => {
          const url = prestataire?.[key];
          return `<li style="padding:8px 0;border-bottom:1px solid #eee;">
            <strong>${label}:</strong>
            ${url ? `<a href="${url}" style="color:#7c3aed;">Télécharger</a>` : 'Non fourni'}
          </li>`;
        }).join('')}
      </ul>
    `;
    document.body.appendChild(container);
    const filename = `prestataire-${(prestataire?.nom || 'fiche').replace(/\s+/g, '-').replace(/[^\w\-àâäéèêëïîôùûüç]/gi, '')}-documentation.pdf`;
    try {
      const pdfBlob = await html2pdf()
        .set({
          margin: 15,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(container)
        .outputPdf('blob');
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erreur génération PDF:', err);
      alert('Erreur lors de la génération du PDF');
    } finally {
      container.remove();
    }
  }

  const isSociete = prestataire?.type === 'societe_taxi' || prestataire?.type === 'societe_tourisme';

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
      </div>
    );
  }

  if (!prestataire) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Prestataire non trouvé</p>
        <Link href="/admin/prestataires">
          <button className="mt-4 text-purple-600 hover:underline">
            Retour à la liste
          </button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/prestataires">
            <button className="rounded-lg p-2 text-gray-600 hover:bg-gray-100">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{prestataire.nom}</h1>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${typeColors[prestataire.type]}`}>
              {isSociete ? <Users className="h-3 w-3" /> : <Car className="h-3 w-3" />}
              {typeLabels[prestataire.type]}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleActive}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
              prestataire.isActive
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
          >
            <Power className="h-4 w-4" />
            {prestataire.isActive ? 'Désactiver' : 'Activer'}
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            <Trash2 className="h-4 w-4" />
            Supprimer
          </button>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Informations principales */}
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Informations</h2>
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700"
              >
                <Edit className="h-4 w-4" />
                Modifier
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-700"
                >
                  <X className="h-4 w-4" />
                  Annuler
                </button>
                <button
                  onClick={handleSave}
                  className="flex items-center gap-1 text-sm text-green-600 hover:text-green-700"
                >
                  <Save className="h-4 w-4" />
                  Enregistrer
                </button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-500">Nom</label>
              {isEditing ? (
                <input
                  type="text"
                  value={editForm.nom}
                  onChange={(e) => setEditForm({ ...editForm, nom: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none"
                />
              ) : (
                <p className="font-medium text-gray-900">{prestataire.nom}</p>
              )}
            </div>

            <div>
              <label className="text-sm text-gray-500">Numéro Tahiti / K-BIS</label>
              {isEditing ? (
                <input
                  type="text"
                  value={editForm.numeroTahiti}
                  onChange={(e) => setEditForm({ ...editForm, numeroTahiti: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none"
                />
              ) : (
                <p className="font-medium text-gray-900">{prestataire.numeroTahiti || '-'}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-500">Email</label>
                {isEditing ? (
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none"
                  />
                ) : (
                  <div className="flex items-center gap-1">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <p className="font-medium text-gray-900">{prestataire.email || '-'}</p>
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm text-gray-500">Téléphone</label>
                {isEditing ? (
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none"
                  />
                ) : (
                  <div className="flex items-center gap-1">
                    <Phone className="h-4 w-4 text-gray-400" />
                    <p className="font-medium text-gray-900">{prestataire.phone || '-'}</p>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-500">Date de création</label>
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4 text-gray-400" />
                <p className="font-medium text-gray-900">
                  {new Date(prestataire.createdAt).toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Code d'accès */}
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Code d'accès Dashboard</h2>
          
          <div className="rounded-lg bg-purple-50 p-6 text-center">
            <div className="flex items-center justify-center gap-3">
              <code className="text-4xl font-bold tracking-widest text-purple-700">
                {prestataire.code}
              </code>
              <button
                onClick={copyCode}
                className="rounded-lg p-2 text-purple-600 hover:bg-purple-100"
              >
                {copiedCode ? <Check className="h-6 w-6" /> : <Copy className="h-6 w-6" />}
              </button>
            </div>
            <p className="mt-3 text-sm text-gray-600">
              Ce code permet au prestataire de se connecter au dashboard
            </p>
          </div>

          {/* Documentation prestataire */}
          <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Documentation
                </h3>
                <button
                  onClick={downloadDocsPdf}
                  className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700"
                >
                  <Download className="h-4 w-4" />
                  Télécharger en PDF
                </button>
              </div>
              <div className="space-y-2">
                {DOC_ITEMS.map(({ key, label }) => {
                  const url = prestataire[key];
                  return (
                    <div key={key} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <span className="text-sm text-gray-600">{label}</span>
                      {url ? (
                        <button
                          type="button"
                          onClick={() => handleDownloadDocument(url, label)}
                          className="flex items-center gap-1 text-sm text-purple-600 hover:underline bg-transparent border-none cursor-pointer p-0"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Voir / Télécharger
                        </button>
                      ) : (
                        <span className="text-sm text-gray-400">Non fourni</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

          <div className="mt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Statut</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${
                prestataire.isActive
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}>
                <Power className="h-4 w-4" />
                {prestataire.isActive ? 'Actif' : 'Inactif'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Chauffeurs (si société) */}
      {isSociete && (
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Chauffeurs ({chauffeurs.length})
            </h2>
          </div>

          {chauffeurs.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              <Users className="mx-auto mb-2 h-12 w-12" />
              <p>Aucun chauffeur créé par ce prestataire</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Chauffeur</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Contact</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Code</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Véhicule</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Courses</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {chauffeurs.map((chauffeur) => (
                    <tr key={chauffeur.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {chauffeur.firstName} {chauffeur.lastName}
                        </div>
                        <div className="text-xs text-gray-500">
                          {chauffeur.typeChauffeur === 'salarie' ? 'Salarié' : 'Patenté'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <Phone className="h-3 w-3" />
                          {chauffeur.phone}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <code className="rounded bg-gray-100 px-2 py-1 text-sm font-mono">
                          {chauffeur.code}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        {chauffeur.vehicleModel ? (
                          <div className="text-sm">
                            <div className="text-gray-900">{chauffeur.vehicleModel}</div>
                            <div className="text-gray-500">{chauffeur.vehiclePlate}</div>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-medium">{chauffeur.totalRides || 0}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          chauffeur.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {chauffeur.isActive ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
