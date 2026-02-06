/**
 * Tape'ā Back Office - Page Login Admin/Prestataire
 * Supporte la connexion admin (mot de passe) et prestataire (code 6 chiffres)
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { Car, Lock, AlertCircle, Hash, Building2, User } from "lucide-react";

type LoginMode = "admin" | "prestataire";

export function AdminLogin() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<LoginMode>("admin");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const body = mode === "admin" 
        ? { password } 
        : { code };

      const response = await fetch("/api/auth/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        localStorage.setItem("admin_token", data.token);
        localStorage.setItem("user_type", data.userType);
        
        if (data.userType === "prestataire" && data.prestataire) {
          localStorage.setItem("prestataire_info", JSON.stringify(data.prestataire));
          // Rediriger vers le dashboard prestataire
          setLocation("/prestataire");
        } else {
          // Rediriger vers le dashboard admin
          setLocation("/admin");
        }
      } else {
        setError(data.error || "Identifiants incorrects");
      }
    } catch (err) {
      setError("Erreur de connexion au serveur");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-900 to-purple-700 p-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          {/* Logo */}
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-purple-800">
              <Car className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Tape'a</h1>
            <p className="text-gray-600">Back Office</p>
          </div>

          {/* Mode Toggle */}
          <div className="mb-6 flex rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => { setMode("admin"); setError(""); }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-all ${
                mode === "admin"
                  ? "bg-white text-purple-700 shadow"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <User className="h-4 w-4" />
              Admin
            </button>
            <button
              type="button"
              onClick={() => { setMode("prestataire"); setError(""); }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-all ${
                mode === "prestataire"
                  ? "bg-white text-purple-700 shadow"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Building2 className="h-4 w-4" />
              Prestataire
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-6 flex items-center gap-2 rounded-lg bg-red-50 p-4 text-red-700">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Login form */}
          <form onSubmit={handleSubmit}>
            {mode === "admin" ? (
              <div className="mb-6">
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-gray-700">
                  Mot de passe administrateur
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-4 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    placeholder="Entrez le mot de passe"
                    required
                    autoFocus
                  />
                </div>
              </div>
            ) : (
              <div className="mb-6">
                <label htmlFor="code" className="mb-2 block text-sm font-medium text-gray-700">
                  Code prestataire (6 chiffres)
                </label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    id="code"
                    value={code}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                      setCode(value);
                    }}
                    className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-4 text-center text-2xl tracking-widest focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    placeholder="000000"
                    maxLength={6}
                    required
                    autoFocus
                  />
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Entrez le code fourni par l'administrateur TAPEA
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || (mode === "admin" ? !password : code.length !== 6)}
              className="w-full rounded-lg bg-gradient-to-r from-purple-600 to-purple-800 py-3 font-medium text-white transition-all hover:from-purple-700 hover:to-purple-900 disabled:opacity-50"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Connexion...
                </span>
              ) : (
                "Se connecter"
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            {mode === "admin" 
              ? "Accès administrateur TAPEA" 
              : "Accès prestataires de transport"
            }
          </div>
        </div>
      </div>
    </div>
  );
}
