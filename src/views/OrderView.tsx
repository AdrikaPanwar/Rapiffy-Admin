import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { BottomNavBar } from '../components/BottomNavBar';
import { adminAuthHeaders, adminOrderUrls, statusUpdateUrl, type AdminOrderStatusAction } from '../api/adminOrders';

const STATUS_FILTERS = [
  'ALL',
  'PAYMENT_PENDING',
  'PENDING',
  'CONFIRMED',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'REJECTED',
] as const;

type OrderStatusFilter = (typeof STATUS_FILTERS)[number];

export interface OrderSummary {
  orderId: number;
  orderNumber: string;
  customerPhone: string;
  customerName: string;
  subtotal: number;
  totalGst: number;
  deliveryCharge: number;
  totalAmount: number;
  totalItems: number;
  status: string;
  deliveryType: string;
  createdAt: string;
}

export interface OrderLineItem {
  orderItemId: number;
  shopProductId: number | null;
  productName: string;
  brand: string;
  unit: string;
  unitValue: string;
  imageUrl: string | null;
  mrp: number;
  sellingPrice: number;
  quantity: number;
  gstSlab: string;
  gstAmount: number;
  lineTotal: number;
}

export interface OrderDetail {
  orderId: number;
  orderNumber: string;
  invoiceId: string;
  customerPhone: string;
  customerName: string;
  shopName: string;
  items: OrderLineItem[];
  subtotal: number;
  totalGst: number;
  deliveryCharge: number;
  totalAmount: number;
  deliveryType: string;
  deliveryAddress: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceInfo {
  invoiceId: string;
  orderNumber: string;
  invoiceDate: string;
  shopName: string;
  shopAddress: string;
  shopGstNumber: string;
  shopPhone: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  items: OrderLineItem[];
  subtotal: number;
  totalGst: number;
  deliveryCharge: number;
  totalAmount: number;
  deliveryType: string;
}

export interface OrderViewProps {
  onNavigate?: (screen: 'login' | 'forgot_password' | 'home' | 'category' | 'coverage' | 'order' | 'profile') => void;
  authToken?: string;
}

const STATUS_COLORS: Record<string, string> = {
  PAYMENT_PENDING: '#B8860B',
  PENDING: '#D2691E',
  CONFIRMED: '#2E7D32',
  READY: '#1565C0',
  OUT_FOR_DELIVERY: '#6A1B9A',
  DELIVERED: '#137A63',
  CANCELLED: '#8A7A6A',
  REJECTED: '#C62828',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const getStatusColor = (status: string): string => STATUS_COLORS[status] || '#5C4033';

const prettyStatus = (status: string): string => String(status || '').replace(/_/g, ' ');

const formatMoney = (value: number): string => {
  const n = Number(value);
  if (isNaN(n)) return '₹0.00';
  return `₹${n.toFixed(2)}`;
};

const formatDate = (iso: string): string => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const day = d.getDate();
  const month = MONTHS[d.getMonth()];
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`;
};

const toNumber = (value: any, fallback = 0): number => {
  const n = Number(value);
  return isNaN(n) ? fallback : n;
};

const normalizeSummary = (raw: any): OrderSummary | null => {
  if (!raw || typeof raw !== 'object') return null;
  const orderId = toNumber(raw.orderId, NaN);
  if (isNaN(orderId)) return null;
  return {
    orderId,
    orderNumber: String(raw.orderNumber || ''),
    customerPhone: String(raw.customerPhone || ''),
    customerName: String(raw.customerName || ''),
    subtotal: toNumber(raw.subtotal),
    totalGst: toNumber(raw.totalGst),
    deliveryCharge: toNumber(raw.deliveryCharge),
    totalAmount: toNumber(raw.totalAmount),
    totalItems: toNumber(raw.totalItems),
    status: String(raw.status || ''),
    deliveryType: String(raw.deliveryType || ''),
    createdAt: String(raw.createdAt || ''),
  };
};

const parseJson = (text: string): any => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const unwrapObject = (payload: any): any => {
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    return payload.data;
  }
  return payload;
};

const unwrapList = (payload: any): any[] | null => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return null;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.content)) return payload.content;
  if (Array.isArray(payload.orders)) return payload.orders;
  if (Array.isArray(payload.items)) return payload.items;
  return null;
};

const readMessage = (payload: any, fallback: string): string => {
  if (payload && typeof payload === 'object') {
    if (typeof payload.message === 'string' && payload.message.trim()) return payload.message;
    if (typeof payload.error === 'string' && payload.error.trim()) return payload.error;
  }
  return fallback;
};

const normalizeLineItem = (raw: any): OrderLineItem | null => {
  if (!raw || typeof raw !== 'object') return null;
  const orderItemId = toNumber(raw.orderItemId, NaN);
  if (isNaN(orderItemId)) return null;
  return {
    orderItemId,
    shopProductId: raw.shopProductId == null ? null : toNumber(raw.shopProductId),
    productName: String(raw.productName || 'Item'),
    brand: String(raw.brand || ''),
    unit: String(raw.unit || ''),
    unitValue: String(raw.unitValue || ''),
    imageUrl: typeof raw.imageUrl === 'string' ? raw.imageUrl : null,
    mrp: toNumber(raw.mrp),
    sellingPrice: toNumber(raw.sellingPrice),
    quantity: toNumber(raw.quantity),
    gstSlab: String(raw.gstSlab || ''),
    gstAmount: toNumber(raw.gstAmount),
    lineTotal: toNumber(raw.lineTotal),
  };
};

const normalizeDetail = (raw: any, fallback: OrderSummary): OrderDetail => {
  const source = unwrapObject(raw) || {};
  const itemsSource = Array.isArray(source.items) ? source.items : [];
  return {
    orderId: toNumber(source.orderId, fallback.orderId),
    orderNumber: String(source.orderNumber || fallback.orderNumber || ''),
    invoiceId: String(source.invoiceId || ''),
    customerPhone: String(source.customerPhone || fallback.customerPhone || ''),
    customerName: String(source.customerName || fallback.customerName || ''),
    shopName: String(source.shopName || ''),
    items: itemsSource.map(normalizeLineItem).filter((item: OrderLineItem | null): item is OrderLineItem => item !== null),
    subtotal: toNumber(source.subtotal, fallback.subtotal),
    totalGst: toNumber(source.totalGst, fallback.totalGst),
    deliveryCharge: toNumber(source.deliveryCharge, fallback.deliveryCharge),
    totalAmount: toNumber(source.totalAmount, fallback.totalAmount),
    deliveryType: String(source.deliveryType || fallback.deliveryType || ''),
    deliveryAddress: String(source.deliveryAddress || ''),
    status: String(source.status || fallback.status || ''),
    createdAt: String(source.createdAt || fallback.createdAt || ''),
    updatedAt: String(source.updatedAt || ''),
  };
};

const normalizeInvoice = (raw: any): InvoiceInfo | null => {
  const source = unwrapObject(raw);
  if (!source || typeof source !== 'object') return null;
  const itemsSource = Array.isArray(source.items) ? source.items : [];
  return {
    invoiceId: String(source.invoiceId || ''),
    orderNumber: String(source.orderNumber || ''),
    invoiceDate: String(source.invoiceDate || ''),
    shopName: String(source.shopName || ''),
    shopAddress: String(source.shopAddress || ''),
    shopGstNumber: String(source.shopGstNumber || ''),
    shopPhone: String(source.shopPhone || ''),
    customerName: String(source.customerName || ''),
    customerPhone: String(source.customerPhone || ''),
    deliveryAddress: String(source.deliveryAddress || ''),
    deliveryType: String(source.deliveryType || ''),
    items: itemsSource.map(normalizeLineItem).filter((item: OrderLineItem | null): item is OrderLineItem => item !== null),
    subtotal: toNumber(source.subtotal),
    totalGst: toNumber(source.totalGst),
    deliveryCharge: toNumber(source.deliveryCharge),
    totalAmount: toNumber(source.totalAmount),
  };
};

const itemStockKey = (orderId: number, orderItemId: number): string => `${orderId}:${orderItemId}`;

const ChevronIcon = ({ open }: { open: boolean }) => (
  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5C4033" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    {open ? <Path d="m18 15-6-6-6 6" /> : <Path d="m6 9 6 6 6-6" />}
  </Svg>
);

const CheckIcon = () => (
  <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 6 9 17l-5-5" />
  </Svg>
);

const TrackCheckIcon = () => (
  <Svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 6 9 17l-5-5" />
  </Svg>
);

const PinIcon = () => (
  <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D2691E" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <Path d="M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
  </Svg>
);

type StatusAction = AdminOrderStatusAction;

const TRACK_STEPS = [
  { key: 'CONFIRMED', label: 'Ordered' },
  { key: 'READY', label: 'Ready' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery' },
  { key: 'DELIVERED', label: 'Delivered' },
] as const;

const STATUS_RANK: Record<string, number> = {
  PAYMENT_PENDING: 0,
  PENDING: 0,
  CONFIRMED: 1,
  READY: 2,
  OUT_FOR_DELIVERY: 3,
  DELIVERED: 4,
  CANCELLED: -1,
  REJECTED: -1,
};

const ACTION_COPY: Record<StatusAction, { title: string; text: string; button: string; hint: string }> = {
  confirm: {
    title: 'Confirm this order?',
    text: 'This confirms the order and deducts stock. The customer app will show Ordered.',
    button: 'Confirm order',
    hint: 'You confirm the order here. This deducts stock. The customer app will show Ordered.',
  },
  ready: {
    title: 'Mark as ready?',
    text: 'You are marking this packed and ready. The customer app will show Ready.',
    button: 'Mark ready',
    hint: 'You mark Ready after packing. The customer app will show this step.',
  },
  'out-for-delivery': {
    title: 'Mark out for delivery?',
    text: 'You are sending this order out. The customer app will show Out for Delivery.',
    button: 'Mark out for delivery',
    hint: 'You mark Out for Delivery when it leaves the shop. The customer app will show this step.',
  },
  delivered: {
    title: 'Mark as delivered?',
    text: 'You are completing this order. The customer app will show Delivered.',
    button: 'Mark delivered',
    hint: 'You mark Delivered when the customer has received it. The customer app will show this step.',
  },
};

const getStatusRank = (status: string): number => {
  const key = String(status || '').toUpperCase();
  return STATUS_RANK[key] ?? 0;
};

const TRACK_DOT_SIZE = 26;
const TRACK_LINE_THICKNESS = 3;
const TRACK_LINE_TOP = (TRACK_DOT_SIZE - TRACK_LINE_THICKNESS) / 2;
const TRACK_LINE_START_PCT = 100 / TRACK_STEPS.length / 2;
const TRACK_LINE_SPAN_PCT = 100 - 100 / TRACK_STEPS.length;

const getTrackLineWidthPct = (rank: number, blocked: boolean): number => {
  if (blocked) return 0;
  const filled = Math.max(0, Math.min(rank, TRACK_STEPS.length));
  if (filled <= 0) return 0;
  const segmentsReached = Math.min(filled, TRACK_STEPS.length - 1);
  return TRACK_LINE_SPAN_PCT * (segmentsReached / (TRACK_STEPS.length - 1));
};

const preferStatus = (current: string, incoming: string): string => {
  const cur = String(current || '').toUpperCase();
  const next = String(incoming || '').toUpperCase();
  if (!next) return cur;
  if (!cur) return next;
  if (next === 'CANCELLED' || next === 'REJECTED' || cur === 'CANCELLED' || cur === 'REJECTED') {
    return next;
  }
  return getStatusRank(next) >= getStatusRank(cur) ? next : cur;
};

const getStepAction = (status: string, stepKey: string): StatusAction | null => {
  const current = String(status || '').toUpperCase();
  if (stepKey === 'CONFIRMED' && current === 'PENDING') return 'confirm';
  if (stepKey === 'READY' && current === 'CONFIRMED') return 'ready';
  if (stepKey === 'OUT_FOR_DELIVERY' && current === 'READY') return 'out-for-delivery';
  if (stepKey === 'DELIVERED' && current === 'OUT_FOR_DELIVERY') return 'delivered';
  return null;
};

const getNextAction = (status: string): StatusAction | null =>
  getStepAction(status, 'CONFIRMED')
  || getStepAction(status, 'READY')
  || getStepAction(status, 'OUT_FOR_DELIVERY')
  || getStepAction(status, 'DELIVERED');

interface OrderStatusTrackerProps {
  status: string;
  busy?: boolean;
  compact?: boolean;
  onAdvance?: (action: StatusAction) => void;
}

const OrderStatusTracker = ({ status, busy = false, compact = false, onAdvance }: OrderStatusTrackerProps) => {
  const rank = getStatusRank(status);
  const blocked = rank < 0;
  const nextAction = getNextAction(status);
  const lineWidthPct = getTrackLineWidthPct(rank, blocked);

  return (
    <View style={[styles.trackBox, compact && styles.trackBoxCompact]}>
      <Text style={styles.trackTitle}>ORDER STATUS</Text>
      {compact ? null : (
        <Text style={styles.trackOwnerHint}>You mark each step here. The customer app shows the same status.</Text>
      )}
      <View style={styles.trackRow}>
        <View pointerEvents="none" style={styles.trackLineLayer}>
          <View style={[styles.trackBaseLine, { left: `${TRACK_LINE_START_PCT}%`, width: `${TRACK_LINE_SPAN_PCT}%` }]} />
          {lineWidthPct > 0 ? (
            <View style={[styles.trackProgressLine, { left: `${TRACK_LINE_START_PCT}%`, width: `${lineWidthPct}%` }]} />
          ) : null}
        </View>
        {TRACK_STEPS.map((step, index) => {
          const stepRank = index + 1;
          const done = !blocked && rank >= stepRank;
          const action = blocked ? null : getStepAction(status, step.key);
          const isNext = Boolean(action);

          return (
            <TouchableOpacity
              key={step.key}
              style={styles.trackStep}
              disabled={!action || busy}
              hitSlop={action ? { top: 8, bottom: 8, left: 4, right: 4 } : undefined}
              accessibilityRole={action ? 'button' : 'text'}
              accessibilityLabel={action ? `Mark ${step.label}` : step.label}
              onPress={() => {
                if (action && onAdvance) onAdvance(action);
              }}
              activeOpacity={action ? 0.7 : 1}
            >
              <View style={styles.trackDotRow}>
                <View
                  style={[
                    styles.trackDot,
                    done && styles.trackDotDone,
                    isNext && styles.trackDotNext,
                    !done && !isNext && styles.trackDotIdle,
                  ]}
                >
                  {busy && isNext ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : done ? (
                    <TrackCheckIcon />
                  ) : null}
                </View>
              </View>
              <Text
                style={[
                  styles.trackLabel,
                  done && styles.trackLabelDone,
                  isNext && styles.trackLabelNext,
                ]}
                numberOfLines={2}
              >
                {step.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {blocked ? (
        <Text style={styles.trackHint}>This order is {prettyStatus(status).toLowerCase()} and cannot be moved forward.</Text>
      ) : nextAction ? (
        <Text style={styles.trackHint}>
          {compact ? 'Tap the orange step to update the customer app.' : ACTION_COPY[nextAction].hint}
        </Text>
      ) : compact ? null : rank >= 4 ? (
        <Text style={styles.trackHint}>This order is delivered. The customer app already shows this step.</Text>
      ) : String(status || '').toUpperCase() === 'PAYMENT_PENDING' ? (
        <Text style={styles.trackHint}>Payment is still pending. You can mark Ordered after payment.</Text>
      ) : (
        <Text style={styles.trackHint}>Tap the next orange step to update the customer app.</Text>
      )}
    </View>
  );
};

interface DetailRowProps {
  label: string;
  value: string;
}

const DetailRow = ({ label, value }: DetailRowProps) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue}>{value}</Text>
  </View>
);

export const OrderView: React.FC<OrderViewProps> = ({ onNavigate, authToken }) => {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<OrderStatusFilter>('ALL');
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [outOfStockIds, setOutOfStockIds] = useState<Set<number>>(new Set());
  const [outOfStockItemKeys, setOutOfStockItemKeys] = useState<Set<string>>(new Set());
  const [orderDetails, setOrderDetails] = useState<Record<number, OrderDetail>>({});
  const [invoices, setInvoices] = useState<Record<number, InvoiceInfo>>({});
  const [detailLoadingIds, setDetailLoadingIds] = useState<Set<number>>(new Set());
  const [detailErrorById, setDetailErrorById] = useState<Record<number, string>>({});
  const [invoiceErrorById, setInvoiceErrorById] = useState<Record<number, string>>({});
  const [pdfLoadingIds, setPdfLoadingIds] = useState<Set<number>>(new Set());
  const [statusUpdatingIds, setStatusUpdatingIds] = useState<Set<number>>(new Set());
  const [pendingActionById, setPendingActionById] = useState<Record<number, StatusAction>>({});
  const orderDetailsRef = useRef<Record<number, OrderDetail>>({});
  orderDetailsRef.current = orderDetails;

  const resolveToken = useCallback(async (): Promise<string | null> => {
    const fromProp = authToken && authToken.trim() !== '' ? authToken.trim() : '';
    if (fromProp) return fromProp;
    const stored = await AsyncStorage.getItem('user_auth_token');
    const cleaned = stored ? stored.trim() : '';
    return cleaned || null;
  }, [authToken]);

  const fetchOrders = useCallback(
    async (
      statusFilter: OrderStatusFilter,
      mode: 'initial' | 'refresh' | 'silent' = 'initial',
      signal?: AbortSignal,
    ) => {
      const token = await resolveToken();

      if (signal?.aborted) return;

      if (!token) {
        if (mode === 'silent') return;
        setErrorMessage('You are not logged in. Please sign in again.');
        setOrders([]);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (mode === 'refresh') {
        setIsRefreshing(true);
      } else if (mode === 'initial') {
        setIsLoading(true);
      }
      if (mode !== 'silent') {
        setErrorMessage(null);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);
      const onParentAbort = () => controller.abort();
      if (signal) {
        if (signal.aborted) {
          clearTimeout(timeoutId);
          return;
        }
        signal.addEventListener('abort', onParentAbort);
      }

      try {
        const response = await fetch(adminOrderUrls.list(statusFilter), {
          method: 'GET',
          headers: adminAuthHeaders(token),
          signal: controller.signal,
        });

        if (signal?.aborted) return;

        if (!response.ok) {
          if (mode === 'silent') return;
          if (response.status === 401 || response.status === 403) {
            setErrorMessage('Session expired. Please log in again.');
          } else {
            setErrorMessage(`Could not load orders (error ${response.status}).`);
          }
          setOrders([]);
          return;
        }

        const responseText = await response.text();
        const payload = parseJson(responseText);
        const list = unwrapList(payload);

        if (!list) {
          if (mode === 'silent') return;
          setErrorMessage('Could not read the orders response. Pull to refresh and try again.');
          setOrders([]);
          return;
        }

        const normalized = list
          .map(normalizeSummary)
          .filter((item: OrderSummary | null): item is OrderSummary => item !== null);

        if (signal?.aborted) return;
        setOrders((prev) => {
          const previousById = new Map(prev.map((order) => [order.orderId, order]));
          return normalized
            .map((item) => {
              const previous = previousById.get(item.orderId);
              const knownDetail = orderDetailsRef.current[item.orderId];
              const knownStatus = knownDetail?.status || previous?.status || '';
              return {
                ...item,
                status: preferStatus(knownStatus, item.status),
              };
            })
            .filter((order) => statusFilter === 'ALL' || String(order.status).toUpperCase() === statusFilter);
        });
      } catch (error: any) {
        if (signal?.aborted || mode === 'silent') {
          return;
        }
        if (error?.name === 'AbortError') {
          setErrorMessage('The server took too long. Please try again.');
          setOrders([]);
          return;
        }
        setErrorMessage('Network error. Please check your connection and try again.');
        setOrders([]);
      } finally {
        clearTimeout(timeoutId);
        if (signal) {
          signal.removeEventListener('abort', onParentAbort);
        }
        if (!signal?.aborted && mode !== 'silent') {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [resolveToken],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchOrders(selectedStatus, 'initial', controller.signal);
    return () => controller.abort();
  }, [selectedStatus, fetchOrders]);

  const handleSelectStatus = useCallback((status: OrderStatusFilter) => {
    setSelectedStatus(status);
    setExpandedIds(new Set());
  }, []);

  const fetchOrderExtras = useCallback(
    async (order: OrderSummary) => {
      const token = await resolveToken();
      if (!token) {
        setDetailErrorById((prev) => ({ ...prev, [order.orderId]: 'You are not logged in.' }));
        return;
      }

      setDetailLoadingIds((prev) => {
        const next = new Set(prev);
        next.add(order.orderId);
        return next;
      });
      setDetailErrorById((prev) => {
        const next = { ...prev };
        delete next[order.orderId];
        return next;
      });
      setInvoiceErrorById((prev) => {
        const next = { ...prev };
        delete next[order.orderId];
        return next;
      });

      const headers = adminAuthHeaders(token);

      try {
        const [detailResponse, invoiceResponse] = await Promise.all([
          fetch(adminOrderUrls.detail(order.orderId), { method: 'GET', headers }),
          fetch(adminOrderUrls.invoice(order.orderId), { method: 'GET', headers }),
        ]);

        const detailText = await detailResponse.text();
        const detailPayload = parseJson(detailText);
        if (detailResponse.ok) {
          setOrderDetails((prev) => {
            const incoming = normalizeDetail(detailPayload, order);
            const existing = prev[order.orderId];
            if (existing) {
              incoming.status = preferStatus(existing.status, incoming.status);
            }
            return { ...prev, [order.orderId]: incoming };
          });
        } else {
          setDetailErrorById((prev) => ({
            ...prev,
            [order.orderId]: readMessage(detailPayload, `Could not load items (error ${detailResponse.status}).`),
          }));
        }

        const invoiceText = await invoiceResponse.text();
        const invoicePayload = parseJson(invoiceText);
        if (invoiceResponse.ok) {
          const invoice = normalizeInvoice(invoicePayload);
          if (invoice) {
            setInvoices((prev) => ({ ...prev, [order.orderId]: invoice }));
          } else {
            setInvoiceErrorById((prev) => ({
              ...prev,
              [order.orderId]: 'Invoice data was empty.',
            }));
          }
        } else {
          setInvoiceErrorById((prev) => ({
            ...prev,
            [order.orderId]: readMessage(
              invoicePayload,
              'Invoice is not ready yet. Confirm the order first.',
            ),
          }));
        }
      } catch {
        setDetailErrorById((prev) => ({
          ...prev,
          [order.orderId]: 'Network error while loading items.',
        }));
      } finally {
        setDetailLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(order.orderId);
          return next;
        });
      }
    },
    [resolveToken],
  );

  const handleToggleExpand = useCallback(
    (order: OrderSummary) => {
      const isOpen = expandedIds.has(order.orderId);
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (isOpen) {
          next.delete(order.orderId);
        } else {
          next.add(order.orderId);
        }
        return next;
      });
      if (!isOpen && !orderDetails[order.orderId] && !detailLoadingIds.has(order.orderId)) {
        fetchOrderExtras(order);
      }
    },
    [detailLoadingIds, expandedIds, fetchOrderExtras, orderDetails],
  );

  const downloadInvoicePdf = useCallback(
    async (order: OrderSummary) => {
      const token = await resolveToken();
      if (!token) {
        Alert.alert('Not logged in', 'Please sign in again to download the invoice.');
        return;
      }

      setPdfLoadingIds((prev) => {
        const next = new Set(prev);
        next.add(order.orderId);
        return next;
      });

      try {
        const destination = new File(Paths.cache, `invoice-${order.orderId}.pdf`);
        const downloaded = await File.downloadFileAsync(
          adminOrderUrls.invoicePdf(order.orderId),
          destination,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              accept: 'application/pdf',
            },
            idempotent: true,
          },
        );

        const canShare = await Sharing.isAvailableAsync();
        if (!canShare) {
          Alert.alert('Invoice downloaded', 'Sharing is not available on this device.');
          return;
        }

        await Sharing.shareAsync(downloaded.uri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: 'Share invoice PDF',
        });
      } catch {
        Alert.alert(
          'Could not download PDF',
          'Invoice may not be ready yet. Confirm the order first, then try again.',
        );
      } finally {
        setPdfLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(order.orderId);
          return next;
        });
      }
    },
    [resolveToken],
  );

  const applyDetailToList = useCallback((orderId: number, detail: OrderDetail) => {
    setOrderDetails((prev) => ({ ...prev, [orderId]: detail }));
    setOrders((prev) =>
      prev
        .map((order) => {
          if (order.orderId !== orderId) return order;
          return {
            ...order,
            orderNumber: detail.orderNumber || order.orderNumber,
            customerPhone: detail.customerPhone || order.customerPhone,
            customerName: detail.customerName || order.customerName,
            subtotal: detail.subtotal,
            totalGst: detail.totalGst,
            deliveryCharge: detail.deliveryCharge,
            totalAmount: detail.totalAmount,
            totalItems: detail.items.length || order.totalItems,
            status: preferStatus(order.status, detail.status || order.status),
            deliveryType: detail.deliveryType || order.deliveryType,
            createdAt: detail.createdAt || order.createdAt,
          };
        })
        .filter((order) => selectedStatus === 'ALL' || String(order.status).toUpperCase() === selectedStatus),
    );
  }, [selectedStatus]);

  const updateOrderStatus = useCallback(
    async (order: OrderSummary, action: StatusAction) => {
      const token = await resolveToken();
      if (!token) {
        Alert.alert('Not logged in', 'Please sign in again to update this order.');
        return;
      }

      setStatusUpdatingIds((prev) => {
        const next = new Set(prev);
        next.add(order.orderId);
        return next;
      });

      try {
        const headers = adminAuthHeaders(token);
        const response = await fetch(statusUpdateUrl(order.orderId, action), {
          method: 'PUT',
          headers,
        });

        const responseText = await response.text();
        const payload = parseJson(responseText);

        if (!response.ok) {
          Alert.alert(
            'Could not update order',
            readMessage(payload, `The server returned error ${response.status}.`),
          );
          return;
        }

        let detail = normalizeDetail(payload, order);
        applyDetailToList(order.orderId, detail);

        try {
          const getResponse = await fetch(adminOrderUrls.detail(order.orderId), {
            method: 'GET',
            headers,
          });
          const getText = await getResponse.text();
          if (getResponse.ok) {
            detail = normalizeDetail(parseJson(getText), order);
            applyDetailToList(order.orderId, detail);
          }
        } catch {
          // Keep the PUT body if GET refresh fails.
        }

        await fetchOrders(selectedStatus, 'silent');
        if (action === 'confirm') {
          void fetchOrderExtras({
            ...order,
            status: detail.status,
            orderNumber: detail.orderNumber || order.orderNumber,
          });
        }
      } catch {
        Alert.alert('Network error', 'Please check your connection and try again.');
      } finally {
        setStatusUpdatingIds((prev) => {
          const next = new Set(prev);
          next.delete(order.orderId);
          return next;
        });
      }
    },
    [applyDetailToList, fetchOrderExtras, fetchOrders, resolveToken, selectedStatus],
  );

  const requestStatusUpdate = useCallback((order: OrderSummary, action: StatusAction) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(order.orderId);
      return next;
    });
    setPendingActionById((prev) => ({ ...prev, [order.orderId]: action }));
    if (!orderDetails[order.orderId] && !detailLoadingIds.has(order.orderId)) {
      fetchOrderExtras(order);
    }
  }, [detailLoadingIds, fetchOrderExtras, orderDetails]);

  const cancelStatusUpdate = useCallback((orderId: number) => {
    setPendingActionById((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
  }, []);

  const commitStatusUpdate = useCallback((order: OrderSummary) => {
    const action = pendingActionById[order.orderId];
    if (!action) return;
    setPendingActionById((prev) => {
      const next = { ...prev };
      delete next[order.orderId];
      return next;
    });
    void updateOrderStatus(order, action);
  }, [pendingActionById, updateOrderStatus]);

  const toggleOutOfStock = useCallback((orderId: number) => {
    setOutOfStockIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  }, []);

  const toggleItemOutOfStock = useCallback((orderId: number, orderItemId: number) => {
    const key = itemStockKey(orderId, orderItemId);
    setOutOfStockItemKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const renderOrderCard = useCallback(
    ({ item }: { item: OrderSummary }) => {
      const isExpanded = expandedIds.has(item.orderId);
      const isSelected = !outOfStockIds.has(item.orderId);
      const detail = orderDetails[item.orderId];
      const invoice = invoices[item.orderId];
      const items = (detail && Array.isArray(detail.items) && detail.items.length > 0)
        ? detail.items
        : (invoice && Array.isArray(invoice.items) ? invoice.items : []);
      const isDetailLoading = detailLoadingIds.has(item.orderId);
      const detailError = detailErrorById[item.orderId];
      const invoiceError = invoiceErrorById[item.orderId];
      const isPdfLoading = pdfLoadingIds.has(item.orderId);
      const isStatusUpdating = statusUpdatingIds.has(item.orderId);
      const currentStatus = String(detail?.status || item.status || '').toUpperCase();
      const statusColor = getStatusColor(currentStatus);
      const deliveryAddress = detail?.deliveryAddress || '';
      const pendingAction = pendingActionById[item.orderId];

      return (
        <View style={[styles.orderCard, !isSelected && styles.orderCardMuted]}>
          <View style={styles.cardHeaderRow}>
            <TouchableOpacity
              style={[styles.checkbox, isSelected ? styles.checkboxOn : styles.checkboxOff]}
              onPress={() => toggleOutOfStock(item.orderId)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              {isSelected ? <CheckIcon /> : null}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerTapZone}
              onPress={() => handleToggleExpand(item)}
              activeOpacity={0.8}
            >
              <View style={styles.headerTextBlock}>
                <View style={styles.headerTopLine}>
                  <Text style={[styles.orderNumberText, !isSelected && styles.strikeThrough]} numberOfLines={1}>
                    #{item.orderNumber || item.orderId}
                  </Text>
                  {!isSelected && (
                    <View style={styles.outOfStockTag}>
                      <Text style={styles.outOfStockTagText}>OUT OF STOCK</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.customerNameText} numberOfLines={1}>
                  {item.customerPhone || item.customerName || 'Unknown customer'}
                </Text>
              </View>

              <View style={styles.headerRightBlock}>
                <View style={[styles.statusPill, { backgroundColor: `${statusColor}1A`, borderColor: statusColor }]}>
                  <Text style={[styles.statusPillText, { color: statusColor }]} numberOfLines={1}>
                    {prettyStatus(currentStatus)}
                  </Text>
                </View>
                <Text style={styles.headerAmountText}>{formatMoney(item.totalAmount)}</Text>
              </View>

              <View style={styles.chevronWrap}>
                <ChevronIcon open={isExpanded} />
              </View>
            </TouchableOpacity>
          </View>

          {!isExpanded ? (
            <View style={styles.collapsedTrackWrap}>
              <OrderStatusTracker
                status={currentStatus}
                compact
                busy={isStatusUpdating}
                onAdvance={(action) => requestStatusUpdate(item, action)}
              />
            </View>
          ) : null}

          {isExpanded && (
            <View style={styles.cardBody}>
              <DetailRow label="Order ID" value={String(item.orderId)} />
              <DetailRow label="Order number" value={detail?.orderNumber || item.orderNumber || '-'} />
              <DetailRow label="Customer name" value={detail?.customerName || item.customerName || '-'} />
              <DetailRow label="Customer phone" value={detail?.customerPhone || item.customerPhone || '-'} />
              <DetailRow label="Total items" value={String(detail?.items.length ?? item.totalItems)} />

              <View style={styles.divider} />

              <DetailRow label="Status" value={prettyStatus(currentStatus)} />
              <DetailRow label="Delivery type" value={detail?.deliveryType || item.deliveryType || '-'} />
              <DetailRow label="Shop name" value={detail?.shopName || '-'} />
              <DetailRow label="Placed on" value={formatDate(detail?.createdAt || item.createdAt)} />

              <OrderStatusTracker
                status={currentStatus}
                busy={isStatusUpdating}
                onAdvance={(action) => requestStatusUpdate(item, action)}
              />

              {!pendingAction && getNextAction(currentStatus) === 'confirm' ? (
                <TouchableOpacity
                  style={styles.shopActionBtn}
                  onPress={() => requestStatusUpdate(item, 'confirm')}
                  activeOpacity={0.85}
                  disabled={isStatusUpdating}
                >
                  {isStatusUpdating ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.shopActionText}>Confirm order</Text>
                  )}
                </TouchableOpacity>
              ) : null}

              {pendingAction ? (
                <View style={styles.confirmBox}>
                  <Text style={styles.confirmTitle}>{ACTION_COPY[pendingAction].title}</Text>
                  <Text style={styles.confirmText}>{ACTION_COPY[pendingAction].text}</Text>
                  <View style={styles.confirmRow}>
                    <TouchableOpacity
                      style={styles.confirmCancelBtn}
                      onPress={() => cancelStatusUpdate(item.orderId)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.confirmCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.confirmGoBtn}
                      onPress={() => commitStatusUpdate(item)}
                      activeOpacity={0.85}
                      disabled={isStatusUpdating}
                    >
                      {isStatusUpdating ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.confirmGoText}>{ACTION_COPY[pendingAction].button}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              <View style={styles.addressBox}>
                <View style={styles.addressTitleRow}>
                  <PinIcon />
                  <Text style={styles.addressTitle}>DELIVERY ADDRESS</Text>
                </View>
                <Text style={styles.addressText}>{deliveryAddress || 'No delivery address on this order.'}</Text>
              </View>

              <View style={styles.divider} />

              <Text style={styles.sectionTitle}>Items</Text>
              <Text style={styles.sectionHint}>Un-select any item that has gone out of stock.</Text>
              {isDetailLoading && items.length === 0 ? (
                <View style={styles.inlineLoading}>
                  <ActivityIndicator size="small" color="#D2691E" />
                  <Text style={[styles.centerStateText, { marginTop: 0, marginLeft: 8 }]}>Loading items...</Text>
                </View>
              ) : detailError && items.length === 0 ? (
                <View style={styles.inlineError}>
                  <Text style={styles.itemErrorText}>{detailError}</Text>
                  <TouchableOpacity style={styles.retryBtnSmall} onPress={() => fetchOrderExtras(item)} activeOpacity={0.85}>
                    <Text style={styles.retryBtnText}>Retry items</Text>
                  </TouchableOpacity>
                </View>
              ) : items.length === 0 ? (
                <Text style={styles.emptyItemsText}>No items found for this order.</Text>
              ) : (
                items.map((line) => {
                  const isItemSelected = !outOfStockItemKeys.has(itemStockKey(item.orderId, line.orderItemId));
                  const unitLabel = [line.unitValue, line.unit].filter(Boolean).join(' ');
                  return (
                    <View key={`item_${item.orderId}_${line.orderItemId}`} style={[styles.itemCard, !isItemSelected && styles.itemCardMuted]}>
                      <TouchableOpacity
                        style={[styles.itemCheckbox, isItemSelected ? styles.checkboxOn : styles.checkboxOff]}
                        onPress={() => toggleItemOutOfStock(item.orderId, line.orderItemId)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        activeOpacity={0.7}
                      >
                        {isItemSelected ? <CheckIcon /> : null}
                      </TouchableOpacity>
                      {line.imageUrl && line.imageUrl.startsWith('http') ? (
                        <Image source={{ uri: line.imageUrl }} style={styles.itemImage} />
                      ) : (
                        <View style={styles.itemImageFallback}>
                          <Text style={styles.itemImageFallbackText}>
                            {line.productName ? line.productName.charAt(0).toUpperCase() : '?'}
                          </Text>
                        </View>
                      )}
                      <View style={styles.itemTextBlock}>
                        <View style={styles.itemTitleRow}>
                          <Text style={[styles.itemName, !isItemSelected && styles.strikeThrough]} numberOfLines={2}>
                            {line.productName}
                          </Text>
                          {!isItemSelected && (
                            <View style={styles.outOfStockTag}>
                              <Text style={styles.outOfStockTagText}>OUT OF STOCK</Text>
                            </View>
                          )}
                        </View>
                        {!!line.brand && <Text style={styles.itemMeta}>{line.brand}</Text>}
                        <Text style={styles.itemMeta}>
                          Qty {line.quantity}{unitLabel ? ` · ${unitLabel}` : ''}
                        </Text>
                        <Text style={styles.itemMeta}>
                          Price {formatMoney(line.sellingPrice)} · MRP {formatMoney(line.mrp)}
                        </Text>
                        <Text style={styles.itemMeta}>
                          GST {formatMoney(line.gstAmount)}{line.gstSlab ? ` (${line.gstSlab})` : ''}
                        </Text>
                      </View>
                      <Text style={[styles.itemPrice, !isItemSelected && styles.strikeThrough]}>{formatMoney(line.lineTotal)}</Text>
                    </View>
                  );
                })
              )}

              <View style={styles.divider} />

              <DetailRow label="Subtotal" value={formatMoney(detail?.subtotal ?? item.subtotal)} />
              <DetailRow label="GST" value={formatMoney(detail?.totalGst ?? item.totalGst)} />
              <DetailRow label="Delivery charge" value={formatMoney(detail?.deliveryCharge ?? item.deliveryCharge)} />

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total amount</Text>
                <Text style={styles.totalValue}>{formatMoney(detail?.totalAmount ?? item.totalAmount)}</Text>
              </View>

              <View style={styles.divider} />

              <Text style={styles.sectionTitle}>Invoice</Text>
              {invoice ? (
                <>
                  <DetailRow label="Invoice ID" value={invoice.invoiceId || '-'} />
                  <DetailRow label="Order number" value={invoice.orderNumber || '-'} />
                  <DetailRow label="Invoice date" value={formatDate(invoice.invoiceDate)} />
                  <DetailRow label="Shop name" value={invoice.shopName || '-'} />
                  <DetailRow label="Shop address" value={invoice.shopAddress || '-'} />
                  <DetailRow label="Shop GST number" value={invoice.shopGstNumber || '-'} />
                  <DetailRow label="Shop phone" value={invoice.shopPhone || '-'} />
                  <DetailRow label="Customer name" value={invoice.customerName || '-'} />
                  <DetailRow label="Customer phone" value={invoice.customerPhone || '-'} />
                  <DetailRow label="Delivery address" value={invoice.deliveryAddress || '-'} />
                  <DetailRow label="Delivery type" value={invoice.deliveryType || '-'} />
                  <View style={styles.divider} />
                  <DetailRow label="Subtotal" value={formatMoney(invoice.subtotal)} />
                  <DetailRow label="GST" value={formatMoney(invoice.totalGst)} />
                  <DetailRow label="Delivery charge" value={formatMoney(invoice.deliveryCharge)} />
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total amount</Text>
                    <Text style={styles.totalValue}>{formatMoney(invoice.totalAmount)}</Text>
                  </View>
                </>
              ) : (
                <Text style={styles.emptyItemsText}>
                  {invoiceError || (isDetailLoading ? 'Loading invoice...' : 'Invoice is not ready yet.')}
                </Text>
              )}

              <TouchableOpacity
                style={styles.pdfBtn}
                onPress={() => downloadInvoicePdf(item)}
                activeOpacity={0.85}
                disabled={isPdfLoading}
              >
                {isPdfLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.pdfBtnText}>Download invoice PDF</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.stockActionBtn, isSelected ? styles.stockActionBtnOut : styles.stockActionBtnIn]}
                onPress={() => toggleOutOfStock(item.orderId)}
                activeOpacity={0.85}
              >
                <Text style={[styles.stockActionText, isSelected ? styles.stockActionTextOut : styles.stockActionTextIn]}>
                  {isSelected ? 'Mark out of stock (un-select)' : 'Restore (mark available)'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    },
    [
      detailErrorById,
      detailLoadingIds,
      downloadInvoicePdf,
      expandedIds,
      fetchOrderExtras,
      handleToggleExpand,
      invoiceErrorById,
      invoices,
      orderDetails,
      outOfStockIds,
      outOfStockItemKeys,
      pdfLoadingIds,
      statusUpdatingIds,
      toggleItemOutOfStock,
      toggleOutOfStock,
      requestStatusUpdate,
      cancelStatusUpdate,
      commitStatusUpdate,
      pendingActionById,
    ],
  );

  const keyExtractor = useCallback(
    (item: OrderSummary, index: number) =>
      item && item.orderId != null ? `order_${item.orderId}` : `order_idx_${index}`,
    [],
  );

  return (
    <SafeAreaView style={styles.viewMainWrapper} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFBF7" />

      <View style={styles.topHeader}>
        <Text style={styles.headerTitle}>Orders</Text>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => fetchOrders(selectedStatus, 'refresh')}
          activeOpacity={0.7}
        >
          <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D2691E" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <Path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <Path d="M21 3v5h-5" />
            <Path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <Path d="M8 16H3v5" />
          </Svg>
        </TouchableOpacity>
      </View>

      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScrollContent}>
          {STATUS_FILTERS.map((status) => {
            const isActive = selectedStatus === status;
            return (
              <TouchableOpacity
                key={status}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => handleSelectStatus(status)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {prettyStatus(status)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.contentArea}>
        {isLoading && orders.length === 0 ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color="#D2691E" />
            <Text style={styles.centerStateText}>Loading orders...</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.centerState}>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => fetchOrders(selectedStatus, 'initial')} activeOpacity={0.85}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : orders.length === 0 ? (
          <View style={styles.centerState}>
            <Text style={styles.emptyTitle}>No orders found</Text>
            <Text style={styles.emptySubtitle}>
              {selectedStatus === 'ALL'
                ? 'This shop has no orders yet. New customer orders will show up here.'
                : `No orders with status "${prettyStatus(selectedStatus)}". Try All.`}
            </Text>
          </View>
        ) : (
          <FlatList
            data={orders}
            keyExtractor={keyExtractor}
            renderItem={renderOrderCard}
            extraData={{ expandedIds, outOfStockIds, outOfStockItemKeys, orderDetails, invoices, detailLoadingIds, pdfLoadingIds, statusUpdatingIds, pendingActionById }}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={() => fetchOrders(selectedStatus, 'refresh')} colors={['#D2691E']} tintColor="#D2691E" />
            }
          />
        )}
      </View>

      <BottomNavBar onNavigate={onNavigate} currentActive="order" />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  viewMainWrapper: { flex: 1, backgroundColor: '#FFFBF7' },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0E2D3',
    backgroundColor: '#FFFFFF',
  },
  headerTitle: { fontSize: 19, fontWeight: '800', color: '#2B1E1A' },
  refreshBtn: { padding: 6, borderRadius: 8, backgroundColor: '#FFF5EA' },
  filterBar: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F0E2D3' },
  filterScrollContent: { paddingHorizontal: 12, paddingVertical: 10 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F5ECE2',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E6D4BF',
  },
  filterChipActive: { backgroundColor: '#D2691E', borderColor: '#D2691E' },
  filterChipText: { fontSize: 12, fontWeight: '700', color: '#5C4033' },
  filterChipTextActive: { color: '#FFFFFF' },
  contentArea: { flex: 1 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  centerStateText: { fontSize: 12, color: '#A89685', fontWeight: '700', marginTop: 10 },
  errorText: { fontSize: 13, color: '#C62828', fontWeight: '700', textAlign: 'center', marginBottom: 14 },
  retryBtn: { backgroundColor: '#D2691E', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: '#2B1E1A', marginBottom: 6 },
  emptySubtitle: { fontSize: 12.5, color: '#A89685', fontWeight: '600', textAlign: 'center' },
  listContent: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 120 },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F0E2D3',
    marginBottom: 10,
    overflow: 'hidden',
  },
  orderCardMuted: { opacity: 0.6 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1.5,
  },
  checkboxOn: { backgroundColor: '#D2691E', borderColor: '#D2691E' },
  checkboxOff: { backgroundColor: '#FFFFFF', borderColor: '#C7B7A6' },
  headerTapZone: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  headerTextBlock: { flex: 1, paddingRight: 8 },
  headerTopLine: { flexDirection: 'row', alignItems: 'center' },
  orderNumberText: { fontSize: 14, fontWeight: '800', color: '#2B1E1A' },
  strikeThrough: { textDecorationLine: 'line-through', color: '#A89685' },
  outOfStockTag: { backgroundColor: '#C62828', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, marginLeft: 6 },
  outOfStockTagText: { color: '#FFFFFF', fontSize: 8, fontWeight: '800' },
  customerNameText: { fontSize: 11.5, color: '#5C4033', fontWeight: '600', marginTop: 2 },
  headerRightBlock: { alignItems: 'flex-end', marginRight: 6 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1, maxWidth: 150 },
  statusPillText: { fontSize: 9.5, fontWeight: '800' },
  headerAmountText: { fontSize: 13, fontWeight: '800', color: '#2B1E1A', marginTop: 4 },
  chevronWrap: { width: 22, alignItems: 'center', justifyContent: 'center' },
  cardBody: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 2, borderTopWidth: 1, borderTopColor: '#F5ECE2' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  detailLabel: { fontSize: 12, color: '#A89685', fontWeight: '600' },
  detailValue: { fontSize: 12.5, color: '#2B1E1A', fontWeight: '700', flexShrink: 1, textAlign: 'right', marginLeft: 12, maxWidth: '62%' },
  divider: { height: 1, backgroundColor: '#F0E2D3', marginVertical: 8 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0E2D3',
  },
  totalLabel: { fontSize: 13, fontWeight: '800', color: '#2B1E1A' },
  totalValue: { fontSize: 15, fontWeight: '800', color: '#D2691E' },
  stockActionBtn: { marginTop: 14, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  stockActionBtnOut: { backgroundColor: '#FFFFFF', borderColor: '#C62828' },
  stockActionBtnIn: { backgroundColor: '#137A63', borderColor: '#137A63' },
  stockActionText: { fontSize: 12.5, fontWeight: '800' },
  stockActionTextOut: { color: '#C62828' },
  stockActionTextIn: { color: '#FFFFFF' },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#2B1E1A', marginBottom: 2 },
  sectionHint: { fontSize: 11, color: '#A89685', fontWeight: '600', marginBottom: 10 },
  inlineLoading: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  inlineError: { alignItems: 'flex-start', paddingVertical: 8 },
  itemErrorText: { fontSize: 12, color: '#C62828', fontWeight: '700' },
  retryBtnSmall: { backgroundColor: '#D2691E', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, marginTop: 8 },
  emptyItemsText: { fontSize: 12, color: '#A89685', fontWeight: '600', paddingVertical: 8 },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFBF7',
    borderWidth: 1,
    borderColor: '#F0E2D3',
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
  },
  itemCardMuted: { opacity: 0.55 },
  itemCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginTop: 2,
    borderWidth: 1.5,
  },
  itemImage: { width: 42, height: 42, borderRadius: 8, backgroundColor: '#F5ECE2', marginRight: 8 },
  itemImageFallback: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#F5ECE2',
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemImageFallbackText: { fontSize: 14, fontWeight: '800', color: '#5C4033' },
  itemTextBlock: { flex: 1, paddingRight: 6 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  itemName: { fontSize: 12.5, fontWeight: '800', color: '#2B1E1A', flexShrink: 1 },
  itemMeta: { fontSize: 11, color: '#8A7A6A', fontWeight: '600', marginTop: 1 },
  itemPrice: { fontSize: 12.5, fontWeight: '800', color: '#2B1E1A', marginTop: 2 },
  pdfBtn: {
    marginTop: 12,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2B1E1A',
  },
  pdfBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  collapsedTrackWrap: {
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  trackBox: {
    marginTop: 12,
    backgroundColor: '#FFF8F1',
    borderWidth: 1,
    borderColor: '#F0E2D3',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 8,
  },
  trackBoxCompact: {
    marginTop: 0,
    paddingTop: 8,
    paddingBottom: 6,
  },
  trackTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#5C4033',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  trackOwnerHint: {
    fontSize: 11,
    color: '#8A7A6A',
    fontWeight: '600',
    marginBottom: 8,
    lineHeight: 15,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    position: 'relative',
  },
  trackLineLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: TRACK_DOT_SIZE,
  },
  trackBaseLine: {
    position: 'absolute',
    top: TRACK_LINE_TOP,
    height: TRACK_LINE_THICKNESS,
    borderRadius: 2,
    backgroundColor: '#E6D4BF',
  },
  trackProgressLine: {
    position: 'absolute',
    top: TRACK_LINE_TOP,
    height: TRACK_LINE_THICKNESS,
    borderRadius: 2,
    backgroundColor: '#2E7D32',
  },
  trackStep: {
    flex: 1,
    alignItems: 'center',
    zIndex: 1,
  },
  trackDotRow: {
    width: '100%',
    height: TRACK_DOT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  trackDot: {
    width: TRACK_DOT_SIZE,
    height: TRACK_DOT_SIZE,
    borderRadius: TRACK_DOT_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
  },
  trackDotDone: {
    backgroundColor: '#2E7D32',
    borderColor: '#2E7D32',
  },
  trackDotNext: {
    backgroundColor: '#D2691E',
    borderColor: '#D2691E',
  },
  trackDotIdle: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8C8B8',
  },
  trackLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#A89685',
    textAlign: 'center',
    lineHeight: 12,
    minHeight: 24,
  },
  trackLabelDone: {
    color: '#2E7D32',
  },
  trackLabelNext: {
    color: '#D2691E',
  },
  trackHint: {
    fontSize: 11,
    color: '#8A7A6A',
    fontWeight: '600',
    marginTop: 6,
    lineHeight: 15,
  },
  addressBox: {
    marginTop: 10,
    backgroundColor: '#FFF8F1',
    borderWidth: 1,
    borderColor: '#F0E2D3',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  addressTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  addressTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#5C4033',
    letterSpacing: 0.6,
    marginLeft: 6,
  },
  addressText: {
    fontSize: 12.5,
    color: '#2B1E1A',
    fontWeight: '600',
    lineHeight: 18,
  },
  confirmBox: {
    marginTop: 10,
    backgroundColor: '#FFF5EA',
    borderWidth: 1,
    borderColor: '#E6C8A8',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  confirmTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2B1E1A',
  },
  confirmText: {
    fontSize: 12,
    color: '#5C4033',
    fontWeight: '600',
    marginTop: 4,
    lineHeight: 16,
  },
  confirmRow: {
    flexDirection: 'row',
    marginTop: 10,
  },
  confirmCancelBtn: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#C7B7A6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    backgroundColor: '#FFFFFF',
  },
  confirmCancelText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#5C4033',
  },
  confirmGoBtn: {
    flex: 1.3,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D2691E',
  },
  confirmGoText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  shopActionBtn: {
    marginTop: 10,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D2691E',
  },
  shopActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
