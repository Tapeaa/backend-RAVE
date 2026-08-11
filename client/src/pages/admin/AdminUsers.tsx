/**
 * Comptes admin multi-utilisateurs
 */

import { useEffect, useState } from "react";
import { UserCog, Plus } from "lucide-react";
import { adminAuthHeaders } from "@/lib/adminApi";

export function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "ops" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", { headers: adminAuthHeaders() });
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: adminAuthHeaders(),
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm({ email: "", name: "", password: "", role: "ops" });
      load();
    } else {
      const err = await res.json();
      alert(err.error || "Erreur");
    }
  }

  async function toggle(u: any) {
    await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: adminAuthHeaders(),
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
        <UserCog className="h-7 w-7 text-amber-500" /> Admins
      </h1>
      <p className="text-sm text-slate-500">
        Comptes multi-admins (rôles ops / finance / content / super). Le mot de passe partagé <code>ADMIN_PASSWORD</code> reste disponible.
      </p>

      <form onSubmit={create} className="rounded-xl border bg-white p-4 grid gap-3 sm:grid-cols-5">
        <input required type="email" placeholder="Email" className="rounded-lg border px-3 py-2 text-sm" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input required placeholder="Nom" className="rounded-lg border px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input required type="password" placeholder="Mot de passe" className="rounded-lg border px-3 py-2 text-sm" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <select className="rounded-lg border px-3 py-2 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="ops">ops</option>
          <option value="finance">finance</option>
          <option value="content">content</option>
          <option value="super">super</option>
        </select>
        <button type="submit" className="inline-flex items-center justify-center gap-1 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium"><Plus className="h-4 w-4" /> Créer</button>
      </form>

      {loading ? (
        <div className="h-24 flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Nom</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Rôle</th>
                <th className="px-4 py-3 text-left">Actif</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3">{u.role}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggle(u)} className={`rounded-full px-2 py-0.5 text-xs ${u.isActive ? "bg-green-100 text-green-700" : "bg-slate-100"}`}>
                      {u.isActive ? "Actif" : "Off"}
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">Aucun compte admin — utilisez le mot de passe partagé ou créez-en un</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
