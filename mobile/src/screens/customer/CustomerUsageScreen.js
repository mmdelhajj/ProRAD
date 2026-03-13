import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Card, ProgressBar, LoadingScreen } from '../../components';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { formatBytes, formatDate } from '../../utils/format';
import { customerApi } from '../../services/api';

// ---------------------------------------------------------------------------
// Tab options
// ---------------------------------------------------------------------------

const TABS = [
  { key: 'daily', label: 'Daily' },
  { key: 'monthly', label: 'Monthly' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getLast30Days() {
  const days = [];
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

function getCurrentMonthDays() {
  const today = new Date();
  const days = [];
  for (let i = today.getDate(); i >= 1; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

function getDaysRemainingInMonth() {
  const today = new Date();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return lastDay.getDate() - today.getDate();
}

function formatDayLabel(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  if (dateStr === todayStr) return 'Today';
  if (dateStr === yesterdayStr) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// UsageRow
// ---------------------------------------------------------------------------

const UsageRow = ({ date, download, upload, sessions, isLast }) => (
  <View style={[rowStyles.container, !isLast && rowStyles.border]}>
    <View style={rowStyles.dateCol}>
      <Text style={rowStyles.dateText}>{formatDayLabel(date)}</Text>
      {sessions > 0 && (
        <Text style={rowStyles.sessionsText}>
          {sessions} session{sessions !== 1 ? 's' : ''}
        </Text>
      )}
    </View>
    <View style={rowStyles.dataCol}>
      <View style={rowStyles.dataRow}>
        <View style={[rowStyles.dot, { backgroundColor: colors.primary }]} />
        <Text style={rowStyles.dataLabel}>DL</Text>
        <Text style={rowStyles.dataValue}>{formatBytes(download)}</Text>
      </View>
      <View style={rowStyles.dataRow}>
        <View style={[rowStyles.dot, { backgroundColor: colors.success }]} />
        <Text style={rowStyles.dataLabel}>UL</Text>
        <Text style={rowStyles.dataValue}>{formatBytes(upload)}</Text>
      </View>
    </View>
  </View>
);

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  border: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  dateCol: {
    flex: 1,
  },
  dateText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
  },
  sessionsText: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: 1,
  },
  dataCol: {
    alignItems: 'flex-end',
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 0,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: borderRadius.sm,
    marginRight: spacing.xs,
  },
  dataLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    width: 18,
  },
  dataValue: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
    minWidth: 60,
    textAlign: 'right',
  },
});

// ---------------------------------------------------------------------------
// TotalRow
// ---------------------------------------------------------------------------

const TotalRow = ({ download, upload }) => (
  <View style={totalStyles.container}>
    <Text style={totalStyles.label}>Total</Text>
    <View style={totalStyles.dataCol}>
      <View style={totalStyles.dataRow}>
        <View style={[totalStyles.dot, { backgroundColor: colors.primary }]} />
        <Text style={totalStyles.text}>{formatBytes(download)}</Text>
      </View>
      <View style={totalStyles.dataRow}>
        <View style={[totalStyles.dot, { backgroundColor: colors.success }]} />
        <Text style={totalStyles.text}>{formatBytes(upload)}</Text>
      </View>
    </View>
  </View>
);

const totalStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 2,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
  },
  label: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
    flex: 1,
  },
  dataCol: {
    alignItems: 'flex-end',
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 0,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: borderRadius.sm,
    marginRight: spacing.xs,
  },
  text: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
    minWidth: 72,
    textAlign: 'right',
  },
});

// ---------------------------------------------------------------------------
// CustomerUsageScreen
// ---------------------------------------------------------------------------

const CustomerUsageScreen = () => {
  const [activeTab, setActiveTab] = useState('daily');
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // -----------------------------------------------------------------------
  // Fetch
  // -----------------------------------------------------------------------

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await customerApi.usage();
      if (res?.data) {
        const raw = res.data.data || res.data;
        // Handle both nested { daily: [...] } and flat array responses
        if (Array.isArray(raw)) {
          setData({ daily: raw });
        } else {
          setData(raw);
        }
      }
    } catch (err) {
      console.error('CustomerUsageScreen fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchData(true);
  }, [fetchData]);

  // -----------------------------------------------------------------------
  // First load
  // -----------------------------------------------------------------------

  if (isLoading && !data) {
    return <LoadingScreen message="Loading usage data..." />;
  }

  // -----------------------------------------------------------------------
  // Build daily rows from API data
  // -----------------------------------------------------------------------

  const dailyUsage = data?.daily || data?.daily_usage || [];
  const monthlyInfo = data?.monthly || data?.monthly_usage || {};

  // Build a map of date -> usage record
  const dailyMap = {};
  if (Array.isArray(dailyUsage)) {
    dailyUsage.forEach((entry) => {
      const key = entry.date || entry.day;
      if (key) {
        dailyMap[key] = {
          download: entry.download || entry.download_bytes || 0,
          upload: entry.upload || entry.upload_bytes || 0,
          sessions: entry.sessions || entry.session_count || 0,
        };
      }
    });
  }

  // -----------------------------------------------------------------------
  // Daily tab data
  // -----------------------------------------------------------------------

  const last30 = getLast30Days();
  const dailyRows = last30.map((date) => ({
    date,
    download: dailyMap[date]?.download || 0,
    upload: dailyMap[date]?.upload || 0,
    sessions: dailyMap[date]?.sessions || 0,
  }));

  const dailyTotalDownload = dailyRows.reduce((sum, r) => sum + r.download, 0);
  const dailyTotalUpload = dailyRows.reduce((sum, r) => sum + r.upload, 0);

  // -----------------------------------------------------------------------
  // Monthly tab data
  // -----------------------------------------------------------------------

  const monthlyDownloadUsed = monthlyInfo.download_used || monthlyInfo.monthly_download_used || data?.monthly_download_used || 0;
  const monthlyUploadUsed = monthlyInfo.upload_used || monthlyInfo.monthly_upload_used || data?.monthly_upload_used || 0;
  const monthlyDownloadQuota = monthlyInfo.download_quota || monthlyInfo.monthly_quota || data?.monthly_quota || 0;
  const monthlyUploadQuota = monthlyInfo.upload_quota || monthlyInfo.monthly_upload_quota || monthlyDownloadQuota;
  const daysRemaining = getDaysRemainingInMonth();

  const currentMonthDays = getCurrentMonthDays();
  const monthlyDailyRows = currentMonthDays.map((date) => ({
    date,
    download: dailyMap[date]?.download || 0,
    upload: dailyMap[date]?.upload || 0,
    sessions: dailyMap[date]?.sessions || 0,
  }));

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const renderDailyItem = ({ item, index }) => (
    <UsageRow
      date={item.date}
      download={item.download}
      upload={item.upload}
      sessions={item.sessions}
      isLast={index === dailyRows.length - 1}
    />
  );

  const renderMonthlyDailyItem = ({ item, index }) => (
    <UsageRow
      date={item.date}
      download={item.download}
      upload={item.upload}
      sessions={item.sessions}
      isLast={index === monthlyDailyRows.length - 1}
    />
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Usage History</Text>
      </View>

      {/* Tab Selector */}
      <View style={styles.tabRow}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            activeOpacity={0.7}
            onPress={() => setActiveTab(tab.key)}
            style={[
              styles.tab,
              activeTab === tab.key && styles.tabActive,
            ]}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab.key && styles.tabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {activeTab === 'daily' ? (
        <FlatList
          data={dailyRows}
          keyExtractor={(item) => item.date}
          renderItem={renderDailyItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListFooterComponent={
            dailyRows.length > 0 ? (
              <View style={styles.footerCard}>
                <TotalRow download={dailyTotalDownload} upload={dailyTotalUpload} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No usage data available</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={monthlyDailyRows}
          keyExtractor={(item) => item.date}
          renderItem={renderMonthlyDailyItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListHeaderComponent={
            <View style={styles.monthlySummary}>
              {/* Monthly Summary Card */}
              <Card title="Current Month" style={styles.summaryCard}>
                {monthlyDownloadQuota > 0 && (
                  <>
                    <ProgressBar
                      label="Monthly Download"
                      value={monthlyDownloadUsed}
                      total={monthlyDownloadQuota}
                    />
                    <View style={{ height: spacing.base }} />
                    <ProgressBar
                      label="Monthly Upload"
                      value={monthlyUploadUsed}
                      total={monthlyUploadQuota || monthlyDownloadQuota}
                    />
                  </>
                )}
                {monthlyDownloadQuota === 0 && (
                  <View style={styles.noQuotaRow}>
                    <Text style={styles.noQuotaLabel}>Download Used</Text>
                    <Text style={styles.noQuotaValue}>{formatBytes(monthlyDownloadUsed)}</Text>
                  </View>
                )}
                <View style={styles.daysRemainingRow}>
                  <Text style={styles.daysRemainingLabel}>Days remaining in billing cycle</Text>
                  <Text style={styles.daysRemainingValue}>{daysRemaining}</Text>
                </View>
              </Card>

              {/* Section label for daily breakdown */}
              <View style={styles.breakdownHeader}>
                <Text style={styles.breakdownTitle}>Daily Breakdown</Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No usage data for this month</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: spacing.xxxl + spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.text,
  },

  // Tab selector
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.xs + 1,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceHover,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.textInverse,
  },

  // List
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.tabBar,
  },
  footerCard: {
    marginTop: spacing.xs,
  },

  // Monthly summary
  monthlySummary: {
    marginBottom: spacing.xs,
  },
  summaryCard: {
    marginBottom: spacing.md,
  },
  noQuotaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  noQuotaLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  noQuotaValue: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
  },
  daysRemainingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  daysRemainingLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  daysRemainingValue: {
    ...typography.h4,
    color: colors.primary,
  },

  breakdownHeader: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  breakdownTitle: {
    ...typography.h4,
    color: colors.text,
  },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
});

export default CustomerUsageScreen;
