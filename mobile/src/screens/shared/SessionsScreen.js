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
import { Ionicons } from '@expo/vector-icons';
import { Card, EmptyState, LoadingScreen } from '../../components';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { shadows } from '../../theme/shadows';
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
              <View style={rowStyles.rateItem}>
                <Ionicons name="arrow-down" size={12} color={colors.success} />
                <Text style={rowStyles.rateDown}> {formatBytes(downloadRate)}/s</Text>
              </View>
              <View style={rowStyles.rateItem}>
                <Ionicons name="arrow-up" size={12} color={colors.info} />
                <Text style={rowStyles.rateUp}> {formatBytes(uploadRate)}/s</Text>
              </View>
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
    marginHorizontal: 6,
    marginBottom: 3,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  actionsContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: borderRadius.sm,
  },
  disconnectButton: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disconnectText: {
    fontSize: 12,
    color: colors.textInverse,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: 6,
    ...shadows.sm,
  },
  dotContainer: {
    justifyContent: 'flex-start',
    paddingTop: 3,
    marginRight: 6,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.online,
  },
  content: {
    flex: 1,
  },
  topLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 1,
  },
  username: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
    marginRight: 4,
  },
  duration: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  fullName: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  bottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  ipAddress: {
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    marginRight: 4,
  },
  serviceChip: {
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
  },
  serviceChipText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  rateLine: {
    flexDirection: 'row',
    marginTop: 2,
    gap: 6,
  },
  rateItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rateDown: {
    fontSize: 12,
    color: colors.success,
    fontWeight: '500',
  },
  rateUp: {
    fontSize: 12,
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
          <Ionicons name="search-outline" size={14} color={colors.textLight} style={styles.searchIcon} />
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
              <Ionicons name="close-circle" size={14} color={colors.textLight} style={styles.clearSearch} />
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
            iconName="wifi-outline"
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
    paddingTop: Platform.OS === 'ios' ? 56 : 10,
    paddingBottom: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  countBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
    marginLeft: 6,
  },
  countBadgeText: {
    fontSize: 12,
    color: colors.textInverse,
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
    height: 30,
  },
  searchIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
    paddingVertical: 0,
  },
  clearSearch: {
    fontSize: 12,
    color: colors.textLight,
    paddingLeft: 4,
  },
  listContent: {
    paddingTop: 6,
    paddingBottom: spacing.tabBar,
  },
});

export default SessionsScreen;
