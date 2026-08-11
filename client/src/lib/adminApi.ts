/**
 * Helper: wrap admin page with protected layout (used in App.tsx)
 */
export function adminAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("admin_token");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}
