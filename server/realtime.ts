import type { Server as SocketIOServer } from "socket.io";

let ioInstance: SocketIOServer | null = null;

export function setRealtimeIo(io: SocketIOServer) {
  ioInstance = io;
}

export function getRealtimeIo(): SocketIOServer | null {
  return ioInstance;
}

export type OrderRealtimeShape = {
  id: string;
  assignedDriverId?: string | null;
  clientName?: string | null;
  clientPhone?: string | null;
  totalPrice?: number | null;
  addresses?: unknown;
  scheduledTime?: string | Date | null;
  paymentMethod?: string | null;
  rideOption?: unknown;
};

export function getRentalOwnerDriverIdFromOrder(order: OrderRealtimeShape): string | null {
  const ro = (order.rideOption || {}) as any;
  return (
    order.assignedDriverId ||
    ro?.targetDriverId ||
    ro?.rentalDispatch?.targetDriverId ||
    ro?.rentalDispatch?.driverId ||
    null
  );
}

export function buildRentalCancelPayload(order: OrderRealtimeShape, extra: Record<string, any> = {}) {
  const ro = (order.rideOption || {}) as any;
  const addresses = Array.isArray(order.addresses) ? (order.addresses as any[]) : [];
  return {
    orderId: order.id,
    clientName: order.clientName || "Client",
    clientPhone: order.clientPhone || "",
    vehicleTitle: ro?.title || "Véhicule",
    totalPrice: order.totalPrice || 0,
    pickupLocation: addresses.find((a: any) => a?.type === "pickup")?.value || "",
    scheduledTime: order.scheduledTime || null,
    startDate: ro?.startDate || null,
    endDate: ro?.endDate || null,
    days: ro?.days || null,
    paymentMethod: order.paymentMethod || null,
    paid: ro?.payzenStatus === "paid",
    refund: ro?.refund || null,
    ...extra,
  };
}

export function emitRentalOrderRealtime(order: OrderRealtimeShape, event: string, payload: Record<string, any>) {
  if (!ioInstance) return;
  const ownerId = getRentalOwnerDriverIdFromOrder(order);
  ioInstance.to(`order:${order.id}`).emit(event, payload);
  if (ownerId) ioInstance.to(`driver:${ownerId}`).emit(event, payload);
}
