/**
 * Cloudinary Integration for RAVE
 * Gestion de l'upload d'images (photos loueurs, carrousel)
 */

import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { Express, Request, Response } from 'express';

// Configuration Cloudinary — env only (no hardcoded secrets)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || '',
});

// Configuration Multer pour upload en mémoire
const storage = multer.memoryStorage();
export const upload = multer({ 
  storage,
  limits: {
    fileSize: 8 * 1024 * 1024, // 8MB max (photos modèle admin)
  },
  fileFilter: (_req, file, cb) => {
    // Accepter uniquement les images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Seules les images sont acceptées'));
    }
  }
});

// Multer pour documents (PDF + images) - prestataires
export const uploadDocument = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format accepté : PDF, JPEG, PNG, WebP'));
    }
  }
});

/**
 * Upload un document (PDF ou image) sur Cloudinary - pas de transformation
 */
export async function uploadDocumentToCloudinary(
  buffer: Buffer,
  folder: string = 'rave/prestataires-docs',
  mimeType: string = 'application/pdf'
): Promise<{ url: string; publicId: string }> {
  const resourceType = mimeType === 'application/pdf' ? 'raw' : 'image';
  return new Promise((resolve, reject) => {
    const uploadOptions: Record<string, unknown> = { folder };
    if (resourceType === 'raw') {
      uploadOptions.resource_type = 'raw';
    }

    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error('[Cloudinary] Document upload error:', error);
          reject(error);
        } else if (result) {
          const url = resourceType === 'raw' 
            ? result.secure_url 
            : (result as { secure_url: string }).secure_url;
          resolve({ url, publicId: result.public_id });
        }
      }
    );
    stream.end(buffer);
  });
}

/**
 * Upload une image sur Cloudinary
 */
export async function uploadToCloudinary(
  buffer: Buffer, 
  folder: string = 'rave'
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation: [
          { width: 800, height: 800, crop: 'limit' }, // Limiter la taille
          { quality: 'auto:good' }, // Optimiser la qualité
          { format: 'auto' } // Format optimal (webp si supporté)
        ]
      },
      (error, result) => {
        if (error) {
          console.error('[Cloudinary] Upload error:', error);
          reject(error);
        } else if (result) {
          console.log('[Cloudinary] ✅ Upload success:', result.secure_url);
          resolve({
            url: result.secure_url,
            publicId: result.public_id
          });
        }
      }
    ).end(buffer);
  });
}

/**
 * Supprimer une image de Cloudinary
 */
export async function deleteFromCloudinary(publicId: string): Promise<boolean> {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    console.log('[Cloudinary] Delete result:', result);
    return result.result === 'ok';
  } catch (error) {
    console.error('[Cloudinary] Delete error:', error);
    return false;
  }
}

/**
 * Enregistre les routes d'upload
 */
export function registerUploadRoutes(app: Express) {
  // Route d'upload générique
  app.post('/api/upload', upload.single('image'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier envoyé' });
      }

      const folder = (req.body.folder as string) || 'rave';
      const result = await uploadToCloudinary(req.file.buffer, folder);

      res.json({
        success: true,
        url: result.url,
        publicId: result.publicId
      });
    } catch (error) {
      console.error('[Upload] Error:', error);
      res.status(500).json({ error: 'Erreur lors de l\'upload' });
    }
  });

  // Route d'upload pour photo chauffeur
  app.post('/api/upload/driver-photo', upload.single('image'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier envoyé' });
      }

      const result = await uploadToCloudinary(req.file.buffer, 'rave/drivers');

      res.json({
        success: true,
        url: result.url,
        publicId: result.publicId
      });
    } catch (error) {
      console.error('[Upload Driver Photo] Error:', error);
      res.status(500).json({ error: 'Erreur lors de l\'upload de la photo' });
    }
  });

  // Route d'upload pour image carrousel
  app.post('/api/upload/carousel', upload.single('image'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier envoyé' });
      }

      const result = await uploadToCloudinary(req.file.buffer, 'rave/carousel');

      res.json({
        success: true,
        url: result.url,
        publicId: result.publicId
      });
    } catch (error) {
      console.error('[Upload Carousel] Error:', error);
      res.status(500).json({ error: 'Erreur lors de l\'upload de l\'image' });
    }
  });

  // Route d'upload pour documents prestataire (PDF, images) - appelée depuis prestataire-routes avec auth
  app.post('/api/upload/prestataire-doc', uploadDocument.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier envoyé' });
      }
      const result = await uploadDocumentToCloudinary(
        req.file.buffer,
        'rave/prestataires-docs',
        req.file.mimetype
      );
      res.json({ success: true, url: result.url, publicId: result.publicId });
    } catch (error) {
      console.error('[Upload Prestataire Doc] Error:', error);
      res.status(500).json({ error: "Erreur lors de l'upload du document" });
    }
  });

  // Route d'upload pour photo client
  app.post('/api/upload/client-photo', upload.single('image'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier envoyé' });
      }

      const result = await uploadToCloudinary(req.file.buffer, 'rave/clients');

      res.json({
        success: true,
        url: result.url,
        publicId: result.publicId
      });
    } catch (error) {
      console.error('[Upload Client Photo] Error:', error);
      res.status(500).json({ error: 'Erreur lors de l\'upload de la photo' });
    }
  });

  // Route d'upload pour photos véhicule loueur
  app.post('/api/upload/vehicle-photo', upload.single('image'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier envoyé' });
      }

      const result = await uploadToCloudinary(req.file.buffer, 'rave/vehicles');

      res.json({
        success: true,
        url: result.url,
        publicId: result.publicId
      });
    } catch (error) {
      console.error('[Upload Vehicle Photo] Error:', error);
      res.status(500).json({ error: "Erreur lors de l'upload de la photo du véhicule" });
    }
  });

  console.log('[Cloudinary] ✅ Upload routes registered');
}

export default {
  uploadToCloudinary,
  deleteFromCloudinary,
  registerUploadRoutes,
  upload
};
