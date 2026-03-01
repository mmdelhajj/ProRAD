import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform,
  RefreshControl,
  Switch,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState, LoadingScreen } from '../../components';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { resellerApi } from '../../services/api';
import { formatCurrency } from '../../utils/format';
import useAuthStore from '../../store/authStore';
import { CommonActions } from '@react-navigation/native';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

function getStatusLabel(reseller) {
  if (reseller.is_active === false) return 'Inactive';
  return 'Active';
}

function getStatusColor(reseller) {
  if (reseller.is_active === false) return colors.inactive;
  return colors.online;
}

// ---------------------------------------------------------------------------
// Detail Field
// ---------------------------------------------------------------------------

const DetailField = ({ label, value, valueColor }) => (
  <View style={detailFieldStyles.container}>
    <Text style={detailFieldStyles.label}>{label}</Text>
    <Text style={[detailFieldStyles.value, valueColor && { color: valueColor }]}>
      {value != null ? String(value) : '-'}
    </Text>
  </View>
);

const detailFieldStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  label: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flex: 1,
  },
  value: {
    ...typography.body,
    color: colors.text,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
});

// ---------------------------------------------------------------------------
// Form Field
// ---------------------------------------------------------------------------

const FormField = ({ label, value, onChangeText, placeholder, keyboardType, secureTextEntry, multiline }) => (
  <View style={formFieldStyles.container}>
    <Text style={formFieldStyles.label}>{label}</Text>
    <TextInput
      style={[formFieldStyles.input, multiline && formFieldStyles.multilineInput]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textLight}
      keyboardType={keyboardType || 'default'}
      secureTextEntry={secureTextEntry}
      autoCapitalize="none"
      autoCorrect={false}
      multiline={multiline}
    />
  </View>
);

const formFieldStyles = StyleSheet.create({
  container: {
    marginBottom: spacing.base,
  },
  label: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    ...typography.body,
    color: colors.text,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
});

// ---------------------------------------------------------------------------
// Reseller Row
// ---------------------------------------------------------------------------

const ResellerRow = ({ reseller, onPress }) => {
  const balance = reseller.balance || 0;
  const balanceColor = balance >= 0 ? colors.success : colors.danger;
  const subscriberCount = reseller.subscriber_count ?? reseller.subscribers_count ?? 0;
  const companyName = reseller.company_name || reseller.company || '';
  const username = reseller.username || reseller.user?.username || '';

  return (
    <TouchableOpacity
      style={rowStyles.container}
      onPress={() => onPress(reseller)}
      activeOpacity={0.7}
    >
      <View style={rowStyles.row}>
        <View style={rowStyles.info}>
          <View style={rowStyles.topLine}>
            <Text style={rowStyles.username} numberOfLines={1}>{username}</Text>
            <View style={[rowStyles.statusBadge, { backgroundColor: getStatusColor(reseller) + '18' }]}>
              <Text style={[rowStyles.statusText, { color: getStatusColor(reseller) }]}>
                {getStatusLabel(reseller)}
              </Text>
            </View>
          </View>
          {companyName ? (
            <Text style={rowStyles.company} numberOfLines={1}>{companyName}</Text>
          ) : null}
          <View style={rowStyles.bottomLine}>
            <View style={rowStyles.tag}>
              <Text style={rowStyles.tagText}>
                {subscriberCount} subscriber{subscriberCount !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>
        </View>
        <View style={rowStyles.rightSide}>
          <Text style={[rowStyles.balance, { color: balanceColor }]}>
            {formatCurrency(balance)}
          </Text>
          <Text style={rowStyles.chevron}>{'\u203A'}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const rowStyles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  info: { flex: 1 },
  topLine: {
    flexDirection: 'row',
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
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  statusText: {
    ...typography.caption,
    fontWeight: '600',
  },
  company: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  bottomLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  tag: {
    backgroundColor: colors.textSecondary + '12',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  tagText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  rightSide: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    marginLeft: spacing.md,
  },
  balance: {
    ...typography.body,
    fontWeight: '700',
    marginBottom: 2,
  },
  chevron: {
    ...typography.h3,
    color: colors.textLight,
  },
});

// ---------------------------------------------------------------------------
// Balance Modal
// ---------------------------------------------------------------------------

const BalanceModal = ({ visible, reseller, onClose, onSubmit }) => {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const isDeduct = reseller?._balanceAction === 'deduct';

  const handleSubmit = async () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a positive number.');
      return;
    }
    setLoading(true);
    try {
      await onSubmit(isDeduct ? -val : val);
      setAmount('');
      onClose();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to adjust balance.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={balanceModalStyles.overlay}>
        <View style={balanceModalStyles.container}>
          <Text style={balanceModalStyles.title}>
            {isDeduct ? 'Deduct Balance' : 'Add Balance'}
          </Text>
          <Text style={balanceModalStyles.subtitle}>
            {reseller?.username || reseller?.user?.username || 'Reseller'}
          </Text>
          <TextInput
            style={balanceModalStyles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="Enter amount"
            placeholderTextColor={colors.textLight}
            keyboardType="decimal-pad"
            autoFocus
          />
          <View style={balanceModalStyles.buttons}>
            <TouchableOpacity style={balanceModalStyles.cancelBtn} onPress={onClose} disabled={loading}>
              <Text style={balanceModalStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[balanceModalStyles.submitBtn, { backgroundColor: isDeduct ? colors.danger : colors.success }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={balanceModalStyles.submitText}>
                  {isDeduct ? 'Deduct' : 'Add'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const balanceModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 340,
  },
  title: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.h4,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cancelText: {
    ...typography.button,
    color: colors.textSecondary,
  },
  submitBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  submitText: {
    ...typography.button,
    color: colors.textInverse,
  },
});

// ---------------------------------------------------------------------------
// Reseller Detail Modal
// ---------------------------------------------------------------------------

const ResellerDetailModal = ({ reseller, visible, onClose, onAction }) => {
  if (!reseller) return null;

  const username = reseller.username || reseller.user?.username || '';
  const email = reseller.email || reseller.user?.email || '';
  const balance = reseller.balance || 0;
  const balanceColor = balance >= 0 ? colors.success : colors.danger;
  const subscriberCount = reseller.subscriber_count ?? reseller.subscribers_count ?? 0;
  const isActive = reseller.is_active !== false;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={detailModalStyles.container}>
        <View style={detailModalStyles.header}>
          <Text style={detailModalStyles.headerTitle} numberOfLines={1}>{username}</Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.6}>
            <Text style={detailModalStyles.closeButton}>{'\u2715'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={detailModalStyles.body} contentContainerStyle={detailModalStyles.bodyContent} showsVerticalScrollIndicator={false}>
          <Text style={detailModalStyles.sectionTitle}>Account Info</Text>
          <View style={detailModalStyles.card}>
            <DetailField label="Username" value={username} />
            <DetailField label="Email" value={email} />
            <DetailField label="Company" value={reseller.company_name || reseller.company || '-'} />
            <DetailField label="Phone" value={reseller.phone || '-'} />
            <DetailField label="Status" value={isActive ? 'Active' : 'Inactive'} valueColor={isActive ? colors.success : colors.danger} />
          </View>

          <Text style={detailModalStyles.sectionTitle}>Financials</Text>
          <View style={detailModalStyles.card}>
            <DetailField label="Balance" value={formatCurrency(balance)} valueColor={balanceColor} />
            <DetailField label="Subscribers" value={String(subscriberCount)} />
          </View>

          <Text style={detailModalStyles.sectionTitle}>Actions</Text>
          <View style={detailModalStyles.actionsContainer}>
            <TouchableOpacity
              style={[detailModalStyles.actionBtn, { backgroundColor: colors.success }]}
              onPress={() => onAction('add_balance', reseller)}
            >
              <Text style={detailModalStyles.actionBtnText}>Add Balance</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[detailModalStyles.actionBtn, { backgroundColor: colors.danger }]}
              onPress={() => onAction('deduct_balance', reseller)}
            >
              <Text style={detailModalStyles.actionBtnText}>Deduct Balance</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[detailModalStyles.actionBtn, { backgroundColor: isActive ? colors.warning : colors.success }]}
              onPress={() => onAction('toggle_status', reseller)}
            >
              <Text style={detailModalStyles.actionBtnText}>
                {isActive ? 'Deactivate' : 'Activate'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[detailModalStyles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={() => onAction('login_as', reseller)}
            >
              <Text style={detailModalStyles.actionBtnText}>Login as Reseller</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: spacing.tabBar }} />
        </ScrollView>
      </View>
    </Modal>
  );
};

const detailModalStyles = StyleSheet.create({
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
  bodyContent: { paddingHorizontal: spacing.base, paddingTop: spacing.md },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
  },
  actionsContainer: {
    gap: spacing.sm,
  },
  actionBtn: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  actionBtnText: {
    ...typography.button,
    color: colors.textInverse,
  },
});

// ---------------------------------------------------------------------------
// Create Reseller Modal
// ---------------------------------------------------------------------------

const CreateResellerModal = ({ visible, onClose, onSubmit }) => {
  const [form, setForm] = useState({ username: '', password: '', email: '', company_name: '', phone: '' });
  const [loading, setLoading] = useState(false);

  const updateField = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = async () => {
    if (!form.username.trim()) {
      Alert.alert('Validation', 'Username is required.');
      return;
    }
    if (!form.password.trim()) {
      Alert.alert('Validation', 'Password is required.');
      return;
    }
    setLoading(true);
    try {
      await onSubmit(form);
      setForm({ username: '', password: '', email: '', company_name: '', phone: '' });
      onClose();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to create reseller.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={createModalStyles.container}>
          <View style={createModalStyles.header}>
            <Text style={createModalStyles.headerTitle}>New Reseller</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.6}>
              <Text style={createModalStyles.closeButton}>{'\u2715'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={createModalStyles.body} contentContainerStyle={createModalStyles.bodyContent} keyboardShouldPersistTaps="handled">
            <FormField label="Username" value={form.username} onChangeText={(v) => updateField('username', v)} placeholder="Enter username" />
            <FormField label="Password" value={form.password} onChangeText={(v) => updateField('password', v)} placeholder="Enter password" secureTextEntry />
            <FormField label="Email" value={form.email} onChangeText={(v) => updateField('email', v)} placeholder="Enter email" keyboardType="email-address" />
            <FormField label="Company Name" value={form.company_name} onChangeText={(v) => updateField('company_name', v)} placeholder="Company name" />
            <FormField label="Phone" value={form.phone} onChangeText={(v) => updateField('phone', v)} placeholder="Phone number" keyboardType="phone-pad" />

            <TouchableOpacity
              style={createModalStyles.submitBtn}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={createModalStyles.submitText}>Create Reseller</Text>
              )}
            </TouchableOpacity>
            <View style={{ height: spacing.tabBar }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const createModalStyles = StyleSheet.create({
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
  submitBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md + 2,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  submitText: { ...typography.button, color: colors.textInverse },
});

// ---------------------------------------------------------------------------
// ResellersScreen
// ---------------------------------------------------------------------------

export default function ResellersScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [resellers, setResellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebounce(searchText, 300);

  const [selectedReseller, setSelectedReseller] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [balanceReseller, setBalanceReseller] = useState(null);

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // ---- Fetch ----
  const fetchResellers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const params = {};
      if (debouncedSearch) params.search = debouncedSearch;
      const res = await resellerApi.list(params);
      if (!isMounted.current) return;
      const data = res.data?.data || res.data;
      const list = data?.resellers || data?.items || (Array.isArray(data) ? data : []);
      setResellers(list);
    } catch (err) {
      if (isMounted.current) setError(err.message || 'Failed to load resellers.');
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [debouncedSearch]);

  useEffect(() => { fetchResellers(); }, [fetchResellers]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchResellers(true);
  }, [fetchResellers]);

  // ---- Actions ----
  const handleAction = useCallback((action, reseller) => {
    switch (action) {
      case 'add_balance':
        setSelectedReseller(null);
        setBalanceReseller({ ...reseller, _balanceAction: 'add' });
        break;
      case 'deduct_balance':
        setSelectedReseller(null);
        setBalanceReseller({ ...reseller, _balanceAction: 'deduct' });
        break;
      case 'toggle_status': {
        const isActive = reseller.is_active !== false;
        Alert.alert(
          isActive ? 'Deactivate Reseller' : 'Activate Reseller',
          `Are you sure you want to ${isActive ? 'deactivate' : 'activate'} ${reseller.username || reseller.user?.username}?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: isActive ? 'Deactivate' : 'Activate',
              style: isActive ? 'destructive' : 'default',
              onPress: async () => {
                try {
                  await resellerApi.update(reseller.id || reseller.ID, { is_active: !isActive });
                  setSelectedReseller(null);
                  fetchResellers(true);
                } catch (err) {
                  Alert.alert('Error', err.message || 'Failed to update status.');
                }
              },
            },
          ],
        );
        break;
      }
      case 'login_as': {
        const resellerName = reseller.username || reseller.user?.username || 'this reseller';
        Alert.alert(
          'Login as Reseller',
          `Switch to ${resellerName}'s account? You can switch back to admin from the reseller dashboard.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Login',
              onPress: async () => {
                try {
                  const res = await resellerApi.impersonate(reseller.id || reseller.ID);
                  const data = res.data;
                  const inner = data.data || data; // token is inside data.data
                  if (data.success && inner.token) {
                    const resellerUser = inner.user || {};
                    await useAuthStore.getState().startImpersonation(inner.token, resellerUser);
                    // Navigate to ResellerTabs, resetting the stack
                    navigation.dispatch(
                      CommonActions.reset({
                        index: 0,
                        routes: [{ name: 'ResellerTabs' }],
                      }),
                    );
                  } else {
                    Alert.alert('Error', data.message || 'Impersonation failed.');
                  }
                } catch (err) {
                  Alert.alert('Error', err.message || 'Failed to impersonate reseller.');
                }
              },
            },
          ],
        );
        break;
      }
      default:
        break;
    }
  }, [fetchResellers]);

  const handleBalanceSubmit = useCallback(async (amount) => {
    if (!balanceReseller) return;
    const id = balanceReseller.id || balanceReseller.ID;
    if (amount < 0) {
      await resellerApi.deductBalance(id, Math.abs(amount));
    } else {
      await resellerApi.addBalance(id, amount);
    }
    fetchResellers(true);
  }, [balanceReseller, fetchResellers]);

  const handleCreateSubmit = useCallback(async (formData) => {
    await resellerApi.create(formData);
    fetchResellers(true);
  }, [fetchResellers]);

  // ---- Render ----
  if (loading && resellers.length === 0 && !refreshing) {
    return <LoadingScreen message="Loading resellers..." />;
  }

  const renderItem = ({ item }) => (
    <ResellerRow reseller={item} onPress={setSelectedReseller} />
  );

  const keyExtractor = (item, index) => String(item.id || item.ID || index);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>Resellers</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{resellers.length}</Text>
          </View>
        </View>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>{'\uD83D\uDD0D'}</Text>
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search resellers..."
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

      {/* Error state */}
      {error && !loading && resellers.length === 0 ? (
        <EmptyState
          icon={'\u26A0\uFE0F'}
          title="Connection Error"
          message={error}
          actionLabel="Retry"
          onAction={() => fetchResellers()}
        />
      ) : (
        <FlatList
          data={resellers}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[styles.listContent, resellers.length === 0 && styles.listContentEmpty]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />
          }
          ListEmptyComponent={
            <EmptyState
              icon={'\uD83D\uDC65'}
              title="No Resellers"
              message={debouncedSearch ? `No resellers found for "${debouncedSearch}".` : 'No resellers have been created yet.'}
              actionLabel={debouncedSearch ? 'Clear Search' : 'Add Reseller'}
              onAction={debouncedSearch ? () => setSearchText('') : () => setShowCreate(true)}
            />
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}
        onPress={() => setShowCreate(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      {/* Modals */}
      <ResellerDetailModal
        reseller={selectedReseller}
        visible={!!selectedReseller}
        onClose={() => setSelectedReseller(null)}
        onAction={handleAction}
      />
      <BalanceModal
        visible={!!balanceReseller}
        reseller={balanceReseller}
        onClose={() => setBalanceReseller(null)}
        onSubmit={handleBalanceSubmit}
      />
      <CreateResellerModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreateSubmit}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.surface,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingTop: spacing.md,
  },
  headerTitle: { ...typography.h2, color: colors.text },
  countBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginLeft: spacing.md,
  },
  countBadgeText: { ...typography.caption, color: colors.textInverse, fontWeight: '700' },
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
  clearSearch: { ...typography.body, color: colors.textLight, paddingLeft: spacing.sm },
  listContent: { paddingTop: spacing.md, paddingBottom: spacing.tabBar },
  listContentEmpty: { flex: 1, justifyContent: 'center' },
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
      ios: { shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8 },
      android: { elevation: 6 },
    }),
  },
  fabIcon: { fontSize: 28, color: colors.textInverse, fontWeight: '300', marginTop: -1 },
});
