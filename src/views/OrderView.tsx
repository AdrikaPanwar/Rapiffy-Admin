import React, { useCallback, useEffect, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BottomNavBar } from '../components/BottomNavBar';

const BASE_URL = 'https://rapiffy-backend-1.onrender.com';

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

export interface OrderDetail extends OrderSummary {
  invoiceId?: string | null;
  shopName?: string;
  deliveryAddress?: string;
  items: OrderLineItem[];
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

const itemStockKey = (orderId: number, orderItemId: number): string => `${orderId}:${orderItemId}`;

const extractOrdersArray = (payload: any): any[] => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.orders)) return payload.orders;
  if (Array.isArray(payload.content)) return payload.content;
  return [];
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
  const summary = normalizeSummary(raw) || fallback;
  const itemsSource = Array.isArray(raw?.items) ? raw.items : [];
  const items = itemsSource
    .map(normalizeLineItem)
    .filter((item: OrderLineItem | null): item is OrderLineItem => item !== null);

  return {
    ...summary,
    invoiceId: raw?.invoiceId != null ? String(raw.invoiceId) : null,
    shopName: raw?.shopName != null ? String(raw.shopName) : undefined,
    deliveryAddress: raw?.deliveryAddress != null ? String(raw.deliveryAddress) : undefined,
    items,
  };
};

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
  const [orderDetails, setOrderDetails] = useState<Record<number, OrderDetail>>({});
  const [detailLoadingIds, setDetailLoadingIds] = useState<Set<number>>(new Set());
  const [detailErrorById, setDetailErrorById] = useState<Record<number, string>>({});
  const [outOfStockItemKeys, setOutOfStockItemKeys] = useState<Set<string>>(new Set());

  const resolveToken = useCallback(async (): Promise<string | null> => {
    const fromProp = authToken && authToken.trim() !== '' ? authToken.trim() : '';
    if (fromProp) return fromProp;
    const stored = await AsyncStorage.getItem('user_auth_token');
    const cleaned = stored ? stored.trim() : '';
    return cleaned || null;
  }, [authToken]);

  const fetchOrders = useCallback(
    async (statusFilter: OrderStatusFilter, mode: 'initial' | 'refresh' = 'initial') => {
      const token = await resolveToken();

      if (!token) {
        setErrorMessage('You are not logged in. Please sign in again.');
        setOrders([]);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (mode === 'refresh') {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage(null);

      try {
        const query = statusFilter && statusFilter !== 'ALL' ? `?status=${encodeURIComponent(statusFilter)}` : '';
        const response = await fetch(`${BASE_URL}/v1/admin/orders${query}`, {
          method: 'GET',
          headers: {
            accept: '*/*',
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            setErrorMessage('Session expired. Please log in again.');
          } else {
            setErrorMessage(`Could not load orders (error ${response.status}).`);
          }
          setOrders([]);
          return;
        }

        const responseText = await response.text();
        let payload: any = [];
        try {
          payload = JSON.parse(responseText);
        } catch {
          payload = [];
        }

        const normalized = extractOrdersArray(payload)
          .map(normalizeSummary)
          .filter((item: OrderSummary | null): item is OrderSummary => item !== null);

        setOrders(normalized);
      } catch {
        setErrorMessage('Network error. Please check your connection and try again.');
        setOrders([]);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [resolveToken],
  );

  const fetchOrderDetail = useCallback(
    async (orderId: number, fallback: OrderSummary) => {
      const token = await resolveToken();
      if (!token) {
        setDetailErrorById((prev) => ({ ...prev, [orderId]: 'You are not logged in.' }));
        return;
      }

      setDetailLoadingIds((prev) => {
        const next = new Set(prev);
        next.add(orderId);
        return next;
      });
      setDetailErrorById((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });

      try {
        const response = await fetch(`${BASE_URL}/v1/admin/orders/${orderId}`, {
          method: 'GET',
          headers: {
            accept: '*/*',
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          setDetailErrorById((prev) => ({
            ...prev,
            [orderId]: `Could not load items (error ${response.status}).`,
          }));
          return;
        }

        const responseText = await response.text();
        let payload: any = {};
        try {
          payload = JSON.parse(responseText);
        } catch {
          payload = {};
        }

        const detailSource = payload && typeof payload === 'object' && payload.data && !Array.isArray(payload.data)
          ? payload.data
          : payload;

        setOrderDetails((prev) => ({
          ...prev,
          [orderId]: normalizeDetail(detailSource, fallback),
        }));
      } catch {
        setDetailErrorById((prev) => ({
          ...prev,
          [orderId]: 'Network error while loading items.',
        }));
      } finally {
        setDetailLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(orderId);
          return next;
        });
      }
    },
    [resolveToken],
  );

  useEffect(() => {
    fetchOrders(selectedStatus, 'initial');
  }, [selectedStatus, fetchOrders]);

  const handleSelectStatus = useCallback((status: OrderStatusFilter) => {
    setSelectedStatus(status);
    setExpandedIds(new Set());
  }, []);

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
      if (!isOpen && !orderDetails[order.orderId]) {
        fetchOrderDetail(order.orderId, order);
      }
    },
    [expandedIds, fetchOrderDetail, orderDetails],
  );

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

  const renderLineItem = useCallback(
    (orderId: number, item: OrderLineItem) => {
      const isSelected = !outOfStockItemKeys.has(itemStockKey(orderId, item.orderItemId));
      const unitLabel = [item.unitValue, item.unit].filter(Boolean).join(' ');

      return (
        <View key={`item_${orderId}_${item.orderItemId}`} style={[styles.itemSection, !isSelected && styles.itemSectionMuted]}>
          <TouchableOpacity
            style={[styles.checkbox, isSelected ? styles.checkboxOn : styles.checkboxOff]}
            onPress={() => toggleItemOutOfStock(orderId, item.orderItemId)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            {isSelected ? <CheckIcon /> : null}
          </TouchableOpacity>

          {item.imageUrl && item.imageUrl.startsWith('http') ? (
            <Image source={{ uri: item.imageUrl }} style={styles.itemImage} />
          ) : (
            <View style={styles.itemImageFallback}>
              <Text style={styles.itemImageFallbackText}>
                {item.productName ? item.productName.charAt(0).toUpperCase() : '?'}
              </Text>
            </View>
          )}

          <View style={styles.itemTextBlock}>
            <View style={styles.itemTitleRow}>
              <Text style={[styles.itemName, !isSelected && styles.strikeThrough]} numberOfLines={2}>
                {item.productName}
              </Text>
              {!isSelected && (
                <View style={styles.outOfStockTag}>
                  <Text style={styles.outOfStockTagText}>OUT OF STOCK</Text>
                </View>
              )}
            </View>
            {!!item.brand && <Text style={styles.itemMeta} numberOfLines={1}>{item.brand}</Text>}
            <Text style={styles.itemMeta} numberOfLines={1}>
              Qty {item.quantity}{unitLabel ? ` · ${unitLabel}` : ''}
            </Text>
          </View>

          <Text style={[styles.itemPrice, !isSelected && styles.strikeThrough]}>{formatMoney(item.lineTotal)}</Text>
        </View>
      );
    },
    [outOfStockItemKeys, toggleItemOutOfStock],
  );

  const renderOrderCard = useCallback(
    ({ item }: { item: OrderSummary }) => {
      const isExpanded = expandedIds.has(item.orderId);
      const statusColor = getStatusColor(item.status);
      const detail = orderDetails[item.orderId];
      const isDetailLoading = detailLoadingIds.has(item.orderId);
      const detailError = detailErrorById[item.orderId];
      const items = detail && Array.isArray(detail.items) ? detail.items : [];
      const selectedItems = items.filter(
        (line) => !outOfStockItemKeys.has(itemStockKey(item.orderId, line.orderItemId)),
      );
      const selectedTotal = selectedItems.reduce((sum, line) => sum + toNumber(line.lineTotal), 0);
      const hasUnselected = items.length > 0 && selectedItems.length !== items.length;

      return (
        <View style={styles.orderCard}>
          <TouchableOpacity
            style={styles.cardHeaderRow}
            onPress={() => handleToggleExpand(item)}
            activeOpacity={0.8}
          >
            <View style={styles.headerTextBlock}>
              <View style={styles.headerTopLine}>
                <Text style={styles.orderNumberText} numberOfLines={1}>
                  #{item.orderNumber || item.orderId}
                </Text>
              </View>
              <Text style={styles.customerNameText} numberOfLines={1}>
                {item.customerName || item.customerPhone || 'Unknown customer'}
              </Text>
            </View>

            <View style={styles.headerRightBlock}>
              <View style={[styles.statusPill, { backgroundColor: `${statusColor}1A`, borderColor: statusColor }]}>
                <Text style={[styles.statusPillText, { color: statusColor }]} numberOfLines={1}>
                  {prettyStatus(item.status)}
                </Text>
              </View>
              <Text style={styles.headerAmountText}>{formatMoney(item.totalAmount)}</Text>
            </View>

            <View style={styles.chevronWrap}>
              <ChevronIcon open={isExpanded} />
            </View>
          </TouchableOpacity>

          {isExpanded && (
            <View style={styles.cardBody}>
              <DetailRow label="Order ID" value={String(item.orderId)} />
              <DetailRow label="Customer phone" value={item.customerPhone || '-'} />
              <DetailRow label="Total items" value={String(item.totalItems)} />
              <DetailRow label="Delivery type" value={item.deliveryType || '-'} />
              <DetailRow label="Placed on" value={formatDate(item.createdAt)} />
              {detail?.deliveryAddress ? <DetailRow label="Address" value={detail.deliveryAddress} /> : null}

              <View style={styles.divider} />

              <Text style={styles.itemsHeading}>Items</Text>
              <Text style={styles.itemsHint}>Un-select any item that has gone out of stock.</Text>

              {isDetailLoading && items.length === 0 ? (
                <View style={styles.itemLoadingRow}>
                  <ActivityIndicator size="small" color="#D2691E" />
                  <Text style={[styles.centerStateText, { marginTop: 0, marginLeft: 8 }]}>Loading items...</Text>
                </View>
              ) : detailError && items.length === 0 ? (
                <View style={styles.itemErrorBlock}>
                  <Text style={styles.itemErrorText}>{detailError}</Text>
                  <TouchableOpacity
                    style={styles.retryBtnSmall}
                    onPress={() => fetchOrderDetail(item.orderId, item)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.retryBtnText}>Retry items</Text>
                  </TouchableOpacity>
                </View>
              ) : items.length === 0 ? (
                <Text style={styles.emptyItemsText}>No line items returned for this order.</Text>
              ) : (
                items.map((line) => renderLineItem(item.orderId, line))
              )}

              <View style={styles.divider} />

              <DetailRow label="Subtotal" value={formatMoney(item.subtotal)} />
              <DetailRow label="GST" value={formatMoney(item.totalGst)} />
              <DetailRow label="Delivery charge" value={formatMoney(item.deliveryCharge)} />

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total amount</Text>
                <Text style={styles.totalValue}>{formatMoney(item.totalAmount)}</Text>
              </View>

              {hasUnselected ? (
                <View style={styles.adjustedTotalRow}>
                  <Text style={styles.adjustedTotalLabel}>Selected items total</Text>
                  <Text style={styles.adjustedTotalValue}>{formatMoney(selectedTotal)}</Text>
                </View>
              ) : null}
            </View>
          )}
        </View>
      );
    },
    [
      detailErrorById,
      detailLoadingIds,
      expandedIds,
      fetchOrderDetail,
      handleToggleExpand,
      orderDetails,
      outOfStockItemKeys,
      renderLineItem,
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
              {selectedStatus === 'ALL' ? 'There are no orders yet.' : `No orders with status "${prettyStatus(selectedStatus)}".`}
            </Text>
          </View>
        ) : (
          <FlatList
            data={orders}
            keyExtractor={keyExtractor}
            renderItem={renderOrderCard}
            extraData={{ expandedIds, orderDetails, detailLoadingIds, detailErrorById, outOfStockItemKeys }}
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
  retryBtnSmall: { backgroundColor: '#D2691E', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, marginTop: 8 },
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
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  headerTextBlock: { flex: 1, paddingRight: 8 },
  headerTopLine: { flexDirection: 'row', alignItems: 'center' },
  orderNumberText: { fontSize: 14, fontWeight: '800', color: '#2B1E1A' },
  customerNameText: { fontSize: 11.5, color: '#5C4033', fontWeight: '600', marginTop: 2 },
  headerRightBlock: { alignItems: 'flex-end', marginRight: 6 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1, maxWidth: 120 },
  statusPillText: { fontSize: 9.5, fontWeight: '800' },
  headerAmountText: { fontSize: 13, fontWeight: '800', color: '#2B1E1A', marginTop: 4 },
  chevronWrap: { width: 22, alignItems: 'center', justifyContent: 'center' },
  cardBody: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 2, borderTopWidth: 1, borderTopColor: '#F5ECE2' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 5 },
  detailLabel: { fontSize: 12, color: '#A89685', fontWeight: '600' },
  detailValue: { fontSize: 12.5, color: '#2B1E1A', fontWeight: '700', flexShrink: 1, textAlign: 'right', marginLeft: 12, maxWidth: '62%' },
  divider: { height: 1, backgroundColor: '#F0E2D3', marginVertical: 8 },
  itemsHeading: { fontSize: 13, fontWeight: '800', color: '#2B1E1A', marginBottom: 2 },
  itemsHint: { fontSize: 11, color: '#A89685', fontWeight: '600', marginBottom: 10 },
  itemLoadingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  itemErrorBlock: { alignItems: 'flex-start', paddingVertical: 8 },
  itemErrorText: { fontSize: 12, color: '#C62828', fontWeight: '700' },
  emptyItemsText: { fontSize: 12, color: '#A89685', fontWeight: '600', paddingVertical: 8 },
  itemSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBF7',
    borderWidth: 1,
    borderColor: '#F0E2D3',
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
  },
  itemSectionMuted: { opacity: 0.55 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderWidth: 1.5,
  },
  checkboxOn: { backgroundColor: '#D2691E', borderColor: '#D2691E' },
  checkboxOff: { backgroundColor: '#FFFFFF', borderColor: '#C7B7A6' },
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
  itemPrice: { fontSize: 12.5, fontWeight: '800', color: '#2B1E1A' },
  strikeThrough: { textDecorationLine: 'line-through', color: '#A89685' },
  outOfStockTag: { backgroundColor: '#C62828', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, marginLeft: 6 },
  outOfStockTagText: { color: '#FFFFFF', fontSize: 8, fontWeight: '800' },
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
  adjustedTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  adjustedTotalLabel: { fontSize: 12, fontWeight: '700', color: '#5C4033' },
  adjustedTotalValue: { fontSize: 13, fontWeight: '800', color: '#2E7D32' },
});
