/**
 * Chiffrement enveloppe AES-256-GCM des certificats OSB/PayZen.
 *
 * Format v2 (actuel) :
 *   Chaque certificat est chiffré avec une DEK aléatoire (32 bytes).
 *   La DEK est wrappée soit :
 *     - "local" : AES-GCM avec OSB_CREDENTIALS_ENCRYPTION_KEY
 *     - "kms"   : AWS KMS Encrypt (OSB_AWS_KMS_KEY_ID + credentials AWS)
 *
 * Format v1 (legacy) : base64(iv||tag||ciphertext) avec la clé maître directe.
 * Le decrypt lit les deux formats.
 *
 * Env :
 *   OSB_CREDENTIALS_ENCRYPTION_KEY  — requis (KEK locale / fallback)
 *   OSB_AWS_KMS_KEY_ID              — optionnel (arn ou key id) → wrap KMS
 *   AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY — si KMS
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const DEK_LEN = 32;
const V2_PREFIX = "v2.";

type WrapMode = "local" | "kms";

type EnvelopeV2 = {
  v: 2;
  wrap: WrapMode;
  /** iv + tag + ciphertext du certificat (base64 parts) */
  iv: string;
  tag: string;
  ct: string;
  /** DEK wrappée (local = iv+tag+ct concat base64 ; kms = CiphertextBlob base64) */
  wrappedDek: string;
  /** présent si wrap=local */
  dekIv?: string;
  dekTag?: string;
  /** audit */
  createdAt: string;
};

function resolveMasterKey(): Buffer | null {
  const raw = (process.env.OSB_CREDENTIALS_ENCRYPTION_KEY || "").trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  try {
    const b = Buffer.from(raw, "base64");
    if (b.length === 32) return b;
  } catch {
    /* fallthrough */
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

function getKmsKeyId(): string | null {
  const id = (process.env.OSB_AWS_KMS_KEY_ID || process.env.AWS_KMS_KEY_ID || "").trim();
  return id || null;
}

export function isOsbEncryptionConfigured(): boolean {
  return !!resolveMasterKey();
}

export function isOsbKmsEnabled(): boolean {
  return !!getKmsKeyId();
}

function aesGcmEncrypt(key: Buffer, plain: Buffer): { iv: Buffer; tag: Buffer; ct: Buffer } {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv, tag, ct };
}

function aesGcmDecrypt(key: Buffer, iv: Buffer, tag: Buffer, ct: Buffer): Buffer {
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

async function wrapDekWithKms(dek: Buffer): Promise<string> {
  const keyId = getKmsKeyId();
  if (!keyId) throw new Error("OSB_AWS_KMS_KEY_ID manquante");
  const { KMSClient, EncryptCommand } = await import("@aws-sdk/client-kms");
  const client = new KMSClient({
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1",
  });
  const out = await client.send(
    new EncryptCommand({
      KeyId: keyId,
      Plaintext: dek,
      EncryptionContext: { purpose: "rave-osb-certificate" },
    })
  );
  if (!out.CiphertextBlob) throw new Error("KMS Encrypt: CiphertextBlob vide");
  return Buffer.from(out.CiphertextBlob).toString("base64");
}

async function unwrapDekWithKms(wrappedB64: string): Promise<Buffer> {
  const { KMSClient, DecryptCommand } = await import("@aws-sdk/client-kms");
  const client = new KMSClient({
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1",
  });
  const out = await client.send(
    new DecryptCommand({
      CiphertextBlob: Buffer.from(wrappedB64, "base64"),
      EncryptionContext: { purpose: "rave-osb-certificate" },
    })
  );
  if (!out.Plaintext) throw new Error("KMS Decrypt: Plaintext vide");
  return Buffer.from(out.Plaintext);
}

function wrapDekLocal(dek: Buffer, master: Buffer): { wrappedDek: string; dekIv: string; dekTag: string } {
  const { iv, tag, ct } = aesGcmEncrypt(master, dek);
  return {
    dekIv: iv.toString("base64"),
    dekTag: tag.toString("base64"),
    wrappedDek: ct.toString("base64"),
  };
}

function unwrapDekLocal(
  wrappedDek: string,
  dekIv: string,
  dekTag: string,
  master: Buffer
): Buffer {
  return aesGcmDecrypt(
    master,
    Buffer.from(dekIv, "base64"),
    Buffer.from(dekTag, "base64"),
    Buffer.from(wrappedDek, "base64")
  );
}

function auditDecrypt(meta: { mode: string; legacy?: boolean }) {
  // Jamais de certificat / DEK dans les logs
  console.info("[OSB-CRYPTO] decrypt", {
    wrap: meta.mode,
    legacy: !!meta.legacy,
    at: new Date().toISOString(),
  });
}

/**
 * Chiffre un certificat (enveloppe v2). Prefère KMS si configuré.
 */
export async function encryptOsbCertificate(plain: string): Promise<string> {
  const master = resolveMasterKey();
  if (!master) {
    throw new Error(
      "OSB_CREDENTIALS_ENCRYPTION_KEY manquante — impossible de chiffrer le certificat OSB"
    );
  }

  const dek = randomBytes(DEK_LEN);
  const { iv, tag, ct } = aesGcmEncrypt(dek, Buffer.from(plain, "utf8"));

  const useKms = isOsbKmsEnabled();
  let envelope: EnvelopeV2;

  if (useKms) {
    try {
      const wrappedDek = await wrapDekWithKms(dek);
      envelope = {
        v: 2,
        wrap: "kms",
        iv: iv.toString("base64"),
        tag: tag.toString("base64"),
        ct: ct.toString("base64"),
        wrappedDek,
        createdAt: new Date().toISOString(),
      };
    } catch (e) {
      console.warn("[OSB-CRYPTO] KMS wrap failed, fallback local:", (e as Error)?.message);
      const local = wrapDekLocal(dek, master);
      envelope = {
        v: 2,
        wrap: "local",
        iv: iv.toString("base64"),
        tag: tag.toString("base64"),
        ct: ct.toString("base64"),
        wrappedDek: local.wrappedDek,
        dekIv: local.dekIv,
        dekTag: local.dekTag,
        createdAt: new Date().toISOString(),
      };
    }
  } else {
    const local = wrapDekLocal(dek, master);
    envelope = {
      v: 2,
      wrap: "local",
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      ct: ct.toString("base64"),
      wrappedDek: local.wrappedDek,
      dekIv: local.dekIv,
      dekTag: local.dekTag,
      createdAt: new Date().toISOString(),
    };
  }

  // Zeroiser DEK en mémoire au mieux
  dek.fill(0);

  return V2_PREFIX + Buffer.from(JSON.stringify(envelope), "utf8").toString("base64");
}

/** Sync wrapper pour appels legacy — préfère encryptOsbCertificate async */
export function encryptOsbCertificateSync(plain: string): string {
  if (isOsbKmsEnabled()) {
    throw new Error("encryptOsbCertificateSync indisponible avec KMS — utiliser await encryptOsbCertificate");
  }
  const master = resolveMasterKey();
  if (!master) {
    throw new Error("OSB_CREDENTIALS_ENCRYPTION_KEY manquante");
  }
  const dek = randomBytes(DEK_LEN);
  const { iv, tag, ct } = aesGcmEncrypt(dek, Buffer.from(plain, "utf8"));
  const local = wrapDekLocal(dek, master);
  dek.fill(0);
  const envelope: EnvelopeV2 = {
    v: 2,
    wrap: "local",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: ct.toString("base64"),
    wrappedDek: local.wrappedDek,
    dekIv: local.dekIv,
    dekTag: local.dekTag,
    createdAt: new Date().toISOString(),
  };
  return V2_PREFIX + Buffer.from(JSON.stringify(envelope), "utf8").toString("base64");
}

function decryptLegacyV1(encrypted: string, master: Buffer): string {
  const buf = Buffer.from(encrypted, "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("Certificat OSB chiffré invalide");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);
  auditDecrypt({ mode: "local", legacy: true });
  return aesGcmDecrypt(master, iv, tag, data).toString("utf8");
}

/**
 * Déchiffre v2 (enveloppe) ou v1 (legacy).
 */
export async function decryptOsbCertificate(encrypted: string): Promise<string> {
  const master = resolveMasterKey();
  if (!master) {
    throw new Error(
      "OSB_CREDENTIALS_ENCRYPTION_KEY manquante — impossible de déchiffrer le certificat OSB"
    );
  }

  const raw = String(encrypted || "").trim();
  if (!raw) throw new Error("Certificat OSB vide");

  if (raw.startsWith(V2_PREFIX)) {
    const json = Buffer.from(raw.slice(V2_PREFIX.length), "base64").toString("utf8");
    const env = JSON.parse(json) as EnvelopeV2;
    if (env.v !== 2 || !env.iv || !env.tag || !env.ct || !env.wrappedDek) {
      throw new Error("Enveloppe OSB v2 invalide");
    }

    let dek: Buffer;
    if (env.wrap === "kms") {
      dek = await unwrapDekWithKms(env.wrappedDek);
      auditDecrypt({ mode: "kms" });
    } else {
      if (!env.dekIv || !env.dekTag) {
        throw new Error("Enveloppe OSB local incomplete");
      }
      dek = unwrapDekLocal(env.wrappedDek, env.dekIv, env.dekTag, master);
      auditDecrypt({ mode: "local" });
    }

    try {
      return aesGcmDecrypt(
        dek,
        Buffer.from(env.iv, "base64"),
        Buffer.from(env.tag, "base64"),
        Buffer.from(env.ct, "base64")
      ).toString("utf8");
    } finally {
      dek.fill(0);
    }
  }

  // Legacy v1
  return decryptLegacyV1(raw, master);
}

/** @deprecated utiliser decryptOsbCertificate async — sync uniquement pour v1/local sans KMS */
export function decryptOsbCertificateSync(encrypted: string): string {
  const master = resolveMasterKey();
  if (!master) throw new Error("OSB_CREDENTIALS_ENCRYPTION_KEY manquante");
  const raw = String(encrypted || "").trim();
  if (raw.startsWith(V2_PREFIX)) {
    const json = Buffer.from(raw.slice(V2_PREFIX.length), "base64").toString("utf8");
    const env = JSON.parse(json) as EnvelopeV2;
    if (env.wrap === "kms") {
      throw new Error("decryptOsbCertificateSync indisponible pour wrap KMS");
    }
    if (!env.dekIv || !env.dekTag) throw new Error("Enveloppe OSB local incomplete");
    const dek = unwrapDekLocal(env.wrappedDek, env.dekIv, env.dekTag, master);
    try {
      auditDecrypt({ mode: "local" });
      return aesGcmDecrypt(
        dek,
        Buffer.from(env.iv, "base64"),
        Buffer.from(env.tag, "base64"),
        Buffer.from(env.ct, "base64")
      ).toString("utf8");
    } finally {
      dek.fill(0);
    }
  }
  return decryptLegacyV1(raw, master);
}

export function prestataireHasOsbCredentials(row: {
  osbShopId?: string | null;
  osbCertificateEncrypted?: string | null;
}): boolean {
  return !!(
    row.osbShopId &&
    String(row.osbShopId).trim() &&
    row.osbCertificateEncrypted &&
    String(row.osbCertificateEncrypted).trim()
  );
}

/** Comparaison timing-safe de deux buffers (utilitaire) */
export function safeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
