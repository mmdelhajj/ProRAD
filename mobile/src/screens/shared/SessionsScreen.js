import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Animated,
  StyleSheet,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, EmptyState, LoadingScreen } from '../../components';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { formatDuration, formatBytes } from '../../utils/format';
import { sessionApi } from '../../services/api';

// ---------------------------------------------------------------------------
// Swipeable row with Disconnect button
// ---------------------------------------------------------------------------

const SWIPE_THRESHOLD = -80;

const SessionRow = ({ session, onDisconnect }) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const panStartX = useRef(0);
  const currentTranslateX = useRef(0);

  // Track animated value
  useEffect(() => {
    const id = translateX.addListener(({ value }) => {
      currentTranslateX.current = value;
    });
    return () => translateX.removeListener(id);
  }, [translateX]);

  const onTouchStart = useCallback((e) => {
    panStartX.current = e.nativeEvent.pageX;
  }, []);

  const onTouchMove = useCallback(
    (e) => {
      const dx = e.nativeEvent.pageX - panStartX.current;
      // Only allow swiping left
      if (dx < 0) {
        translateX.setValue(Math.max(dx, -120));
      } else if (currentTranslateX.current < 0) {
        translateX.setValue(Math.max(currentTranslateX.current + dx, -120));
      }
    },
    [translateX],
  );

  const onTouchEnd = useCallback(() => {
    if (currentTranslateX.current < SWIPE_THRESHOLD) {
      Animated.spring(translateX, {
        toValue: -100,
        useNativeDriver: true,
        bounciness: 4,
      }).start();
    } else {
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4,
      }).start();
    }
  }, [translateX]);

  const closeSwipe = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 4,
    }).start();
  }, [translateX]);

  const handleDisconnect = useCallback(() => {
    closeSwipe();
    Alert.alert(
      'Disconnect Session',
      `Are you sure you want to disconnect ${session.username || 'this session'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => onDisconnect(session),
        },
      ],
    );
  }, [session, onDisconnect, closeSwipe]);

  // Session duration
  const durationSeconds = session.session_time || session.session_duration || 0;
  const durationStr = formatDuration(durationSeconds);

  // Download/Upload rate
  const downloadRate = session.download_rate || session.tx_rate || 0;
  const uploadRate = session.upload_rate || session.rx_rate || 0;

  const ipAddress =
    session.framed_ip_address ||
    session.ip_address ||
    session.framedipaddress ||
    '-';

  const serviceName =
    session.service_name || session.service || session.plan || '';

  const fullName =
    session.full_name || session.subscriber_name || '';

  return (
    <View style={rowStyles.wrapper}>
      {/* Disconnect button behind the row */}
      <View style={rowStyles.actionsContainer}>
        <TouchableOpacity
          style={rowStyles.disconnectButton}
          onPress={handleDisconnect}
          activeOpacity={0.8}
        >
          <Text style={rowStyles.disconnectText}>Disconnect</Text>
        </TouchableOpacity>
      </View>

      {/* Swipeable row */}
      <Animated.View
        style={[rowStyles.row, { transform: [{ translateX }] }]}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Green dot */}
        <View style={rowStyles.dotContainer}>
          <View style={rowStyles.onlineDot} />
        </View>

        {/* Content */}
        <View style={rowStyles.content}>
          {/* Top line: username + duration */}
          <View style={rowStyles.topLine}>
            <Text style={rowStyles.username} numberOfLines={1}>
              {session.username || 'Unknown'}
            </Text>
            <Text style={rowStyles.duration}>{durationStr}</Text>
          </View>

          {/* Full name */}
          {fullName ? (
            <Text style={rowStyles.fullName} numberOfLines={1}>
              {fullName}
            </Text>
          ) : null}

          {/* Bottom line: IP + service chip */}
          <View style={rowStyles.bottomLine}>
            <Text style={rowStyles.ipAddress}>{ipAddress}</Text>
            {serviceName ? (
              <View style={rowStyles.serviceChip}>
                <Text style={rowStyles.serviceChipText} numberOfLines={1}>
                  {serviceName}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Rate display */}
          {(downloadRate > 0 || uploadRate > 0) ? (
            <View style={rowStyles.rateLine}>
              <Text style={rowStyles.rateDown}>
                {'\u2B07'} {formatBytes(downloadRate)}/s
              </Text>
              <Text style={rowStyles.rateUp}>
                {'\u2B06'} {formatBytes(uploadRate)}/s
              </Text>
            </View>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
};

const rowStyles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  actionsContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 100,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: borderRadius.lg,
  },
  disconnectButton: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disconnectText: {
    ...typography.caption,
    color: colors.textInverse,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  dotContainer: {
    justifyContent: 'flex-start',
    paddingTop: 5,
    marginRight: spacing.md,
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.online,
  },
  content: {
    flex: 1,
  },
  topLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  username: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
    marginRight: spacing.sm,
  },
  duration: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  fullName: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  bottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  ipAddress: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    marginRight: spacing.sm,
  },
  serviceChip: {
    backgroundColor: colors.primary + '15',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  serviceChipText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  rateLine: {
    flexDirection: 'row',
    marginTop: spacing.xs,
    gap: spacing.md,
  },
  rateDown: {
    ...typography.caption,
    color: colors.success,
    fontWeight: '500',
  },
  rateUp: {
    ...typography.caption,
    color: colors.info,
    fontWeight: '500',
  },
});

// ---------------------------------------------------------------------------
// SessionsScreen
// ---------------------------------------------------------------------------

const SessionsScreen = () => {
  const [sessions, setSessions] = useState([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);

  const intervalRef = useRef(null);
  const searchDebounceRef = useRef(null);

  // -----------------------------------------------------------------------
  // Fetch sessions
  // -----------------------------------------------------------------------

  const fetchSessions = useCallback(
    async (silent = false) => {
      if (!silent) setIsLoading(true);
      try {
        const params = {
          page: 1,
          limit: 100,
          status: 'online',
        };
        if (search.trim()) {
          params.search = search.trim();
        }

        const res = await sessionApi.list(params);
        if (res?.data) {
          const data = res.data.data || res.data;
          const list =
            data.sessions ||
            data.items ||
            (Array.isArray(data) ? data : []);
          setSessions(list);
          setOnlineCount(
            data.total || data.online_count || data.count || list.length,
          );
        }
      } catch (err) {
        console.error('SessionsScreen fetch error:', err);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [search],
  );

  // Initial load + auto-refresh every 10 seconds (only when tab is focused)
  useFocusEffect(
    useCallback(() => {
      fetchSessions();
      intervalRef.current = setInterval(() => fetchSessions(true), 10000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }, [fetchSessions]),
  );

  // Debounced search
  const onSearchChange = useCallback(
    (text) => {
      setSearch(text);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(() => {
        // fetchSessions will be called by the useEffect dependency on `search`
      }, 300);
    },
    [],
  );

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchSessions(true);
  }, [fetchSessions]);

  // -----------------------------------------------------------------------
  // Disconnect handler
  // -----------------------------------------------------------------------

  const handleDisconnect = useCallback(
    async (session) => {
      const sessionId =
        session.id ||
        session.acct_session_id ||
        session.acctsessionid ||
        session.session_id;
      if (!sessionId) {
        Alert.alert('Error', 'Could not identify session to disconnect.');
        return;
      }

      try {
        await sessionApi.disconnect(sessionId);
        // Remove from list immediately for UX
        setSessions((prev) =>
          prev.filter((s) => {
            const sId =
              s.id ||
              s.acct_session_id ||
              s.acctsessionid ||
              s.session_id;
            return sId !== sessionId;
          }),
        );
        setOnlineCount((prev) => Math.max(0, prev - 1));
      } catch (err) {
        Alert.alert(
          'Disconnect Failed',
          err.message || 'Could not disconnect the session.',
        );
      }
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (isLoading && sessions.length === 0) {
    return <LoadingScreen message="Loading sessions..." />;
  }

  const renderItem = ({ item }) => (
    <SessionRow session={item} onDisconnect={handleDisconnect} />
  );

  const keyExtractor = (item, index) =>
    String(
      item.id ||
        item.acct_session_id ||
        item.acctsessionid ||
        item.session_id ||
        index,
    );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>Active Sessions</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{onlineCount}</Text>
          </View>
        </View>

        {/* Search bar */}
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>{'\uD83D\uDD0D'}</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by username..."
            placeholderTextColor={colors.textLight}
            value={search}
            onChangeText={onSearchChange}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.clearSearch}>{'\u2715'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Session list */}
      <FlatList
        data={sessions}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
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
        ListEmptyComponent={
          <EmptyState
            icon={'\uD83D\uDCE1'}
            title="No Active Sessions"
            message={
              search
                ? `No sessions found matching "${search}".`
                : 'There are no active PPPoE sessions at the moment.'
            }
          />
        }
      />
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
    backgroundColor: colors.surface,
    paddingTop: Platform.OS === 'ios' ? 56 : spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.text,
  },
  countBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginLeft: spacing.md,
  },
  countBadgeText: {
    ...typography.caption,
    color: colors.textInverse,
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 40,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingVertical: 0,
  },
  clearSearch: {
    ...typography.body,
    color: colors.textLight,
    paddingLeft: spacing.sm,
  },
  listContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.tabBar,
  },
});

export default SessionsScreen;
