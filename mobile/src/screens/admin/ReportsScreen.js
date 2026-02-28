import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
} from 'react-native';
import { EmptyState } from '../../components';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { reportApi } from '../../services/api';
import { formatCurrency, formatBytes } from '../../utils/format';

// ---------------------------------------------------------------------------
// Report types
// ---------------------------------------------------------------------------

const REPORT_TYPES = [
  {
    key: 'subscribers',
    icon: '\uD83D\uDC65',
    title: 'Subscriber Report',
    description: 'Current subscriber statistics',
    color: colors.primary,
  },
  {
    key: 'revenue',
    icon: '\uD83D\uDCB0',
    title: 'Revenue Report',
    description: 'Revenue data and payment analysis',
    color: colors.success,
  },
  {
    key: 'usage',
    icon: '\uD83D\uDCC8',
    title: 'Usage Report',
    description: 'Bandwidth usage by subscriber',
    color: colors.info,
  },
  {
    key: 'services',
    icon: '\uD83D\uDCE6',
    title: 'Service Report',
    description: 'Service plan statistics',
    color: colors.secondary || '#6b7280',
  },
];

// ---------------------------------------------------------------------------
// Period selector (for revenue/usage)
// ---------------------------------------------------------------------------

const PERIODS = [
  { key: 'day', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
];

const PeriodSelector = ({ selected, onSelect }) => (
  <View style={periodStyles.container}>
    {PERIODS.map((p) => {
      const active = selected === p.key;
      return (
        <TouchableOpacity
          key={p.key}
          style={[periodStyles.chip, active && periodStyles.chipActive]}
          onPress={() => onSelect(p.key)}
          activeOpacity={0.7}
        >
          <Text style={[periodStyles.chipText, active && periodStyles.chipTextActive]}>
            {p.label}
          </Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const periodStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  chip: {
    backgroundColor: colors.surfaceHover || colors.background,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.textInverse,
  },
});

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

const StatCard = ({ label, value, color, icon }) => (
  <View style={[statStyles.card, { borderLeftColor: color || colors.primary }]}>
    <Text style={statStyles.icon}>{icon}</Text>
    <Text style={[statStyles.value, { color: color || colors.text }]}>{value}</Text>
    <Text style={statStyles.label}>{label}</Text>
  </View>
);

const statStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    padding: spacing.md,
    alignItems: 'center',
  },
  icon: { fontSize: 20, marginBottom: spacing.xs },
  value: { ...typography.h3, fontWeight: '800', marginBottom: 2 },
  label: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
});

// ---------------------------------------------------------------------------
// Report Type Card
// ---------------------------------------------------------------------------

const ReportTypeCard = ({ report, isSelected, onPress }) => (
  <TouchableOpacity
    style={[
      cardStyles.container,
      isSelected && { borderColor: report.color, borderWidth: 2 },
    ]}
    onPress={() => onPress(report.key)}
    activeOpacity={0.7}
  >
    <View style={[cardStyles.iconBg, { backgroundColor: report.color + '15' }]}>
      <Text style={cardStyles.icon}>{report.icon}</Text>
    </View>
    <Text style={cardStyles.title}>{report.title}</Text>
    <Text style={cardStyles.description}>{report.description}</Text>
    {isSelected && (
      <View style={[cardStyles.selectedBadge, { backgroundColor: report.color }]}>
        <Text style={cardStyles.selectedText}>Selected</Text>
      </View>
    )}
  </TouchableOpacity>
);

const cardStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  iconBg: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  icon: { fontSize: 22 },
  title: { ...typography.h4, color: colors.text, marginBottom: spacing.xs },
  description: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 18 },
  selectedBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  selectedText: { ...typography.caption, color: colors.textInverse, fontWeight: '600' },
});

// ---------------------------------------------------------------------------
// Subscriber Report
// ---------------------------------------------------------------------------

const SubscriberReportView = ({ data }) => {
  if (!data) return <EmptyState icon={'\uD83D\uDCCA'} title="No Data" message="No subscriber data found." />;
  return (
    <View>
      <View style={styles.statsRow}>
        <View style={styles.statHalf}>
          <StatCard label="Total" value={String(data.total || 0)} icon={'\uD83D\uDC65'} color={colors.primary} />
        </View>
        <View style={styles.statHalf}>
          <StatCard label="Active" value={String(data.active || 0)} icon={'\u2705'} color={colors.success} />
        </View>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.statHalf}>
          <StatCard label="Online" value={String(data.online || 0)} icon={'\uD83D\uDFE2'} color="#22c55e" />
        </View>
        <View style={styles.statHalf}>
          <StatCard label="Expired" value={String(data.expired || 0)} icon={'\u26A0\uFE0F'} color={colors.warning} />
        </View>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.statHalf}>
          <StatCard label="New This Month" value={String(data.newThisMonth || 0)} icon={'\u2795'} color={colors.info} />
        </View>
        <View style={styles.statHalf}>
          <StatCard label="Expiring Soon" value={String(data.expiringSoon || 0)} icon={'\u23F3'} color={colors.danger} />
        </View>
      </View>
      {data.suspended > 0 && (
        <View style={styles.statsRow}>
          <View style={styles.statHalf}>
            <StatCard label="Suspended" value={String(data.suspended)} icon={'\u26D4'} color={colors.danger} />
          </View>
          <View style={styles.statHalf} />
        </View>
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Revenue Report
// ---------------------------------------------------------------------------

const RevenueReportView = ({ data }) => {
  if (!data) return <EmptyState icon={'\uD83D\uDCCA'} title="No Data" message="No revenue data found." />;
  return (
    <View>
      <View style={styles.statsRow}>
        <View style={styles.statHalf}>
          <StatCard label="Total Revenue" value={formatCurrency(data.totalRevenue || 0)} icon={'\uD83D\uDCB0'} color={colors.success} />
        </View>
        <View style={styles.statHalf}>
          <StatCard label="Payments" value={String(data.paymentCount || 0)} icon={'\uD83D\uDCC8'} color={colors.primary} />
        </View>
      </View>

      {/* Revenue by method */}
      {data.byMethod && data.byMethod.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.cardTitle}>By Payment Method</Text>
          {data.byMethod.map((item, idx) => (
            <View key={idx} style={[styles.listRow, idx > 0 && styles.listRowBorder]}>
              <Text style={styles.listLabel}>{item.payment_method || 'Unknown'}</Text>
              <View style={styles.listRight}>
                <Text style={styles.listValue}>{formatCurrency(item.amount || 0)}</Text>
                <Text style={styles.listSubValue}>{item.count || 0} txn</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Daily revenue */}
      {data.dailyRevenue && data.dailyRevenue.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.cardTitle}>Daily Revenue</Text>
          {data.dailyRevenue.slice(-10).map((item, idx) => (
            <View key={idx} style={[styles.listRow, idx > 0 && styles.listRowBorder]}>
              <Text style={styles.listLabel}>{item.date}</Text>
              <Text style={[styles.listValue, { color: colors.success }]}>{formatCurrency(item.amount || 0)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Usage Report
// ---------------------------------------------------------------------------

const UsageReportView = ({ data }) => {
  if (!data) return <EmptyState icon={'\uD83D\uDCCA'} title="No Data" message="No usage data found." />;
  const usage = data.totalUsage || {};
  return (
    <View>
      <View style={styles.statsRow}>
        <View style={styles.statHalf}>
          <StatCard label="Total Download" value={formatBytes(usage.total_download || 0)} icon={'\u2B07\uFE0F'} color={colors.info} />
        </View>
        <View style={styles.statHalf}>
          <StatCard label="Total Upload" value={formatBytes(usage.total_upload || 0)} icon={'\u2B06\uFE0F'} color={colors.primary} />
        </View>
      </View>

      {/* Top users */}
      {data.topUsers && data.topUsers.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.cardTitle}>Top Users by Download</Text>
          {data.topUsers.slice(0, 15).map((user, idx) => (
            <View key={idx} style={[styles.listRow, idx > 0 && styles.listRowBorder]}>
              <View style={styles.listRank}>
                <Text style={styles.rankText}>{idx + 1}</Text>
              </View>
              <Text style={[styles.listLabel, { flex: 1 }]} numberOfLines={1}>{user.username}</Text>
              <View style={styles.listRight}>
                <Text style={styles.listValue}>{formatBytes(user.download || 0)}</Text>
                <Text style={styles.listSubValue}>{formatBytes(user.upload || 0)} up</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Hourly usage */}
      {data.hourlyUsage && data.hourlyUsage.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.cardTitle}>Hourly Usage (Today)</Text>
          {data.hourlyUsage.map((item, idx) => (
            <View key={idx} style={[styles.listRow, idx > 0 && styles.listRowBorder]}>
              <Text style={styles.listLabel}>{String(item.hour).padStart(2, '0')}:00</Text>
              <View style={styles.listRight}>
                <Text style={styles.listValue}>{formatBytes(item.download || 0)}</Text>
                <Text style={styles.listSubValue}>{formatBytes(item.upload || 0)} up</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Service Report
// ---------------------------------------------------------------------------

const ServiceReportView = ({ data }) => {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return <EmptyState icon={'\uD83D\uDCCA'} title="No Data" message="No service data found." />;
  }
  const totalSubs = data.reduce((sum, s) => sum + (s.subscriber_count || 0), 0);
  const totalRevenue = data.reduce((sum, s) => sum + (s.revenue || 0), 0);
  return (
    <View>
      <View style={styles.statsRow}>
        <View style={styles.statHalf}>
          <StatCard label="Services" value={String(data.length)} icon={'\uD83D\uDCE6'} color={colors.primary} />
        </View>
        <View style={styles.statHalf}>
          <StatCard label="Total Subscribers" value={String(totalSubs)} icon={'\uD83D\uDC65'} color={colors.info} />
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.cardTitle}>Services Breakdown</Text>
        {data.map((svc, idx) => (
          <View key={svc.id || idx} style={[styles.listRow, idx > 0 && styles.listRowBorder]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.listLabel} numberOfLines={1}>{svc.name}</Text>
              <Text style={styles.listSubValue}>{svc.subscriber_count || 0} subscribers</Text>
            </View>
            <Text style={[styles.listValue, { color: colors.success }]}>
              {formatCurrency(svc.revenue || 0)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// ReportsScreen
// ---------------------------------------------------------------------------

const ReportsScreen = () => {
  const [selectedReport, setSelectedReport] = useState(null);
  const [period, setPeriod] = useState('month');
  const [reportData, setReportData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const needsPeriod = selectedReport === 'revenue' || selectedReport === 'usage';

  const generateReport = useCallback(async () => {
    if (!selectedReport) {
      Alert.alert('Select Report', 'Please select a report type first.');
      return;
    }

    setIsLoading(true);
    setHasLoaded(false);
    try {
      let res;
      switch (selectedReport) {
        case 'subscribers':
          res = await reportApi.subscribers();
          break;
        case 'revenue':
          res = await reportApi.revenue({ period });
          break;
        case 'usage':
          res = await reportApi.usage({ period });
          break;
        case 'services':
          res = await reportApi.services();
          break;
        default:
          res = await reportApi.subscribers();
      }
      setReportData(res?.data?.data || res?.data);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to generate report.');
      setReportData(null);
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }, [selectedReport, period]);

  const renderReport = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading report...</Text>
        </View>
      );
    }
    switch (selectedReport) {
      case 'subscribers':
        return <SubscriberReportView data={reportData} />;
      case 'revenue':
        return <RevenueReportView data={reportData} />;
      case 'usage':
        return <UsageReportView data={reportData} />;
      case 'services':
        return <ServiceReportView data={reportData} />;
      default:
        return null;
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Report Type Selection */}
      <Text style={styles.sectionTitle}>Select Report Type</Text>
      <View style={styles.reportGrid}>
        {REPORT_TYPES.map((report) => (
          <View key={report.key} style={styles.reportGridItem}>
            <ReportTypeCard
              report={report}
              isSelected={selectedReport === report.key}
              onPress={(key) => {
                setSelectedReport(key);
                setReportData(null);
                setHasLoaded(false);
              }}
            />
          </View>
        ))}
      </View>

      {/* Period Selector + Generate */}
      {selectedReport && (
        <View style={styles.sectionCard}>
          {needsPeriod && (
            <>
              <Text style={styles.periodLabel}>Time Period</Text>
              <PeriodSelector selected={period} onSelect={setPeriod} />
            </>
          )}
          <TouchableOpacity
            style={[styles.generateButton, isLoading && styles.generateButtonDisabled]}
            onPress={generateReport}
            disabled={isLoading}
            activeOpacity={0.7}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Text style={styles.generateButtonText}>Generate Report</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Results */}
      {hasLoaded && selectedReport && (
        <>
          <Text style={styles.sectionTitle}>Results</Text>
          {renderReport()}
        </>
      )}

      <View style={{ height: spacing.xxxl }} />
    </ScrollView>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  contentContainer: { paddingTop: spacing.base, paddingBottom: spacing.xxxl },
  sectionTitle: {
    ...typography.h4,
    color: colors.text,
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  reportGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.base,
  },
  reportGridItem: { width: '50%', paddingRight: spacing.sm },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.base,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  periodLabel: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  generateButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  generateButtonDisabled: { opacity: 0.6 },
  generateButtonText: { ...typography.button, color: colors.textInverse },
  loadingContainer: { alignItems: 'center', paddingVertical: spacing.xxxl },
  loadingText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.md },
  // Stat grid
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  statHalf: { flex: 1 },
  // Section card for lists
  cardTitle: {
    ...typography.h4,
    color: colors.text,
    marginBottom: spacing.md,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  listRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight || colors.border,
  },
  listLabel: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    marginRight: spacing.sm,
  },
  listRight: { alignItems: 'flex-end' },
  listValue: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  listSubValue: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  listRank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  rankText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primary,
  },
});

export default ReportsScreen;
