/** Shopkeeper order APIs from GET /v3/api-docs — Admin Order Controller. */
export const ADMIN_API_BASE = 'https://rapiffy-backend-1.onrender.com';

export type AdminOrderStatusAction = 'confirm' | 'ready' | 'out-for-delivery' | 'delivered';

export const adminAuthHeaders = (token: string): Record<string, string> => ({
  accept: '*/*',
  Authorization: `Bearer ${token}`,
});

export const adminOrderUrls = {
  list: (status?: string): string => {
    if (status && status !== 'ALL') {
      return `${ADMIN_API_BASE}/v1/admin/orders?status=${encodeURIComponent(status)}`;
    }
    return `${ADMIN_API_BASE}/v1/admin/orders`;
  },
  detail: (orderId: number): string => `${ADMIN_API_BASE}/v1/admin/orders/${orderId}`,
  confirm: (orderId: number): string => `${ADMIN_API_BASE}/v1/admin/orders/${orderId}/confirm`,
  ready: (orderId: number): string => `${ADMIN_API_BASE}/v1/admin/orders/${orderId}/ready`,
  outForDelivery: (orderId: number): string => `${ADMIN_API_BASE}/v1/admin/orders/${orderId}/out-for-delivery`,
  delivered: (orderId: number): string => `${ADMIN_API_BASE}/v1/admin/orders/${orderId}/delivered`,
  invoice: (orderId: number): string => `${ADMIN_API_BASE}/v1/admin/orders/${orderId}/invoice`,
  invoicePdf: (orderId: number): string => `${ADMIN_API_BASE}/v1/admin/orders/${orderId}/invoice/pdf`,
};

export const statusUpdateUrl = (orderId: number, action: AdminOrderStatusAction): string => {
  if (action === 'confirm') return adminOrderUrls.confirm(orderId);
  if (action === 'ready') return adminOrderUrls.ready(orderId);
  if (action === 'out-for-delivery') return adminOrderUrls.outForDelivery(orderId);
  return adminOrderUrls.delivered(orderId);
};
