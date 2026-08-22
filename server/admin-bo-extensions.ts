/**
 * Extensions Back-Office location (flotte, pipeline, promos, wallet, calendrier, litiges, multi-admins)
 */

import type { Express } from "express";
import bcrypt from "bcrypt";
import Stripe from "stripe";
import { db } from "./db";
import { dbStorage } from "./db-storage";
import { requireAdminAuth, AuthenticatedRequest, generateAdminToken } from "./admin-auth";
import {
  loueurVehicles,
  vehicleModels,
  prestataires,
  orders,
  ratings,
  clients,
  promoCodes,
  walletTransactions,
  vehicleAvailabilityBlocks,
  adminUsers,
  disputes,
  adminAuditLogs,
  invoices,
} from "@shared/schema";
import { eq, desc, and, gte, lte, or } from "drizzle-orm";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

async function audit(
  req: AuthenticatedRequest,
  action: string,
  entityType?: string,
  entityId?: string,
  details?: Record<string, unknown>
) {
  try {
    await db.insert(adminAuditLogs).values({
      adminId: (req as any).adminUserId || null,
      adminEmail: (req as any).adminEmail || null,
      action,
      entityType: entityType || null,
      entityId: entityId || null,
      details: details || null,
    });
  } catch (e) {
    console.warn("[AUDIT] failed:", e);
  }
}

export function registerAdminBoExtensions(app: Express) {
  // ─── FLOTTE GLOBALE ─────────────────────────────────────────────
  app.get("/api/admin/fleet", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const page = parseInt((req.query.page as string) || "1", 10);
      const limit = parseInt((req.query.limit as string) || "50", 10);
      const offset = (page - 1) * limit;
      const activeOnly = req.query.active === "true";

      let query = db
        .select({
          id: loueurVehicles.id,
          plate: loueurVehicles.plate,
          pricePerDay: loueurVehicles.pricePerDay,
          pricePerDayLongTerm: loueurVehicles.pricePerDayLongTerm,
          availableForRental: loueurVehicles.availableForRental,
          availableForDelivery: loueurVehicles.availableForDelivery,
          availableForLongTerm: loueurVehicles.availableForLongTerm,
          customImageUrl: loueurVehicles.customImageUrl,
          rentalContractMode: loueurVehicles.rentalContractMode,
          customContractText: loueurVehicles.customContractText,
          isActive: loueurVehicles.isActive,
          createdAt: loueurVehicles.createdAt,
          vehicleModelId: loueurVehicles.vehicleModelId,
          modelName: vehicleModels.name,
          category: vehicleModels.category,
          prestataireId: loueurVehicles.prestataireId,
          prestataireNom: prestataires.nom,
          driverId: loueurVehicles.driverId,
        })
        .from(loueurVehicles)
        .leftJoin(vehicleModels, eq(loueurVehicles.vehicleModelId, vehicleModels.id))
        .leftJoin(prestataires, eq(loueurVehicles.prestataireId, prestataires.id));

      const rows = activeOnly
        ? await query.where(eq(loueurVehicles.isActive, true)).orderBy(desc(loueurVehicles.createdAt))
        : await query.orderBy(desc(loueurVehicles.createdAt));

      const total = rows.length;
      return res.json({
        vehicles: rows.slice(offset, offset + limit),
        total,
        page,
        totalPages: Math.ceil(total / limit) || 1,
      });
    } catch (error) {
      console.error("Admin fleet list error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.patch("/api/admin/fleet/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const allowed = [
        "plate",
        "pricePerDay",
        "pricePerDayLongTerm",
        "availableForRental",
        "availableForDelivery",
        "availableForLongTerm",
        "customImageUrl",
        "rentalContractMode",
        "customContractText",
        "isActive",
      ] as const;
      const updates: Record<string, unknown> = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "Aucune modification" });
      }
      const [updated] = await db
        .update(loueurVehicles)
        .set(updates)
        .where(eq(loueurVehicles.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Véhicule introuvable" });
      await audit(req, "fleet.update", "loueur_vehicle", id, updates);
      return res.json(updated);
    } catch (error) {
      console.error("Admin fleet patch error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // ─── PIPELINE LOCATION (lifecycle + cancel) ─────────────────────
  app.post("/api/admin/commandes/:id/lifecycle", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { phase } = req.body;
      if (!phase || !["with_client", "returned"].includes(phase)) {
        return res.status(400).json({ error: "Phase invalide (with_client | returned)" });
      }
      const order = await dbStorage.getOrder(req.params.id);
      if (!order) return res.status(404).json({ error: "Commande introuvable" });

      const rideOption: Record<string, unknown> = {
        ...(order.rideOption || {}),
        rentalLifecyclePhase: phase,
        rentalPhase: phase, // legacy alias (read fallback)
      };
      if (phase === "with_client") rideOption.handedOverAt = new Date().toISOString();
      if (phase === "returned") rideOption.returnedAt = new Date().toISOString();

      const [updated] = await db
        .update(orders)
        .set({
          rideOption,
          status: phase === "returned" ? "completed" : order.status === "pending" ? "accepted" : order.status,
        } as any)
        .where(eq(orders.id, req.params.id))
        .returning();

      await audit(req, "rental.lifecycle", "order", req.params.id, { phase });
      return res.json({ success: true, commande: updated });
    } catch (error) {
      console.error("Admin lifecycle error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.post("/api/admin/commandes/:id/cancel-approve", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const order = await dbStorage.getOrder(req.params.id);
      if (!order) return res.status(404).json({ error: "Commande introuvable" });
      const rideOption = {
        ...(order.rideOption || {}),
        cancelRequest: {
          ...((order.rideOption as any)?.cancelRequest || {}),
          status: "approved",
          resolvedAt: new Date().toISOString(),
          resolvedBy: "admin",
        },
      };
      const [updated] = await db
        .update(orders)
        .set({ status: "cancelled", rideOption } as any)
        .where(eq(orders.id, req.params.id))
        .returning();
      await audit(req, "rental.cancel_approve", "order", req.params.id);
      return res.json({ success: true, commande: updated });
    } catch (error) {
      console.error("Admin cancel-approve error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.post("/api/admin/commandes/:id/cancel-reject", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const order = await dbStorage.getOrder(req.params.id);
      if (!order) return res.status(404).json({ error: "Commande introuvable" });
      const rideOption = {
        ...(order.rideOption || {}),
        cancelRequest: {
          ...((order.rideOption as any)?.cancelRequest || {}),
          status: "rejected",
          resolvedAt: new Date().toISOString(),
          resolvedBy: "admin",
          reason: req.body.reason || null,
        },
      };
      const [updated] = await db
        .update(orders)
        .set({ rideOption } as any)
        .where(eq(orders.id, req.params.id))
        .returning();
      await audit(req, "rental.cancel_reject", "order", req.params.id);
      return res.json({ success: true, commande: updated });
    } catch (error) {
      console.error("Admin cancel-reject error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // ─── SETTINGS (frais via auth admin) ────────────────────────────
  app.post("/api/admin/frais-service-config", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { fraisServicePrestataire, commissionPrestataire, commissionSalarieTapea } = req.body;
      if (fraisServicePrestataire !== undefined && (fraisServicePrestataire < 0 || fraisServicePrestataire > 100)) {
        return res.status(400).json({ error: "Frais entre 0 et 100" });
      }
      const updated = await dbStorage.updateFraisServiceConfig({
        fraisServicePrestataire,
        commissionPrestataire,
        commissionSalarieTapea,
      });
      await audit(req, "settings.frais", "frais_service_config", "default", req.body);
      return res.json({ success: true, config: updated });
    } catch (error) {
      console.error("Admin frais config error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.get("/api/admin/settings/app-version", requireAdminAuth, async (_req, res) => {
    // Mirror of in-memory config exposed publicly via /api/admin/app-version — keep readable for BO
    try {
      const r = await fetch(`http://127.0.0.1:${process.env.PORT || 5000}/api/admin/app-version`).catch(() => null);
      if (r && r.ok) return res.json(await r.json());
    } catch { /* fallthrough */ }
    return res.json({
      client: { minVersion: "1.0.0", currentVersion: "1.0.0", forceUpdate: false, message: "" },
      chauffeur: { minVersion: "1.0.0", currentVersion: "1.0.0", forceUpdate: false, message: "" },
    });
  });

  // ─── PROMOS ─────────────────────────────────────────────────────
  app.get("/api/admin/promos", requireAdminAuth, async (_req, res) => {
    try {
      const list = await db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt));
      return res.json(list);
    } catch (error) {
      console.error("Admin promos list error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.post("/api/admin/promos", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { code, description, discountType, discountValue, maxUses, minOrderAmount, startsAt, endsAt, isActive } = req.body;
      if (!code || !discountType || discountValue === undefined) {
        return res.status(400).json({ error: "code, discountType, discountValue requis" });
      }
      if (!["percent", "fixed"].includes(discountType)) {
        return res.status(400).json({ error: "discountType: percent | fixed" });
      }
      const [created] = await db
        .insert(promoCodes)
        .values({
          code: String(code).toUpperCase().trim(),
          description: description || null,
          discountType,
          discountValue: Number(discountValue),
          maxUses: maxUses ?? null,
          minOrderAmount: minOrderAmount ?? 0,
          startsAt: startsAt ? new Date(startsAt) : null,
          endsAt: endsAt ? new Date(endsAt) : null,
          isActive: isActive !== false,
        })
        .returning();
      await audit(req, "promo.create", "promo_code", created.id);
      return res.status(201).json(created);
    } catch (error: any) {
      if (String(error?.message || "").includes("unique")) {
        return res.status(409).json({ error: "Code déjà existant" });
      }
      console.error("Admin promo create error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.patch("/api/admin/promos/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const updates: Record<string, unknown> = {};
      for (const key of ["description", "discountType", "discountValue", "maxUses", "minOrderAmount", "isActive", "code"] as const) {
        if (req.body[key] !== undefined) {
          updates[key] = key === "code" ? String(req.body[key]).toUpperCase().trim() : req.body[key];
        }
      }
      if (req.body.startsAt !== undefined) updates.startsAt = req.body.startsAt ? new Date(req.body.startsAt) : null;
      if (req.body.endsAt !== undefined) updates.endsAt = req.body.endsAt ? new Date(req.body.endsAt) : null;
      const [updated] = await db.update(promoCodes).set(updates).where(eq(promoCodes.id, req.params.id)).returning();
      if (!updated) return res.status(404).json({ error: "Promo introuvable" });
      await audit(req, "promo.update", "promo_code", req.params.id, updates);
      return res.json(updated);
    } catch (error) {
      console.error("Admin promo patch error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.delete("/api/admin/promos/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const [deleted] = await db.delete(promoCodes).where(eq(promoCodes.id, req.params.id)).returning();
      if (!deleted) return res.status(404).json({ error: "Promo introuvable" });
      await audit(req, "promo.delete", "promo_code", req.params.id);
      return res.json({ success: true });
    } catch (error) {
      console.error("Admin promo delete error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Public validate (client apps)
  app.post("/api/promos/validate", async (req, res) => {
    try {
      const code = String(req.body.code || "").toUpperCase().trim();
      const orderAmount = Number(req.body.orderAmount || 0);
      if (!code) return res.status(400).json({ valid: false, error: "Code requis" });
      const [promo] = await db.select().from(promoCodes).where(eq(promoCodes.code, code)).limit(1);
      if (!promo || !promo.isActive) return res.json({ valid: false, error: "Code invalide" });
      const now = new Date();
      if (promo.startsAt && now < promo.startsAt) return res.json({ valid: false, error: "Code pas encore actif" });
      if (promo.endsAt && now > promo.endsAt) return res.json({ valid: false, error: "Code expiré" });
      if (promo.maxUses != null && promo.usedCount >= promo.maxUses) return res.json({ valid: false, error: "Code épuisé" });
      if ((promo.minOrderAmount || 0) > orderAmount) {
        return res.json({ valid: false, error: `Montant minimum ${promo.minOrderAmount} XPF` });
      }
      const discountAmount =
        promo.discountType === "percent"
          ? Math.round((orderAmount * promo.discountValue) / 100)
          : Math.min(promo.discountValue, orderAmount);
      return res.json({
        valid: true,
        promo: { id: promo.id, code: promo.code, discountType: promo.discountType, discountValue: promo.discountValue },
        discountAmount,
      });
    } catch (error) {
      console.error("Promo validate error:", error);
      return res.status(500).json({ valid: false, error: "Erreur serveur" });
    }
  });

  // ─── WALLET ADMIN ───────────────────────────────────────────────
  app.get("/api/admin/clients/:id/wallet", requireAdminAuth, async (req, res) => {
    try {
      const client = await dbStorage.getClient(req.params.id);
      if (!client) return res.status(404).json({ error: "Client introuvable" });
      const txns = await db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.clientId, req.params.id))
        .orderBy(desc(walletTransactions.createdAt))
        .limit(100);
      return res.json({ balance: client.walletBalance, transactions: txns });
    } catch (error) {
      console.error("Admin wallet get error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.post("/api/admin/clients/:id/wallet", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { type, amount, description } = req.body;
      if (!["credit", "debit"].includes(type) || !amount || amount <= 0) {
        return res.status(400).json({ error: "type credit|debit et amount > 0 requis" });
      }
      const delta = type === "credit" ? Number(amount) : -Number(amount);
      const updated = await dbStorage.updateClientWallet(req.params.id, delta);
      if (!updated) return res.status(404).json({ error: "Client introuvable" });
      if (updated.walletBalance < 0) {
        await dbStorage.updateClientWallet(req.params.id, -delta);
        return res.status(400).json({ error: "Solde insuffisant" });
      }
      const [txn] = await db
        .insert(walletTransactions)
        .values({
          clientId: req.params.id,
          type,
          amount: Number(amount),
          balanceAfter: updated.walletBalance,
          description: description || (type === "credit" ? "Crédit admin" : "Débit admin"),
          createdByAdmin: true,
        })
        .returning();
      await audit(req, "wallet." + type, "client", req.params.id, { amount, description });
      return res.json({ success: true, balance: updated.walletBalance, transaction: txn });
    } catch (error) {
      console.error("Admin wallet post error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.patch("/api/admin/clients/:id/status", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { isActive } = req.body;
      if (typeof isActive !== "boolean") return res.status(400).json({ error: "isActive boolean requis" });
      const [updated] = await db
        .update(clients)
        .set({ isActive } as any)
        .where(eq(clients.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Client introuvable" });
      await audit(req, isActive ? "client.activate" : "client.suspend", "client", req.params.id);
      return res.json({ success: true, client: updated });
    } catch (error) {
      console.error("Admin client status error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // ─── REFUNDS + STRIPE RECONCILIATION ────────────────────────────
  app.post("/api/admin/commandes/:id/refund", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const order = await dbStorage.getOrder(req.params.id);
      if (!order) return res.status(404).json({ error: "Commande introuvable" });

      const amount = req.body.amount != null ? Number(req.body.amount) : Number(order.totalPrice);
      const reason = req.body.reason || "refund_admin";

      let stripeRefund = null;
      const [invoice] = await db.select().from(invoices).where(eq(invoices.orderId, req.params.id)).limit(1);

      if (stripe && invoice?.stripePaymentIntentId) {
        stripeRefund = await stripe.refunds.create({
          payment_intent: invoice.stripePaymentIntentId,
          amount: Math.round(amount),
          reason: "requested_by_customer",
          metadata: { orderId: req.params.id, adminReason: reason },
        });
      }

      const rideOption = {
        ...(order.rideOption || {}),
        refund: {
          amount,
          reason,
          stripeRefundId: stripeRefund?.id || null,
          refundedAt: new Date().toISOString(),
        },
      };
      await db.update(orders).set({ rideOption } as any).where(eq(orders.id, req.params.id));
      await audit(req, "order.refund", "order", req.params.id, { amount, reason, stripeRefundId: stripeRefund?.id });
      return res.json({ success: true, stripeRefund, amount });
    } catch (error: any) {
      console.error("Admin refund error:", error);
      return res.status(500).json({ error: error?.message || "Erreur serveur" });
    }
  });

  app.get("/api/admin/stripe/reconciliation", requireAdminAuth, async (_req, res) => {
    try {
      const completed = await db
        .select()
        .from(orders)
        .where(or(eq(orders.status, "completed"), eq(orders.status, "payment_confirmed")))
        .orderBy(desc(orders.createdAt))
        .limit(100);

      const invs = await db.select().from(invoices).orderBy(desc(invoices.createdAt)).limit(100);

      let stripePayments: any[] = [];
      if (stripe) {
        const list = await stripe.paymentIntents.list({ limit: 50 });
        stripePayments = list.data.map((pi) => ({
          id: pi.id,
          amount: pi.amount,
          currency: pi.currency,
          status: pi.status,
          created: pi.created,
          metadata: pi.metadata,
        }));
      }

      return res.json({
        ordersLedger: completed.map((o) => ({
          id: o.id,
          totalPrice: o.totalPrice,
          status: o.status,
          paymentMethod: o.paymentMethod,
          createdAt: o.createdAt,
          refund: (o.rideOption as any)?.refund || null,
        })),
        invoices: invs,
        stripePayments,
        stripeConfigured: !!stripe,
      });
    } catch (error) {
      console.error("Stripe reconciliation error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // ─── CALENDRIER DISPO ───────────────────────────────────────────
  app.get("/api/admin/calendar", requireAdminAuth, async (req, res) => {
    try {
      const from = req.query.from ? new Date(String(req.query.from)) : new Date();
      const to = req.query.to
        ? new Date(String(req.query.to))
        : new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);

      const blocks = await db
        .select({
          id: vehicleAvailabilityBlocks.id,
          loueurVehicleId: vehicleAvailabilityBlocks.loueurVehicleId,
          startDate: vehicleAvailabilityBlocks.startDate,
          endDate: vehicleAvailabilityBlocks.endDate,
          reason: vehicleAvailabilityBlocks.reason,
          plate: loueurVehicles.plate,
          modelName: vehicleModels.name,
        })
        .from(vehicleAvailabilityBlocks)
        .leftJoin(loueurVehicles, eq(vehicleAvailabilityBlocks.loueurVehicleId, loueurVehicles.id))
        .leftJoin(vehicleModels, eq(loueurVehicles.vehicleModelId, vehicleModels.id))
        .where(
          and(
            lte(vehicleAvailabilityBlocks.startDate, to),
            gte(vehicleAvailabilityBlocks.endDate, from)
          )
        );

      const allOrders = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(500);
      const rentalBookings = allOrders
        .filter((o) => {
          const ro = o.rideOption as any;
          if (!(ro?.type === "rental" || String(ro?.id || "").startsWith("rental-"))) return false;
          if (["cancelled"].includes(o.status)) return false;
          const start = ro?.startDate ? new Date(ro.startDate) : null;
          const end = ro?.endDate ? new Date(ro.endDate) : null;
          if (!start || !end) return false;
          return start <= to && end >= from;
        })
        .map((o) => {
          const ro = o.rideOption as any;
          return {
            orderId: o.id,
            loueurVehicleId: ro?.loueurVehicleId || ro?.rentalData?.loueurVehicleId || null,
            startDate: ro.startDate,
            endDate: ro.endDate,
            status: o.status,
            clientName: o.clientName,
            title: ro?.title || "Location",
          };
        });

      return res.json({ blocks, bookings: rentalBookings, from, to });
    } catch (error) {
      console.error("Admin calendar error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.post("/api/admin/calendar/blocks", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { loueurVehicleId, startDate, endDate, reason } = req.body;
      if (!loueurVehicleId || !startDate || !endDate) {
        return res.status(400).json({ error: "loueurVehicleId, startDate, endDate requis" });
      }
      const [created] = await db
        .insert(vehicleAvailabilityBlocks)
        .values({
          loueurVehicleId,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          reason: reason || null,
          createdBy: "admin",
        })
        .returning();
      await audit(req, "calendar.block_create", "vehicle_block", created.id);
      return res.status(201).json(created);
    } catch (error) {
      console.error("Admin calendar block error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.delete("/api/admin/calendar/blocks/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const [deleted] = await db
        .delete(vehicleAvailabilityBlocks)
        .where(eq(vehicleAvailabilityBlocks.id, req.params.id))
        .returning();
      if (!deleted) return res.status(404).json({ error: "Bloc introuvable" });
      await audit(req, "calendar.block_delete", "vehicle_block", req.params.id);
      return res.json({ success: true });
    } catch (error) {
      console.error("Admin calendar delete error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // ─── RATINGS MODÉRATION ─────────────────────────────────────────
  app.get("/api/admin/ratings", requireAdminAuth, async (req, res) => {
    try {
      const page = parseInt((req.query.page as string) || "1", 10);
      const limit = parseInt((req.query.limit as string) || "50", 10);
      const all = await db.select().from(ratings).orderBy(desc(ratings.createdAt));
      return res.json({
        ratings: all.slice((page - 1) * limit, page * limit),
        total: all.length,
        page,
        totalPages: Math.ceil(all.length / limit) || 1,
      });
    } catch (error) {
      console.error("Admin ratings error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.delete("/api/admin/ratings/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const [deleted] = await db.delete(ratings).where(eq(ratings.id, req.params.id)).returning();
      if (!deleted) return res.status(404).json({ error: "Avis introuvable" });
      await audit(req, "rating.delete", "rating", req.params.id);
      return res.json({ success: true });
    } catch (error) {
      console.error("Admin rating delete error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // ─── LITIGES ────────────────────────────────────────────────────
  app.get("/api/admin/disputes", requireAdminAuth, async (_req, res) => {
    try {
      const list = await db.select().from(disputes).orderBy(desc(disputes.createdAt));
      return res.json(list);
    } catch (error) {
      console.error("Admin disputes error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.post("/api/admin/disputes", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { orderId, reason, openedBy } = req.body;
      if (!orderId || !reason) return res.status(400).json({ error: "orderId et reason requis" });
      const [created] = await db
        .insert(disputes)
        .values({
          orderId,
          reason,
          openedBy: openedBy || "admin",
          status: "open",
        })
        .returning();
      await audit(req, "dispute.create", "dispute", created.id);
      return res.status(201).json(created);
    } catch (error) {
      console.error("Admin dispute create error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.patch("/api/admin/disputes/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { status, resolution, refundAmount } = req.body;
      const updates: Record<string, unknown> = {};
      if (status) updates.status = status;
      if (resolution !== undefined) updates.resolution = resolution;
      if (refundAmount !== undefined) updates.refundAmount = refundAmount;
      if (status === "resolved" || status === "rejected") updates.resolvedAt = new Date();
      const [updated] = await db.update(disputes).set(updates).where(eq(disputes.id, req.params.id)).returning();
      if (!updated) return res.status(404).json({ error: "Litige introuvable" });
      await audit(req, "dispute.update", "dispute", req.params.id, updates);
      return res.json(updated);
    } catch (error) {
      console.error("Admin dispute patch error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // ─── MULTI-ADMINS ───────────────────────────────────────────────
  app.get("/api/admin/users", requireAdminAuth, async (_req, res) => {
    try {
      const list = await db
        .select({
          id: adminUsers.id,
          email: adminUsers.email,
          name: adminUsers.name,
          role: adminUsers.role,
          isActive: adminUsers.isActive,
          lastLoginAt: adminUsers.lastLoginAt,
          createdAt: adminUsers.createdAt,
        })
        .from(adminUsers)
        .orderBy(desc(adminUsers.createdAt));
      return res.json(list);
    } catch (error) {
      console.error("Admin users list error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.post("/api/admin/users", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { email, name, password, role } = req.body;
      if (!email || !name || !password) return res.status(400).json({ error: "email, name, password requis" });
      const hashedPassword = await bcrypt.hash(String(password), 10);
      const [created] = await db
        .insert(adminUsers)
        .values({
          email: String(email).toLowerCase().trim(),
          name,
          hashedPassword,
          role: role || "ops",
          isActive: true,
        })
        .returning({
          id: adminUsers.id,
          email: adminUsers.email,
          name: adminUsers.name,
          role: adminUsers.role,
          isActive: adminUsers.isActive,
          createdAt: adminUsers.createdAt,
        });
      await audit(req, "admin_user.create", "admin_user", created.id);
      return res.status(201).json(created);
    } catch (error: any) {
      if (String(error?.message || "").includes("unique")) {
        return res.status(409).json({ error: "Email déjà utilisé" });
      }
      console.error("Admin user create error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.patch("/api/admin/users/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const updates: Record<string, unknown> = {};
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.role !== undefined) updates.role = req.body.role;
      if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;
      if (req.body.password) updates.hashedPassword = await bcrypt.hash(String(req.body.password), 10);
      const [updated] = await db
        .update(adminUsers)
        .set(updates)
        .where(eq(adminUsers.id, req.params.id))
        .returning({
          id: adminUsers.id,
          email: adminUsers.email,
          name: adminUsers.name,
          role: adminUsers.role,
          isActive: adminUsers.isActive,
        });
      if (!updated) return res.status(404).json({ error: "Admin introuvable" });
      await audit(req, "admin_user.update", "admin_user", req.params.id);
      return res.json(updated);
    } catch (error) {
      console.error("Admin user patch error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.get("/api/admin/audit-logs", requireAdminAuth, async (req, res) => {
    try {
      const limit = parseInt((req.query.limit as string) || "100", 10);
      const logs = await db.select().from(adminAuditLogs).orderBy(desc(adminAuditLogs.createdAt)).limit(limit);
      return res.json(logs);
    } catch (error) {
      console.error("Admin audit logs error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Login email/password for multi-admin (alongside shared password)
  app.post("/api/auth/admin/login-user", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: "email et password requis" });
      const [user] = await db
        .select()
        .from(adminUsers)
        .where(and(eq(adminUsers.email, String(email).toLowerCase().trim()), eq(adminUsers.isActive, true)))
        .limit(1);
      if (!user) return res.status(401).json({ error: "Identifiants invalides" });
      const ok = await bcrypt.compare(String(password), user.hashedPassword);
      if (!ok) return res.status(401).json({ error: "Identifiants invalides" });
      await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, user.id));
      const token = generateAdminToken();
      res.cookie("admin_token", token, { httpOnly: true, sameSite: "lax", maxAge: 24 * 60 * 60 * 1000 });
      return res.json({
        success: true,
        token,
        type: "admin",
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      });
    } catch (error) {
      console.error("Admin login-user error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });
}
