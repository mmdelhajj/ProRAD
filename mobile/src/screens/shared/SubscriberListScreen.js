import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Animated,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SubscriberRow, StatusBadge, Button, LoadingScreen, EmptyState } from '../../components';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { subscriberApi } from '../../services/api';
import { formatBytes } from '../../utils/format';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

const FILTER_CHIPS = [
  { key: 'all', label: 'All' },
  { key: 'online', label: 'Online' },
  { key: 'offline', label: 'Offline' },
  { key: 'active', label: 'Active' },
  { key: 'expired', label: 'Expired' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'fup1', label: 'FUP 1' },
  { key: 'fup2', label: 'FUP 2' },
  { key: 'fup3', label: 'FUP 3' },
];

const SORT_OPTIONS = [
  { key: 'full_name', label: 'Name' },
  { key: 'username', label: 'Username' },
  { key: 'expiry_date', label: 'Expiry' },
  { key: 'status', label: 'Status' },
  { key: 'daily_usage', label: 'Top Daily' },
  { key: 'monthly_usage', label: 'Top Monthly' },
];

const BULK_ACTIONS = [
  { key: 'renew', label: 'Renew', color: colors.success },
  { key: 'disconnect', label: 'Disconnect', color: colors.warning },
  { key: 'reset_fup', label: 'Reset FUP', color: colors.info },
  { key: 'activate', label: 'Activate', color: colors.success },
  { key: 'deactivate', label: 'Deactivate', color: colors.textSecondary },
  { key: 'delete', label: 'Delete', color: colors.danger },
];

// ---------------------------------------------------------------------------
// Helper: debounce
// ---------------------------------------------------------------------------

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// ---------------------------------------------------------------------------
// Helper: build API params from filter state
// ---------------------------------------------------------------------------

function buildParams({ page, search, activeFilter, sortBy, sortOrder }) {
  const params = {
    page,
    limit: PAGE_SIZE,
    sort_by: sortBy,
    sort_dir: sortOrder,
  };

  if (search) {
    params.search = search;
  }

  switch (activeFilter) {
    case 'online':
      params.status = 'online';
      break;
    case 'offline':
      params.status = 'offline';
      break;
    case 'active':
      params.status = 'active';
      break;
    case 'expired':
      params.status = 'expired';
      break;
    case 'inactive':
      params.status = 'inactive';
      break;
    case 'fup1':
      params.fup_level = 1;
      break;
    case 'fup2':
      params.fup_level = 2;
      break;
    case 'fup3':
      params.fup_level = 3;
      break;
    default:
      break;
  }

  return params;
}

// ---------------------------------------------------------------------------
// SubscriberListScreen
// ---------------------------------------------------------------------------

export default function SubscriberListScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  // ---- Data state ----
  const [subscribers, setSubscribers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // ---- Filter / search state ----
  const [searchText, setSearchText] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [sortBy, setSortBy] = useState('username');
  const [sortOrder, setSortOrder] = useState('asc');
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  // ---- Filter counts (fetched from separate "stats" call or derived) ----
  const [filterCounts, setFilterCounts] = useState({});

  // ---- Multi-select state ----
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // ---- Refs ----
  const flatListRef = useRef(null);
  const searchInputRef = useRef(null);
  const isMounted = useRef(true);

  // ---- Debounced search ----
  const debouncedSearch = useDebounce(searchText, 300);

  // ---- Unmount cleanup ----
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Fetch subscribers
  // ---------------------------------------------------------------------------

  const fetchSubscribers = useCallback(
    async (pageNum = 1, isRefresh = false) => {
      try {
        if (pageNum === 1 && !isRefresh) {
          setLoading(true);
        }
        setError(null);

        const params = buildParams({
          page: pageNum,
          search: debouncedSearch,
          activeFilter,
          sortBy,
          sortOrder,
        });

        const response = await subscriberApi.list(params);
        const result = response.data;

        if (!isMounted.current) return;

        const items = result.data || [];
        const total = result.meta?.total || result.total || 0;

        if (pageNum === 1) {
          setSubscribers(items);
        } else {
          setSubscribers((prev) => [...prev, ...items]);
        }

        setTotalCount(total);
        setPage(pageNum);
        setHasMore(items.length === PAGE_SIZE && pageNum * PAGE_SIZE < total);

        // Use stats from response to populate filter counts (avoids 8 extra API calls)
        if (result.stats && pageNum === 1 && activeFilter === 'all' && !debouncedSearch) {
          const s = result.stats;
          setFilterCounts({
            online: s.online || 0,
            offline: s.offline || 0,
            active: s.active || 0,
            expired: s.expired || 0,
            inactive: s.inactive || 0,
            fup1: s.fup1 || 0,
            fup2: s.fup2 || 0,
            fup3: s.fup3 || 0,
            all: s.total || (s.active || 0) + (s.expired || 0) + (s.inactive || 0),
          });
        }
      } catch (err) {
        if (!isMounted.current) return;
        console.error('Failed to fetch subscribers:', err);
        setError(err.message || 'Failed to load subscribers.');
      } finally {
        if (isMounted.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [debouncedSearch, activeFilter, sortBy, sortOrder],
  );

  // ---------------------------------------------------------------------------
  // Fetch filter counts (summary stats)
  // ---------------------------------------------------------------------------

  const fetchFilterCounts = useCallback(async () => {
    try {
      // Try to get stats from the subscriber list endpoint with minimal data
      // or a dedicated stats endpoint. We use a simple approach: fetch with
      // per_page=0 for each filter. In practice, the backend might return
      // counts in the main list response. We'll fetch counts for the main
      // statuses on refresh.
      const countParams = { page: 1, limit: 1 };

      const fetchCount = async (filter) => {
        try {
          const params = buildParams({
            page: 1,
            search: '',
            activeFilter: filter,
            sortBy: 'username',
            sortOrder: 'asc',
          });
          params.limit = 1;
          const resp = await subscriberApi.list(params);
          return resp.data?.meta?.total || resp.data?.total || 0;
        } catch {
          return 0;
        }
      };

      const [online, offline, active, expired, inactive, fup1, fup2, fup3] =
        await Promise.all([
          fetchCount('online'),
          fetchCount('offline'),
          fetchCount('active'),
          fetchCount('expired'),
          fetchCount('inactive'),
          fetchCount('fup1'),
          fetchCount('fup2'),
          fetchCount('fup3'),
        ]);

      if (isMounted.current) {
        setFilterCounts({
          online,
          offline,
          active,
          expired,
          inactive,
          fup1,
          fup2,
          fup3,
          all: active + expired + inactive,
        });
      }
    } catch (err) {
      // Non-critical — counts will just not appear
      console.warn('Failed to fetch filter counts:', err);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Effects: re-fetch when filters/search/sort change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    fetchSubscribers(1);
  }, [fetchSubscribers]);

  // Fetch counts on mount and on refresh
  useEffect(() => {
    fetchFilterCounts();
  }, [fetchFilterCounts]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setSelectedIds(new Set());
    setSelectMode(false);
    fetchSubscribers(1, true);
    fetchFilterCounts();
  }, [fetchSubscribers, fetchFilterCounts]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    fetchSubscribers(page + 1);
  }, [loadingMore, hasMore, loading, page, fetchSubscribers]);

  const handleFilterPress = useCallback((filterKey) => {
    setActiveFilter(filterKey);
    setPage(1);
    setSelectedIds(new Set());
    setSelectMode(false);
  }, []);

  const handleSortChange = useCallback((option) => {
    setSortBy((prevSort) => {
      if (prevSort === option.key) {
        setSortOrder((prevOrder) => (prevOrder === 'asc' ? 'desc' : 'asc'));
        return prevSort;
      }
      setSortOrder('asc');
      return option.key;
    });
    setShowSortDropdown(false);
    setPage(1);
  }, []);

  const handleSubscriberPress = useCallback(
    (subscriber) => {
      if (selectMode) {
        toggleSelection(subscriber.id);
        return;
      }
      navigation.navigate('SubscriberDetail', { id: subscriber.id });
    },
    [selectMode, navigation],
  );

  const handleSubscriberLongPress = useCallback(
    (subscriber) => {
      if (!selectMode) {
        setSelectMode(true);
        setSelectedIds(new Set([subscriber.id]));
      }
    },
    [selectMode],
  );

  const handleFABPress = useCallback(() => {
    navigation.navigate('SubscriberCreateEdit');
  }, [navigation]);

  const handleCancelSelect = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleSelectAll = useCallback(() => {
    const allIds = new Set(subscribers.map((s) => s.id));
    setSelectedIds(allIds);
  }, [subscribers]);

  const toggleSelection = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      // Exit select mode if nothing selected
      if (next.size === 0) {
        setSelectMode(false);
      }
      return next;
    });
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchText('');
    searchInputRef.current?.focus();
  }, []);

  // ---------------------------------------------------------------------------
  // Bulk actions
  // ---------------------------------------------------------------------------

  const handleBulkAction = useCallback(
    async (actionKey) => {
      if (selectedIds.size === 0) return;

      const ids = Array.from(selectedIds);
      const actionLabel = BULK_ACTIONS.find((a) => a.key === actionKey)?.label || actionKey;

      // Confirmation
      const confirmMessage =
        actionKey === 'delete'
          ? `Are you sure you want to DELETE ${ids.length} subscriber(s)? This cannot be undone.`
          : `${actionLabel} ${ids.length} subscriber(s)?`;

      Alert.alert(
        `${actionLabel} Subscribers`,
        confirmMessage,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: actionKey === 'delete' ? 'Delete' : actionLabel,
            style: actionKey === 'delete' ? 'destructive' : 'default',
            onPress: async () => {
              setBulkLoading(true);
              try {
                await subscriberApi.bulkAction({
                  action: actionKey,
                  subscriber_ids: ids,
                });
                // Refresh list
                handleRefresh();
              } catch (err) {
                Alert.alert('Error', err.message || `Failed to ${actionLabel.toLowerCase()} subscribers.`);
              } finally {
                if (isMounted.current) {
                  setBulkLoading(false);
                }
              }
            },
          },
        ],
        { cancelable: true },
      );
    },
    [selectedIds, handleRefresh],
  );

  // ---------------------------------------------------------------------------
  // Computed values
  // ---------------------------------------------------------------------------

  const displayedCount = subscribers.length;
  const currentSortLabel = SORT_OPTIONS.find((o) => o.key === sortBy)?.label || 'Username';
  const sortArrow = sortOrder === 'asc' ? '\u2191' : '\u2193';

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const handleTorchPress = useCallback(
    (subscriber) => {
      navigation.navigate('LiveBandwidth', {
        subscriberId: subscriber.id,
        subscriberName: subscriber.full_name,
        subscriberUsername: subscriber.username,
      });
    },
    [navigation],
  );

  const renderSubscriberRow = useCallback(
    ({ item }) => {
      const isSelected = selectedIds.has(item.id);

      return (
        <TouchableOpacity
          activeOpacity={0.65}
          onPress={() => handleSubscriberPress(item)}
          onLongPress={() => handleSubscriberLongPress(item)}
          delayLongPress={400}
        >
          <View style={[styles.rowWrapper, isSelected && styles.rowSelected]}>
            {selectMode && (
              <View style={styles.checkCircleWrapper}>
                <View
                  style={[
                    styles.checkCircle,
                    isSelected && styles.checkCircleActive,
                  ]}
                >
                  {isSelected && <Text style={styles.checkMark}>{'\u2713'}</Text>}
                </View>
              </View>
            )}
            <View style={styles.rowContent}>
              <SubscriberRow subscriber={item} onPress={() => handleSubscriberPress(item)} />
            </View>
            {item.is_online && !selectMode && (
              <TouchableOpacity
                style={styles.torchButton}
                onPress={() => handleTorchPress(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.torchIcon}>{'\uD83D\uDCF6'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [selectMode, selectedIds, handleSubscriberPress, handleSubscriberLongPress, handleTorchPress],
  );

  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.footerText}>Loading more...</Text>
      </View>
    );
  }, [loadingMore]);

  const renderSeparator = useCallback(
    () => <View style={styles.separator} />,
    [],
  );

  const renderEmptyList = useCallback(() => {
    if (loading) return null;

    if (error) {
      return (
        <EmptyState
          icon={'\u26A0\uFE0F'}
          title="Connection Error"
          message={error}
          actionLabel="Retry"
          onAction={() => fetchSubscribers(1)}
        />
      );
    }

    if (debouncedSearch) {
      return (
        <EmptyState
          icon={'\uD83D\uDD0D'}
          title="No Results"
          message={`No subscribers found for "${debouncedSearch}".`}
          actionLabel="Clear Search"
          onAction={() => setSearchText('')}
        />
      );
    }

    return (
      <EmptyState
        icon={'\uD83D\uDC65'}
        title="No Subscribers"
        message="There are no subscribers matching the current filters."
        actionLabel="Add Subscriber"
        onAction={handleFABPress}
      />
    );
  }, [loading, error, debouncedSearch, fetchSubscribers, handleFABPress]);

  const keyExtractor = useCallback((item) => String(item.id), []);

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (loading && subscribers.length === 0 && !refreshing) {
    return <LoadingScreen message="Loading subscribers..." />;
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ---- Select mode header ---- */}
      {selectMode && (
        <View style={styles.selectHeader}>
          <TouchableOpacity onPress={handleCancelSelect} style={styles.selectHeaderBtn}>
            <Text style={styles.selectHeaderBtnText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.selectHeaderTitle}>
            {selectedIds.size} selected
          </Text>
          <TouchableOpacity onPress={handleSelectAll} style={styles.selectHeaderBtn}>
            <Text style={styles.selectHeaderBtnText}>Select All</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ---- Search bar ---- */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>{'\uD83D\uDD0D'}</Text>
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search by username, name, phone..."
            placeholderTextColor={colors.textLight}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="never"
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={handleClearSearch} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>{'\u2715'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ---- Filter chips (horizontal scroll) ---- */}
      <View style={styles.filterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          {FILTER_CHIPS.map((chip) => {
            const isActive = activeFilter === chip.key;
            const count = filterCounts[chip.key];
            return (
              <TouchableOpacity
                key={chip.key}
                onPress={() => handleFilterPress(chip.key)}
                style={[
                  styles.filterChip,
                  isActive && styles.filterChipActive,
                ]}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    isActive && styles.filterChipTextActive,
                  ]}
                >
                  {chip.label}
                  {count !== undefined && count > 0
                    ? ` (${count.toLocaleString()})`
                    : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ---- Stats bar + sort ---- */}
      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          Showing {displayedCount.toLocaleString()} of{' '}
          {totalCount.toLocaleString()} subscribers
        </Text>

        <TouchableOpacity
          onPress={() => setShowSortDropdown((v) => !v)}
          style={styles.sortButton}
          activeOpacity={0.7}
        >
          <Text style={styles.sortButtonText}>
            {currentSortLabel} {sortArrow}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ---- Sort dropdown ---- */}
      {showSortDropdown && (
        <View style={styles.sortDropdown}>
          {SORT_OPTIONS.map((option) => {
            const isActive = sortBy === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.sortDropdownItem,
                  isActive && styles.sortDropdownItemActive,
                ]}
                onPress={() => handleSortChange(option)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.sortDropdownItemText,
                    isActive && styles.sortDropdownItemTextActive,
                  ]}
                >
                  {option.label}
                  {isActive ? ` ${sortArrow}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ---- Subscriber list ---- */}
      <FlatList
        ref={flatListRef}
        data={subscribers}
        keyExtractor={keyExtractor}
        renderItem={renderSubscriberRow}
        ListEmptyComponent={renderEmptyList}
        ListFooterComponent={renderFooter}
        ItemSeparatorComponent={renderSeparator}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.4}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        removeClippedSubviews={Platform.OS !== 'web'}
        maxToRenderPerBatch={20}
        updateCellsBatchingPeriod={50}
        windowSize={11}
        initialNumToRender={15}
        getItemLayout={undefined}
        contentContainerStyle={[
          styles.listContent,
          subscribers.length === 0 && styles.listContentEmpty,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />

      {/* ---- Floating Action Button ---- */}
      {!selectMode && (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}
          onPress={handleFABPress}
          activeOpacity={0.85}
        >
          <Text style={styles.fabIcon}>+</Text>
        </TouchableOpacity>
      )}

      {/* ---- Multi-select bottom action bar ---- */}
      {selectMode && (
        <View style={[styles.bulkBar, { paddingBottom: insets.bottom + spacing.sm }]}>
          {bulkLoading ? (
            <View style={styles.bulkLoadingContainer}>
              <ActivityIndicator size="small" color={colors.textInverse} />
              <Text style={styles.bulkLoadingText}>Processing...</Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.bulkScrollContent}
            >
              {BULK_ACTIONS.map((action) => (
                <TouchableOpacity
                  key={action.key}
                  style={[styles.bulkActionBtn, { backgroundColor: action.color }]}
                  onPress={() => handleBulkAction(action.key)}
                  activeOpacity={0.75}
                  disabled={selectedIds.size === 0}
                >
                  <Text style={styles.bulkActionBtnText}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // ---- Layout ----
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ---- Select mode header ----
  selectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  selectHeaderTitle: {
    ...typography.body,
    color: colors.textInverse,
    fontWeight: '600',
  },
  selectHeaderBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  selectHeaderBtnText: {
    ...typography.body,
    color: colors.textInverse,
    fontWeight: '500',
  },

  // ---- Search ----
  searchContainer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    height: 42,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: spacing.sm,
    opacity: 0.5,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    padding: 0,
    height: '100%',
  },
  clearBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  clearBtnText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '600',
  },

  // ---- Filter chips ----
  filterContainer: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  filterScrollContent: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: colors.textInverse,
    fontWeight: '600',
  },

  // ---- Stats bar ----
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  statsText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortButtonText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
  },

  // ---- Sort dropdown ----
  sortDropdown: {
    position: 'absolute',
    right: spacing.base,
    top: undefined,
    zIndex: 100,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
    marginTop: -2,
    top: 190,
    minWidth: 160,
  },
  sortDropdownItem: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  sortDropdownItemActive: {
    backgroundColor: colors.primaryLight + '12',
  },
  sortDropdownItemText: {
    ...typography.body,
    color: colors.text,
  },
  sortDropdownItemTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },

  // ---- List ----
  listContent: {
    flexGrow: 1,
  },
  listContentEmpty: {
    flex: 1,
    justifyContent: 'center',
  },
  separator: {
    height: 0,
  },

  // ---- Row wrapper (for multi-select) ----
  rowWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  rowSelected: {
    backgroundColor: colors.primary + '12',
  },
  rowContent: {
    flex: 1,
  },
  checkCircleWrapper: {
    paddingLeft: spacing.base,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkCircleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkMark: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '700',
    marginTop: -1,
  },

  // ---- Torch button ----
  torchButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  torchIcon: {
    fontSize: 20,
  },

  // ---- Footer loader ----
  footerLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  footerText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },

  // ---- FAB ----
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  fabIcon: {
    fontSize: 28,
    color: colors.textInverse,
    fontWeight: '300',
    marginTop: -1,
  },

  // ---- Bulk action bar ----
  bulkBar: {
    backgroundColor: colors.text,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bulkScrollContent: {
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  bulkActionBtn: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    marginRight: spacing.sm,
    minWidth: 80,
    alignItems: 'center',
  },
  bulkActionBtnText: {
    ...typography.bodySmall,
    color: colors.textInverse,
    fontWeight: '600',
  },
  bulkLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  bulkLoadingText: {
    ...typography.body,
    color: colors.textInverse,
    marginLeft: spacing.sm,
  },
});
