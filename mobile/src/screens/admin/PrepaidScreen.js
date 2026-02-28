import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  RefreshControl,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { EmptyState, LoadingScreen } from '../../components';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import api, { serviceApi } from '../../services/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'unused', label: 'Unused' },
  { value: 'used', label: 'Used' },
  { value: 'expired', label: 'Expired' },
];

const STATUS_COLORS = {
  unused: colors.success,
  used: colors.textSecondary,
  expired: colors.danger,
  active: colors.primary,
};

// ---------------------------------------------------------------------------
// Tab Bar
// ---------------------------------------------------------------------------

const TabBar = ({ activeTab, onTabChange }) => (
  <View style={tabStyles.container}>
    <TouchableOpacity
      style={[tabStyles.tab, activeTab === 'list' && tabStyles.tabActive]}
      onPress={() => onTabChange('list')}
      activeOpacity={0.7}
    >
      <Text
        style={[
          tabStyles.tabText,
          activeTab === 'list' && tabStyles.tabTextActive,
        ]}
      >
        Card List
      </Text>
    </TouchableOpacity>
    <TouchableOpacity
      style={[tabStyles.tab, activeTab === 'generate' && tabStyles.tabActive]}
      onPress={() => onTabChange('generate')}
      activeOpacity={0.7}
    >
      <Text
        style={[
          tabStyles.tabText,
          activeTab === 'generate' && tabStyles.tabTextActive,
        ]}
      >
        Generate Cards
      </Text>
    </TouchableOpacity>
  </View>
);

const tabStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.base,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primary,
  },
});

// ---------------------------------------------------------------------------
// Status Filter Bar
// ---------------------------------------------------------------------------

const StatusFilterBar = ({ active, onChange }) => (
  <View style={filterStyles.container}>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={filterStyles.scroll}
    >
      {STATUS_FILTERS.map((f) => (
        <TouchableOpacity
          key={f.value}
          style={[
            filterStyles.chip,
            active === f.value && filterStyles.chipActive,
          ]}
          onPress={() => onChange(f.value)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              filterStyles.chipText,
              active === f.value && filterStyles.chipTextActive,
            ]}
          >
            {f.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  </View>
);

const filterStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
  },
  scroll: {
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceHover,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary + '12',
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.primary,
  },
});

// ---------------------------------------------------------------------------
// Card Row
// ---------------------------------------------------------------------------

const CardRow = ({ card, onDelete }) => {
  const status = card.status || 'unused';
  const statusColor = STATUS_COLORS[status] || colors.textSecondary;
  const serviceName = card.service?.name || card.service_name || '-';
  const createdDate = card.created_at
    ? new Date(card.created_at).toLocaleDateString()
    : '-';

  const handleLongPress = () => {
    if (status === 'unused') {
      Alert.alert(
        'Delete Card',
        `Delete card ${card.card_number || card.code || ''}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => onDelete(card.id || card.ID),
          },
        ],
      );
    }
  };

  return (
    <TouchableOpacity
      style={cardRowStyles.container}
      onLongPress={handleLongPress}
      activeOpacity={0.8}
    >
      <View style={cardRowStyles.row}>
        <View style={cardRowStyles.info}>
          <Text style={cardRowStyles.cardNumber} numberOfLines={1}>
            {card.card_number || card.code || 'No Number'}
          </Text>
          <View style={cardRowStyles.detailRow}>
            <Text style={cardRowStyles.service} numberOfLines={1}>
              {serviceName}
            </Text>
            <Text style={cardRowStyles.dot}>{'\u00B7'}</Text>
            <Text style={cardRowStyles.date}>{createdDate}</Text>
          </View>
          {card.used_by && (
            <Text style={cardRowStyles.usedBy} numberOfLines={1}>
              Used by: {card.used_by}
            </Text>
          )}
        </View>
        <View
          style={[
            cardRowStyles.statusBadge,
            { backgroundColor: statusColor + '15' },
          ]}
        >
          <Text style={[cardRowStyles.statusText, { color: statusColor }]}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const cardRowStyles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  info: {
    flex: 1,
    marginRight: spacing.md,
  },
  cardNumber: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  service: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  dot: {
    ...typography.bodySmall,
    color: colors.textLight,
  },
  date: {
    ...typography.caption,
    color: colors.textLight,
  },
  usedBy: {
    ...typography.caption,
    color: colors.primary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  statusText: {
    ...typography.caption,
    fontWeight: '700',
  },
});

// ---------------------------------------------------------------------------
// Generate Form
// ---------------------------------------------------------------------------

const GenerateForm = ({ services, onGenerate, generating }) => {
  const [serviceId, setServiceId] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [prefix, setPrefix] = useState('');
  const [validity, setValidity] = useState('30');
  const [servicePickerOpen, setServicePickerOpen] = useState(false);

  const selectedService = services.find(
    (s) => String(s.id || s.ID) === String(serviceId),
  );

  const handleGenerate = () => {
    if (!serviceId) {
      Alert.alert('Validation', 'Please select a service.');
      return;
    }
    const qty = parseInt(quantity, 10);
    if (!qty || qty < 1 || qty > 1000) {
      Alert.alert('Validation', 'Quantity must be between 1 and 1000.');
      return;
    }
    const val = parseInt(validity, 10);
    if (!val || val < 1) {
      Alert.alert('Validation', 'Validity days must be at least 1.');
      return;
    }

    Alert.alert(
      'Confirm Generation',
      `Generate ${qty} prepaid card${qty !== 1 ? 's' : ''} for ${selectedService?.name || 'selected service'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: () =>
            onGenerate({
              service_id: parseInt(serviceId, 10),
              quantity: qty,
              prefix: prefix.trim(),
              validity_days: val,
            }),
        },
      ],
    );
  };

  return (
    <ScrollView
      style={genStyles.container}
      contentContainerStyle={genStyles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Info Card */}
      <View style={genStyles.infoCard}>
        <Text style={genStyles.infoIcon}>{'\uD83D\uDCB3'}</Text>
        <Text style={genStyles.infoText}>
          Generate prepaid cards that subscribers can use to activate or renew their service.
        </Text>
      </View>

      {/* Service Picker */}
      <View style={genFormStyles.fieldContainer}>
        <Text style={genFormStyles.label}>Service Plan</Text>
        <TouchableOpacity
          style={genFormStyles.pickerButton}
          onPress={() => setServicePickerOpen(!servicePickerOpen)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              genFormStyles.pickerButtonText,
              !selectedService && { color: colors.textLight },
            ]}
          >
            {selectedService?.name || 'Select a service...'}
          </Text>
          <Text style={genFormStyles.pickerArrow}>
            {servicePickerOpen ? '\u25B2' : '\u25BC'}
          </Text>
        </TouchableOpacity>
        {servicePickerOpen && (
          <View style={genFormStyles.pickerOptions}>
            <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
              {services.map((svc) => {
                const id = String(svc.id || svc.ID);
                return (
                  <TouchableOpacity
                    key={id}
                    style={[
                      genFormStyles.pickerOption,
                      id === String(serviceId) && genFormStyles.pickerOptionActive,
                    ]}
                    onPress={() => {
                      setServiceId(id);
                      setServicePickerOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        genFormStyles.pickerOptionText,
                        id === String(serviceId) &&
                          genFormStyles.pickerOptionTextActive,
                      ]}
                    >
                      {svc.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Quantity & Validity */}
      <View style={genFormStyles.twoCol}>
        <View style={genFormStyles.col}>
          <Text style={genFormStyles.label}>Quantity</Text>
          <TextInput
            style={genFormStyles.input}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="number-pad"
            placeholder="10"
            placeholderTextColor={colors.textLight}
          />
        </View>
        <View style={{ width: spacing.md }} />
        <View style={genFormStyles.col}>
          <Text style={genFormStyles.label}>Validity (days)</Text>
          <TextInput
            style={genFormStyles.input}
            value={validity}
            onChangeText={setValidity}
            keyboardType="number-pad"
            placeholder="30"
            placeholderTextColor={colors.textLight}
          />
        </View>
      </View>

      {/* Prefix */}
      <View style={genFormStyles.fieldContainer}>
        <Text style={genFormStyles.label}>Card Prefix (optional)</Text>
        <TextInput
          style={genFormStyles.input}
          value={prefix}
          onChangeText={setPrefix}
          placeholder="e.g., PRE"
          placeholderTextColor={colors.textLight}
          autoCapitalize="characters"
          maxLength={10}
        />
        <Text style={genFormStyles.hint}>
          Cards will be generated as PREFIX-XXXXXXXXX
        </Text>
      </View>

      {/* Generate Button */}
      <TouchableOpacity
        style={[genStyles.generateButton, generating && { opacity: 0.6 }]}
        onPress={handleGenerate}
        disabled={generating}
        activeOpacity={0.7}
      >
        {generating ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <Text style={genStyles.generateButtonText}>Generate Cards</Text>
        )}
      </TouchableOpacity>

      <View style={{ height: spacing.xxxl * 2 }} />
    </ScrollView>
  );
};

const genStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '08',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary + '20',
    padding: spacing.base,
    marginBottom: spacing.lg,
  },
  infoIcon: {
    fontSize: 24,
    marginRight: spacing.md,
  },
  infoText: {
    ...typography.bodySmall,
    color: colors.primary,
    flex: 1,
    lineHeight: 20,
  },
  generateButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    marginTop: spacing.lg,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  generateButtonText: {
    ...typography.button,
    color: colors.textInverse,
    fontSize: 16,
  },
});

const genFormStyles = StyleSheet.create({
  fieldContainer: {
    marginBottom: spacing.base,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
    ...typography.body,
    color: colors.text,
  },
  hint: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: spacing.xs,
  },
  twoCol: {
    flexDirection: 'row',
    marginBottom: spacing.base,
  },
  col: {
    flex: 1,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
  },
  pickerButtonText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  pickerArrow: {
    ...typography.caption,
    color: colors.textLight,
    marginLeft: spacing.sm,
  },
  pickerOptions: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  pickerOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  pickerOptionActive: {
    backgroundColor: colors.primary + '10',
  },
  pickerOptionText: {
    ...typography.body,
    color: colors.text,
  },
  pickerOptionTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
});

// ---------------------------------------------------------------------------
// PrepaidScreen
// ---------------------------------------------------------------------------

const PrepaidScreen = () => {
  const [activeTab, setActiveTab] = useState('list');
  const [cards, setCards] = useState([]);
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalCards, setTotalCards] = useState(0);

  // -----------------------------------------------------------------------
  // Fetch
  // -----------------------------------------------------------------------

  const fetchCards = useCallback(
    async (silent = false, pageNum = 1) => {
      if (!silent) setIsLoading(true);
      try {
        const params = { page: pageNum, limit: 30 };
        if (statusFilter) params.status = statusFilter;
        if (search.trim()) params.search = search.trim();

        const [cardsRes, svcRes] = await Promise.all([
          api.get('/api/prepaid', { params }),
          services.length === 0 ? serviceApi.list() : Promise.resolve(null),
        ]);

        if (cardsRes?.data) {
          const data = cardsRes.data.data || cardsRes.data;
          const list =
            data.cards || data.items || (Array.isArray(data) ? data : []);

          if (pageNum === 1) {
            setCards(list);
          } else {
            setCards((prev) => [...prev, ...list]);
          }

          setTotalCards(data.total || data.total_count || list.length);
          setHasMore(list.length >= 30);
          setPage(pageNum);
        }

        if (svcRes?.data) {
          const sData = svcRes.data.data || svcRes.data;
          const sList =
            sData.services || sData.items || (Array.isArray(sData) ? sData : []);
          setServices(sList);
        }
      } catch (err) {
        console.error('PrepaidScreen fetch error:', err);
        if (!silent) {
          Alert.alert('Error', 'Failed to load prepaid cards.');
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [statusFilter, search, services.length],
  );

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchCards(true, 1);
  }, [fetchCards]);

  const loadMore = useCallback(() => {
    if (hasMore && !isLoading) {
      fetchCards(true, page + 1);
    }
  }, [hasMore, isLoading, page, fetchCards]);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const handleGenerate = async (payload) => {
    setGenerating(true);
    try {
      const res = await api.post('/api/prepaid/generate', payload);
      const count = res?.data?.data?.count || res?.data?.count || payload.quantity;
      Alert.alert(
        'Success',
        `Generated ${count} prepaid card${count !== 1 ? 's' : ''} successfully.`,
        [
          {
            text: 'View Cards',
            onPress: () => {
              setActiveTab('list');
              fetchCards(true, 1);
            },
          },
        ],
      );
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to generate cards.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (cardId) => {
    try {
      await api.delete(`/api/prepaid/${cardId}`);
      setCards((prev) => prev.filter((c) => (c.id || c.ID) !== cardId));
    } catch (err) {
      Alert.alert('Error', 'Failed to delete card.');
    }
  };

  const handleStatusFilterChange = (val) => {
    setStatusFilter(val);
    setPage(1);
  };

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === 'list') {
        fetchCards(true, 1);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [search, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const renderCardItem = ({ item }) => (
    <CardRow card={item} onDelete={handleDelete} />
  );

  const cardKeyExtractor = (item, index) =>
    String(item.id || item.ID || index);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Prepaid Cards</Text>
        <Text style={styles.headerCount}>
          {totalCards} card{totalCards !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Tabs */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Content */}
      {activeTab === 'generate' ? (
        <GenerateForm
          services={services}
          onGenerate={handleGenerate}
          generating={generating}
        />
      ) : (
        <>
          {/* Search */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search by card number..."
              placeholderTextColor={colors.textLight}
              clearButtonMode="while-editing"
            />
          </View>

          {/* Status Filter */}
          <StatusFilterBar
            active={statusFilter}
            onChange={handleStatusFilterChange}
          />

          {/* Card List */}
          {isLoading && cards.length === 0 ? (
            <LoadingScreen message="Loading cards..." />
          ) : (
            <FlatList
              data={cards}
              renderItem={renderCardItem}
              keyExtractor={cardKeyExtractor}
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
              onEndReached={loadMore}
              onEndReachedThreshold={0.3}
              ListEmptyComponent={
                <EmptyState
                  icon={'\uD83D\uDCB3'}
                  title="No Prepaid Cards"
                  message={
                    search || statusFilter
                      ? 'No cards match your search or filter.'
                      : 'Generate prepaid cards from the Generate tab.'
                  }
                />
              }
              ListFooterComponent={
                hasMore && cards.length > 0 ? (
                  <View style={styles.loadingMore}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                ) : null
              }
            />
          )}
        </>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    paddingTop: Platform.OS === 'ios' ? 56 : spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.text,
  },
  headerCount: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  searchContainer: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    backgroundColor: colors.surfaceHover,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm + 2 : spacing.sm,
    ...typography.body,
    color: colors.text,
  },
  listContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  loadingMore: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
});

export default PrepaidScreen;
