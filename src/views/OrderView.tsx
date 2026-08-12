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
  const [outOfStockIds, setOutOfStockIds] = useState<Set<number>>(new Set());

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
      mode: 'initial' | 'refresh' = 'initial',
      signal?: AbortSignal,
    ) => {
      const token = await resolveToken();

      if (signal?.aborted) return;

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

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      const onParentAbort = () => controller.abort();
      if (signal) {
        if (signal.aborted) {
          clearTimeout(timeoutId);
          return;
        }
        signal.addEventListener('abort', onParentAbort);
      }

      try {
        const query = statusFilter !== 'ALL' ? `?status=${encodeURIComponent(statusFilter)}` : '';
        const response = await fetch(`${BASE_URL}/v1/admin/orders${query}`, {
          method: 'GET',
          headers: {
            accept: '*/*',
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        if (signal?.aborted) return;

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

        const list = Array.isArray(payload) ? payload : [];
        const normalized = list
          .map(normalizeSummary)
          .filter((item: OrderSummary | null): item is OrderSummary => item !== null);

        if (signal?.aborted) return;
        setOrders(normalized);
      } catch (error: any) {
        if (error?.name === 'AbortError' || signal?.aborted) {
          return;
        }
        setErrorMessage('Network error. Please check your connection and try again.');
        setOrders([]);
      } finally {
        clearTimeout(timeoutId);
        if (signal) {
          signal.removeEventListener('abort', onParentAbort);
        }
        if (!signal?.aborted) {
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

  const handleToggleExpand = useCallback((orderId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  }, []);

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

  const renderOrderCard = useCallback(
    ({ item }: { item: OrderSummary }) => {
      const isExpanded = expandedIds.has(item.orderId);
      const isSelected = !outOfStockIds.has(item.orderId);
      const statusColor = getStatusColor(item.status);

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
              onPress={() => handleToggleExpand(item.orderId)}
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
                    {prettyStatus(item.status)}
                  </Text>
                </View>
                <Text style={styles.headerAmountText}>{formatMoney(item.totalAmount)}</Text>
              </View>

              <View style={styles.chevronWrap}>
                <ChevronIcon open={isExpanded} />
              </View>
            </TouchableOpacity>
          </View>

          {isExpanded && (
            <View style={styles.cardBody}>
              <DetailRow label="Order ID" value={String(item.orderId)} />
              <DetailRow label="Customer phone" value={item.customerPhone || '-'} />
              <DetailRow label="Total items" value={String(item.totalItems)} />
              <DetailRow label="Delivery type" value={item.deliveryType || '-'} />
              <DetailRow label="Placed on" value={formatDate(item.createdAt)} />

              <View style={styles.divider} />

              <DetailRow label="Subtotal" value={formatMoney(item.subtotal)} />
              <DetailRow label="GST" value={formatMoney(item.totalGst)} />
              <DetailRow label="Delivery charge" value={formatMoney(item.deliveryCharge)} />

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total amount</Text>
                <Text style={styles.totalValue}>{formatMoney(item.totalAmount)}</Text>
              </View>

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
    [expandedIds, handleToggleExpand, outOfStockIds, toggleOutOfStock],
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
                ? 'There are no orders yet.'
                : `No orders with status "${prettyStatus(selectedStatus)}".`}
            </Text>
          </View>
        ) : (
          <FlatList
            data={orders}
            keyExtractor={keyExtractor}
            renderItem={renderOrderCard}
            extraData={{ expandedIds, outOfStockIds }}
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
});
