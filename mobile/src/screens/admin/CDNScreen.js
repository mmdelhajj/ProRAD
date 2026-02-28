import React, { useState, useEffect, useCallback } from 'react';
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
import { cdnApi, nasApi } from '../../services/api';
import api from '../../services/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSpeedKb(kb) {
  if (!kb || kb === 0) return '-';
  if (kb >= 1000) {
    const m = kb / 1000;
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
  }
  return `${kb}K`;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CDN_EMPTY = {
  name: '',
  subnets: '',
  download_speed: '',
  upload_speed: '',
  service_id: '',
  enabled: true,
};

const PORT_RULE_EMPTY = {
  name: '',
  port: '',
  direction: 'dst',
  speed: '',
  nas_id: '',
  enabled: true,
};

const DIRECTIONS = [
  { key: 'src', label: 'Source' },
  { key: 'dst', label: 'Destination' },
  { key: 'both', label: 'Both' },
  { key: 'dscp', label: 'DSCP Only' },
];

// ---------------------------------------------------------------------------
// Form Field
// ---------------------------------------------------------------------------

const FormField = ({ label, value, onChangeText, placeholder, keyboardType, multiline }) => (
  <View style={formStyles.container}>
    <Text style={formStyles.label}>{label}</Text>
    <TextInput
      style={[formStyles.input, multiline && { height: 80, textAlignVertical: 'top' }]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textLight}
      keyboardType={keyboardType || 'default'}
      autoCapitalize="none"
      autoCorrect={false}
      multiline={multiline}
    />
  </View>
);

const formStyles = StyleSheet.create({
  container: { marginBottom: spacing.base },
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
});

// ---------------------------------------------------------------------------
// Tabs: CDN Configs | Port Rules
// ---------------------------------------------------------------------------

const CDNScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState('cdn'); // 'cdn' | 'portRules'

  // CDN state
  const [cdnList, setCdnList] = useState([]);
  const [portRules, setPortRules] = useState([]);
  const [nasList, setNasList] = useState([]);
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Modal state
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState(CDN_EMPTY);

  // -----------------------------------------------------------------------
  // Fetch
  // -----------------------------------------------------------------------

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const [cdnRes, portRes, nasRes, svcRes] = await Promise.all([
        cdnApi.list().catch(() => null),
        cdnApi.portRules().catch(() => null),
        nasApi.list().catch(() => null),
        api.get('/api/services').catch(() => null),
      ]);

      if (cdnRes?.data) {
        const d = cdnRes.data.data || cdnRes.data;
        setCdnList(Array.isArray(d) ? d : d.items || d.cdns || []);
      }
      if (portRes?.data) {
        const d = portRes.data.data || portRes.data;
        setPortRules(Array.isArray(d) ? d : d.items || d.port_rules || []);
      }
      if (nasRes?.data) {
        const d = nasRes.data.data || nasRes.data;
        setNasList(Array.isArray(d) ? d : d.items || []);
      }
      if (svcRes?.data) {
        const d = svcRes.data.data || svcRes.data;
        setServices(Array.isArray(d) ? d : d.services || d.items || []);
      }
    } catch (err) {
      console.error('CDNScreen fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchData(true);
  }, [fetchData]);

  // -----------------------------------------------------------------------
  // CDN CRUD
  // -----------------------------------------------------------------------

  const openCDNForm = (item = null) => {
    if (item) {
      setEditingItem(item);
      setForm({
        name: item.name || '',
        subnets: item.subnets || '',
        download_speed: item.download_speed ? String(item.download_speed) : '',
        upload_speed: item.upload_speed ? String(item.upload_speed) : '',
        service_id: item.service_id ? String(item.service_id) : '',
        enabled: item.enabled !== false,
      });
    } else {
      setEditingItem(null);
      setForm(CDN_EMPTY);
    }
    setShowForm(true);
  };

  const saveCDN = async () => {
    if (!form.name.trim()) {
      Alert.alert('Validation', 'Name is required.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        subnets: form.subnets.trim(),
        download_speed: parseInt(form.download_speed, 10) || 0,
        upload_speed: parseInt(form.upload_speed, 10) || 0,
        service_id: parseInt(form.service_id, 10) || 0,
        enabled: form.enabled,
      };

      if (editingItem) {
        await cdnApi.update(editingItem.id || editingItem.ID, payload);
      } else {
        await cdnApi.create(payload);
      }

      setShowForm(false);
      fetchData(true);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save CDN configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteCDN = (item) => {
    Alert.alert(
      'Delete CDN',
      `Delete "${item.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await cdnApi.delete(item.id || item.ID);
              fetchData(true);
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to delete.');
            }
          },
        },
      ],
    );
  };

  // -----------------------------------------------------------------------
  // Port Rule CRUD
  // -----------------------------------------------------------------------

  const openPortRuleForm = (item = null) => {
    if (item) {
      setEditingItem(item);
      setForm({
        name: item.name || '',
        port: item.port ? String(item.port) : '',
        direction: item.direction || 'dst',
        speed: item.speed ? String(item.speed) : '',
        nas_id: item.nas_id ? String(item.nas_id) : '',
        enabled: item.enabled !== false,
      });
    } else {
      setEditingItem(null);
      setForm(PORT_RULE_EMPTY);
    }
    setShowForm(true);
  };

  const savePortRule = async () => {
    if (!form.name.trim()) {
      Alert.alert('Validation', 'Name is required.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        port: parseInt(form.port, 10) || 0,
        direction: form.direction,
        speed: parseInt(form.speed, 10) || 0,
        nas_id: parseInt(form.nas_id, 10) || 0,
        enabled: form.enabled,
      };

      if (editingItem) {
        await cdnApi.updatePortRule(editingItem.id || editingItem.ID, payload);
      } else {
        await cdnApi.createPortRule(payload);
      }

      setShowForm(false);
      fetchData(true);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save port rule.');
    } finally {
      setIsSaving(false);
    }
  };

  const deletePortRule = (item) => {
    Alert.alert(
      'Delete Port Rule',
      `Delete "${item.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await cdnApi.deletePortRule(item.id || item.ID);
              fetchData(true);
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to delete.');
            }
          },
        },
      ],
    );
  };

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const renderCDNItem = ({ item }) => {
    const svc = services.find(
      (s) => (s.id || s.ID) === item.service_id,
    );
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => openCDNForm(item)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardLeft}>
            <Text style={styles.cardIcon}>{'\uD83C\uDF10'}</Text>
            <View>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
              {svc && (
                <Text style={styles.cardSubtitle} numberOfLines={1}>
                  Service: {svc.name}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.cardRight}>
            <View style={[styles.badge, { backgroundColor: item.enabled !== false ? colors.success + '20' : colors.danger + '20' }]}>
              <Text style={[styles.badgeText, { color: item.enabled !== false ? colors.success : colors.danger }]}>
                {item.enabled !== false ? 'Active' : 'Disabled'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.cardDetails}>
          {item.subnets ? (
            <Text style={styles.cardDetailText} numberOfLines={1}>
              Subnets: {item.subnets}
            </Text>
          ) : null}
          {(item.download_speed || item.upload_speed) ? (
            <Text style={styles.cardDetailText}>
              Speed: {formatSpeedKb(item.download_speed)} / {formatSpeedKb(item.upload_speed)}
            </Text>
          ) : null}
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.editBtn]}
            onPress={() => openCDNForm(item)}
          >
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.deleteBtn]}
            onPress={() => deleteCDN(item)}
          >
            <Text style={styles.deleteBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderPortRuleItem = ({ item }) => {
    const nas = nasList.find(
      (n) => (n.id || n.ID) === item.nas_id,
    );
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => openPortRuleForm(item)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardLeft}>
            <Text style={styles.cardIcon}>{'\u26A1'}</Text>
            <View>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.cardSubtitle}>
                Port {item.port} ({DIRECTIONS.find((d) => d.key === item.direction)?.label || item.direction})
              </Text>
            </View>
          </View>
          <View style={styles.cardRight}>
            <View style={[styles.badge, { backgroundColor: item.enabled !== false ? colors.success + '20' : colors.danger + '20' }]}>
              <Text style={[styles.badgeText, { color: item.enabled !== false ? colors.success : colors.danger }]}>
                {item.enabled !== false ? 'Active' : 'Disabled'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.cardDetails}>
          {item.speed ? (
            <Text style={styles.cardDetailText}>
              Speed: {formatSpeedKb(item.speed)}
            </Text>
          ) : null}
          {nas && (
            <Text style={styles.cardDetailText} numberOfLines={1}>
              NAS: {nas.name}
            </Text>
          )}
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.editBtn]}
            onPress={() => openPortRuleForm(item)}
          >
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.deleteBtn]}
            onPress={() => deletePortRule(item)}
          >
            <Text style={styles.deleteBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // -----------------------------------------------------------------------
  // Form Modal
  // -----------------------------------------------------------------------

  const renderFormModal = () => {
    const isCDN = activeTab === 'cdn';
    const title = editingItem
      ? `Edit ${isCDN ? 'CDN' : 'Port Rule'}`
      : `New ${isCDN ? 'CDN Configuration' : 'Port Rule'}`;

    return (
      <Modal
        visible={showForm}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowForm(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={modalStyles.container}>
            {/* Header */}
            <View style={[modalStyles.header, { paddingTop: Platform.OS === 'ios' ? insets.top + spacing.sm : spacing.xl }]}>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Text style={modalStyles.cancelBtn}>Cancel</Text>
              </TouchableOpacity>
              <Text style={modalStyles.title} numberOfLines={1}>{title}</Text>
              <TouchableOpacity onPress={isCDN ? saveCDN : savePortRule} disabled={isSaving}>
                {isSaving ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={modalStyles.saveBtn}>Save</Text>
                )}
              </TouchableOpacity>
            </View>

            <ScrollView
              style={modalStyles.body}
              contentContainerStyle={{ paddingBottom: spacing.xxxl }}
              showsVerticalScrollIndicator={false}
            >
              {isCDN ? (
                <>
                  <FormField
                    label="Name"
                    value={form.name}
                    onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
                    placeholder="e.g. Google CDN"
                  />
                  <FormField
                    label="Subnets (one per line)"
                    value={form.subnets}
                    onChangeText={(v) => setForm((p) => ({ ...p, subnets: v }))}
                    placeholder="e.g. 8.8.8.0/24"
                    multiline
                  />
                  <FormField
                    label="Download Speed (kb)"
                    value={form.download_speed}
                    onChangeText={(v) => setForm((p) => ({ ...p, download_speed: v }))}
                    placeholder="e.g. 10000"
                    keyboardType="numeric"
                  />
                  <FormField
                    label="Upload Speed (kb)"
                    value={form.upload_speed}
                    onChangeText={(v) => setForm((p) => ({ ...p, upload_speed: v }))}
                    placeholder="e.g. 5000"
                    keyboardType="numeric"
                  />

                  {/* Service picker */}
                  <Text style={formStyles.label}>Service</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: spacing.base }}
                  >
                    <TouchableOpacity
                      style={[styles.chipBtn, !form.service_id && styles.chipBtnActive]}
                      onPress={() => setForm((p) => ({ ...p, service_id: '' }))}
                    >
                      <Text style={[styles.chipText, !form.service_id && styles.chipTextActive]}>
                        All Services
                      </Text>
                    </TouchableOpacity>
                    {services.map((svc) => {
                      const svcId = String(svc.id || svc.ID);
                      const active = form.service_id === svcId;
                      return (
                        <TouchableOpacity
                          key={svcId}
                          style={[styles.chipBtn, active && styles.chipBtnActive]}
                          onPress={() => setForm((p) => ({ ...p, service_id: svcId }))}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {svc.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* Enabled toggle */}
                  <View style={styles.switchRow}>
                    <Text style={formStyles.label}>Enabled</Text>
                    <Switch
                      value={form.enabled}
                      onValueChange={(v) => setForm((p) => ({ ...p, enabled: v }))}
                      trackColor={{ false: colors.border, true: colors.primary + '80' }}
                      thumbColor={form.enabled ? colors.primary : colors.textLight}
                    />
                  </View>
                </>
              ) : (
                <>
                  <FormField
                    label="Name"
                    value={form.name}
                    onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
                    placeholder="e.g. Gaming Ports"
                  />
                  <FormField
                    label="Port"
                    value={form.port}
                    onChangeText={(v) => setForm((p) => ({ ...p, port: v }))}
                    placeholder="e.g. 443"
                    keyboardType="numeric"
                  />
                  <FormField
                    label="Speed (Mbps)"
                    value={form.speed}
                    onChangeText={(v) => setForm((p) => ({ ...p, speed: v }))}
                    placeholder="e.g. 10"
                    keyboardType="numeric"
                  />

                  {/* Direction picker */}
                  <Text style={formStyles.label}>Direction</Text>
                  <View style={styles.dirRow}>
                    {DIRECTIONS.map((dir) => {
                      const active = form.direction === dir.key;
                      return (
                        <TouchableOpacity
                          key={dir.key}
                          style={[styles.chipBtn, active && styles.chipBtnActive]}
                          onPress={() => setForm((p) => ({ ...p, direction: dir.key }))}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {dir.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* NAS picker */}
                  <Text style={[formStyles.label, { marginTop: spacing.md }]}>NAS (optional)</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: spacing.base }}
                  >
                    <TouchableOpacity
                      style={[styles.chipBtn, !form.nas_id && styles.chipBtnActive]}
                      onPress={() => setForm((p) => ({ ...p, nas_id: '' }))}
                    >
                      <Text style={[styles.chipText, !form.nas_id && styles.chipTextActive]}>
                        All NAS
                      </Text>
                    </TouchableOpacity>
                    {nasList.map((nas) => {
                      const nasId = String(nas.id || nas.ID);
                      const active = form.nas_id === nasId;
                      return (
                        <TouchableOpacity
                          key={nasId}
                          style={[styles.chipBtn, active && styles.chipBtnActive]}
                          onPress={() => setForm((p) => ({ ...p, nas_id: nasId }))}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {nas.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* Enabled toggle */}
                  <View style={styles.switchRow}>
                    <Text style={formStyles.label}>Enabled</Text>
                    <Switch
                      value={form.enabled}
                      onValueChange={(v) => setForm((p) => ({ ...p, enabled: v }))}
                      trackColor={{ false: colors.border, true: colors.primary + '80' }}
                      thumbColor={form.enabled ? colors.primary : colors.textLight}
                    />
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  // -----------------------------------------------------------------------
  // Loading
  // -----------------------------------------------------------------------

  if (isLoading && cdnList.length === 0 && portRules.length === 0) {
    return <LoadingScreen message="Loading CDN..." />;
  }

  const data = activeTab === 'cdn' ? cdnList : portRules;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? insets.top + spacing.sm : spacing.xl }]}>
        <TouchableOpacity onPress={() => navigation?.goBack?.()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>{'\u2039'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>CDN & Port Rules</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => activeTab === 'cdn' ? openCDNForm() : openPortRuleForm()}
        >
          <Text style={styles.addBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'cdn' && styles.tabActive]}
          onPress={() => setActiveTab('cdn')}
        >
          <Text style={[styles.tabText, activeTab === 'cdn' && styles.tabTextActive]}>
            CDN Configs ({cdnList.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'portRules' && styles.tabActive]}
          onPress={() => setActiveTab('portRules')}
        >
          <Text style={[styles.tabText, activeTab === 'portRules' && styles.tabTextActive]}>
            Port Rules ({portRules.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      <FlatList
        data={data}
        renderItem={activeTab === 'cdn' ? renderCDNItem : renderPortRuleItem}
        keyExtractor={(item, idx) => String(item.id || item.ID || idx)}
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
            icon={activeTab === 'cdn' ? '\uD83C\uDF10' : '\u26A1'}
            title={activeTab === 'cdn' ? 'No CDN Configs' : 'No Port Rules'}
            message={
              activeTab === 'cdn'
                ? 'Tap + to add a CDN configuration.'
                : 'Tap + to add a port rule.'
            }
          />
        }
      />

      {/* Form Modal */}
      {renderFormModal()}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Modal Styles
// ---------------------------------------------------------------------------

const modalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cancelBtn: {
    ...typography.body,
    color: colors.textSecondary,
  },
  title: {
    ...typography.h4,
    color: colors.text,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: spacing.md,
  },
  saveBtn: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
  },
});

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
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: 28,
    color: colors.primary,
    fontWeight: '300',
  },
  headerTitle: {
    ...typography.h3,
    color: colors.text,
    flex: 1,
    textAlign: 'center',
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    fontSize: 22,
    color: '#fff',
    fontWeight: '600',
    marginTop: -1,
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },

  // List
  listContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.base,
  },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  cardIcon: {
    fontSize: 24,
  },
  cardTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  cardSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  cardRight: {
    marginLeft: spacing.sm,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    ...typography.caption,
    fontWeight: '700',
  },
  cardDetails: {
    marginBottom: spacing.sm,
    paddingLeft: 36,
  },
  cardDetailText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  actionBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.md,
  },
  editBtn: {
    backgroundColor: colors.primary + '15',
  },
  editBtnText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  deleteBtn: {
    backgroundColor: colors.danger + '15',
  },
  deleteBtnText: {
    ...typography.caption,
    color: colors.danger,
    fontWeight: '700',
  },

  // Chips
  chipBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  chipBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
  },

  // Direction row
  dirRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.base,
  },

  // Switch row
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    marginBottom: spacing.base,
  },
});

export default CDNScreen;
