import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  StatCard,
  Card,
  QuickAction,
  SectionHeader,
  LoadingScreen,
  SubscriberRow,
} from '../../components';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { formatCurrency } from '../../utils/format';
import { dashboardApi, subscriberApi, authApi } from '../../services/api';
import useAuthStore from '../../store/authStore';

// ---------------------------------------------------------------------------
// ResellerDashboard
// ---------------------------------------------------------------------------

const ResellerDashboard = ({ navigation, route }) => {
  const authUser = useAuthStore((state) => state.user);

  // Data state
  const [stats, setStats] = useState(null);
  const [resellerBalance, setResellerBalance] = useState(0);
  const [recentSubs, setRecentSubs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Timers
  const intervalRef = useRef(null);

  // -----------------------------------------------------------------------
  // Fetch
  // -----------------------------------------------------------------------

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const [statsRes, subsRes, meRes] = await Promise.all([
        dashboardApi.stats().catch(() => null),
        subscriberApi
          .list({ page: 1, limit: 5, sort_by: 'created_at', sort_dir: 'desc' })
          .catch(() => null),
        authApi.me().catch(() => null),
      ]);

      if (statsRes?.data) {
        const d = statsRes.data.data || statsRes.data;
        setStats(d);
      }

      // Get reseller balance from /auth/me response
      if (meRes?.data) {
        const u = meRes.data.user || meRes.data.data || meRes.data;
        const bal = u?.reseller?.balance ?? u?.balance ?? 0;
        setResellerBalance(bal);
      }

      if (subsRes?.data) {
        const list =
          subsRes.data.data?.subscribers ||
          subsRes.data.data ||
          subsRes.data.subscribers ||
          [];
        setRecentSubs(Array.isArray(list) ? list.slice(0, 5) : []);
      }
    } catch (err) {
      console.error('ResellerDashboard fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

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

  const balance = resellerBalance || stats?.balance || authUser?.reseller?.balance || 0;
  const totalSubscribers = stats?.total_subscribers ?? stats?.total ?? 0;
  const onlineNow = stats?.online_subscribers ?? stats?.online ?? 0;
  const activeCount = stats?.active_subscribers ?? stats?.active ?? 0;
  const expiredCount = stats?.expired_subscribers ?? stats?.expired ?? 0;
  const inactiveCount = stats?.inactive_subscribers ?? stats?.inactive ?? 0;

  // -----------------------------------------------------------------------
  // First-load
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
      {/* 1. Balance Banner                                                */}
      {/* ================================================================ */}
      <View
        style={[
          styles.balanceBanner,
          { backgroundColor: balance >= 0 ? colors.success : colors.danger },
        ]}
      >
        <Text style={styles.balanceLabel}>Available Balance</Text>
        <Text style={styles.balanceValue}>
          {formatCurrency(balance)}
        </Text>
        {balance < 0 && (
          <Text style={styles.balanceWarning}>
            Your balance is negative. Please recharge to continue adding subscribers.
          </Text>
        )}
      </View>

      {/* ================================================================ */}
      {/* 2. Stats Grid (2 columns)                                        */}
      {/* ================================================================ */}
      <SectionHeader title="My Subscribers" />

      <View style={styles.statsGrid}>
        {/* Row 1 */}
        <View style={styles.statsRow}>
          <View style={styles.statHalf}>
            <StatCard
              label="Total Subscribers"
              value={totalSubscribers}
              icon={'\u{1F465}'}
              color={colors.primary}
            />
          </View>
          <View style={styles.statHalf}>
            <StatCard
              label="Online Now"
              value={onlineNow}
              icon={'\u{1F4F6}'}
              color={colors.success}
            />
          </View>
        </View>

        {/* Row 2 */}
        <View style={styles.statsRow}>
          <View style={styles.statHalf}>
            <StatCard
              label="Active"
              value={activeCount}
              icon={'\u2713'}
              color={colors.primary}
            />
          </View>
          <View style={styles.statHalf}>
            <StatCard
              label="Expired"
              value={expiredCount}
              icon={'\u23F0'}
              color={colors.warning}
            />
          </View>
        </View>

        {/* Row 3 - single card */}
        <View style={styles.statsRow}>
          <View style={styles.statHalf}>
            <StatCard
              label="Inactive"
              value={inactiveCount}
              icon={'\u23F8'}
              color={colors.inactive}
            />
          </View>
          <View style={styles.statHalf} />
        </View>
      </View>

      {/* ================================================================ */}
      {/* 3. Quick Actions                                                 */}
      {/* ================================================================ */}
      <SectionHeader title="Quick Actions" />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.quickActionsScroll}
      >
        <QuickAction
          icon="+"
          label="New Subscriber"
          color={colors.primary}
          onPress={() => navigation?.navigate?.('Subscribers', { screen: 'SubscriberCreateEdit' })}
        />
        <QuickAction
          icon={'\u{1F4AC}'}
          label="Send WhatsApp"
          color={colors.success}
          onPress={() => navigation?.navigate?.('More', { screen: 'WhatsApp' })}
        />
        <QuickAction
          icon={'\u{1F3AB}'}
          label="View Tickets"
          color={colors.secondary}
          onPress={() => navigation?.navigate?.('More', { screen: 'Tickets' })}
        />
      </ScrollView>

      {/* ================================================================ */}
      {/* 4. Recent Subscribers                                            */}
      {/* ================================================================ */}
      <SectionHeader
        title="Recent Subscribers"
        actionLabel="View All"
        onAction={() => navigation?.navigate?.('Subscribers')}
      />

      <Card style={styles.recentCard}>
        {recentSubs.length > 0 ? (
          recentSubs.map((sub) => (
            <SubscriberRow
              key={sub.id || sub.username}
              subscriber={sub}
              onPress={(s) => navigation?.navigate?.('Subscribers', { screen: 'SubscriberDetail', params: { id: s.id } })}
            />
          ))
        ) : (
          <Text style={styles.emptyText}>No subscribers yet</Text>
        )}
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

  // Balance Banner
  balanceBanner: {
    paddingTop: spacing.xxxl + spacing.lg,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.base,
    borderBottomLeftRadius: borderRadius.xl,
    borderBottomRightRadius: borderRadius.xl,
    alignItems: 'center',
  },
  balanceLabel: {
    ...typography.bodySmall,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  balanceValue: {
    ...typography.h1,
    color: colors.textInverse,
    fontWeight: '800',
    letterSpacing: -1,
  },
  balanceWarning: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
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

  // Quick Actions
  quickActionsScroll: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },

  // Recent Subscribers
  recentCard: {
    marginHorizontal: spacing.base,
    overflow: 'hidden',
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textLight,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});

export default ResellerDashboard;
