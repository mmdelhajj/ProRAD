import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  Platform,
} from 'react-native';
import { Card, EmptyState, LoadingScreen, StatusBadge } from '../../components';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { formatCurrency, formatDate } from '../../utils/format';
import api from '../../services/api';

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG = {
  paid: {
    label: 'Paid',
    bg: colors.success + '15',
    color: colors.success,
    icon: '\u2713',
  },
  unpaid: {
    label: 'Unpaid',
    bg: colors.warning + '15',
    color: colors.warning,
    icon: '\u23F3',
  },
  overdue: {
    label: 'Overdue',
    bg: colors.danger + '15',
    color: colors.danger,
    icon: '\u26A0',
  },
};

function getStatusConfig(status) {
  if (!status) return STATUS_CONFIG.unpaid;
  const key = status.toLowerCase();
  return STATUS_CONFIG[key] || STATUS_CONFIG.unpaid;
}

// ---------------------------------------------------------------------------
// Filter Tabs
// ---------------------------------------------------------------------------

const FILTER_TABS = [
  { key: '', label: 'All' },
  { key: 'paid', label: 'Paid' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'overdue', label: 'Overdue' },
];

const FilterTabs = ({ active, onSelect }) => (
  <View style={filterStyles.container}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {FILTER_TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[filterStyles.tab, isActive && filterStyles.tabActive]}
            onPress={() => onSelect(tab.key)}
            activeOpacity={0.7}
          >
            <Text
              style={[filterStyles.tabText, isActive && filterStyles.tabTextActive]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  </View>
);

const filterStyles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
    backgroundColor: colors.surfaceHover,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.textInverse,
  },
});

// ---------------------------------------------------------------------------
// Invoice Row
// ---------------------------------------------------------------------------

const InvoiceRow = ({ item, onPress }) => {
  const sc = getStatusConfig(item.status);

  return (
    <TouchableOpacity
      style={rowStyles.container}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <View style={rowStyles.leftSection}>
        <View style={[rowStyles.statusDot, { backgroundColor: sc.color }]} />
        <View style={rowStyles.info}>
          <Text style={rowStyles.invoiceNo} numberOfLines={1}>
            #{item.invoice_number || item.id}
          </Text>
          <Text style={rowStyles.subscriber} numberOfLines={1}>
            {item.subscriber_name || item.subscriber?.full_name || item.subscriber?.username || '-'}
          </Text>
          <Text style={rowStyles.date}>
            {formatDate(item.created_at || item.date, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </Text>
        </View>
      </View>
      <View style={rowStyles.rightSection}>
        <Text style={rowStyles.amount}>
          {formatCurrency(item.amount || item.total || 0)}
        </Text>
        <View style={[rowStyles.badge, { backgroundColor: sc.bg }]}>
          <Text style={[rowStyles.badgeText, { color: sc.color }]}>
            {sc.icon} {sc.label}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.md,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.md,
  },
  info: {
    flex: 1,
  },
  invoiceNo: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  subscriber: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  date: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: 2,
  },
  rightSection: {
    alignItems: 'flex-end',
  },
  amount: {
    ...typography.h4,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    ...typography.caption,
    fontWeight: '600',
  },
});

// ---------------------------------------------------------------------------
// Invoice Detail Modal
// ---------------------------------------------------------------------------

const InvoiceDetailModal = ({ invoice, visible, onClose, onMarkPaid, marking }) => {
  if (!invoice) return null;

  const sc = getStatusConfig(invoice.status);
  const isPaid = invoice.status?.toLowerCase() === 'paid';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      onRequestClose={onClose}
    >
      <SafeAreaView style={detailStyles.safe}>
        {/* Header */}
        <View style={detailStyles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={detailStyles.closeBtn}>{'\u2715'}</Text>
          </TouchableOpacity>
          <Text style={detailStyles.headerTitle}>Invoice Detail</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          style={detailStyles.scroll}
          contentContainerStyle={detailStyles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Invoice Number */}
          <View style={detailStyles.topSection}>
            <Text style={detailStyles.invoiceNo}>
              Invoice #{invoice.invoice_number || invoice.id}
            </Text>
            <View style={[detailStyles.statusBadge, { backgroundColor: sc.bg }]}>
              <Text style={[detailStyles.statusText, { color: sc.color }]}>
                {sc.icon} {sc.label}
              </Text>
            </View>
          </View>

          {/* Amount */}
          <View style={detailStyles.amountBox}>
            <Text style={detailStyles.amountLabel}>Total Amount</Text>
            <Text style={detailStyles.amountValue}>
              {formatCurrency(invoice.amount || invoice.total || 0)}
            </Text>
          </View>

          {/* Details */}
          <Card>
            <DetailRow
              label="Subscriber"
              value={invoice.subscriber_name || invoice.subscriber?.full_name || '-'}
            />
            <DetailRow
              label="Username"
              value={invoice.subscriber?.username || '-'}
            />
            <DetailRow
              label="Service"
              value={invoice.service_name || invoice.service?.name || '-'}
            />
            <DetailRow
              label="Date"
              value={formatDate(invoice.created_at || invoice.date)}
            />
            <DetailRow
              label="Due Date"
              value={formatDate(invoice.due_date)}
            />
            {invoice.paid_at ? (
              <DetailRow
                label="Paid At"
                value={formatDate(invoice.paid_at)}
              />
            ) : null}
            {invoice.notes ? (
              <DetailRow label="Notes" value={invoice.notes} />
            ) : null}
          </Card>

          {/* Mark as Paid */}
          {!isPaid && (
            <TouchableOpacity
              style={detailStyles.markPaidBtn}
              onPress={() => onMarkPaid(invoice)}
              activeOpacity={0.7}
              disabled={marking}
            >
              {marking ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={detailStyles.markPaidText}>
                  {'\u2713'} Mark as Paid
                </Text>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const DetailRow = ({ label, value }) => (
  <View style={detailStyles.row}>
    <Text style={detailStyles.rowLabel}>{label}</Text>
    <Text style={detailStyles.rowValue} numberOfLines={2}>
      {value || '-'}
    </Text>
  </View>
);

const detailStyles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeBtn: {
    fontSize: 18,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  headerTitle: {
    ...typography.h4,
    color: colors.text,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
    paddingBottom: spacing.tabBar,
  },
  topSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  invoiceNo: {
    ...typography.h3,
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
  },
  statusText: {
    ...typography.bodySmall,
    fontWeight: '700',
  },
  amountBox: {
    backgroundColor: colors.primary + '08',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary + '20',
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  amountLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  amountValue: {
    ...typography.h1,
    color: colors.primary,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  rowLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flex: 1,
  },
  rowValue: {
    ...typography.body,
    color: colors.text,
    fontWeight: '500',
    flex: 1.5,
    textAlign: 'right',
  },
  markPaidBtn: {
    backgroundColor: colors.success,
    paddingVertical: spacing.base,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    minHeight: 52,
  },
  markPaidText: {
    ...typography.button,
    color: colors.textInverse,
    fontSize: 16,
  },
});

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

const InvoicesScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [marking, setMarking] = useState(false);

  // ------ Fetch invoices ------
  const fetchInvoices = useCallback(
    async (pageNum = 1, statusFilter = filter, append = false) => {
      try {
        const params = { page: pageNum, limit: 20 };
        if (statusFilter) params.status = statusFilter;

        const res = await api.get('/api/invoices', { params });
        const data = res.data?.data || res.data?.invoices || [];
        const list = Array.isArray(data) ? data : [];

        if (append) {
          setInvoices((prev) => [...prev, ...list]);
        } else {
          setInvoices(list);
        }

        // Determine if there are more pages
        const total = res.data?.total || res.data?.pagination?.total || 0;
        const currentCount = append
          ? invoices.length + list.length
          : list.length;
        setHasMore(list.length >= 20 && currentCount < total);
      } catch (err) {
        if (!append) setInvoices([]);
      }
    },
    [filter, invoices.length],
  );

  // ------ Initial load ------
  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchInvoices(1, filter, false);
      setLoading(false);
    })();
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------ Pull to refresh ------
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setPage(1);
    await fetchInvoices(1, filter, false);
    setRefreshing(false);
  }, [fetchInvoices, filter]);

  // ------ Load more ------
  const onEndReached = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    setPage(nextPage);
    await fetchInvoices(nextPage, filter, true);
    setLoadingMore(false);
  }, [hasMore, loadingMore, page, fetchInvoices, filter]);

  // ------ Filter change ------
  const handleFilterChange = useCallback((newFilter) => {
    setFilter(newFilter);
    setPage(1);
    setHasMore(true);
  }, []);

  // ------ Invoice press ------
  const handleInvoicePress = useCallback((invoice) => {
    setSelectedInvoice(invoice);
    setDetailVisible(true);
  }, []);

  // ------ Mark as paid ------
  const handleMarkPaid = useCallback(
    (invoice) => {
      Alert.alert(
        'Mark as Paid',
        `Mark invoice #${invoice.invoice_number || invoice.id} as paid?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm',
            onPress: async () => {
              setMarking(true);
              try {
                await api.put(`/api/invoices/${invoice.id}`, {
                  status: 'paid',
                });
                // Update local state
                setInvoices((prev) =>
                  prev.map((inv) =>
                    inv.id === invoice.id
                      ? { ...inv, status: 'paid', paid_at: new Date().toISOString() }
                      : inv,
                  ),
                );
                setSelectedInvoice((prev) =>
                  prev && prev.id === invoice.id
                    ? { ...prev, status: 'paid', paid_at: new Date().toISOString() }
                    : prev,
                );
                Alert.alert('Success', 'Invoice marked as paid.');
              } catch (err) {
                Alert.alert('Error', err.message || 'Failed to update invoice.');
              } finally {
                setMarking(false);
              }
            },
          },
        ],
      );
    },
    [],
  );

  // ------ Close detail ------
  const handleCloseDetail = useCallback(() => {
    setDetailVisible(false);
    setSelectedInvoice(null);
  }, []);

  // ------ Summary stats ------
  const totalAmount = invoices.reduce(
    (sum, inv) => sum + (inv.amount || inv.total || 0),
    0,
  );
  const paidCount = invoices.filter(
    (inv) => inv.status?.toLowerCase() === 'paid',
  ).length;
  const unpaidCount = invoices.filter(
    (inv) => inv.status?.toLowerCase() === 'unpaid',
  ).length;

  // ------ Render ------
  if (loading) {
    return <LoadingScreen message="Loading invoices..." />;
  }

  const ListHeader = () => (
    <View style={styles.statsRow}>
      <View style={styles.statBox}>
        <Text style={styles.statValue}>{invoices.length}</Text>
        <Text style={styles.statLabel}>Total</Text>
      </View>
      <View style={[styles.statBox, { borderLeftWidth: 1, borderLeftColor: colors.borderLight }]}>
        <Text style={[styles.statValue, { color: colors.success }]}>{paidCount}</Text>
        <Text style={styles.statLabel}>Paid</Text>
      </View>
      <View style={[styles.statBox, { borderLeftWidth: 1, borderLeftColor: colors.borderLight }]}>
        <Text style={[styles.statValue, { color: colors.warning }]}>{unpaidCount}</Text>
        <Text style={styles.statLabel}>Unpaid</Text>
      </View>
      <View style={[styles.statBox, { borderLeftWidth: 1, borderLeftColor: colors.borderLight }]}>
        <Text style={[styles.statValue, { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>
          {formatCurrency(totalAmount)}
        </Text>
        <Text style={styles.statLabel}>Total</Text>
      </View>
    </View>
  );

  const ListFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.loadingMore}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Filter Tabs */}
      <FilterTabs active={filter} onSelect={handleFilterChange} />

      {/* Invoice List */}
      <FlatList
        data={invoices}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <InvoiceRow item={item} onPress={handleInvoicePress} />
        )}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        ListEmptyComponent={
          <EmptyState
            icon={'\uD83D\uDCC4'}
            title="No Invoices"
            message={
              filter
                ? `No ${filter} invoices found.`
                : 'No invoices found.'
            }
          />
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Detail Modal */}
      <InvoiceDetailModal
        invoice={selectedInvoice}
        visible={detailVisible}
        onClose={handleCloseDetail}
        onMarkPaid={handleMarkPaid}
        marking={marking}
      />
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingBottom: spacing.tabBar,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statValue: {
    ...typography.h4,
    color: colors.text,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  loadingMore: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
});

export default InvoicesScreen;
