import twilio from 'twilio';

// Twilio Configuration from environment variables
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID || '';

// Initialize Twilio client (only if credentials are provided)
const twilioClient = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
  ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : null;

if (twilioClient && TWILIO_VERIFY_SERVICE_SID) {
  console.log('[TWILIO] ✅ Twilio Verify Service configuré');
} else {
  console.warn('[TWILIO] ⚠️ Twilio non configuré - variables d\'environnement manquantes');
}

/**
 * Envoie un code de vérification par SMS via Twilio Verify Service
 * @param phoneNumber Numéro de téléphone au format international (ex: +689XXXXXXXX)
 * @returns Promise avec le status de l'envoi
 */
export async function sendVerificationCode(phoneNumber: string): Promise<{ success: boolean; error?: string }> {
  if (!twilioClient || !TWILIO_VERIFY_SERVICE_SID) {
    console.warn('[TWILIO] Tentative d\'envoi de code sans configuration Twilio');
    return { success: false, error: 'Twilio non configuré' };
  }

  try {
    // Normaliser le numéro de téléphone (assurez-vous qu'il commence par +)
    const normalizedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

    console.log(`[TWILIO] Envoi du code de vérification à ${normalizedPhone}`);
    console.log(`[TWILIO DEBUG] Account SID: ${TWILIO_ACCOUNT_SID ? TWILIO_ACCOUNT_SID.substring(0, 10) + '...' : 'MISSING'}, Auth Token: ${TWILIO_AUTH_TOKEN ? '***' + TWILIO_AUTH_TOKEN.substring(TWILIO_AUTH_TOKEN.length - 4) : 'MISSING'}, Service SID: ${TWILIO_VERIFY_SERVICE_SID || 'MISSING'}`);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/18c9163f-4b67-4579-b7aa-ab0aff42521f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/twilio.ts:34',message:'Before Twilio API call',data:{normalizedPhone,hasTWILIO_VERIFY_SERVICE_SID:!!TWILIO_VERIFY_SERVICE_SID},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    const verification = await twilioClient.verify.v2
      .services(TWILIO_VERIFY_SERVICE_SID)
      .verifications
      .create({
        to: normalizedPhone,
        channel: 'sms',
      });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/18c9163f-4b67-4579-b7aa-ab0aff42521f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/twilio.ts:43',message:'Twilio API success',data:{status:verification.status,sid:verification.sid},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    console.log(`[TWILIO] ✅ Code envoyé - Status: ${verification.status}, SID: ${verification.sid}`);

    return { success: true };
  } catch (error: any) {
    console.error('[TWILIO] ❌ Erreur lors de l\'envoi du code:', error.message);
    console.error('[TWILIO] ❌ Erreur complète:', {
      code: error.code,
      status: error.status,
      message: error.message,
      moreInfo: error.moreInfo,
      stack: error.stack
    });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/18c9163f-4b67-4579-b7aa-ab0aff42521f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/twilio.ts:50',message:'Twilio API error',data:{errorMessage:error.message,errorCode:error.code,errorName:error.name,errorString:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    // Gestion des erreurs spécifiques Twilio
    if (error.code === 60200) {
      return { success: false, error: 'Numéro de téléphone invalide' };
    } else if (error.code === 60203) {
      return { success: false, error: 'Trop de tentatives. Réessayez plus tard' };
    } else if (error.code === 20429) {
      return { success: false, error: 'Trop de requêtes. Réessayez dans quelques secondes' };
    } else if (error.code === 20003 || error.message === 'Authenticate' || error.message?.includes('Authenticate')) {
      // Credentials Twilio invalides
      console.error('[TWILIO] ⚠️ Credentials Twilio invalides - erreur d\'authentification');
      return { success: false, error: 'Configuration Twilio invalide. Veuillez vérifier les credentials.' };
    }

    return { success: false, error: error.message || 'Erreur lors de l\'envoi du code' };
  }
}

/**
 * Vérifie un code de vérification via Twilio Verify Service
 * @param phoneNumber Numéro de téléphone au format international (ex: +689XXXXXXXX)
 * @param code Code de vérification à 6 chiffres
 * @returns Promise avec le status de la vérification
 */
export async function verifyCode(phoneNumber: string, code: string): Promise<{ success: boolean; verified: boolean; error?: string }> {
  if (!twilioClient || !TWILIO_VERIFY_SERVICE_SID) {
    console.warn('[TWILIO] Tentative de vérification sans configuration Twilio');
    return { success: false, verified: false, error: 'Twilio non configuré' };
  }

  try {
    // Normaliser le numéro de téléphone
    const normalizedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

    console.log(`[TWILIO] Vérification du code ${code} pour ${normalizedPhone}`);

    const verificationCheck = await twilioClient.verify.v2
      .services(TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks
      .create({
        to: normalizedPhone,
        code: code.trim(),
      });

    const isVerified = verificationCheck.status === 'approved';

    if (isVerified) {
      console.log(`[TWILIO] ✅ Code vérifié avec succès - Status: ${verificationCheck.status}`);
    } else {
      console.log(`[TWILIO] ❌ Code invalide ou expiré - Status: ${verificationCheck.status}`);
    }

    return {
      success: true,
      verified: isVerified,
      ...(!isVerified && { error: 'Code invalide ou expiré' }),
    };
  } catch (error: any) {
    console.error('[TWILIO] ❌ Erreur lors de la vérification:', error.message);

    // Gestion des erreurs spécifiques Twilio
    if (error.code === 20404) {
      return { success: true, verified: false, error: 'Code invalide ou expiré' };
    } else if (error.code === 60202) {
      return { success: false, verified: false, error: 'Trop de tentatives. Réessayez plus tard' };
    }

    return { success: false, verified: false, error: error.message || 'Erreur lors de la vérification' };
  }
}

/**
 * Envoie un SMS avec un message personnalisé (pour les codes générés par notre système)
 * @param phoneNumber Numéro de téléphone au format international (ex: +689XXXXXXXX)
 * @param message Message à envoyer
 * @returns Promise avec le status de l'envoi
 */
export async function sendSMSMessage(phoneNumber: string, message: string): Promise<{ success: boolean; error?: string }> {
  if (!twilioClient) {
    console.warn('[TWILIO] Tentative d\'envoi de SMS sans configuration Twilio');
    return { success: false, error: 'Twilio non configuré' };
  }

  try {
    // Normaliser le numéro de téléphone
    const normalizedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
    
    // Récupérer le numéro Twilio depuis les variables d'environnement
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    if (!fromNumber) {
      console.error('[TWILIO] ⚠️ TWILIO_PHONE_NUMBER non configuré');
      return { success: false, error: 'Numéro Twilio non configuré' };
    }

    console.log(`[TWILIO] Envoi de SMS à ${normalizedPhone} depuis ${fromNumber}`);

    const sms = await twilioClient.messages.create({
      body: message,
      from: fromNumber,
      to: normalizedPhone,
    });

    console.log(`[TWILIO] ✅ SMS envoyé - SID: ${sms.sid}, Status: ${sms.status}`);

    return { success: true };
  } catch (error: any) {
    console.error('[TWILIO] ❌ Erreur lors de l\'envoi du SMS:', error.message);
    
    // Gestion des erreurs spécifiques Twilio
    if (error.code === 21211) {
      return { success: false, error: 'Numéro de téléphone invalide' };
    } else if (error.code === 21608) {
      return { success: false, error: 'Numéro Twilio non autorisé' };
    }

    return { success: false, error: error.message || 'Erreur lors de l\'envoi du SMS' };
  }
}

/**
 * Vérifie si Twilio est configuré et disponible
 */
export function isTwilioConfigured(): boolean {
  return !!(twilioClient && TWILIO_VERIFY_SERVICE_SID);
}
