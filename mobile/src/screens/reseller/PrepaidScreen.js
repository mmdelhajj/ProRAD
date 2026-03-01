import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  Platform,
  KeyboardAvoidingView,
  Clipboard,
} from 'react-native';
import { Card, EmptyState, LoadingScreen, StatCard } from '../../components';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { formatCurrency, formatDate } from '../../utils/format';
import api from '../../services/api';

// ---------------------------------------------------------------------------
// Prepaid Card Row
// ---------------------------------------------------------------------------

const PrepaidCardRow = ({ item, onCopy }) => {
  const isUsed = !!item.used_at || item.status === 'used';
  const isExpired = item.status === 'expired';

  const statusLabel = isUsed ? 'Used' : isExpired ? 'Expired' : 'Active';
  const statusColor = isUsed
    ? colors.inactive
    : isExpired
    ? colors.warning
    : colors.success;

  return (
    <TouchableOpacity
      style={cardRowStyles.container}
      onPress={() => onCopy(item)}
      activeOpacity={0.7}
    >
      <View style={cardRowStyles.topRow}>
        <Text style={cardRowStyles.code} numberOfLines={1}>
          {item.code || item.card_number || '-'}
        </Text>
        <View
          style={[cardRowStyles.badge, { backgroundColor: statusColor + '15' }]}
        >
          <View
            style={[cardRowStyles.dot, { backgroundColor: statusColor }]}
          />
          <Text style={[cardRowStyles.badgeText, { color: statusColor }]}>
            {statusLabel}
          </Text>
        </View>
      </View>

      <View style={cardRowStyles.details}>
        <View style={cardRowStyles.detailItem}>
          <Text style={cardRowStyles.detailLabel}>Service</Text>
          <Text style={cardRowStyles.detailValue} numberOfLines={1}>
            {item.service_name || item.service?.name || '-'}
          </Text>
        </View>
        <View style={cardRowStyles.detailItem}>
          <Text style={cardRowStyles.detailLabel}>Value</Text>
          <Text style={cardRowStyles.detailValue}>
            {item.days ? `${item.days} days` : item.value ? formatCurrency(item.value) : '-'}
          </Text>
        </View>
        <View style={cardRowStyles.detailItem}>
          <Text style={cardRowStyles.detailLabel}>Created</Text>
          <Text style={cardRowStyles.detailValue}>
            {formatDate(item.created_at, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
        </View>
      </View>

      {isUsed && item.used_by ? (
        <Text style={cardRowStyles.usedBy} numberOfLines={1}>
          Used by: {item.used_by}
        </Text>
      ) : null}

      <Text style={cardRowStyles.tapHint}>Tap to copy code</Text>
    </TouchableOpacity>
  );
};

const cardRowStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  code: {
    ...typography.h4,
    color: colors.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 1,
    flex: 1,
    marginRight: spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
    borderRadius: borderRadius.full,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.xs,
  },
  badgeText: {
    ...typography.caption,
    fontWeight: '600',
  },
  details: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    ...typography.caption,
    color: colors.textLight,
    marginBottom: 2,
  },
  detailValue: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '500',
  },
  usedBy: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  tapHint: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: spacing.sm,
    textAlign: 'right',
  },
});

// ---------------------------------------------------------------------------
// Generate Modal
// ---------------------------------------------------------------------------

const GenerateModal = ({ visible, onClose, onGenerate, generating, services }) => {
  const [selectedService, setSelectedService] = useState(null);
  const [quantity, setQuantity] = useState('1');
  const [days, setDays] = useState('30');
  const [prefix, setPrefix] = useState('');

  const handleGenerate = () => {
    if (!selectedService) {
      Alert.alert('Error', 'Please select a service.');
      return;
    }
    const qty = parseInt(quantity, 10);
    if (!qty || qty < 1 || qty > 100) {
      Alert.alert('Error', 'Quantity must be between 1 and 100.');
      return;
    }
    const d = parseInt(days, 10);
    if (!d || d < 1) {
      Alert.alert('Error', 'Days must be at least 1.');
      return;
    }

    Alert.alert(
      'Generate Cards',
      `Generate ${qty} prepaid card(s) for "${selectedService.name}" (${d} days each)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: () => {
            onGenerate({
              service_id: selectedService.id,
              quantity: qty,
              days: d,
              prefix: prefix.trim() || undefined,
            });
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      onRequestClose={onClose}
    >
      <SafeAreaView style={genStyles.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header */}
          <View style={genStyles.header}>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={genStyles.closeBtn}>{'\u2715'}</Text>
            </TouchableOpacity>
            <Text style={genStyles.headerTitle}>Generate Prepaid Cards</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView
            style={genStyles.scroll}
            contentContainerStyle={genStyles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Service Selector */}
            <Text style={genStyles.label}>Service</Text>
            <View style={genStyles.serviceList}>
              {services.map((svc) => {
                const isSelected = selectedService?.id === svc.id;
                return (
                  <TouchableOpacity
                    key={svc.id}
                    style={[
                      genStyles.serviceChip,
                      isSelected && genStyles.serviceChipActive,
                    ]}
                    onPress={() => setSelectedService(svc)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        genStyles.serviceChipText,
                        isSelected && genStyles.serviceChipTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {svc.name}
                    </Text>
                    {svc.price ? (
                      <Text
                        style={[
                          genStyles.serviceChipPrice,
                          isSelected && genStyles.serviceChipPriceActive,
                        ]}
                      >
                        {formatCurrency(svc.price)}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
              {services.length === 0 && (
                <Text style={genStyles.noServices}>
                  No services available.
                </Text>
              )}
            </View>

            {/* Quantity */}
            <Text style={genStyles.label}>Quantity (1-100)</Text>
            <TextInput
              style={genStyles.input}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor={colors.textLight}
              maxLength={3}
            />

            {/* Days */}
            <Text style={genStyles.label}>Validity (days)</Text>
            <TextInput
              style={genStyles.input}
              value={days}
              onChangeText={setDays}
              keyboardType="number-pad"
              placeholder="30"
              placeholderTextColor={colors.textLight}
              maxLength={4}
            />

            {/* Prefix */}
            <Text style={genStyles.label}>Code Prefix (optional)</Text>
            <TextInput
              style={genStyles.input}
              value={prefix}
              onChangeText={setPrefix}
              placeholder="e.g., PROMO"
              placeholderTextColor={colors.textLight}
              autoCapitalize="characters"
              maxLength={10}
            />

            {/* Generate Button */}
            <TouchableOpacity
              style={[
                genStyles.generateBtn,
                generating && genStyles.generateBtnDisabled,
              ]}
              onPress={handleGenerate}
              activeOpacity={0.7}
              disabled={generating}
            >
              {generating ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={genStyles.generateText}>
                  {'\uD83D\uDCB3'} Generate Cards
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const genStyles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeBtn: {
    fontSize: 18,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  headerTitle: {
    ...typography.h4,
    color: colors.text,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
    paddingBottom: spacing.tabBar,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  serviceList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  serviceChip: {
    backgroundColor: colors.surfaceHover,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    minWidth: 100,
    alignItems: 'center',
  },
  serviceChipActive: {
    backgroundColor: colors.primary + '12',
    borderColor: colors.primary,
  },
  serviceChipText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  serviceChipTextActive: {
    color: colors.primary,
  },
  serviceChipPrice: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  serviceChipPriceActive: {
    color: colors.primary,
  },
  noServices: {
    ...typography.body,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    height: 48,
  },
  generateBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.base,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xxl,
    minHeight: 52,
  },
  generateBtnDisabled: {
    opacity: 0.6,
  },
  generateText: {
    ...typography.button,
    color: colors.textInverse,
    fontSize: 16,
  },
});

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

const PrepaidScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cards, setCards] = useState([]);
  const [services, setServices] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);

  // ------ Fetch cards ------
  const fetchCards = useCallback(
    async (pageNum = 1, append = false) => {
      try {
        const params = { page: pageNum, limit: 20 };
        const res = await api.get('/api/prepaid', { params });
        const data = res.data?.data || res.data?.cards || [];
        const list = Array.isArray(data) ? data : [];

        if (append) {
          setCards((prev) => [...prev, ...list]);
        } else {
          setCards(list);
        }

        const total = res.data?.total || res.data?.pagination?.total || 0;
        const currentCount = append ? cards.length + list.length : list.length;
        setHasMore(list.length >= 20 && currentCount < total);
      } catch (err) {
        if (!append) setCards([]);
      }
    },
    [cards.length],
  );

  // ------ Fetch services ------
  const fetchServices = useCallback(async () => {
    try {
      const res = await api.get('/api/services');
      const data = res.data?.data || res.data?.services || res.data;
      setServices(Array.isArray(data) ? data : []);
    } catch (err) {
      // silent
    }
  }, []);

  // ------ Initial load ------
  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchCards(1, false), fetchServices()]);
      setLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ------ Pull to refresh ------
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setPage(1);
    await fetchCards(1, false);
    setRefreshing(false);
  }, [fetchCards]);

  // ------ Load more ------
  const onEndReached = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    setPage(nextPage);
    await fetchCards(nextPage, true);
    setLoadingMore(false);
  }, [hasMore, loadingMore, page, fetchCards]);

  // ------ Copy card code ------
  const handleCopy = useCallback((card) => {
    const code = card.code || card.card_number || '';
    if (code) {
      try {
        Clipboard.setString(code);
      } catch (e) {
        // Clipboard might not be available
      }
      Alert.alert('Copied', `Card code "${code}" copied to clipboard.`);
    }
  }, []);

  // ------ Generate cards ------
  const handleGenerate = useCallback(
    async (data) => {
      setGenerating(true);
      try {
        await api.post('/api/prepaid/generate', data);
        Alert.alert('Success', `${data.quantity} prepaid card(s) generated!`);
        setShowGenerate(false);
        // Refresh list
        setPage(1);
        await fetchCards(1, false);
      } catch (err) {
        Alert.alert('Error', err.message || 'Failed to generate cards.');
      } finally {
        setGenerating(false);
      }
    },
    [fetchCards],
  );

  // ------ Stats ------
  const totalCards = cards.length;
  const activeCards = cards.filter(
    (c) => !c.used_at && c.status !== 'used' && c.status !== 'expired',
  ).length;
  const usedCards = cards.filter(
    (c) => !!c.used_at || c.status === 'used',
  ).length;

  // ------ Render ------
  if (loading) {
    return <LoadingScreen message="Loading prepaid cards..." />;
  }

  const ListHeader = () => (
    <View style={styles.headerSection}>
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{totalCards}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={[styles.statBox, styles.statBorder]}>
          <Text style={[styles.statValue, { color: colors.success }]}>
            {activeCards}
          </Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={[styles.statBox, styles.statBorder]}>
          <Text style={[styles.statValue, { color: colors.inactive }]}>
            {usedCards}
          </Text>
          <Text style={styles.statLabel}>Used</Text>
        </View>
      </View>
    </View>
  );

  const ListFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.loadingMore}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={cards}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <PrepaidCardRow item={item} onCopy={handleCopy} />
        )}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        ListEmptyComponent={
          <EmptyState
            icon={'\uD83D\uDCB3'}
            title="No Prepaid Cards"
            message="Generate your first prepaid cards for your subscribers."
            actionLabel="Generate Cards"
            onAction={() => setShowGenerate(true)}
          />
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowGenerate(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      {/* Generate Modal */}
      <GenerateModal
        visible={showGenerate}
        onClose={() => setShowGenerate(false)}
        onGenerate={handleGenerate}
        generating={generating}
        services={services}
      />
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingBottom: spacing.tabBar + 60,
  },
  headerSection: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statBorder: {
    borderLeftWidth: 1,
    borderLeftColor: colors.borderLight,
  },
  statValue: {
    ...typography.h4,
    color: colors.text,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  loadingMore: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl + (Platform.OS === 'ios' ? 20 : 0),
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  fabIcon: {
    fontSize: 28,
    fontWeight: '300',
    color: colors.textInverse,
    lineHeight: 30,
  },
});

export default PrepaidScreen;
