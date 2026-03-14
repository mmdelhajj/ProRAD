import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ProgressBar, CircularProgress, Card, StatusBadge, LoadingScreen } from '../../components';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { shadows } from '../../theme/shadows';
import {
  formatBytes,
  formatSpeed,
  formatDate,
  formatDuration,
  getTimeAgo,
} from '../../utils/format';
import { customerApi } from '../../services/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDaysUntilExpiry(expiryDate) {
  if (!expiryDate) return null;
  const exp = new Date(expiryDate);
  if (isNaN(exp.getTime())) return null;
  const now = new Date();
  const diffMs = exp.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function getStatusKey(data) {
  if (!data) return 'inactive';
  const status = (data.status || '').toLowerCase();
  if (status === 'expired') return 'expired';
  if (status === 'inactive') return 'inactive';
  if (data.is_online) return 'online';
  return 'active';
}

function getExpiryLabel(days) {
  if (days === null) return '';
  if (days > 0) return `Expires in ${days} day${days !== 1 ? 's' : ''}`;
  if (days === 0) return 'Expires today';
  return `Expired ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} ago`;
}

function getSessionDuration(sessionStart) {
  if (!sessionStart) return null;
  const start = new Date(sessionStart);
  if (isNaN(start.getTime())) return null;
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - start.getTime()) / 1000);
  if (diffSec <= 0) return null;
  return diffSec;
}

// ---------------------------------------------------------------------------
// Status Banner gradient colours
// ---------------------------------------------------------------------------

const STATUS_BANNER_COLORS = {
  online: { bg: colors.success, bgLight: '#059669' },
  active: { bg: colors.primary, bgLight: '#1d4ed8' },
  expired: { bg: colors.warning, bgLight: '#d97706' },
  inactive: { bg: colors.inactive, bgLight: '#64748b' },
};

// ---------------------------------------------------------------------------
// InfoRow (key-value line inside a Card)
// ---------------------------------------------------------------------------

const InfoRow = ({ label, value, isLast, iconName }) => (
  <View style={[infoStyles.row, !isLast && infoStyles.rowBorder]}>
    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
      {iconName && (
        <Ionicons name={iconName} size={15} color={colors.textSecondary} style={{ marginRight: spacing.xs }} />
      )}
      <Text style={infoStyles.label}>{label}</Text>
    </View>
    <Text style={infoStyles.value} numberOfLines={1}>
      {value || '-'}
    </Text>
  </View>
);

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  value: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
});

// ---------------------------------------------------------------------------
// CustomerDashboard
// ---------------------------------------------------------------------------

const CustomerDashboard = ({ navigation, route }) => {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const intervalRef = useRef(null);

  // -----------------------------------------------------------------------
  // Fetch
  // -----------------------------------------------------------------------

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await customerApi.dashboard();
      if (res?.data) {
        setData(res.data.data || res.data);
      }
    } catch (err) {
      console.error('CustomerDashboard fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
      intervalRef.current = setInterval(() => fetchData(true), 60000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }, [fetchData]),
  );

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchData(true);
  }, [fetchData]);

  // -----------------------------------------------------------------------
  // First-load
  // -----------------------------------------------------------------------

  if (isLoading && !data) {
    return <LoadingScreen message="Loading your account..." />;
  }

  // -----------------------------------------------------------------------
  // Derived values
  // -----------------------------------------------------------------------

  const statusKey = getStatusKey(data);
  const daysUntilExpiry = getDaysUntilExpiry(data?.expiry_date);
  const expiryLabel = getExpiryLabel(daysUntilExpiry);
  const bannerColors = STATUS_BANNER_COLORS[statusKey] || STATUS_BANNER_COLORS.inactive;

  const downloadSpeed = data?.download_speed ?? data?.service?.download_speed ?? 0;
  const uploadSpeed = data?.upload_speed ?? data?.service?.upload_speed ?? 0;
  const serviceName = data?.service_name ?? data?.service?.name ?? '';

  const fupLevel = data?.fup_level ?? 0;
  const fupDownloadSpeed = data?.fup_download_speed ?? data?.service?.fup_download_speed ?? 0;
  const fupUploadSpeed = data?.fup_upload_speed ?? data?.service?.fup_upload_speed ?? 0;

  const dailyDownloadUsed = data?.daily_download_used ?? 0;
  const dailyUploadUsed = data?.daily_upload_used ?? 0;
  const dailyQuota = data?.daily_quota ?? data?.service?.daily_quota ?? 0;
  const dailyUploadQuota = data?.daily_upload_quota ?? dailyQuota;

  const monthlyDownloadUsed = data?.monthly_download_used ?? data?.monthly_quota_used ?? 0;
  const monthlyUploadUsed = data?.monthly_upload_used ?? 0;
  const monthlyQuota = data?.monthly_quota ?? data?.service?.monthly_quota ?? 0;
  const monthlyUploadQuota = data?.monthly_upload_quota ?? monthlyQuota;
  const monthlyResetDate = data?.monthly_reset_date || data?.next_reset_date || '';

  const ipAddress = data?.ip_address ?? '';
  const macAddress = data?.mac_address ?? '';
  const lastSeen = data?.last_seen ?? '';
  const sessionStart = data?.session_start ?? data?.acct_start_time ?? '';
  const sessionDurationSec = getSessionDuration(sessionStart);

  const fullName = data?.full_name ?? '';
  const username = data?.username ?? '';
  const phone = data?.phone ?? '';
  const email = data?.email ?? '';
  const price = data?.price ?? data?.override_price ?? data?.service?.price ?? 0;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {/* ================================================================ */}
      {/* 1. Status Banner                                                 */}
      {/* ================================================================ */}
      <LinearGradient
        colors={['#2563eb', '#1e40af']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.statusBanner}
      >
        <View style={styles.bannerTop}>
          <StatusBadge
            status={statusKey}
            label={statusKey === 'online' ? 'Online' : statusKey.charAt(0).toUpperCase() + statusKey.slice(1)}
          />
          {data?.is_online !== undefined && (
            <View style={styles.onlineIndicator}>
              <View
                style={[
                  styles.onlineDot,
                  { backgroundColor: data.is_online ? '#4ade80' : colors.danger },
                ]}
              />
              <Text style={styles.onlineLabel}>
                {data.is_online ? 'Online' : 'Offline'}
              </Text>
            </View>
          )}
        </View>

        {serviceName ? (
          <Text style={styles.bannerServiceName}>{serviceName}</Text>
        ) : null}

        {expiryLabel ? (
          <Text style={styles.bannerExpiry}>{expiryLabel}</Text>
        ) : null}
      </LinearGradient>

      {/* ================================================================ */}
      {/* 2. Speed Info                                                    */}
      {/* ================================================================ */}
      <View style={styles.speedRow}>
        <View style={styles.speedCard}>
          <Ionicons name="arrow-down" size={18} color={colors.primary} style={{ marginBottom: spacing.xs }} />
          <Text style={styles.speedValue}>{formatSpeed(downloadSpeed)}</Text>
          <Text style={styles.speedLabel}>Download</Text>
        </View>
        <View style={styles.speedCard}>
          <Ionicons name="arrow-up" size={18} color={colors.primary} style={{ marginBottom: spacing.xs }} />
          <Text style={styles.speedValue}>{formatSpeed(uploadSpeed)}</Text>
          <Text style={styles.speedLabel}>Upload</Text>
        </View>
      </View>

      {fupLevel > 0 && (
        <View style={styles.fupBanner}>
          <View style={styles.fupBadge}>
            <Text style={styles.fupBadgeText}>FUP Level {fupLevel}</Text>
          </View>
          <Text style={styles.fupSpeedText}>
            {formatSpeed(fupDownloadSpeed)} / {formatSpeed(fupUploadSpeed)}
          </Text>
        </View>
      )}

      {/* ================================================================ */}
      {/* 3. Daily Usage                                                   */}
      {/* ================================================================ */}
      {dailyQuota > 0 && (
        <>
          <View style={styles.sectionHeaderInline}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="analytics-outline" size={18} color={colors.text} style={{ marginRight: spacing.xs }} />
              <Text style={styles.sectionTitle}>Daily Usage</Text>
            </View>
            <Text style={styles.sectionCaption}>Resets at midnight</Text>
          </View>

          <Card style={styles.usageCard}>
            <View style={styles.circularRow}>
              <CircularProgress
                label="Download"
                value={dailyDownloadUsed}
                total={dailyQuota}
              />
              <CircularProgress
                label="Upload"
                value={dailyUploadUsed}
                total={dailyUploadQuota || dailyQuota}
              />
            </View>
          </Card>
        </>
      )}

      {/* ================================================================ */}
      {/* 4. Monthly Usage                                                 */}
      {/* ================================================================ */}
      {monthlyQuota > 0 && (
        <>
          <View style={styles.sectionHeaderInline}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="calendar-outline" size={18} color={colors.text} style={{ marginRight: spacing.xs }} />
              <Text style={styles.sectionTitle}>Monthly Usage</Text>
            </View>
            <Text style={styles.sectionCaption}>
              {monthlyResetDate ? `Resets on ${formatDate(monthlyResetDate, { month: 'short', day: 'numeric' })}` : 'Monthly quota'}
            </Text>
          </View>

          <Card style={styles.usageCard}>
            <View style={styles.circularRow}>
              <CircularProgress
                label="Download"
                value={monthlyDownloadUsed}
                total={monthlyQuota}
              />
              <CircularProgress
                label="Upload"
                value={monthlyUploadUsed}
                total={monthlyUploadQuota || monthlyQuota}
              />
            </View>
          </Card>
        </>
      )}

      {/* ================================================================ */}
      {/* 5. Connection Info                                               */}
      {/* ================================================================ */}
      <View style={styles.sectionHeaderInline}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="wifi" size={18} color={colors.text} style={{ marginRight: spacing.xs }} />
          <Text style={styles.sectionTitle}>Connection Info</Text>
        </View>
      </View>

      <Card style={styles.infoCard}>
        <InfoRow label="IP Address" value={ipAddress} iconName="globe-outline" />
        <InfoRow label="MAC Address" value={macAddress} iconName="hardware-chip-outline" />
        <InfoRow label="Last Seen" value={lastSeen ? getTimeAgo(lastSeen) : '-'} iconName="time-outline" />
        <InfoRow
          label="Session Duration"
          value={data?.is_online && sessionDurationSec ? formatDuration(sessionDurationSec) : '-'}
          iconName="hourglass-outline"
          isLast
        />
      </Card>

      {/* ================================================================ */}
      {/* 6. Account Info                                                  */}
      {/* ================================================================ */}
      <View style={styles.sectionHeaderInline}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="person-outline" size={18} color={colors.text} style={{ marginRight: spacing.xs }} />
          <Text style={styles.sectionTitle}>Account Info</Text>
        </View>
      </View>

      <Card style={styles.infoCard}>
        <InfoRow label="Full Name" value={fullName} iconName="person-outline" />
        <InfoRow label="Username" value={username} iconName="at-outline" />
        <InfoRow label="Phone" value={phone} iconName="call-outline" />
        <InfoRow label="Email" value={email} iconName="mail-outline" />
        {price > 0 && (
          <InfoRow
            label="Monthly Price"
            value={`$${parseFloat(price).toFixed(2)}`}
            iconName="cash-outline"
            isLast
          />
        )}
        {!price && <View style={{ marginBottom: -spacing.md }} />}
      </Card>

      {/* Bottom spacer */}
      <View style={{ height: spacing.tabBar }} />
    </ScrollView>
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
  contentContainer: {
    paddingBottom: spacing.tabBar,
  },

  // Status Banner
  statusBanner: {
    paddingTop: spacing.xxxl + spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bannerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  onlineIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: borderRadius.md,
    marginRight: spacing.xs,
  },
  onlineLabel: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
  bannerServiceName: {
    ...typography.h3,
    color: colors.textInverse,
    marginBottom: spacing.xs,
  },
  bannerExpiry: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.85)',
  },

  // Speed Info
  speedRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  speedCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    ...shadows.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  // speedArrow style removed - Ionicons used instead
  speedValue: {
    ...typography.h4,
    color: colors.text,
    marginBottom: 1,
  },
  speedLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  // FUP Banner
  fupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.fup2 + '15',
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.fup2 + '30',
  },
  fupBadge: {
    backgroundColor: colors.fup2,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
    marginRight: spacing.xs,
  },
  fupBadgeText: {
    ...typography.caption,
    color: colors.textInverse,
    fontWeight: '700',
  },
  fupSpeedText: {
    ...typography.caption,
    color: colors.fup2,
    fontWeight: '600',
  },

  // Section headers (inline, smaller)
  sectionHeaderInline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.text,
  },
  sectionCaption: {
    ...typography.caption,
    color: colors.textLight,
  },

  // Usage / Info cards
  circularRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  usageCard: {
    marginHorizontal: spacing.md,
  },
  infoCard: {
    marginHorizontal: spacing.md,
  },
});

export default CustomerDashboard;
