/**
 * OneSignal Push Notifications Service
 * Notifications push pour les apps RAVE Client et RAVE Loueur (SDK OneSignal v5).
 */

const DEFAULT_CLIENT_APP_ID = 'eecb391d-782e-4717-9d77-9c95a790c5ea';
const DEFAULT_DRIVER_APP_ID = 'e36c17b6-38b3-48a4-bc95-72502a18aa2b';

function getClientAppId(): string {
  return (process.env.ONESIGNAL_CLIENT_APP_ID || DEFAULT_CLIENT_APP_ID).trim();
}

function getDriverAppId(): string {
  return (process.env.ONESIGNAL_DRIVER_APP_ID || DEFAULT_DRIVER_APP_ID).trim();
}

function getClientApiKey(): string {
  return (process.env.ONESIGNAL_REST_API_KEY_CLIENT || '').trim();
}

function getDriverApiKey(): string {
  return (process.env.ONESIGNAL_REST_API_KEY_DRIVER || '').trim();
}

/**
 * Construit l'en-tête Authorization compatible avec :
 * - les nouvelles clés REST OneSignal v2 (`os_v2_app_...` / `os_v2_org_...`) → `Key <token>`
 * - les anciennes clés REST héritées → `Basic <token>`
 * - une valeur déjà préfixée par `Key ` ou `Basic ` dans les variables d'environnement
 */
function buildAuthHeader(rawApiKey: string): string {
  const key = rawApiKey.trim();
  if (/^(Key|Basic)\s+/i.test(key)) return key;
  if (key.startsWith('os_v2_')) return `Key ${key}`;
  return `Basic ${key}`;
}

const ONESIGNAL_API_URL = 'https://api.onesignal.com/notifications?c=push';
const ONESIGNAL_API_BASE = 'https://api.onesignal.com';

// URL du logo RAVE pour les notifications
const RAVE_LOGO_URL = process.env.RAVE_LOGO_URL || 'https://backend-rave.onrender.com/logo.png';

export function getOneSignalConfigStatus() {
  const clientAppId = getClientAppId();
  const driverAppId = getDriverAppId();
  const clientKey = getClientApiKey();
  const driverKey = getDriverApiKey();
  return {
    client: {
      configured: Boolean(clientAppId && clientKey),
      appId: clientAppId || null,
      hasRestApiKey: Boolean(clientKey),
    },
    driver: {
      configured: Boolean(driverAppId && driverKey),
      appId: driverAppId || null,
      hasRestApiKey: Boolean(driverKey),
    },
  };
}

interface NotificationPayload {
  title: string;
  message: string;
  data?: Record<string, any>;
  targetType: 'all' | 'user' | 'tag';
  targetValue?: string; // external_id ou tag value
  tagKey?: string; // si targetType === 'tag'
}

/**
 * Envoie une notification aux CLIENTS
 */
export async function sendNotificationToClients(payload: NotificationPayload): Promise<boolean> {
  return sendNotification('client', getClientAppId(), getClientApiKey(), payload);
}

/**
 * Envoie une notification aux LOUEURS
 */
export async function sendNotificationToDrivers(payload: NotificationPayload): Promise<boolean> {
  return sendNotification('driver', getDriverAppId(), getDriverApiKey(), payload);
}

/**
 * Envoie une notification à un CLIENT spécifique (par son ID = external_id OneSignal)
 */
export async function notifyClient(
  clientId: string,
  title: string,
  message: string,
  data?: Record<string, any>
): Promise<boolean> {
  if (!clientId) return false;
  return sendNotificationToClients({
    title,
    message,
    data,
    targetType: 'user',
    targetValue: clientId,
  });
}

/**
 * Envoie une notification à un LOUEUR spécifique (par son ID = external_id OneSignal)
 */
export async function notifyDriver(
  driverId: string,
  title: string,
  message: string,
  data?: Record<string, any>
): Promise<boolean> {
  if (!driverId) return false;
  return sendNotificationToDrivers({
    title,
    message,
    data,
    targetType: 'user',
    targetValue: driverId,
  });
}

type LiveActivityEvent = 'start' | 'update' | 'end';

async function sendLiveActivityEvent(
  appId: string,
  apiKey: string,
  activityType: string,
  activityId: string,
  event: LiveActivityEvent,
  updates: Record<string, any>,
  externalUserId: string
): Promise<boolean> {
  if (!apiKey || !appId) {
    console.warn('[OneSignal] Live Activity keys not configured, skipping');
    return false;
  }

  const endpoint =
    event === 'start'
      ? `${ONESIGNAL_API_BASE}/apps/${appId}/activities/activity/${activityType}`
      : `${ONESIGNAL_API_BASE}/apps/${appId}/live_activities/${activityId}/notifications`;

  const body: any = {
    app_id: appId,
    event,
    activity_id: activityId,
    event_updates: updates,
    contents: { en: ' ', fr: ' ' },
    include_aliases: { external_id: [externalUserId] },
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: buildAuthHeader(apiKey),
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();
    if (response.ok) {
      console.log(`[OneSignal] Live Activity ${event} sent`, result);
      return true;
    }
    console.error(`[OneSignal] Live Activity ${event} error:`, result);
    return false;
  } catch (error) {
    console.error('[OneSignal] Live Activity network error:', error);
    return false;
  }
}

export async function startClientLiveActivity(
  clientId: string,
  activityType: string,
  activityId: string,
  updates: Record<string, any>
): Promise<boolean> {
  return sendLiveActivityEvent(
    getClientAppId(),
    getClientApiKey(),
    activityType,
    activityId,
    'start',
    updates,
    clientId
  );
}

export async function updateClientLiveActivity(
  clientId: string,
  activityType: string,
  activityId: string,
  updates: Record<string, any>
): Promise<boolean> {
  return sendLiveActivityEvent(
    getClientAppId(),
    getClientApiKey(),
    activityType,
    activityId,
    'update',
    updates,
    clientId
  );
}

export async function endClientLiveActivity(
  clientId: string,
  activityType: string,
  activityId: string,
  updates: Record<string, any>
): Promise<boolean> {
  return sendLiveActivityEvent(
    getClientAppId(),
    getClientApiKey(),
    activityType,
    activityId,
    'end',
    updates,
    clientId
  );
}

/**
 * Envoie une notification à TOUS les loueurs connectés (tag status=online)
 */
export async function notifyAllOnlineDrivers(
  title: string,
  message: string,
  data?: Record<string, any>
): Promise<boolean> {
  return sendNotificationToDrivers({
    title,
    message,
    data,
    targetType: 'tag',
    tagKey: 'status',
    targetValue: 'online',
  });
}

/**
 * Notifications prédéfinies pour les CLIENTS
 */
export const clientNotifications = {
  driverAccepted: (clientId: string, driverName: string, orderId: string) =>
    notifyClient(
      clientId,
      '🚗 Location acceptée !',
      `${driverName} a validé votre demande de location.`,
      { type: 'driver_accepted', orderId }
    ),

  driverArrived: (clientId: string, driverName: string, orderId: string) =>
    notifyClient(
      clientId,
      `📍 ${driverName} vous attend`,
      'Votre loueur est prêt pour la remise du véhicule.',
      { type: 'driver_arrived', orderId }
    ),

  rideCompleted: (clientId: string, amount: number, orderId: string) =>
    notifyClient(
      clientId,
      '✅ Location terminée',
      `Montant : ${amount.toLocaleString('fr-FR')} XPF. Merci d'avoir choisi RAVE !`,
      { type: 'ride_completed', orderId, amount }
    ),

  newMessageFromDriver: (clientId: string, driverName: string, orderId: string) =>
    notifyClient(
      clientId,
      '💬 Nouveau message',
      `${driverName || 'Votre loueur'} vous a envoyé un message.`,
      { type: 'new_message', orderId }
    ),

  bookingConfirmed: (
    clientId: string,
    driverName: string,
    orderId: string,
    formattedDate: string,
    formattedTime: string
  ) =>
    notifyClient(
      clientId,
      '📅 Location confirmée !',
      `${driverName} a accepté votre location pour le ${formattedDate} à ${formattedTime}.`,
      { type: 'booking_confirmed', orderId }
    ),

  reservationIn1Hour: (clientId: string, driverName: string, orderId: string) =>
    notifyClient(
      clientId,
      '⏰ Votre location dans 1 heure',
      `Remise du véhicule prévue avec ${driverName} dans environ 1 heure.`,
      { type: 'reservation_1hour', orderId }
    ),

  reservationIn30Min: (clientId: string, driverName: string, orderId: string) =>
    notifyClient(
      clientId,
      '⏰ Votre location dans 30 minutes',
      `Remise du véhicule prévue avec ${driverName} dans 30 minutes.`,
      { type: 'reservation_30min', orderId }
    ),

  meetingPointSet: (
    clientId: string,
    meetingPoint: string,
    orderId: string,
    driverName?: string
  ) =>
    notifyClient(
      clientId,
      '📍 Lieu de récupération',
      `${driverName ? `${driverName} : ` : ''}${meetingPoint}`,
      { type: 'rental_meeting_point', orderId, meetingPoint }
    ),

  rentalHandedOver: (clientId: string, orderId: string, vehicleTitle?: string) =>
    notifyClient(
      clientId,
      '🔑 Véhicule remis',
      `Bonne route avec ${vehicleTitle || 'votre véhicule'} !`,
      { type: 'rental_handed_over', orderId }
    ),

  rentalCompleted: (clientId: string, orderId: string, vehicleTitle?: string) =>
    notifyClient(
      clientId,
      '✅ Véhicule restitué',
      `Le retour de ${vehicleTitle || 'votre véhicule'} est confirmé. Vous pouvez laisser un avis !`,
      { type: 'rental_completed', orderId }
    ),

  rentalDeclined: (clientId: string, driverName: string, orderId: string) =>
    notifyClient(
      clientId,
      'Demande refusée',
      `${driverName || 'Le loueur'} a refusé votre demande de location.`,
      { type: 'rental_declined', orderId }
    ),

  rentalCancelApproved: (clientId: string, orderId: string) =>
    notifyClient(
      clientId,
      'Annulation acceptée',
      "Le loueur a accepté votre demande d'annulation.",
      { type: 'rental_cancel_approved', orderId }
    ),

  rentalCancelRejected: (clientId: string, orderId: string) =>
    notifyClient(
      clientId,
      'Annulation refusée',
      "Le loueur a refusé votre demande d'annulation. Votre location est maintenue.",
      { type: 'rental_cancel_rejected', orderId }
    ),

  rentalCancelledByLoueur: (clientId: string, orderId: string) =>
    notifyClient(clientId, 'Location annulée', 'Le loueur a annulé votre location.', {
      type: 'rental_cancelled_by_loueur',
      orderId,
    }),

  rentalExpired: (clientId: string, orderId: string, refundPending = false) =>
    notifyClient(
      clientId,
      'Demande expirée',
      refundPending
        ? "Le loueur n'a pas répondu à temps. Votre demande a expiré et le loueur va vous rembourser."
        : "Le loueur n'a pas répondu à temps. Votre demande de location a expiré.",
      { type: 'rental_expired', orderId }
    ),

  rentalRefunded: (clientId: string, orderId: string, amount: number) =>
    notifyClient(
      clientId,
      'Remboursement effectué',
      `Votre remboursement de ${amount.toLocaleString('fr-FR')} XPF a été confirmé.`,
      { type: 'rental_refunded', orderId }
    ),
};

/**
 * Notifications prédéfinies pour les LOUEURS
 */
export const driverNotifications = {
  newOrder: (orderId: string, description: string, price: number) =>
    sendNotificationToDrivers({
      title: '🚗 Nouvelle demande !',
      message: `${description} - ${price.toLocaleString('fr-FR')} XPF`,
      data: { type: 'new_order', orderId, price },
      targetType: 'tag',
      tagKey: 'status',
      targetValue: 'online',
    }),

  /** Nouvelle demande de location ciblée vers un loueur (external_id = driverId) */
  newRentalOrder: (driverId: string, orderId: string, description: string, price: number) =>
    notifyDriver(
      driverId,
      '🚗 Nouvelle demande de location !',
      `${description} — ${price.toLocaleString('fr-FR')} XPF`,
      { type: 'new_rental_order', orderId, price }
    ),

  rentalCancelRequest: (
    driverId: string,
    orderId: string,
    clientName: string,
    vehicleTitle: string
  ) =>
    notifyDriver(
      driverId,
      "⚠️ Demande d'annulation",
      `${clientName} souhaite annuler la location ${vehicleTitle}. Validez ou refusez.`,
      { type: 'rental_cancel_request', orderId }
    ),

  rentalCancelledByClient: (
    driverId: string,
    orderId: string,
    clientName: string,
    vehicleTitle: string
  ) =>
    notifyDriver(
      driverId,
      '❌ Demande annulée',
      `${clientName} a annulé sa demande pour ${vehicleTitle}.`,
      { type: 'rental_cancelled_by_client', orderId }
    ),

  rentalExpired: (
    driverId: string,
    orderId: string,
    vehicleTitle: string,
    refundPending = false
  ) =>
    notifyDriver(
      driverId,
      refundPending ? '💸 Demande expirée — remboursement à faire' : '⌛ Demande expirée',
      refundPending
        ? `La demande pour ${vehicleTitle} a expiré. Remboursez le client puis confirmez dans Réservations → Passées.`
        : `La demande pour ${vehicleTitle} a expiré faute de réponse à temps.`,
      { type: 'rental_expired', orderId, refundPending }
    ),

  rentalHandedOverByClient: (
    driverId: string,
    orderId: string,
    clientName: string,
    vehicleTitle?: string
  ) =>
    notifyDriver(
      driverId,
      '🔑 Remise confirmée par le client',
      `${clientName} a confirmé la prise en charge de ${vehicleTitle || 'votre véhicule'}.`,
      { type: 'rental_handed_over', orderId }
    ),

  rentalReturnedByClient: (
    driverId: string,
    orderId: string,
    clientName: string,
    vehicleTitle?: string
  ) =>
    notifyDriver(
      driverId,
      '✅ Retour confirmé par le client',
      `${clientName} a confirmé la restitution de ${vehicleTitle || 'votre véhicule'}.`,
      { type: 'rental_completed', orderId }
    ),

  clientCancelled: (driverId: string, orderId: string) =>
    notifyDriver(driverId, '❌ Réservation annulée', 'Le client a annulé la réservation.', {
      type: 'order_cancelled',
      orderId,
    }),

  newMessageFromClient: (driverId: string, clientName: string, orderId: string) =>
    notifyDriver(
      driverId,
      '💬 Nouveau message',
      `${clientName || 'Le client'} vous a envoyé un message.`,
      { type: 'new_message', orderId }
    ),

  paymentConfirmed: (driverId: string, amount: number, orderId: string) =>
    notifyDriver(
      driverId,
      '💰 Paiement carte confirmé !',
      `${amount.toLocaleString('fr-FR')} XPF réglés en ligne.`,
      { type: 'payment_confirmed', orderId, amount }
    ),

  reservationIn1Hour: (
    driverId: string,
    clientName: string,
    orderId: string,
    pickupAddress: string
  ) =>
    notifyDriver(
      driverId,
      '⏰ Location dans 1 heure',
      `Remise prévue avec ${clientName}${pickupAddress ? ` — ${pickupAddress}` : ''}`,
      { type: 'reservation_1hour', orderId }
    ),

  reservationIn30Min: (
    driverId: string,
    clientName: string,
    orderId: string,
    pickupAddress: string
  ) =>
    notifyDriver(
      driverId,
      '⏰ Location dans 30 minutes',
      `Préparez la remise avec ${clientName}${pickupAddress ? ` — ${pickupAddress}` : ''}`,
      { type: 'reservation_30min', orderId }
    ),
};

/**
 * Fonction générique d'envoi de notification OneSignal (compatible SDK v5 / User Model v2)
 */
const lastPushResult: Record<'client' | 'driver', unknown> = { client: null, driver: null };

export function getLastPushResult(channel: 'client' | 'driver'): unknown {
  return lastPushResult[channel];
}

async function sendNotification(
  channelLabel: 'client' | 'driver',
  appId: string,
  apiKey: string,
  payload: NotificationPayload
): Promise<boolean> {
  if (!apiKey || !appId) {
    console.warn(
      `[OneSignal:${channelLabel}] Clés manquantes (appId=${Boolean(appId)}, apiKey=${Boolean(apiKey)}), notification ignorée : ${payload.title}`
    );
    return false;
  }

  try {
    const body: any = {
      app_id: appId,
      target_channel: 'push',
      headings: { en: payload.title, fr: payload.title },
      contents: { en: payload.message, fr: payload.message },
      data: payload.data || {},
      chrome_web_icon: RAVE_LOGO_URL,
      large_icon: RAVE_LOGO_URL,
      ios_badgeType: 'Increase',
      ios_badgeCount: 1,
    };

    // OneSignal rejette toute valeur `url` qui n'est pas une URL complète http(s)://
    if (
      payload.data?.url &&
      typeof payload.data.url === 'string' &&
      /^https?:\/\//i.test(payload.data.url)
    ) {
      body.url = payload.data.url;
    }

    switch (payload.targetType) {
      case 'all':
        body.included_segments = ['All'];
        break;
      case 'user':
        if (!payload.targetValue) return false;
        body.include_aliases = { external_id: [payload.targetValue] };
        break;
      case 'tag':
        body.filters = [
          { field: 'tag', key: payload.tagKey, relation: '=', value: payload.targetValue },
        ];
        break;
    }

    const response = await fetch(ONESIGNAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: buildAuthHeader(apiKey),
      },
      body: JSON.stringify(body),
    });

    const result = await response.json().catch(() => ({}));
    lastPushResult[channelLabel] = {
      httpStatus: response.status,
      appId,
      authScheme: buildAuthHeader(apiKey).split(' ')[0],
      target: body.include_aliases || body.filters || body.included_segments,
      response: result,
    };

    if (response.ok && !result?.errors?.invalid_aliases) {
      console.log(`[OneSignal:${channelLabel}] ✅ Notification envoyée: "${payload.title}"`, {
        id: result?.id || null,
        recipients: result?.recipients,
      });
      return Boolean(result?.id);
    } else {
      console.warn(`[OneSignal:${channelLabel}] ⚠️ Réponse OneSignal:`, result);
      return false;
    }
  } catch (error) {
    console.error(`[OneSignal:${channelLabel}] ❌ Erreur réseau:`, error);
    return false;
  }
}

export default {
  getOneSignalConfigStatus,
  sendNotificationToClients,
  sendNotificationToDrivers,
  notifyClient,
  notifyDriver,
  startClientLiveActivity,
  updateClientLiveActivity,
  endClientLiveActivity,
  notifyAllOnlineDrivers,
  clientNotifications,
  driverNotifications,
};
