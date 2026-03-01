import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { StatCard, Card, SectionHeader, LoadingScreen } from '../../components';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { formatCurrency } from '../../utils/format';
import { dashboardApi } from '../../services/api';
import useAuthStore from '../../store/authStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getHealthColor(value) {
  if (value >= 90) return colors.danger;
  if (value >= 70) return colors.warning;
  return colors.success;
}

// ---------------------------------------------------------------------------
// Skeleton placeholder while first load is pending
// ---------------------------------------------------------------------------

const SkeletonBlock = ({ width, height, style }) => {
  const pulse = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        {
          width: width || '100%',
          height: height || 20,
          borderRadius: borderRadius.md,
          backgroundColor: colors.border,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
};

// ---------------------------------------------------------------------------
// System Health Ring
// ---------------------------------------------------------------------------

const HealthRing = ({ label, value, size = 72 }) => {
  const pct = typeof value === 'number' ? Math.min(Math.max(value, 0), 100) : 0;
  const ringColor = getHealthColor(pct);
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference - (pct / 100) * circumference;

  return (
    <View style={healthStyles.item}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        {/* Background track */}
        <View
          style={[
            healthStyles.ringTrack,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: 4,
              borderColor: colors.borderLight,
            },
          ]}
        />
        {/* Filled arc approximated with a clipped view */}
        <View
          style={[
            healthStyles.ringFilled,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: 4,
              borderColor: ringColor,
              borderRightColor: pct > 75 ? ringColor : 'transparent',
              borderBottomColor: pct > 50 ? ringColor : 'transparent',
              borderLeftColor: pct > 25 ? ringColor : 'transparent',
              transform: [{ rotate: '-90deg' }],
            },
          ]}
        />
        {/* Centre label */}
        <View style={healthStyles.ringCenter}>
          <Text style={[healthStyles.ringValue, { color: ringColor }]}>
            {Math.round(pct)}%
          </Text>
        </View>
      </View>
      <Text style={healthStyles.ringLabel}>{label}</Text>
    </View>
  );
};

const healthStyles = StyleSheet.create({
  item: {
    flex: 1,
    alignItems: 'center',
  },
  ringTrack: {
    position: 'absolute',
  },
  ringFilled: {
    position: 'absolute',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    ...typography.bodySmall,
    fontWeight: '700',
  },
  ringLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontWeight: '500',
  },
});

// ---------------------------------------------------------------------------
// AdminDashboard
// ---------------------------------------------------------------------------

const AdminDashboard = ({ navigation, route }) => {
  const authUser = useAuthStore((state) => state.user);
  const username = authUser?.username || authUser?.full_name || 'Admin';

  // Data state
  const [stats, setStats] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Timers
  const intervalRef = useRef(null);

  // -----------------------------------------------------------------------
  // Fetch data
  // -----------------------------------------------------------------------

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const [statsRes, metricsRes] = await Promise.all([
        dashboardApi.stats().catch(() => null),
        dashboardApi.systemMetrics().catch(() => null),
      ]);

      if (statsRes?.data) {
        const d = statsRes.data.data || statsRes.data;
        setStats(d);

        // Derive recent activity from stats if available
        if (d.recent_activity) {
          setRecentActivity(d.recent_activity.slice(0, 5));
        } else if (d.recent_subscribers) {
          setRecentActivity(d.recent_subscribers.slice(0, 5));
        }
      }

      if (metricsRes?.data) {
        const m = metricsRes.data.data || metricsRes.data;
        setMetrics(m);
      }
    } catch (err) {
      console.error('AdminDashboard fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Only fetch and run interval when this tab is focused
  useFocusEffect(
    useCallback(() => {
      fetchData();
      intervalRef.current = setInterval(() => fetchData(true), 30000);
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
  // Derived values
  // -----------------------------------------------------------------------

  const onlineUsers = stats?.online_subscribers ?? stats?.online ?? 0;
  const offlineUsers = stats?.offline_subscribers ?? stats?.offline ?? 0;
  const activeSubscribers = stats?.active_subscribers ?? stats?.active ?? 0;
  const expiredSubscribers = stats?.expired_subscribers ?? stats?.expired ?? 0;
  const inactiveSubscribers = stats?.inactive_subscribers ?? stats?.inactive ?? 0;
  const totalSubscribers = stats?.total_subscribers ?? stats?.total ?? 0;
  const monthlyRevenue = stats?.monthly_revenue ?? stats?.revenue ?? 0;
  const fupActive =
    (stats?.fup1 ?? stats?.fup_level_1 ?? 0) +
    (stats?.fup2 ?? stats?.fup_level_2 ?? 0) +
    (stats?.fup3 ?? stats?.fup_level_3 ?? 0);

  const cpuUsage = metrics?.cpu_percent ?? metrics?.cpu?.usage ?? metrics?.cpu ?? 0;
  const ramUsage = metrics?.memory_percent ?? metrics?.memory?.usage ?? metrics?.memory ?? 0;
  const diskUsage = metrics?.disk_percent ?? metrics?.disk?.usage ?? metrics?.disk ?? 0;

  // -----------------------------------------------------------------------
  // First-load skeleton
  // -----------------------------------------------------------------------

  if (isLoading && !stats) {
    return <LoadingScreen message="Loading dashboard..." />;
  }

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
      {/* 1. Welcome Banner                                                */}
      {/* ================================================================ */}
      <View style={styles.welcomeBanner}>
        <View style={styles.welcomeContent}>
          <Text style={styles.greetingText}>
            {getGreeting()}, {username}
          </Text>
          <View style={styles.serverRow}>
            <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
            <Text style={styles.serverName}>
              {stats?.server_name || 'ProxPanel Server'}
            </Text>
          </View>
        </View>
      </View>

      {/* ================================================================ */}
      {/* 2. System Health (moved above Overview)                          */}
      {/* ================================================================ */}
      <SectionHeader title="System Health" />

      <Card style={styles.healthCard}>
        <View style={styles.healthRow}>
          <HealthRing label="CPU" value={cpuUsage} />
          <HealthRing label="RAM" value={ramUsage} />
          <HealthRing label="Disk" value={diskUsage} />
        </View>
      </Card>

      {/* ================================================================ */}
      {/* 3. Stats Grid (2 columns, 4 rows)                               */}
      {/* ================================================================ */}
      <SectionHeader title="Overview" />

      <View style={styles.statsGrid}>
        {/* Row 1 */}
        <View style={styles.statsRow}>
          <View style={styles.statHalf}>
            <StatCard
              label="Online Users"
              value={onlineUsers}
              icon={'\u{1F4F6}'}
              color={colors.success}
            />
          </View>
          <View style={styles.statHalf}>
            <StatCard
              label="Offline Users"
              value={offlineUsers}
              icon={'\u{1F534}'}
              color={colors.danger}
            />
          </View>
        </View>

        {/* Row 2 */}
        <View style={styles.statsRow}>
          <View style={styles.statHalf}>
            <StatCard
              label="Active"
              value={activeSubscribers}
              icon={'\u2713'}
              color={colors.primary}
            />
          </View>
          <View style={styles.statHalf}>
            <StatCard
              label="Expired"
              value={expiredSubscribers}
              icon={'\u23F0'}
              color={colors.warning}
            />
          </View>
        </View>

        {/* Row 3 */}
        <View style={styles.statsRow}>
          <View style={styles.statHalf}>
            <StatCard
              label="Inactive"
              value={inactiveSubscribers}
              icon={'\u23F8'}
              color={colors.inactive}
            />
          </View>
          <View style={styles.statHalf}>
            <StatCard
              label="Total Subscribers"
              value={totalSubscribers}
              icon={'\u{1F465}'}
              color={colors.text}
            />
          </View>
        </View>

        {/* Row 4 */}
        <View style={styles.statsRow}>
          <View style={styles.statHalf}>
            <StatCard
              label="Monthly Revenue"
              value={formatCurrency(monthlyRevenue)}
              icon="$"
              color={colors.success}
            />
          </View>
          <View style={styles.statHalf}>
            <StatCard
              label="FUP Active"
              value={fupActive}
              icon={'\u26A0'}
              color={colors.fup2}
            />
          </View>
        </View>
      </View>



      {/* ================================================================ */}
      {/* 5. Recent Activity                                               */}
      {/* ================================================================ */}
      <SectionHeader
        title="Recent Activity"
        actionLabel="View All"
        onAction={() => navigation?.navigate?.('More', { screen: 'Audit' })}
      />

      <Card style={styles.activityCard}>
        {recentActivity.length > 0 ? (
          recentActivity.map((item, index) => {
            const isLast = index === recentActivity.length - 1;
            const description =
              item.description ||
              item.action ||
              (item.username ? `Subscriber ${item.username}` : `Event #${index + 1}`);
            const timestamp = item.created_at || item.timestamp || item.date || '';
            const timeStr = timestamp ? formatRelativeTime(timestamp) : '';

            return (
              <View
                key={item.id || index}
                style={[
                  styles.activityItem,
                  !isLast && styles.activityItemBorder,
                ]}
              >
                <View style={styles.activityDot} />
                <View style={styles.activityContent}>
                  <Text style={styles.activityText} numberOfLines={2}>
                    {description}
                  </Text>
                  {timeStr ? (
                    <Text style={styles.activityTime}>{timeStr}</Text>
                  ) : null}
                </View>
              </View>
            );
          })
        ) : (
          <Text style={styles.emptyText}>No recent activity</Text>
        )}
      </Card>

      {/* Bottom spacer for tab bar */}
      <View style={{ height: spacing.tabBar }} />
    </ScrollView>
  );
};

// ---------------------------------------------------------------------------
// Tiny helper used inside the component
// ---------------------------------------------------------------------------

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 0) return 'just now';

  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${diffDay}d ago`;
}

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

  // Welcome Banner
  welcomeBanner: {
    backgroundColor: colors.primary,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.base,
    borderBottomLeftRadius: borderRadius.xl,
    borderBottomRightRadius: borderRadius.xl,
  },
  welcomeContent: {
    paddingTop: spacing.sm,
  },
  greetingText: {
    ...typography.h2,
    color: colors.textInverse,
    marginBottom: spacing.xs,
  },
  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  serverName: {
    ...typography.bodySmall,
    color: 'rgba(255,255,255,0.85)',
  },

  // Stats Grid
  statsGrid: {
    paddingHorizontal: spacing.base,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  statHalf: {
    flex: 1,
    marginHorizontal: spacing.xs,
  },

  // System Health
  healthCard: {
    marginHorizontal: spacing.base,
  },
  healthRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.md,
  },

  // Recent Activity
  activityCard: {
    marginHorizontal: spacing.base,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  activityItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 5,
    marginRight: spacing.md,
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    ...typography.bodySmall,
    color: colors.text,
    lineHeight: 20,
  },
  activityTime: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: 2,
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textLight,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});

export default AdminDashboard;
