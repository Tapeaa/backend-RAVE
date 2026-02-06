/**
 * OneSignal Push Notifications Service
 * Pour envoyer des notifications aux clients et chauffeurs
 */

// Configuration OneSignal
const ONESIGNAL_CLIENT_APP_ID = process.env.ONESIGNAL_CLIENT_APP_ID || 'e5e23506-2176-47ce-9861-cae3b49ed002';
const ONESIGNAL_DRIVER_APP_ID = process.env.ONESIGNAL_DRIVER_APP_ID || '62d9a9ec-c62b-4aae-9cb3-e0d0c46ccfe8';
const ONESIGNAL_REST_API_KEY_CLIENT = process.env.ONESIGNAL_REST_API_KEY_CLIENT || 'os_v2_app_4xrdkbrbozd45gdbzlr3jhwqajiylevhmjmubkuidmk4t5hm257cn6sjvxwvop4hl3awr3bsmxdjymm3v2ksoa3av7f7565gqy3iq5y';
const ONESIGNAL_REST_API_KEY_DRIVER = process.env.ONESIGNAL_REST_API_KEY_DRIVER || 'os_v2_app_mlm2t3ggfnfk5hft4dimi3gp5calhcfqjaousav5fpssqw3wn7ketnnfx3o7gvxfzxxnsedwo25epl3xz6nk7t22b4tcdunorbcobii';

const ONESIGNAL_API_URL = 'https://onesignal.com/api/v1/notifications';
const ONESIGNAL_API_BASE = 'https://onesignal.com/api/v1';

// URL du logo TAPE'A pour les notifications
const TAPEA_LOGO_URL = 'https://back-end-tapea.onrender.com/logo.png';

interface NotificationPayload {
  title: string;
  message: string;
  data?: Record<string, any>;
  targetType: 'all' | 'user' | 'tag';
  targetValue?: string; // userId ou tag value
  tagKey?: string; // si targetType === 'tag'
}

/**
 * Envoie une notification aux CLIENTS
 */
export async function sendNotificationToClients(payload: NotificationPayload): Promise<boolean> {
  return sendNotification(ONESIGNAL_CLIENT_APP_ID, ONESIGNAL_REST_API_KEY_CLIENT, payload);
}

/**
 * Envoie une notification aux CHAUFFEURS
 */
export async function sendNotificationToDrivers(payload: NotificationPayload): Promise<boolean> {
  return sendNotification(ONESIGNAL_DRIVER_APP_ID, ONESIGNAL_REST_API_KEY_DRIVER, payload);
}

/**
 * Envoie une notification à un CLIENT spécifique (par son ID)
 */
export async function notifyClient(clientId: string, title: string, message: string, data?: Record<string, any>): Promise<boolean> {
  return sendNotificationToClients({
    title,
    message,
    data,
    targetType: 'user',
    targetValue: clientId,
  });
}

/**
 * Envoie une notification à un CHAUFFEUR spécifique (par son ID)
 */
export async function notifyDriver(driverId: string, title: string, message: string, data?: Record<string, any>): Promise<boolean> {
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
        'Authorization': `Basic ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();
    if (response.ok) {
      console.log(`[OneSignal] ✅ Live Activity ${event} sent`, result);
      return true;
    }
    console.error(`[OneSignal] ❌ Live Activity ${event} error:`, result);
    return false;
  } catch (error) {
    console.error('[OneSignal] ❌ Live Activity network error:', error);
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
    ONESIGNAL_CLIENT_APP_ID,
    ONESIGNAL_REST_API_KEY_CLIENT,
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
    ONESIGNAL_CLIENT_APP_ID,
    ONESIGNAL_REST_API_KEY_CLIENT,
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
    ONESIGNAL_CLIENT_APP_ID,
    ONESIGNAL_REST_API_KEY_CLIENT,
    activityType,
    activityId,
    'end',
    updates,
    clientId
  );
}

/**
 * Envoie une notification à TOUS les chauffeurs en ligne
 */
export async function notifyAllOnlineDrivers(title: string, message: string, data?: Record<string, any>): Promise<boolean> {
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
  // Chauffeur a accepté la course
  driverAccepted: (clientId: string, driverName: string, orderId: string) => 
    sendNotificationToClients({
      title: '🚕 Chauffeur en route !',
      message: `${driverName} a accepté votre course et arrive.`,
      data: { type: 'driver_accepted', orderId },
      targetType: 'user',
      targetValue: clientId,
    }),
  
  // Chauffeur est arrivé
  driverArrived: (clientId: string, driverName: string, orderId: string) => 
    sendNotificationToClients({
      title: `📍 ${driverName} vous attend`,
      message: `Temps d'attente gratuit: 5min. Au-delà des frais s'appliqueront.`,
      data: { type: 'driver_arrived', orderId },
      targetType: 'user',
      targetValue: clientId,
    }),
  
  // Course terminée
  rideCompleted: (clientId: string, amount: number, orderId: string) => 
    notifyClient(clientId, '✅ Course terminée', `Montant: ${amount.toLocaleString()} XPF. Merci d'avoir choisi TAPE'A !`, { 
      type: 'ride_completed', 
      orderId,
      amount 
    }),
  
  // Nouveau message du chauffeur
  newMessageFromDriver: (clientId: string, driverName: string, orderId: string) => 
    notifyClient(clientId, '💬 Nouveau message', `${driverName} vous a envoyé un message.`, { 
      type: 'new_message', 
      orderId 
    }),
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RÉSERVATION À L'AVANCE: Confirmation de réservation
  // ═══════════════════════════════════════════════════════════════════════════
  bookingConfirmed: (clientId: string, driverName: string, orderId: string, formattedDate: string, formattedTime: string) => 
    notifyClient(clientId, '📅 Réservation confirmée !', 
      `${driverName} a accepté votre réservation pour le ${formattedDate} à ${formattedTime}.`, { 
        type: 'booking_confirmed', 
        orderId 
      }),
  
  // Rappel 1 heure avant la réservation
  reservationIn1Hour: (clientId: string, driverName: string, orderId: string) => 
    notifyClient(clientId, '⏰ Votre course dans 1 heure', 
      `${driverName} vous prendra en charge bientôt. Préparez-vous !`, { 
        type: 'reservation_1hour', 
        orderId 
      }),
  
  // Rappel 30 minutes avant la réservation
  reservationIn30Min: (clientId: string, driverName: string, orderId: string) => 
    notifyClient(clientId, '⏰ Votre course dans 30 minutes', 
      `${driverName} sera bientôt en route pour vous chercher.`, { 
        type: 'reservation_30min', 
        orderId 
      }),
};

/**
 * Notifications prédéfinies pour les CHAUFFEURS
 */
export const driverNotifications = {
  // Nouvelle course disponible
  newOrder: (orderId: string, pickupAddress: string, price: number) => 
    sendNotificationToDrivers({
      title: '🚕 Nouvelle course !',
      message: `${pickupAddress} - ${price.toLocaleString()} XPF`,
      data: { type: 'new_order', orderId, price },
      targetType: 'tag',
      tagKey: 'status',
      targetValue: 'online',
    }),
  
  // Client a annulé
  clientCancelled: (driverId: string, orderId: string) => 
    notifyDriver(driverId, '❌ Course annulée', 'Le client a annulé la course.', { 
      type: 'order_cancelled', 
      orderId 
    }),
  
  // Nouveau message du client
  newMessageFromClient: (driverId: string, clientName: string, orderId: string) => 
    notifyDriver(driverId, '💬 Nouveau message', `${clientName} vous a envoyé un message.`, { 
      type: 'new_message', 
      orderId 
    }),
  
  // Paiement confirmé
  paymentConfirmed: (driverId: string, amount: number, orderId: string) => 
    notifyDriver(driverId, '💰 Paiement reçu !', `${amount.toLocaleString()} XPF crédités sur votre compte.`, { 
      type: 'payment_confirmed', 
      orderId,
      amount 
    }),
  
  // Rappel réservation dans 1 heure
  reservationIn1Hour: (driverId: string, clientName: string, orderId: string, pickupAddress: string) => 
    notifyDriver(driverId, '⏰ Réservation dans 1 heure', 
      `Course prévue avec ${clientName} - ${pickupAddress}`, { 
        type: 'reservation_1hour', 
        orderId 
      }),
  
  // Rappel réservation dans 30 minutes
  reservationIn30Min: (driverId: string, clientName: string, orderId: string, pickupAddress: string) => 
    notifyDriver(driverId, '⏰ Réservation dans 30 minutes', 
      `Préparez-vous ! Course avec ${clientName} - ${pickupAddress}`, { 
        type: 'reservation_30min', 
        orderId 
      }),
};

/**
 * Fonction générique d'envoi de notification
 */
async function sendNotification(appId: string, apiKey: string, payload: NotificationPayload): Promise<boolean> {
  if (!apiKey) {
    console.warn('[OneSignal] API Key not configured, skipping notification');
    return false;
  }

  try {
    const body: any = {
      app_id: appId,
      headings: { en: payload.title, fr: payload.title },
      contents: { en: payload.message, fr: payload.message },
      data: payload.data || {},
    };

    if (payload.data?.url && typeof payload.data.url === "string") {
      body.url = payload.data.url;
    }

    // Ciblage
    switch (payload.targetType) {
      case 'all':
        body.included_segments = ['All'];
        break;
      case 'user':
        body.include_external_user_ids = [payload.targetValue];
        break;
      case 'tag':
        body.filters = [
          { field: 'tag', key: payload.tagKey, relation: '=', value: payload.targetValue }
        ];
        break;
    }

    const response = await fetch(ONESIGNAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    if (response.ok) {
      console.log(`[OneSignal] ✅ Notification sent: ${payload.title}`, result);
      return true;
    } else {
      console.error(`[OneSignal] ❌ Error:`, result);
      return false;
    }
  } catch (error) {
    console.error('[OneSignal] ❌ Network error:', error);
    return false;
  }
}

export default {
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
