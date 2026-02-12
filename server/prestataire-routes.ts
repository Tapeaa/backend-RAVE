/**
 * Tape'ā Back Office - Routes API Prestataires
 * Routes accessibles par les prestataires (sociétés et patentés)
 */

import type { Express } from "express";
import Stripe from "stripe";
import { z } from "zod";
import { requirePrestataireAuth, AuthenticatedRequest, isSociete, isLoueur } from "./admin-auth";
import { db } from "./db";
import { drivers, orders, prestataires, collecteFrais, tarifs, vehicleModels, loueurVehicles } from "@shared/schema";
import { eq, desc, asc, count, sql, and, gte, lte, inArray } from "drizzle-orm";
import { dbStorage } from "./db-storage";
import { uploadDocument, uploadDocumentToCloudinary } from "./cloudinary";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

export function registerPrestataireRoutes(app: Express) {
  
  // ============ INFOS PRESTATAIRE ============

  // Récupérer les infos du prestataire connecté
  app.get("/api/prestataire/me", requirePrestataireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.prestataire) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const [prestataire] = await db
        .select()
        .from(prestataires)
        .where(eq(prestataires.id, req.prestataire.id));

      if (!prestataire) {
        return res.status(404).json({ error: "Prestataire non trouvé" });
      }

      // Compter les chauffeurs si c'est une société
      let totalChauffeurs = 0;
      if (isSociete(prestataire.type)) {
        const [driverCount] = await db
          .select({ count: count() })
          .from(drivers)
          .where(eq(drivers.prestataireId, prestataire.id));
        totalChauffeurs = driverCount?.count || 0;
      }

      return res.json({
        prestataire: {
          id: prestataire.id,
          nom: prestataire.nom,
          type: prestataire.type,
          numeroTahiti: prestataire.numeroTahiti,
          email: prestataire.email,
          phone: prestataire.phone,
          isActive: prestataire.isActive,
          isSociete: isSociete(prestataire.type),
          totalChauffeurs,
          createdAt: prestataire.createdAt.toISOString(),
          documents: {
            docNumeroTahiti: prestataire.docNumeroTahiti ?? null,
            docAttestationQualification: prestataire.docAttestationQualification ?? null,
            docLicenceTransport: prestataire.docLicenceTransport ?? null,
            docAssurancePro: prestataire.docAssurancePro ?? null,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching prestataire info:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Modifier le profil du prestataire connecté (nom, n° Tahiti, email, téléphone)
  app.patch("/api/prestataire/me", requirePrestataireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.prestataire) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const { nom, numeroTahiti, email, phone } = req.body;
      const updates: Record<string, string | null> = {};

      if (typeof nom === "string" && nom.trim()) updates.nom = nom.trim();
      if (numeroTahiti !== undefined) updates.numeroTahiti = typeof numeroTahiti === "string" ? (numeroTahiti.trim() || null) : null;
      if (email !== undefined) updates.email = typeof email === "string" ? (email.trim() || null) : null;
      if (phone !== undefined) updates.phone = typeof phone === "string" ? (phone.trim() || null) : null;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "Aucune donnée à mettre à jour" });
      }

      const [updated] = await db
        .update(prestataires)
        .set(updates)
        .where(eq(prestataires.id, req.prestataire.id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Prestataire non trouvé" });
      }

      return res.json({
        success: true,
        prestataire: {
          id: updated.id,
          nom: updated.nom,
          type: updated.type,
          numeroTahiti: updated.numeroTahiti,
          email: updated.email,
          phone: updated.phone,
          isActive: updated.isActive,
          isSociete: isSociete(updated.type),
          createdAt: updated.createdAt.toISOString(),
        },
      });
    } catch (error) {
      console.error("Error updating prestataire profile:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Upload d'un document prestataire (PDF, images)
  app.post("/api/prestataire/upload-document", requirePrestataireAuth, uploadDocument.single("file"), async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.prestataire || !req.file) {
        return res.status(400).json({ error: "Aucun fichier envoyé" });
      }
      const result = await uploadDocumentToCloudinary(
        req.file.buffer,
        "tapea/prestataires-docs",
        req.file.mimetype
      );
      return res.json({ success: true, url: result.url, publicId: result.publicId });
    } catch (error) {
      console.error("Error uploading prestataire document:", error);
      return res.status(500).json({ error: "Erreur lors de l'upload" });
    }
  });

  // Mettre à jour les documents du prestataire
  app.patch("/api/prestataire/me/documents", requirePrestataireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.prestataire) {
        return res.status(401).json({ error: "Non authentifié" });
      }
      const { docNumeroTahiti, docAttestationQualification, docLicenceTransport, docAssurancePro } = req.body;
      const updates: Record<string, string | null> = {};
      if (docNumeroTahiti !== undefined) updates.docNumeroTahiti = docNumeroTahiti && typeof docNumeroTahiti === "string" ? docNumeroTahiti.trim() : null;
      if (docAttestationQualification !== undefined) updates.docAttestationQualification = docAttestationQualification && typeof docAttestationQualification === "string" ? docAttestationQualification.trim() : null;
      if (docLicenceTransport !== undefined) updates.docLicenceTransport = docLicenceTransport && typeof docLicenceTransport === "string" ? docLicenceTransport.trim() : null;
      if (docAssurancePro !== undefined) updates.docAssurancePro = docAssurancePro && typeof docAssurancePro === "string" ? docAssurancePro.trim() : null;
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "Aucune donnée à mettre à jour" });
      }
      const [updated] = await db
        .update(prestataires)
        .set(updates)
        .where(eq(prestataires.id, req.prestataire.id))
        .returning();
      if (!updated) {
        return res.status(404).json({ error: "Prestataire non trouvé" });
      }
      return res.json({
        success: true,
        documents: {
          docNumeroTahiti: updated.docNumeroTahiti ?? null,
          docAttestationQualification: updated.docAttestationQualification ?? null,
          docLicenceTransport: updated.docLicenceTransport ?? null,
          docAssurancePro: updated.docAssurancePro ?? null,
        },
      });
    } catch (error) {
      console.error("Error updating prestataire documents:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Changer le code à 6 chiffres du prestataire (hors permissions admin)
  app.patch("/api/prestataire/me/code", requirePrestataireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.prestataire) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const { currentCode, newCode } = req.body;
      const currentStr = String(currentCode || "").trim();
      const newStr = String(newCode || "").trim();

      if (!currentStr || !newStr) {
        return res.status(400).json({ error: "Code actuel et nouveau code requis" });
      }
      if (!/^\d{6}$/.test(newStr)) {
        return res.status(400).json({ error: "Le nouveau code doit faire exactement 6 chiffres" });
      }
      if (currentStr === newStr) {
        return res.status(400).json({ error: "Le nouveau code doit être différent de l'actuel" });
      }

      const [prestataire] = await db
        .select()
        .from(prestataires)
        .where(eq(prestataires.id, req.prestataire.id));

      if (!prestataire) {
        return res.status(404).json({ error: "Prestataire non trouvé" });
      }
      if (prestataire.code !== currentStr) {
        return res.status(400).json({ error: "Code actuel incorrect" });
      }

      const [existing] = await db
        .select({ id: prestataires.id })
        .from(prestataires)
        .where(eq(prestataires.code, newStr));
      if (existing && existing.id !== prestataire.id) {
        return res.status(400).json({ error: "Ce code est déjà utilisé par un autre compte" });
      }

      await db
        .update(prestataires)
        .set({ code: newStr })
        .where(eq(prestataires.id, prestataire.id));

      return res.json({ success: true, message: "Code mis à jour. Utilisez ce code pour vos prochaines connexions." });
    } catch (error) {
      console.error("Error updating prestataire code:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Supprimer son compte prestataire (avec confirmation par code)
  app.delete("/api/prestataire/me", requirePrestataireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.prestataire) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const { code } = req.body;
      const codeStr = String(code || "").trim();
      if (!codeStr) {
        return res.status(400).json({ error: "Entrez votre code à 6 chiffres pour confirmer la suppression" });
      }

      const [prestataire] = await db
        .select()
        .from(prestataires)
        .where(eq(prestataires.id, req.prestataire.id));

      if (!prestataire) {
        return res.status(404).json({ error: "Prestataire non trouvé" });
      }
      if (prestataire.code !== codeStr) {
        return res.status(400).json({ error: "Code incorrect" });
      }

      const prestataireDrivers = await db
        .select()
        .from(drivers)
        .where(eq(drivers.prestataireId, prestataire.id));

      const isPatente = prestataire.type === "patente_taxi" || prestataire.type === "patente_tourisme";

      if (!isPatente && prestataireDrivers.length > 0) {
        await db
          .update(prestataires)
          .set({ isActive: false })
          .where(eq(prestataires.id, prestataire.id));
        return res.json({
          success: true,
          message: "Compte désactivé (impossible de supprimer car vous avez des chauffeurs associés)",
          deactivated: true,
        });
      }

      if (prestataireDrivers.length > 0) {
        for (const driver of prestataireDrivers) {
          try {
            await dbStorage.deleteDriver(driver.id);
          } catch (err) {
            console.error("Erreur suppression chauffeur:", err);
          }
        }
      }

      await db.execute(sql`UPDATE collecte_frais SET prestataire_id = NULL WHERE prestataire_id = ${prestataire.id}`);
      await db.execute(sql`DELETE FROM prestataire_sessions WHERE prestataire_id = ${prestataire.id}`);
      await db.delete(prestataires).where(eq(prestataires.id, prestataire.id));

      return res.json({ success: true, message: "Compte supprimé définitivement" });
    } catch (error) {
      console.error("Error deleting prestataire account:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // ============ GESTION DES CHAUFFEURS (Sociétés uniquement) ============

  // Liste les chauffeurs du prestataire
  app.get("/api/prestataire/chauffeurs", requirePrestataireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.prestataire) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      // Vérifier que c'est une société
      if (!isSociete(req.prestataire.type)) {
        return res.status(403).json({ error: "Seules les sociétés peuvent gérer des chauffeurs" });
      }

      const prestataireDrivers = await db
        .select()
        .from(drivers)
        .where(eq(drivers.prestataireId, req.prestataire.id))
        .orderBy(desc(drivers.createdAt));

      return res.json({
        chauffeurs: prestataireDrivers.map(d => ({
          id: d.id,
          firstName: d.firstName,
          lastName: d.lastName,
          phone: d.phone,
          code: d.code,
          typeChauffeur: d.typeChauffeur,
          vehicleModel: d.vehicleModel,
          vehicleColor: d.vehicleColor,
          vehiclePlate: d.vehiclePlate,
          isActive: d.isActive,
          averageRating: d.averageRating,
          totalRides: d.totalRides,
          commissionChauffeur: d.commissionChauffeur || 95,
          createdAt: d.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      console.error("Error fetching prestataire chauffeurs:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Créer un chauffeur (Sociétés uniquement)
  app.post("/api/prestataire/chauffeurs", requirePrestataireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.prestataire) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      // Vérifier que c'est une société
      if (!isSociete(req.prestataire.type)) {
        return res.status(403).json({ error: "Seules les sociétés peuvent créer des chauffeurs" });
      }

      const { firstName, lastName, phone, typeChauffeur, vehicleModel, vehicleColor, vehiclePlate, commissionChauffeur } = req.body;

      if (!firstName || !lastName || !phone) {
        return res.status(400).json({ error: "Prénom, nom et téléphone requis" });
      }

      // Valider la commission
      const finalCommission = commissionChauffeur !== undefined ? commissionChauffeur : 95;
      if (finalCommission < 0 || finalCommission > 100) {
        return res.status(400).json({ error: "La commission doit être entre 0 et 100%" });
      }

      // Vérifier si le téléphone existe déjà
      const [existingDriver] = await db
        .select()
        .from(drivers)
        .where(eq(drivers.phone, phone));

      if (existingDriver) {
        return res.status(400).json({ error: "Un chauffeur avec ce numéro existe déjà" });
      }

      // Générer un code 6 chiffres unique
      let code: string;
      let codeExists = true;
      while (codeExists) {
        code = Math.floor(100000 + Math.random() * 900000).toString();
        const [existing] = await db
          .select()
          .from(drivers)
          .where(eq(drivers.code, code));
        codeExists = !!existing;
      }

      // Créer le chauffeur
      const [newDriver] = await db
        .insert(drivers)
        .values({
          firstName,
          lastName,
          phone,
          code: code!,
          typeChauffeur: typeChauffeur || "salarie",
          vehicleModel: vehicleModel || null,
          vehicleColor: vehicleColor || null,
          vehiclePlate: vehiclePlate || null,
          commissionChauffeur: finalCommission,
          prestataireId: req.prestataire.id,
          isActive: true,
        })
        .returning();

      console.log(`[Prestataire ${req.prestataire.id}] Chauffeur créé: ${newDriver.id}`);

      return res.json({
        success: true,
        chauffeur: {
          id: newDriver.id,
          firstName: newDriver.firstName,
          lastName: newDriver.lastName,
          phone: newDriver.phone,
          code: newDriver.code,
          typeChauffeur: newDriver.typeChauffeur,
          vehicleModel: newDriver.vehicleModel,
          vehicleColor: newDriver.vehicleColor,
          vehiclePlate: newDriver.vehiclePlate,
          isActive: newDriver.isActive,
          createdAt: newDriver.createdAt.toISOString(),
        },
        code: code!,
      });
    } catch (error) {
      console.error("Error creating chauffeur:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Modifier un chauffeur
  app.patch("/api/prestataire/chauffeurs/:id", requirePrestataireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.prestataire) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      if (!isSociete(req.prestataire.type)) {
        return res.status(403).json({ error: "Seules les sociétés peuvent modifier des chauffeurs" });
      }

      const { id } = req.params;
      const { firstName, lastName, typeChauffeur, vehicleModel, vehicleColor, vehiclePlate, isActive } = req.body;

      // Vérifier que le chauffeur appartient au prestataire
      const [driver] = await db
        .select()
        .from(drivers)
        .where(and(
          eq(drivers.id, id),
          eq(drivers.prestataireId, req.prestataire.id)
        ));

      if (!driver) {
        return res.status(404).json({ error: "Chauffeur non trouvé ou non autorisé" });
      }

      const updateData: any = {};
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (typeChauffeur !== undefined) updateData.typeChauffeur = typeChauffeur;
      if (vehicleModel !== undefined) updateData.vehicleModel = vehicleModel;
      if (vehicleColor !== undefined) updateData.vehicleColor = vehicleColor;
      if (vehiclePlate !== undefined) updateData.vehiclePlate = vehiclePlate;
      if (isActive !== undefined) updateData.isActive = isActive;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "Aucune donnée à mettre à jour" });
      }

      const [updated] = await db
        .update(drivers)
        .set(updateData)
        .where(eq(drivers.id, id))
        .returning();

      console.log(`[Prestataire ${req.prestataire.id}] Chauffeur modifié: ${id}`);

      return res.json({
        success: true,
        chauffeur: {
          ...updated,
          createdAt: updated.createdAt.toISOString(),
        },
      });
    } catch (error) {
      console.error("Error updating chauffeur:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Modifier la commission d'un chauffeur
  app.patch("/api/prestataire/chauffeurs/:id/commission", requirePrestataireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.prestataire) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      if (!isSociete(req.prestataire.type)) {
        return res.status(403).json({ error: "Seules les sociétés peuvent modifier la commission des chauffeurs" });
      }

      const { id } = req.params;
      const { commissionChauffeur } = req.body;

      // Valider la commission
      if (commissionChauffeur === undefined || commissionChauffeur < 0 || commissionChauffeur > 100) {
        return res.status(400).json({ error: "La commission doit être entre 0 et 100%" });
      }

      // Vérifier que le chauffeur appartient au prestataire
      const [driver] = await db
        .select()
        .from(drivers)
        .where(and(
          eq(drivers.id, id),
          eq(drivers.prestataireId, req.prestataire.id)
        ));

      if (!driver) {
        return res.status(404).json({ error: "Chauffeur non trouvé ou non autorisé" });
      }

      const [updated] = await db
        .update(drivers)
        .set({ commissionChauffeur })
        .where(eq(drivers.id, id))
        .returning();

      console.log(`[Prestataire ${req.prestataire.id}] Commission chauffeur ${id} mise à jour: ${commissionChauffeur}%`);

      return res.json({
        success: true,
        chauffeur: {
          ...updated,
          createdAt: updated.createdAt.toISOString(),
        },
      });
    } catch (error) {
      console.error("Error updating commission:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Supprimer un chauffeur
  app.delete("/api/prestataire/chauffeurs/:id", requirePrestataireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.prestataire) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      if (!isSociete(req.prestataire.type)) {
        return res.status(403).json({ error: "Seules les sociétés peuvent supprimer des chauffeurs" });
      }

      const { id } = req.params;

      // Vérifier que le chauffeur appartient au prestataire
      const [driver] = await db
        .select()
        .from(drivers)
        .where(and(
          eq(drivers.id, id),
          eq(drivers.prestataireId, req.prestataire.id)
        ));

      if (!driver) {
        return res.status(404).json({ error: "Chauffeur non trouvé ou non autorisé" });
      }

      // Supprimer le chauffeur
      await db.delete(drivers).where(eq(drivers.id, id));

      console.log(`[Prestataire ${req.prestataire.id}] Chauffeur supprimé: ${id}`);

      return res.json({ success: true, message: "Chauffeur supprimé" });
    } catch (error) {
      console.error("Error deleting chauffeur:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // ============ COURSES DU PRESTATAIRE ============

  // Liste les courses des chauffeurs du prestataire
  app.get("/api/prestataire/courses", requirePrestataireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.prestataire) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const limit = parseInt(req.query.limit as string) || 100;

      // Récupérer les chauffeurs du prestataire avec leurs noms
      const prestataireDrivers = await db
        .select({ id: drivers.id, firstName: drivers.firstName, lastName: drivers.lastName })
        .from(drivers)
        .where(eq(drivers.prestataireId, req.prestataire.id));

      const driverIds = prestataireDrivers.map(d => d.id);
      const driverMap = new Map(prestataireDrivers.map(d => [d.id, `${d.firstName} ${d.lastName}`]));

      if (driverIds.length === 0) {
        return res.json({ courses: [] });
      }

      // Récupérer les courses de ces chauffeurs
      const driverOrders = await db
        .select()
        .from(orders)
        .where(inArray(orders.assignedDriverId, driverIds))
        .orderBy(desc(orders.createdAt))
        .limit(limit);

      // Récupérer le % de frais de service depuis la config
      const fraisConfig = await dbStorage.getFraisServiceConfig();
      const fraisServicePercent = fraisConfig?.fraisServicePrestataire || 15;

      return res.json({
        fraisServicePercent, // Inclure le % pour l'affichage
        courses: driverOrders.map(o => {
          const addresses = o.addresses as any;
          // Extraire les adresses - le champ s'appelle "value" dans le schema
          let pickupAddress = '';
          let dropoffAddress = '';
          let stops: string[] = [];
          
          if (Array.isArray(addresses)) {
            // Format tableau [{type, value}, ...]
            const pickup = addresses.find((a: any) => a.type === 'pickup');
            const dropoff = addresses.find((a: any) => a.type === 'destination' || a.type === 'dropoff');
            const stopAddresses = addresses.filter((a: any) => a.type === 'stop');
            
            // Le champ est "value" pas "address"
            pickupAddress = pickup?.value || pickup?.address || addresses[0]?.value || addresses[0]?.address || '';
            dropoffAddress = dropoff?.value || dropoff?.address || addresses[addresses.length - 1]?.value || addresses[addresses.length - 1]?.address || '';
            stops = stopAddresses.map((s: any) => s.value || s.address).filter(Boolean);
          } else if (addresses) {
            // Format objet {pickup, dropoff, stops}
            pickupAddress = addresses.pickup?.value || addresses.pickup?.address || '';
            dropoffAddress = addresses.dropoff?.value || addresses.dropoff?.address || addresses.destination?.value || addresses.destination?.address || '';
            stops = addresses.stops?.map((s: any) => s.value || s.address).filter(Boolean) || [];
          }

          return {
            id: o.id,
            date: o.createdAt.toISOString(),
            clientName: o.clientName,
            clientPhone: o.clientPhone,
            pickupAddress,
            dropoffAddress,
            stops,
            totalPrice: o.totalPrice,
            driverEarnings: o.driverEarnings,
            commission: Math.round(o.totalPrice * fraisServicePercent / 100),
            status: o.status,
            paymentMethod: o.paymentMethod,
            driverName: o.assignedDriverId ? driverMap.get(o.assignedDriverId) : undefined,
            driverId: o.assignedDriverId,
            rideOption: o.rideOption,
            supplements: o.supplements,
            routeInfo: o.routeInfo,
            waitingTimeMinutes: o.waitingTimeMinutes,
          };
        }),
      });
    } catch (error) {
      console.error("Error fetching prestataire courses:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Détails d'une course spécifique
  app.get("/api/prestataire/courses/:id", requirePrestataireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.prestataire) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const { id } = req.params;

      // Récupérer la course
      const [order] = await db.select().from(orders).where(eq(orders.id, id));

      if (!order) {
        return res.status(404).json({ error: "Course non trouvée" });
      }

      // Vérifier que le chauffeur appartient au prestataire
      if (order.assignedDriverId) {
        const [driver] = await db.select().from(drivers).where(eq(drivers.id, order.assignedDriverId));
        if (!driver || driver.prestataireId !== req.prestataire.id) {
          return res.status(403).json({ error: "Accès non autorisé" });
        }
      }

      // Récupérer les infos du chauffeur
      let driverInfo = null;
      if (order.assignedDriverId) {
        const [driver] = await db.select().from(drivers).where(eq(drivers.id, order.assignedDriverId));
        if (driver) {
          driverInfo = {
            id: driver.id,
            firstName: driver.firstName,
            lastName: driver.lastName,
            phone: driver.phone,
            vehicleModel: driver.vehicleModel,
            vehiclePlate: driver.vehiclePlate,
            commissionChauffeur: driver.commissionChauffeur || 95,
          };
        }
      }

      // Extraire les adresses - le champ s'appelle "value" dans le schema
      const addresses = order.addresses as any;
      let pickupAddress = '';
      let dropoffAddress = '';
      let stops: string[] = [];
      
      if (Array.isArray(addresses)) {
        const pickup = addresses.find((a: any) => a.type === 'pickup');
        const dropoff = addresses.find((a: any) => a.type === 'destination' || a.type === 'dropoff');
        const stopAddresses = addresses.filter((a: any) => a.type === 'stop');
        
        // Le champ est "value" pas "address"
        pickupAddress = pickup?.value || pickup?.address || addresses[0]?.value || addresses[0]?.address || '';
        dropoffAddress = dropoff?.value || dropoff?.address || addresses[addresses.length - 1]?.value || addresses[addresses.length - 1]?.address || '';
        stops = stopAddresses.map((s: any) => s.value || s.address).filter(Boolean);
      } else if (addresses) {
        pickupAddress = addresses.pickup?.value || addresses.pickup?.address || '';
        dropoffAddress = addresses.dropoff?.value || addresses.dropoff?.address || addresses.destination?.value || addresses.destination?.address || '';
        stops = addresses.stops?.map((s: any) => s.value || s.address).filter(Boolean) || [];
      }

      // Récupérer les infos du prestataire pour la facture
      const [prestataireInfo] = await db.select().from(prestataires).where(eq(prestataires.id, req.prestataire.id));

      // Récupérer le % de frais de service depuis la config
      const fraisConfig = await dbStorage.getFraisServiceConfig();
      const fraisServicePercent = fraisConfig?.fraisServicePrestataire || 15;

      // Calculer les détails de tarification
      const rideOption = order.rideOption as any;
      const supplements = order.supplements as any;
      const routeInfo = order.routeInfo as any;

      // Debug logs
      console.log('[PRESTATAIRE] Course details:', {
        orderId: order.id,
        rideOption,
        routeInfo,
        supplements,
      });

      // Extraire baseFare (peut être stocké comme 'price' ou 'baseFare')
      const baseFare = rideOption?.baseFare || rideOption?.basePrice || rideOption?.price || 0;
      const pricePerKm = rideOption?.pricePerKm || rideOption?.pricePerKilometer || 0;

      // Extraire distance - peut être number ou string (jsonb). Google = mètres, certains clients = km
      let distanceMeters = 0;
      const rawDist = routeInfo?.distance;
      if (rawDist != null) {
        const parsed = typeof rawDist === 'number' ? rawDist : parseFloat(String(rawDist));
        if (!isNaN(parsed) && parsed > 0) {
          // >= 1000 = mètres. 0.01-99 = km (ex: 9.2). 100-999 = mètres (ex: 500m)
          distanceMeters = parsed >= 1000 || parsed >= 100 ? parsed : parsed * 1000;
        }
      }

      // Récupérer le tarif d'attente (minute_arret) - même logique que db-storage
      let waitingRatePerMin = 42;
      try {
        const [waitingTarif] = await db
          .select()
          .from(tarifs)
          .where(and(eq(tarifs.actif, true), eq(tarifs.typeTarif, "minute_arret")))
          .limit(1);
        if (waitingTarif?.prixXpf) {
          waitingRatePerMin = waitingTarif.prixXpf;
        }
      } catch {
        // Fallback 42
      }
      // 0 minute gratuite : toute minute d'attente est facturée (aligné avec la facturation en cours de course)
      const freeMinutes = 0;

      // Récupérer les notations (client → chauffeur, chauffeur → client)
      const [clientRating, driverRating] = await Promise.all([
        dbStorage.getRatingByOrderAndRater(order.id, 'client'),
        dbStorage.getRatingByOrderAndRater(order.id, 'driver'),
      ]);

      return res.json({
        fraisServicePercent, // Inclure le % pour l'affichage
        fraisConfig: fraisConfig ? { fraisServicePrestataire: fraisConfig.fraisServicePrestataire, commissionPrestataire: fraisConfig.commissionPrestataire } : null,
        waitingRatePerMin,
        freeMinutes,
        course: {
          id: order.id,
          date: order.createdAt.toISOString(),
          clientName: order.clientName,
          clientPhone: order.clientPhone,
          pickupAddress,
          dropoffAddress,
          stops,
          totalPrice: order.totalPrice,
          driverEarnings: order.driverEarnings,
          commission: Math.round(order.totalPrice * fraisServicePercent / 100),
          status: order.status,
          paymentMethod: order.paymentMethod,
          waitingTimeMinutes: order.waitingTimeMinutes,
          scheduledTime: order.scheduledTime?.toISOString() || null,
          isAdvanceBooking: order.isAdvanceBooking,
          // Détails tarification
          rideOption: {
            type: rideOption?.type || rideOption?.id || 'standard',
            label: rideOption?.label || rideOption?.title || 'Course standard',
            baseFare,
            pricePerKm,
            initialTotalPrice: rideOption?.initialTotalPrice, // Prix à la confirmation (avant attente/arrêts) - pour calculer les frais
          },
          supplements: Array.isArray(supplements) ? supplements : [],
          routeInfo: {
            distance: distanceMeters,
            duration: routeInfo?.duration ?? 0,
          },
        },
        driver: driverInfo,
        prestataire: prestataireInfo ? {
          id: prestataireInfo.id,
          nom: prestataireInfo.nom,
          type: prestataireInfo.type,
          numeroTahiti: prestataireInfo.numeroTahiti,
          email: prestataireInfo.email,
          phone: prestataireInfo.phone,
        } : null,
        ratings: {
          client: clientRating, // Note du client sur le chauffeur
          chauffeur: driverRating, // Note du chauffeur sur le client
        },
      });
    } catch (error) {
      console.error("Error fetching course details:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // ============ STATISTIQUES ============

  // Stats du prestataire (revenus jour/semaine/mois)
  app.get("/api/prestataire/stats", requirePrestataireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.prestataire) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      // Récupérer les IDs des chauffeurs du prestataire
      const prestataireDrivers = await db
        .select({ id: drivers.id })
        .from(drivers)
        .where(eq(drivers.prestataireId, req.prestataire.id));

      const driverIds = prestataireDrivers.map(d => d.id);

      if (driverIds.length === 0) {
        return res.json({
          stats: {
            totalChauffeurs: 0,
            revenusGlobal: 0,
            revenusSemaine: 0,
            revenusMois: 0,
            coursesAujourdhui: 0,
            coursesSemaine: 0,
            coursesMois: 0,
            totalCourses: 0,
            commissionsDues: 0,
          },
        });
      }

      // Dates de référence
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      // Récupérer toutes les courses terminées (payment_confirmed = vraiment terminées)
      const completedOrders = await db
        .select()
        .from(orders)
        .where(and(
          inArray(orders.assignedDriverId, driverIds),
          eq(orders.status, "payment_confirmed")
        ));

      // Calculer les stats - utiliser totalPrice pour le CA total (pas driverEarnings)
      let revenusGlobal = 0, revenusSemaine = 0, revenusMois = 0;
      let coursesAujourdhui = 0, coursesSemaine = 0, coursesMois = 0;

      for (const order of completedOrders) {
        const orderDate = new Date(order.createdAt);
        // Utiliser totalPrice pour le CA total de la plateforme
        const totalCA = order.totalPrice || 0;

        // CA global = toutes les courses
        revenusGlobal += totalCA;

        if (orderDate >= todayStart) {
          coursesAujourdhui++;
        }
        if (orderDate >= weekStart) {
          revenusSemaine += totalCA;
          coursesSemaine++;
        }
        if (orderDate >= monthStart) {
          revenusMois += totalCA;
          coursesMois++;
        }
      }

      // Récupérer les commissions dues depuis collecteFrais (non payées)
      const unpaidCollecte = await db
        .select()
        .from(collecteFrais)
        .where(and(
          eq(collecteFrais.prestataireId, req.prestataire.id),
          eq(collecteFrais.isPaid, false)
        ));

      // Récupérer la config pour recalculer en temps réel
      const fraisConfig = await dbStorage.getFraisServiceConfig();
      const fraisServicePercent = fraisConfig?.fraisServicePrestataire || 15;
      const commissionPrestatairePercent = fraisConfig?.commissionPrestataire || 0;

      // Recalculer les commissions dues en temps réel
      let commissionsDues = 0;
      for (const c of unpaidCollecte) {
        const orderIds = (c.orderIds as string[]) || [];
        for (const orderId of orderIds) {
          const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
          if (order) {
            const fraisService = Math.round(order.totalPrice * fraisServicePercent / 100);
            const commissionSupplementaire = Math.round(order.totalPrice * commissionPrestatairePercent / 100);
            commissionsDues += fraisService + commissionSupplementaire;
          }
        }
      }

      return res.json({
        stats: {
          totalChauffeurs: driverIds.length,
          revenusGlobal: Math.round(revenusGlobal),
          revenusSemaine: Math.round(revenusSemaine),
          revenusMois: Math.round(revenusMois),
          coursesAujourdhui,
          coursesSemaine,
          coursesMois,
          totalCourses: completedOrders.length,
          commissionsDues: Math.round(commissionsDues),
        },
      });
    } catch (error) {
      console.error("Error fetching prestataire stats:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // ============ COLLECTE DE FRAIS ============

  // Récupérer les frais de commission du prestataire
  app.get("/api/prestataire/collecte", requirePrestataireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.prestataire) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      // Récupérer les collectes du prestataire
      const prestataireCollecte = await db
        .select()
        .from(collecteFrais)
        .where(eq(collecteFrais.prestataireId, req.prestataire.id))
        .orderBy(desc(collecteFrais.createdAt));

      // Récupérer la config pour recalculer les montants des collectes non payées
      const fraisConfig = await dbStorage.getFraisServiceConfig();
      const fraisServicePercent = fraisConfig?.fraisServicePrestataire || 15;
      const commissionPrestatairePercent = fraisConfig?.commissionPrestataire || 0;

      // Recalculer les montants pour les collectes non payées
      const collectesWithRecalc = await Promise.all(prestataireCollecte.map(async (c) => {
        let montantDu = c.montantDu;

        // Si la collecte n'est pas payée, recalculer en temps réel
        if (!c.isPaid) {
          const orderIds = (c.orderIds as string[]) || [];
          let totalMontant = 0;

          for (const orderId of orderIds) {
            const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
            if (order) {
              const fraisService = Math.round(order.totalPrice * fraisServicePercent / 100);
              const commissionSupplementaire = Math.round(order.totalPrice * commissionPrestatairePercent / 100);
              totalMontant += fraisService + commissionSupplementaire;
            }
          }

          montantDu = totalMontant;
        }

        return {
          id: c.id,
          periode: c.periode,
          montantDu,
          montantPaye: c.montantPaye,
          isPaid: c.isPaid,
          paidAt: c.paidAt?.toISOString() || null,
          createdAt: c.createdAt.toISOString(),
        };
      }));

      return res.json({
        collectes: collectesWithRecalc,
      });
    } catch (error) {
      console.error("Error fetching prestataire collecte:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Détails d'une collecte pour un prestataire
  app.get("/api/prestataire/collecte/:id", requirePrestataireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.prestataire) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const { id } = req.params;

      const [collecte] = await db
        .select()
        .from(collecteFrais)
        .where(eq(collecteFrais.id, id));

      if (!collecte) {
        return res.status(404).json({ error: "Collecte non trouvée" });
      }

      // Vérifier que cette collecte appartient au prestataire
      if (collecte.prestataireId !== req.prestataire.id) {
        return res.status(403).json({ error: "Accès refusé" });
      }

      // Récupérer le chauffeur
      let driver = null;
      if (collecte.driverId) {
        const [d] = await db.select().from(drivers).where(eq(drivers.id, collecte.driverId));
        driver = d ? { id: d.id, firstName: d.firstName, lastName: d.lastName } : null;
      }

      // Récupérer les courses associées
      const orderIds = (collecte.orderIds as string[]) || [];
      const coursesDetails = [];

      // Récupérer la config des frais et commissions
      const fraisConfig = await dbStorage.getFraisServiceConfig();
      const fraisServicePercent = fraisConfig?.fraisServicePrestataire || 15;
      const commissionPrestatairePercent = fraisConfig?.commissionPrestataire || 0;

      let totalFraisService = 0;
      let totalCommissionSupplementaire = 0;

      for (const orderId of orderIds) {
        const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
        if (order) {
          // Calculer séparément les frais de service et la commission supplémentaire
          const fraisService = Math.round(order.totalPrice * fraisServicePercent / 100);
          const commissionSupplementaire = Math.round(order.totalPrice * commissionPrestatairePercent / 100);
          const commission = fraisService + commissionSupplementaire;
          
          totalFraisService += fraisService;
          totalCommissionSupplementaire += commissionSupplementaire;
          
          // Extraire les adresses
          const addresses = order.addresses as any;
          let pickupAddress = '';
          let dropoffAddress = '';
          
          if (Array.isArray(addresses)) {
            const pickup = addresses.find((a: any) => a.type === 'pickup');
            const dropoff = addresses.find((a: any) => a.type === 'destination' || a.type === 'dropoff');
            pickupAddress = pickup?.value || pickup?.address || addresses[0]?.value || addresses[0]?.address || '';
            dropoffAddress = dropoff?.value || dropoff?.address || addresses[addresses.length - 1]?.value || addresses[addresses.length - 1]?.address || '';
          } else if (addresses) {
            pickupAddress = addresses.pickup?.value || addresses.pickup?.address || '';
            dropoffAddress = addresses.dropoff?.value || addresses.dropoff?.address || addresses.destination?.value || addresses.destination?.address || '';
          }

          coursesDetails.push({
            id: order.id,
            date: order.createdAt.toISOString(),
            clientName: order.clientName,
            pickupAddress,
            dropoffAddress,
            totalPrice: order.totalPrice,
            driverEarnings: order.driverEarnings,
            commission,
            fraisService,
            commissionSupplementaire,
            paymentMethod: order.paymentMethod,
            status: order.status,
          });
        }
      }

      // Si la collecte n'est pas payée, utiliser les montants recalculés
      const collecteData = {
        id: collecte.id,
        periode: collecte.periode,
        montantDu: collecte.isPaid ? collecte.montantDu : (totalFraisService + totalCommissionSupplementaire),
        fraisService: collecte.isPaid ? (collecte.fraisService || 0) : totalFraisService,
        commissionSupplementaire: collecte.isPaid ? (collecte.commissionSupplementaire || 0) : totalCommissionSupplementaire,
        montantPaye: collecte.montantPaye,
        isPaid: collecte.isPaid,
        paidAt: collecte.paidAt?.toISOString() || null,
        createdAt: collecte.createdAt.toISOString(),
      };

      return res.json({
        collecte: collecteData,
        driver,
        courses: coursesDetails,
      });
    } catch (error) {
      console.error("Error fetching prestataire collecte details:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // ============ PAIEMENT COMMISSION VIA STRIPE ============

  const paymentIntentSchema = z.object({
    option: z.enum(["full", "half"]),
  });

  // Créer un PaymentIntent pour le paiement des commissions
  app.post("/api/prestataire/collecte/payment-intent", requirePrestataireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.prestataire || !stripe) {
        return res.status(503).json({ error: "Paiement par carte non disponible" });
      }

      const validation = paymentIntentSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Option invalide (full ou half)" });
      }

      const { option } = validation.data;

      // Récupérer les collectes non payées et le total dû
      const unpaidCollecte = await db
        .select()
        .from(collecteFrais)
        .where(and(
          eq(collecteFrais.prestataireId, req.prestataire.id),
          eq(collecteFrais.isPaid, false)
        ))
        .orderBy(collecteFrais.createdAt);

      const fraisConfig = await dbStorage.getFraisServiceConfig();
      const fraisServicePercent = fraisConfig?.fraisServicePrestataire || 15;
      const commissionPrestatairePercent = fraisConfig?.commissionPrestataire || 0;

      let totalRestant = 0;
      for (const c of unpaidCollecte) {
        const orderIds = (c.orderIds as string[]) || [];
        let montantDuCollecte = 0;
        for (const orderId of orderIds) {
          const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
          if (order) {
            montantDuCollecte += Math.round(order.totalPrice * fraisServicePercent / 100) +
              Math.round(order.totalPrice * commissionPrestatairePercent / 100);
          }
        }
        const montantPaye = c.montantPaye || 0;
        totalRestant += Math.max(0, montantDuCollecte - montantPaye);
      }

      const amount = option === "half" ? Math.round(totalRestant / 2) : totalRestant;
      if (amount <= 0) {
        return res.status(400).json({ error: "Aucun montant à régler" });
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount),
        currency: "xpf",
        metadata: { prestataireId: req.prestataire.id, type: "commission" },
        automatic_payment_methods: { enabled: true },
      });

      return res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount,
      });
    } catch (error) {
      console.error("Error creating prestataire payment intent:", error);
      return res.status(500).json({ error: "Erreur lors de la création du paiement" });
    }
  });

  // Confirmer le paiement et mettre à jour les collectes
  const confirmPaymentSchema = z.object({
    paymentIntentId: z.string().min(1),
  });

  app.post("/api/prestataire/collecte/confirm-payment", requirePrestataireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.prestataire || !stripe) {
        return res.status(503).json({ error: "Paiement non disponible" });
      }

      const validation = confirmPaymentSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Données invalides" });
      }

      const { paymentIntentId } = validation.data;

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (paymentIntent.metadata?.prestataireId !== req.prestataire.id) {
        return res.status(403).json({ error: "Paiement non autorisé" });
      }
      if (paymentIntent.status !== "succeeded") {
        return res.status(400).json({ error: "Le paiement n'a pas abouti" });
      }

      const amountPaid = Math.round((paymentIntent.amount || 0));
      const now = new Date();

      const unpaidCollecte = await db
        .select()
        .from(collecteFrais)
        .where(and(
          eq(collecteFrais.prestataireId, req.prestataire!.id),
          eq(collecteFrais.isPaid, false)
        ))
        .orderBy(collecteFrais.createdAt);

      const fraisConfig = await dbStorage.getFraisServiceConfig();
      const fraisServicePercent = fraisConfig?.fraisServicePrestataire || 15;
      const commissionPrestatairePercent = fraisConfig?.commissionPrestataire || 0;

      let remaining = amountPaid;

      for (const c of unpaidCollecte) {
        if (remaining <= 0) break;

        let montantDu = 0;
        const orderIds = (c.orderIds as string[]) || [];
        for (const orderId of orderIds) {
          const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
          if (order) {
            montantDu += Math.round(order.totalPrice * fraisServicePercent / 100) +
              Math.round(order.totalPrice * commissionPrestatairePercent / 100);
          }
        }

        const currentPaye = c.montantPaye || 0;
        const reste = montantDu - currentPaye;
        const toAdd = Math.min(remaining, reste);
        const newMontantPaye = currentPaye + toAdd;
        const isPaid = newMontantPaye >= montantDu;

        await db
          .update(collecteFrais)
          .set({
            montantPaye: newMontantPaye,
            isPaid,
            ...(isPaid && { paidAt: now }),
          })
          .where(eq(collecteFrais.id, c.id));

        remaining -= toAdd;
      }

      return res.json({ success: true, message: "Paiement enregistré" });
    } catch (error) {
      console.error("Error confirming prestataire payment:", error);
      return res.status(500).json({ error: "Erreur lors de la confirmation" });
    }
  });

  // ============================================================================
  // GESTION DES VÉHICULES LOUEUR (Prestataire)
  // ============================================================================

  // GET /api/prestataire/vehicle-models - Récupérer tous les modèles disponibles
  app.get("/api/prestataire/vehicle-models", requirePrestataireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const models = await db
        .select()
        .from(vehicleModels)
        .where(eq(vehicleModels.isActive, true))
        .orderBy(asc(vehicleModels.category), asc(vehicleModels.name));

      return res.json(models);
    } catch (error) {
      console.error("Error fetching vehicle models:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // GET /api/prestataire/vehicles - Véhicules du loueur connecté
  app.get("/api/prestataire/vehicles", requirePrestataireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.prestataire) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const vehicles = await db
        .select({
          id: loueurVehicles.id,
          vehicleModelId: loueurVehicles.vehicleModelId,
          plate: loueurVehicles.plate,
          pricePerDay: loueurVehicles.pricePerDay,
          pricePerDayLongTerm: loueurVehicles.pricePerDayLongTerm,
          availableForRental: loueurVehicles.availableForRental,
          availableForDelivery: loueurVehicles.availableForDelivery,
          availableForLongTerm: loueurVehicles.availableForLongTerm,
          customImageUrl: loueurVehicles.customImageUrl,
          isActive: loueurVehicles.isActive,
          createdAt: loueurVehicles.createdAt,
          // Infos du modèle
          modelName: vehicleModels.name,
          modelCategory: vehicleModels.category,
          modelImageUrl: vehicleModels.imageUrl,
          modelSeats: vehicleModels.seats,
          modelTransmission: vehicleModels.transmission,
          modelFuel: vehicleModels.fuel,
        })
        .from(loueurVehicles)
        .leftJoin(vehicleModels, eq(loueurVehicles.vehicleModelId, vehicleModels.id))
        .where(eq(loueurVehicles.prestataireId, req.prestataire.id))
        .orderBy(desc(loueurVehicles.createdAt));

      return res.json(vehicles);
    } catch (error) {
      console.error("Error fetching loueur vehicles:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // POST /api/prestataire/vehicles - Ajouter un véhicule
  app.post("/api/prestataire/vehicles", requirePrestataireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.prestataire) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      if (!isLoueur(req.prestataire.type)) {
        return res.status(403).json({ error: "Seuls les loueurs peuvent ajouter des véhicules" });
      }

      const {
        vehicleModelId, plate, pricePerDay, pricePerDayLongTerm,
        availableForRental, availableForDelivery, availableForLongTerm, customImageUrl
      } = req.body;

      if (!vehicleModelId || !pricePerDay) {
        return res.status(400).json({ error: "Modèle et prix par jour requis" });
      }

      // Vérifier que le modèle existe
      const [model] = await db
        .select()
        .from(vehicleModels)
        .where(eq(vehicleModels.id, vehicleModelId));

      if (!model || !model.isActive) {
        return res.status(400).json({ error: "Modèle de véhicule introuvable ou inactif" });
      }

      // Pour loueur_individuel, chercher le driver associé
      let driverId: string | null = null;
      if (req.prestataire.type === "loueur_individuel") {
        const [driver] = await db
          .select()
          .from(drivers)
          .where(eq(drivers.prestataireId, req.prestataire.id));
        driverId = driver?.id || null;
      }

      const [newVehicle] = await db
        .insert(loueurVehicles)
        .values({
          vehicleModelId,
          prestataireId: req.prestataire.id,
          driverId,
          plate: plate || null,
          pricePerDay,
          pricePerDayLongTerm: pricePerDayLongTerm || null,
          availableForRental: availableForRental ?? true,
          availableForDelivery: availableForDelivery ?? false,
          availableForLongTerm: availableForLongTerm ?? false,
          customImageUrl: customImageUrl || null,
          isActive: true,
        })
        .returning();

      console.log(`[Prestataire] Vehicle added: ${model.name} by ${req.prestataire.nom}`);
      return res.status(201).json(newVehicle);
    } catch (error) {
      console.error("Error adding loueur vehicle:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // PATCH /api/prestataire/vehicles/:id - Modifier un véhicule
  app.patch("/api/prestataire/vehicles/:id", requirePrestataireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.prestataire) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const { id } = req.params;

      // Vérifier que le véhicule appartient au prestataire
      const [existing] = await db
        .select()
        .from(loueurVehicles)
        .where(and(
          eq(loueurVehicles.id, id),
          eq(loueurVehicles.prestataireId, req.prestataire.id)
        ));

      if (!existing) {
        return res.status(404).json({ error: "Véhicule introuvable" });
      }

      const updates: Record<string, any> = {};
      const allowedFields = ["plate", "pricePerDay", "pricePerDayLongTerm", "availableForRental", "availableForDelivery", "availableForLongTerm", "customImageUrl", "isActive"];
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "Aucune modification" });
      }

      const [updated] = await db
        .update(loueurVehicles)
        .set(updates)
        .where(eq(loueurVehicles.id, id))
        .returning();

      return res.json(updated);
    } catch (error) {
      console.error("Error updating loueur vehicle:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // DELETE /api/prestataire/vehicles/:id - Supprimer un véhicule
  app.delete("/api/prestataire/vehicles/:id", requirePrestataireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.prestataire) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const { id } = req.params;

      const [deleted] = await db
        .delete(loueurVehicles)
        .where(and(
          eq(loueurVehicles.id, id),
          eq(loueurVehicles.prestataireId, req.prestataire.id)
        ))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: "Véhicule introuvable" });
      }

      return res.json({ success: true, message: "Véhicule supprimé" });
    } catch (error) {
      console.error("Error deleting loueur vehicle:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });
}
