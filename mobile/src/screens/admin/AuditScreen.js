import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Platform,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState, LoadingScreen } from '../../components';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { auditApi } from '../../services/api';
import { formatDate, getTimeAgo } from '../../utils/format';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

const ACTION_TYPES = [
  { key: '', label: 'All Actions' },
  { key: 'create', label: 'Create' },
  { key: 'update', label: 'Update' },
  { key: 'delete', label: 'Delete' },
  { key: 'login', label: 'Login' },
  { key: 'logout', label: 'Logout' },
  { key: 'disconnect', label: 'Disconnect' },
  { key: 'renew', label: 'Renew' },
  { key: 'activate', label: 'Activate' },
  { key: 'deactivate', label: 'Deactivate' },
  { key: 'reset', label: 'Reset' },
  { key: 'restore', label: 'Restore' },
  { key: 'backup', label: 'Backup' },
];

function getActionColor(action) {
  if (!action) return colors.textSecondary;
  const a = action.toLowerCase();
  if (a.includes('create') || a.includes('add')) return colors.success;
  if (a.includes('delete') || a.includes('remove')) return colors.danger;
  if (a.includes('update') || a.includes('edit') || a.includes('change')) return colors.info;
  if (a.includes('login')) return colors.primary;
  if (a.includes('logout')) return colors.textSecondary;
  if (a.includes('disconnect')) return colors.warning;
  if (a.includes('renew') || a.includes('activate')) return colors.success;
  if (a.includes('deactivate') || a.includes('suspend')) return colors.warning;
  if (a.includes('reset')) return colors.info;
  if (a.includes('restore') || a.includes('backup')) return colors.secondary;
  return colors.textSecondary;
}

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

// ---------------------------------------------------------------------------
// Audit Entry Row
// ---------------------------------------------------------------------------

const AuditRow = ({ entry, onPress }) => {
  const actionColor = getActionColor(entry.action);
  const username = entry.username || entry.user?.username || entry.performed_by || '-';
  const action = entry.action || '-';
  const entity = entry.entity || entry.entity_type || '';
  const entityName = entry.entity_name || '';
  const ipAddress = entry.ip_address || entry.ip || '-';
  const description = entry.description || entry.details || '';
  const timestamp = entry.created_at || entry.timestamp || entry.date;

  return (
    <TouchableOpacity
      style={auditRowStyles.container}
      onPress={() => onPress(entry)}
      activeOpacity={0.7}
    >
      <View style={auditRowStyles.row}>
        {/* Action color indicator */}
        <View style={[auditRowStyles.indicator, { backgroundColor: actionColor }]} />

        <View style={auditRowStyles.content}>
          {/* Top line: user + time */}
          <View style={auditRowStyles.topLine}>
            <Text style={auditRowStyles.username} numberOfLines={1}>{username}</Text>
            <Text style={auditRowStyles.time}>{getTimeAgo(timestamp)}</Text>
          </View>

          {/* Action + entity */}
          <View style={auditRowStyles.actionLine}>
            <View style={[auditRowStyles.actionBadge, { backgroundColor: actionColor + '18' }]}>
              <Text style={[auditRowStyles.actionText, { color: actionColor }]}>
                {action}
              </Text>
            </View>
            {entity ? (
              <Text style={auditRowStyles.entity} numberOfLines={1}>
                {entity}{entityName ? `: ${entityName}` : ''}
              </Text>
            ) : null}
          </View>

          {/* Description */}
          {description ? (
            <Text style={auditRowStyles.description} numberOfLines={2}>
              {description}
            </Text>
          ) : null}

          {/* IP address */}
          <Text style={auditRowStyles.ip}>{ipAddress}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const auditRowStyles = StyleSheet.create({
  container: { marginHorizontal: spacing.base, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  indicator: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
  topLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  username: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
    marginRight: spacing.sm,
  },
  time: {
    ...typography.caption,
    color: colors.textLight,
  },
  actionLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  actionBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  actionText: {
    ...typography.caption,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  entity: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flex: 1,
  },
  description: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  ip: {
    ...typography.caption,
    color: colors.textLight,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
  },
});

// ---------------------------------------------------------------------------
// Audit Detail Modal
// ---------------------------------------------------------------------------

const AuditDetailModal = ({ entry, visible, onClose }) => {
  if (!entry) return null;

  const fields = [
    { label: 'User', value: entry.username || entry.user?.username || entry.performed_by },
    { label: 'Action', value: entry.action },
    { label: 'Entity Type', value: entry.entity || entry.entity_type },
    { label: 'Entity Name', value: entry.entity_name },
    { label: 'Entity ID', value: entry.entity_id },
    { label: 'IP Address', value: entry.ip_address || entry.ip },
    { label: 'User Agent', value: entry.user_agent },
    { label: 'Description', value: entry.description || entry.details },
    { label: 'Timestamp', value: formatDate(entry.created_at || entry.timestamp || entry.date) },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={detailStyles.container}>
        <View style={detailStyles.header}>
          <Text style={detailStyles.headerTitle}>Audit Entry</Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.6}>
            <Text style={detailStyles.closeButton}>{'\u2715'}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={detailStyles.body} contentContainerStyle={detailStyles.bodyContent} showsVerticalScrollIndicator={false}>
          <View style={detailStyles.card}>
            {fields.map((f, i) => {
              if (!f.value && f.value !== 0) return null;
              return (
                <View key={i} style={detailStyles.field}>
                  <Text style={detailStyles.fieldLabel}>{f.label}</Text>
                  <Text style={detailStyles.fieldValue} selectable>
                    {String(f.value)}
                  </Text>
                </View>
              );
            })}
          </View>
          <View style={{ height: spacing.tabBar }} />
        </ScrollView>
      </View>
    </Modal>
  );
};

const detailStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { ...typography.h3, color: colors.text, flex: 1, marginRight: spacing.md },
  closeButton: { fontSize: 20, color: colors.textSecondary, paddingHorizontal: spacing.sm },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: spacing.base, paddingTop: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
  },
  field: {
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.textLight,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  fieldValue: {
    ...typography.body,
    color: colors.text,
  },
});

// ---------------------------------------------------------------------------
// Filter Bar
// ---------------------------------------------------------------------------

const FilterBar = ({ actionFilter, onActionFilterChange, showFilters, onToggleFilters }) => (
  <View style={filterStyles.container}>
    <TouchableOpacity
      style={[filterStyles.filterBtn, showFilters && filterStyles.filterBtnActive]}
      onPress={onToggleFilters}
      activeOpacity={0.7}
    >
      <Text style={[filterStyles.filterBtnText, showFilters && filterStyles.filterBtnTextActive]}>
        Filters {actionFilter ? '(1)' : ''}
      </Text>
    </TouchableOpacity>
    {actionFilter ? (
      <TouchableOpacity
        style={filterStyles.clearBtn}
        onPress={() => onActionFilterChange('')}
        activeOpacity={0.7}
      >
        <Text style={filterStyles.clearBtnText}>Clear</Text>
      </TouchableOpacity>
    ) : null}
  </View>
);

const FilterPanel = ({ actionFilter, onActionFilterChange }) => (
  <View style={filterPanelStyles.container}>
    <Text style={filterPanelStyles.label}>Action Type</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={filterPanelStyles.chipsContainer}>
      {ACTION_TYPES.map((type) => {
        const isActive = actionFilter === type.key;
        return (
          <TouchableOpacity
            key={type.key}
            style={[filterPanelStyles.chip, isActive && filterPanelStyles.chipActive]}
            onPress={() => onActionFilterChange(type.key)}
            activeOpacity={0.7}
          >
            <Text style={[filterPanelStyles.chipText, isActive && filterPanelStyles.chipTextActive]}>
              {type.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  </View>
);

const filterStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: spacing.sm,
  },
  filterBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  filterBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterBtnText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  filterBtnTextActive: {
    color: colors.textInverse,
    fontWeight: '600',
  },
  clearBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  clearBtnText: {
    ...typography.bodySmall,
    color: colors.danger,
    fontWeight: '600',
  },
});

const filterPanelStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  chipsContainer: {
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    marginRight: spacing.sm,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.textInverse,
    fontWeight: '600',
  },
});

// ---------------------------------------------------------------------------
// AuditScreen
// ---------------------------------------------------------------------------

export default function AuditScreen() {
  const insets = useSafeAreaInsets();

  // Data state
  const [entries, setEntries] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Filter state
  const [searchText, setSearchText] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const debouncedSearch = useDebounce(searchText, 300);

  // Detail modal
  const [selectedEntry, setSelectedEntry] = useState(null);

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // ---- Fetch ----
  const fetchEntries = useCallback(async (pageNum = 1, isRefresh = false) => {
    if (pageNum === 1 && !isRefresh) setLoading(true);
    setError(null);
    try {
      const params = {
        page: pageNum,
        limit: PAGE_SIZE,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (actionFilter) params.action = actionFilter;

      const res = await auditApi.list(params);
      if (!isMounted.current) return;

      const data = res.data?.data || res.data;
      const items = data?.logs || data?.audit_logs || data?.items || (Array.isArray(data) ? data : []);
      const total = data?.total || 0;

      if (pageNum === 1) {
        setEntries(items);
      } else {
        setEntries((prev) => [...prev, ...items]);
      }

      setPage(pageNum);
      setHasMore(items.length === PAGE_SIZE && (total === 0 || pageNum * PAGE_SIZE < total));
    } catch (err) {
      if (isMounted.current) setError(err.message || 'Failed to load audit logs.');
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    }
  }, [debouncedSearch, actionFilter]);

  // Re-fetch when filters change
  useEffect(() => { fetchEntries(1); }, [fetchEntries]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchEntries(1, true);
  }, [fetchEntries]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    fetchEntries(page + 1);
  }, [loadingMore, hasMore, loading, page, fetchEntries]);

  // ---- Render helpers ----
  const renderItem = useCallback(({ item }) => (
    <AuditRow entry={item} onPress={setSelectedEntry} />
  ), []);

  const keyExtractor = useCallback((item, index) => {
    return String(item.id || item.ID || index);
  }, []);

  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={footerStyles.container}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={footerStyles.text}>Loading more...</Text>
      </View>
    );
  }, [loadingMore]);

  const renderEmpty = useCallback(() => {
    if (loading) return null;
    if (error) {
      return (
        <EmptyState
          icon={'\u26A0\uFE0F'}
          title="Connection Error"
          message={error}
          actionLabel="Retry"
          onAction={() => fetchEntries(1)}
        />
      );
    }
    return (
      <EmptyState
        icon={'\uD83D\uDCCB'}
        title="No Audit Logs"
        message={
          debouncedSearch || actionFilter
            ? 'No entries match the current filters.'
            : 'No audit log entries found.'
        }
        actionLabel={debouncedSearch || actionFilter ? 'Clear Filters' : undefined}
        onAction={debouncedSearch || actionFilter ? () => { setSearchText(''); setActionFilter(''); } : undefined}
      />
    );
  }, [loading, error, debouncedSearch, actionFilter, fetchEntries]);

  // ---- Loading state ----
  if (loading && entries.length === 0 && !refreshing) {
    return <LoadingScreen message="Loading audit logs..." />;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Audit Log</Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>{'\uD83D\uDD0D'}</Text>
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search by description, user..."
            placeholderTextColor={colors.textLight}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <Text style={styles.clearSearch}>{'\u2715'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter bar */}
      <FilterBar
        actionFilter={actionFilter}
        onActionFilterChange={(val) => { setActionFilter(val); setPage(1); }}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters(!showFilters)}
      />

      {/* Filter panel (expandable) */}
      {showFilters && (
        <FilterPanel
          actionFilter={actionFilter}
          onActionFilterChange={(val) => { setActionFilter(val); setPage(1); }}
        />
      )}

      {/* List */}
      <FlatList
        data={entries}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.4}
        contentContainerStyle={[styles.listContent, entries.length === 0 && styles.listContentEmpty]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        removeClippedSubviews={Platform.OS !== 'web'}
        maxToRenderPerBatch={20}
        updateCellsBatchingPeriod={50}
        windowSize={11}
        initialNumToRender={15}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />

      {/* Detail Modal */}
      <AuditDetailModal
        entry={selectedEntry}
        visible={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const footerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  text: {
    ...typography.caption,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.surface,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { ...typography.h2, color: colors.text },
  searchContainer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 40,
  },
  searchIcon: { fontSize: 14, marginRight: spacing.sm },
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
  listContent: { paddingTop: spacing.md, paddingBottom: spacing.tabBar },
  listContentEmpty: { flex: 1, justifyContent: 'center' },
});
