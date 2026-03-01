import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  Platform,
  Modal,
} from 'react-native';
import { Card, EmptyState, LoadingScreen, StatCard } from '../../components';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { formatCurrency, formatDate } from '../../utils/format';
import api from '../../services/api';

// ---------------------------------------------------------------------------
// Date Range Presets
// ---------------------------------------------------------------------------

const DATE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
  { key: 'year', label: 'This Year' },
];

function getDateRange(preset) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  let start;

  switch (preset) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case '7d':
      start = new Date(now.getTime() - 7 * 86400000);
      break;
    case '30d':
      start = new Date(now.getTime() - 30 * 86400000);
      break;
    case '90d':
      start = new Date(now.getTime() - 90 * 86400000);
      break;
    case 'year':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      start = new Date(now.getTime() - 30 * 86400000);
  }

  return {
    start_date: start.toISOString().split('T')[0],
    end_date: end.toISOString().split('T')[0],
  };
}

// ---------------------------------------------------------------------------
// Report Type Selector
// ---------------------------------------------------------------------------

const REPORT_TYPES = [
  {
    key: 'subscribers',
    label: 'My Subscribers',
    icon: '\uD83D\uDC65',
    description: 'Subscriber statistics and trends',
    color: colors.primary,
  },
  {
    key: 'revenue',
    label: 'My Revenue',
    icon: '\uD83D\uDCB0',
    description: 'Revenue breakdown and totals',
    color: colors.success,
  },
];

// ---------------------------------------------------------------------------
// Date Range Picker
// ---------------------------------------------------------------------------

const DateRangePicker = ({ selected, onSelect }) => (
  <View style={dateStyles.container}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {DATE_PRESETS.map((preset) => {
        const isActive = selected === preset.key;
        return (
          <TouchableOpacity
            key={preset.key}
            style={[dateStyles.chip, isActive && dateStyles.chipActive]}
            onPress={() => onSelect(preset.key)}
            activeOpacity={0.7}
          >
            <Text
              style={[dateStyles.chipText, isActive && dateStyles.chipTextActive]}
            >
              {preset.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  </View>
);

const dateStyles = StyleSheet.create({
  container: {
    paddingVertical: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
    backgroundColor: colors.surfaceHover,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.textInverse,
  },
});

// ---------------------------------------------------------------------------
// Subscriber Report View
// ---------------------------------------------------------------------------

const SubscriberReport = ({ data, loading, dateLabel }) => {
  if (loading) {
    return (
      <View style={reportStyles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={reportStyles.loadingText}>Loading report...</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={'\uD83D\uDCC1'}
        title="No Data"
        message="No subscriber data available for the selected period."
      />
    );
  }

  const stats = data.stats || data;

  return (
    <View style={reportStyles.container}>
      {/* Stat Cards Row */}
      <View style={reportStyles.statsGrid}>
        <View style={reportStyles.statHalf}>
          <StatCard
            label="Total Subscribers"
            value={String(stats.total || stats.total_subscribers || 0)}
            icon={'\uD83D\uDC65'}
            color={colors.primary}
          />
        </View>
        <View style={reportStyles.statHalf}>
          <StatCard
            label="Active"
            value={String(stats.active || stats.active_subscribers || 0)}
            icon={'\u2705'}
            color={colors.success}
          />
        </View>
      </View>

      <View style={reportStyles.statsGrid}>
        <View style={reportStyles.statHalf}>
          <StatCard
            label="Online Now"
            value={String(stats.online || stats.online_count || 0)}
            icon={'\uD83D\uDFE2'}
            color={colors.online}
          />
        </View>
        <View style={reportStyles.statHalf}>
          <StatCard
            label="Expired"
            value={String(stats.expired || stats.expired_count || 0)}
            icon={'\u26A0\uFE0F'}
            color={colors.warning}
          />
        </View>
      </View>

      <View style={reportStyles.statsGrid}>
        <View style={reportStyles.statHalf}>
          <StatCard
            label="New This Period"
            value={String(stats.new_subscribers || stats.new || 0)}
            icon={'\u2795'}
            color={colors.info}
          />
        </View>
        <View style={reportStyles.statHalf}>
          <StatCard
            label="Inactive"
            value={String(stats.inactive || stats.inactive_count || 0)}
            icon={'\u26D4'}
            color={colors.inactive}
          />
        </View>
      </View>

      {/* Subscribers by Service */}
      {(stats.by_service || data.by_service) && (
        <Card
          title="By Service"
          subtitle="Subscriber count per service plan"
          style={reportStyles.sectionCard}
        >
          {(stats.by_service || data.by_service || []).map((item, idx) => (
            <View
              key={idx}
              style={[
                reportStyles.serviceRow,
                idx > 0 && reportStyles.serviceRowBorder,
              ]}
            >
              <Text style={reportStyles.serviceName} numberOfLines={1}>
                {item.name || item.service_name || '-'}
              </Text>
              <View style={reportStyles.serviceCountBadge}>
                <Text style={reportStyles.serviceCount}>
                  {item.count || item.subscriber_count || 0}
                </Text>
              </View>
            </View>
          ))}
          {(stats.by_service || data.by_service || []).length === 0 && (
            <Text style={reportStyles.noData}>No service breakdown available.</Text>
          )}
        </Card>
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Revenue Report View
// ---------------------------------------------------------------------------

const RevenueReport = ({ data, loading, dateLabel }) => {
  if (loading) {
    return (
      <View style={reportStyles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={reportStyles.loadingText}>Loading report...</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={'\uD83D\uDCC1'}
        title="No Data"
        message="No revenue data available for the selected period."
      />
    );
  }

  return (
    <View style={reportStyles.container}>
      {/* Revenue Cards */}
      <View style={reportStyles.statsGrid}>
        <View style={reportStyles.statHalf}>
          <StatCard
            label="Total Revenue"
            value={formatCurrency(data.totalRevenue || 0)}
            icon={'\uD83D\uDCB0'}
            color={colors.success}
          />
        </View>
        <View style={reportStyles.statHalf}>
          <StatCard
            label="Payments"
            value={String(data.paymentCount || 0)}
            icon={'\uD83D\uDCC8'}
            color={colors.primary}
          />
        </View>
      </View>

      {/* Revenue by Payment Method */}
      {data.byMethod && data.byMethod.length > 0 && (
        <Card
          title="By Payment Method"
          style={reportStyles.sectionCard}
        >
          {data.byMethod.map((item, idx) => (
            <View
              key={idx}
              style={[
                reportStyles.serviceRow,
                idx > 0 && reportStyles.serviceRowBorder,
              ]}
            >
              <Text style={reportStyles.serviceName} numberOfLines={1}>
                {item.payment_method || 'Unknown'}
              </Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={reportStyles.revenueValue}>
                  {formatCurrency(item.amount || 0)}
                </Text>
                <Text style={reportStyles.noData}>{item.count || 0} txn</Text>
              </View>
            </View>
          ))}
        </Card>
      )}

      {/* Daily Revenue */}
      {data.dailyRevenue && data.dailyRevenue.length > 0 && (
        <Card
          title="Daily Revenue"
          style={reportStyles.sectionCard}
        >
          {data.dailyRevenue.slice(-10).map((item, idx) => (
            <View
              key={idx}
              style={[
                reportStyles.serviceRow,
                idx > 0 && reportStyles.serviceRowBorder,
              ]}
            >
              <Text style={reportStyles.serviceName}>{item.date}</Text>
              <Text style={reportStyles.revenueValue}>
                {formatCurrency(item.amount || 0)}
              </Text>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
};

const reportStyles = StyleSheet.create({
  container: {
    paddingTop: spacing.sm,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  statHalf: {
    flex: 1,
  },
  sectionCard: {
    marginTop: spacing.md,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  serviceRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  serviceName: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    marginRight: spacing.md,
  },
  serviceCountBadge: {
    backgroundColor: colors.primary + '15',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    minWidth: 40,
    alignItems: 'center',
  },
  serviceCount: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.primary,
  },
  revenueValue: {
    ...typography.body,
    fontWeight: '700',
    color: colors.success,
  },
  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  txnInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  txnName: {
    ...typography.body,
    color: colors.text,
    fontWeight: '500',
  },
  txnDate: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: 2,
  },
  txnAmount: {
    ...typography.h4,
    fontWeight: '700',
  },
  noData: {
    ...typography.body,
    color: colors.textSecondary,
    fontStyle: 'italic',
    paddingVertical: spacing.md,
    textAlign: 'center',
  },
});

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

const ReportsScreen = ({ navigation }) => {
  const [reportType, setReportType] = useState(null);
  const [datePreset, setDatePreset] = useState('30d');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reportData, setReportData] = useState(null);

  // ------ Map preset to backend period param ------
  const presetToPeriod = (preset) => {
    switch (preset) {
      case 'today': return 'day';
      case '7d': return 'week';
      case '90d':
      case '30d': return 'month';
      case 'year': return 'year';
      default: return 'month';
    }
  };

  // ------ Fetch report data ------
  const fetchReport = useCallback(
    async (type, preset) => {
      if (!type) return;
      setLoading(true);
      try {
        const params = type === 'revenue'
          ? { period: presetToPeriod(preset) }
          : {};
        const endpoint =
          type === 'subscribers'
            ? '/api/reports/subscribers'
            : '/api/reports/revenue';
        const res = await api.get(endpoint, { params });
        setReportData(res.data?.data || res.data);
      } catch (err) {
        setReportData(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // ------ When report type or date changes ------
  useEffect(() => {
    if (reportType) {
      fetchReport(reportType, datePreset);
    }
  }, [reportType, datePreset, fetchReport]);

  // ------ Pull to refresh ------
  const onRefresh = useCallback(async () => {
    if (!reportType) return;
    setRefreshing(true);
    await fetchReport(reportType, datePreset);
    setRefreshing(false);
  }, [reportType, datePreset, fetchReport]);

  // ------ Date label ------
  const dateLabel = DATE_PRESETS.find((p) => p.key === datePreset)?.label || '';

  // ------ Report type selection (landing view) ------
  if (!reportType) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.pageTitle}>Reports</Text>
          <Text style={styles.pageSubtitle}>
            Select a report type to view your data
          </Text>

          {REPORT_TYPES.map((rpt) => (
            <TouchableOpacity
              key={rpt.key}
              style={styles.reportCard}
              onPress={() => setReportType(rpt.key)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.reportIconBox,
                  { backgroundColor: rpt.color + '15' },
                ]}
              >
                <Text style={styles.reportIcon}>{rpt.icon}</Text>
              </View>
              <View style={styles.reportInfo}>
                <Text style={styles.reportLabel}>{rpt.label}</Text>
                <Text style={styles.reportDesc}>{rpt.description}</Text>
              </View>
              <Text style={styles.reportChevron}>{'\u203A'}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ------ Report view ------
  const currentReport = REPORT_TYPES.find((r) => r.key === reportType);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* Back + Title */}
        <View style={styles.reportHeader}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              setReportType(null);
              setReportData(null);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.backIcon}>{'\u2190'}</Text>
          </TouchableOpacity>
          <View style={styles.reportTitleContainer}>
            <Text style={styles.reportTitle}>
              {currentReport?.icon} {currentReport?.label}
            </Text>
            <Text style={styles.reportDateLabel}>
              {dateLabel} report
            </Text>
          </View>
        </View>

        {/* Date Range Picker */}
        <DateRangePicker selected={datePreset} onSelect={setDatePreset} />

        {/* Report Content */}
        {reportType === 'subscribers' ? (
          <SubscriberReport
            data={reportData}
            loading={loading}
            dateLabel={dateLabel}
          />
        ) : (
          <RevenueReport
            data={reportData}
            loading={loading}
            dateLabel={dateLabel}
          />
        )}

        <View style={{ height: spacing.tabBar }} />
      </ScrollView>
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing.tabBar,
  },
  pageTitle: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  pageSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  reportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  reportIconBox: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  reportIcon: {
    fontSize: 24,
  },
  reportInfo: {
    flex: 1,
  },
  reportLabel: {
    ...typography.h4,
    color: colors.text,
    marginBottom: 2,
  },
  reportDesc: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  reportChevron: {
    ...typography.h2,
    color: colors.textLight,
    marginLeft: spacing.sm,
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceHover,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  backIcon: {
    fontSize: 20,
    color: colors.text,
    fontWeight: '700',
  },
  reportTitleContainer: {
    flex: 1,
  },
  reportTitle: {
    ...typography.h3,
    color: colors.text,
  },
  reportDateLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
});

export default ReportsScreen;
