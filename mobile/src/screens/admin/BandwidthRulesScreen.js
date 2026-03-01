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
  Switch,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { EmptyState, LoadingScreen } from '../../components';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import api, { serviceApi, bandwidthApi } from '../../services/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAYS_OF_WEEK = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

const EMPTY_FORM = {
  name: '',
  start_time: '22:00',
  end_time: '06:00',
  download_multiplier: '200',
  upload_multiplier: '200',
  days_of_week: 'mon,tue,wed,thu,fri,sat,sun',
  enabled: true,
  service_ids: [],
};

// ---------------------------------------------------------------------------
// Time Input (simple HH:MM text input)
// ---------------------------------------------------------------------------

const TimeInput = ({ label, value, onChange }) => {
  return (
    <View style={formStyles.fieldContainer}>
      <Text style={formStyles.label}>{label}</Text>
      <TextInput
        style={formStyles.input}
        value={value}
        onChangeText={onChange}
        placeholder="HH:MM"
        placeholderTextColor={colors.textLight}
        keyboardType="numbers-and-punctuation"
        maxLength={5}
      />
      <Text style={formStyles.hint}>Format: 24-hour (e.g., 22:00)</Text>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Day of Week Selector
// ---------------------------------------------------------------------------

const DaySelector = ({ value, onChange }) => {
  const selected = Array.isArray(value) ? value : (value || '').split(',').filter(Boolean);

  const toggle = (day) => {
    const current = new Set(selected);
    if (current.has(day)) {
      current.delete(day);
    } else {
      current.add(day);
    }
    const ordered = DAYS_OF_WEEK
      .map((d) => d.key)
      .filter((k) => current.has(k));
    onChange(ordered.join(','));
  };

  return (
    <View style={formStyles.fieldContainer}>
      <Text style={formStyles.label}>Days of Week</Text>
      <View style={dayStyles.row}>
        {DAYS_OF_WEEK.map((day) => {
          const active = selected.includes(day.key);
          return (
            <TouchableOpacity
              key={day.key}
              style={[dayStyles.chip, active && dayStyles.chipActive]}
              onPress={() => toggle(day.key)}
              activeOpacity={0.7}
            >
              <Text
                style={[dayStyles.chipText, active && dayStyles.chipTextActive]}
              >
                {day.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const dayStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minWidth: 44,
    alignItems: 'center',
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '12',
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
// Service Multi-select
// ---------------------------------------------------------------------------

const ServiceMultiSelect = ({ services, selectedIds, onToggle }) => {
  if (!services || services.length === 0) return null;

  return (
    <View style={formStyles.fieldContainer}>
      <Text style={formStyles.label}>Services Affected</Text>
      <Text style={formStyles.hint}>
        Leave empty to apply to all services
      </Text>
      <View style={svcStyles.list}>
        {services.map((svc) => {
          const id = svc.id || svc.ID;
          const active = selectedIds.includes(id);
          return (
            <TouchableOpacity
              key={id}
              style={[svcStyles.item, active && svcStyles.itemActive]}
              onPress={() => onToggle(id)}
              activeOpacity={0.7}
            >
              <View style={svcStyles.itemInfo}>
                <Text style={[svcStyles.itemName, active && svcStyles.itemNameActive]} numberOfLines={1}>
                  {svc.name}
                </Text>
              </View>
              <View style={[svcStyles.check, active && svcStyles.checkActive]}>
                {active && <Text style={svcStyles.checkMark}>{'\u2713'}</Text>}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const svcStyles = StyleSheet.create({
  list: {
    marginTop: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  itemActive: {
    backgroundColor: colors.primary + '06',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    ...typography.body,
    color: colors.text,
  },
  itemNameActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  checkActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  checkMark: {
    color: colors.textInverse,
    fontSize: 12,
    fontWeight: '800',
  },
});

// ---------------------------------------------------------------------------
// Rule Row
// ---------------------------------------------------------------------------

const RuleRow = ({ rule, onEdit, onToggle }) => {
  const dlMulti = rule.download_multiplier || 100;
  const ulMulti = rule.upload_multiplier || 100;
  const timeRange = `${rule.start_time || '?'} - ${rule.end_time || '?'}`;
  const daysRaw = rule.days_of_week || [];
  const days = Array.isArray(daysRaw) ? daysRaw : String(daysRaw).split(',').filter(Boolean);
  const allDays = days.length === 7;
  const serviceCount = rule.services?.length || rule.service_ids?.length || 0;

  return (
    <TouchableOpacity
      style={rRowStyles.container}
      onPress={() => onEdit(rule)}
      activeOpacity={0.7}
    >
      <View style={rRowStyles.row}>
        <View style={rRowStyles.info}>
          <View style={rRowStyles.nameRow}>
            <Text style={rRowStyles.name} numberOfLines={1}>
              {rule.name || 'Unnamed Rule'}
            </Text>
          </View>

          <View style={rRowStyles.timeRow}>
            <Text style={rRowStyles.timeIcon}>{'\u23F0'}</Text>
            <Text style={rRowStyles.timeText}>{timeRange}</Text>
          </View>

          <View style={rRowStyles.tagsRow}>
            <View style={[rRowStyles.tag, { backgroundColor: colors.success + '15' }]}>
              <Text style={[rRowStyles.tagText, { color: colors.success }]}>
                DL {dlMulti}%
              </Text>
            </View>
            <View style={[rRowStyles.tag, { backgroundColor: colors.info + '15' }]}>
              <Text style={[rRowStyles.tagText, { color: colors.info }]}>
                UL {ulMulti}%
              </Text>
            </View>
            {allDays ? (
              <View style={[rRowStyles.tag, { backgroundColor: colors.primary + '12' }]}>
                <Text style={[rRowStyles.tagText, { color: colors.primary }]}>
                  Every day
                </Text>
              </View>
            ) : (
              <View style={[rRowStyles.tag, { backgroundColor: colors.textSecondary + '12' }]}>
                <Text style={[rRowStyles.tagText, { color: colors.textSecondary }]}>
                  {days.map((d) => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(', ')}
                </Text>
              </View>
            )}
            {serviceCount > 0 && (
              <View style={[rRowStyles.tag, { backgroundColor: colors.warning + '15' }]}>
                <Text style={[rRowStyles.tagText, { color: colors.warning }]}>
                  {serviceCount} service{serviceCount !== 1 ? 's' : ''}
                </Text>
              </View>
            )}
          </View>
        </View>

        <Switch
          value={!!rule.enabled}
          onValueChange={() => onToggle(rule)}
          trackColor={{ false: colors.border, true: colors.success + '60' }}
          thumbColor={rule.enabled ? colors.success : colors.textLight}
        />
      </View>
    </TouchableOpacity>
  );
};

const rRowStyles = StyleSheet.create({
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
  nameRow: {
    marginBottom: spacing.xs,
  },
  name: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  timeIcon: {
    fontSize: 13,
    marginRight: spacing.xs,
  },
  timeText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  tagText: {
    ...typography.caption,
    fontWeight: '600',
  },
});

// ---------------------------------------------------------------------------
// Create / Edit Modal
// ---------------------------------------------------------------------------

const RuleModal = ({ visible, rule, services, onClose, onSave, onDelete, saving }) => {
  const isEdit = !!rule?.id;
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (rule && rule.id) {
      setForm({
        name: rule.name || '',
        start_time: rule.start_time || '22:00',
        end_time: rule.end_time || '06:00',
        download_multiplier: String(rule.download_multiplier || 200),
        upload_multiplier: String(rule.upload_multiplier || 200),
        days_of_week: Array.isArray(rule.days_of_week) ? rule.days_of_week.join(',') : (rule.days_of_week || 'mon,tue,wed,thu,fri,sat,sun'),
        enabled: rule.enabled !== false,
        service_ids: rule.service_ids || (rule.services || []).map((s) => s.id || s.ID),
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [rule]);

  const update = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  const toggleService = (id) => {
    setForm((prev) => {
      const ids = [...(prev.service_ids || [])];
      const idx = ids.indexOf(id);
      if (idx >= 0) {
        ids.splice(idx, 1);
      } else {
        ids.push(id);
      }
      return { ...prev, service_ids: ids };
    });
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      Alert.alert('Validation', 'Rule name is required.');
      return;
    }

    const timeRegex = /^\d{2}:\d{2}$/;
    if (!timeRegex.test(form.start_time) || !timeRegex.test(form.end_time)) {
      Alert.alert('Validation', 'Time must be in HH:MM format.');
      return;
    }

    const payload = {
      ...form,
      download_multiplier: parseInt(form.download_multiplier, 10) || 100,
      upload_multiplier: parseInt(form.upload_multiplier, 10) || 100,
    };
    onSave(payload, rule?.id);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Rule',
      `Are you sure you want to delete "${form.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete(rule.id),
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={modalStyles.container}>
        {/* Header */}
        <View style={modalStyles.header}>
          <TouchableOpacity onPress={onClose} activeOpacity={0.6}>
            <Text style={modalStyles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={modalStyles.headerTitle} numberOfLines={1}>
            {isEdit ? 'Edit Rule' : 'New Rule'}
          </Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.6}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={modalStyles.saveButton}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={modalStyles.body}
          contentContainerStyle={modalStyles.bodyContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Name */}
          <View style={formStyles.fieldContainer}>
            <Text style={formStyles.label}>Rule Name</Text>
            <TextInput
              style={formStyles.input}
              value={form.name}
              onChangeText={(v) => update('name', v)}
              placeholder="e.g., NIGHT BOOST"
              placeholderTextColor={colors.textLight}
            />
          </View>

          {/* Time Range */}
          <View style={formStyles.timeRow}>
            <View style={formStyles.timeCol}>
              <TimeInput
                label="Start Time"
                value={form.start_time}
                onChange={(v) => update('start_time', v)}
              />
            </View>
            <View style={formStyles.timeSeparator}>
              <Text style={formStyles.timeSepText}>{'\u2192'}</Text>
            </View>
            <View style={formStyles.timeCol}>
              <TimeInput
                label="End Time"
                value={form.end_time}
                onChange={(v) => update('end_time', v)}
              />
            </View>
          </View>

          {/* Multipliers */}
          <View style={formStyles.multiplierRow}>
            <View style={formStyles.multiplierCol}>
              <Text style={formStyles.label}>Download Multiplier (%)</Text>
              <TextInput
                style={formStyles.input}
                value={form.download_multiplier}
                onChangeText={(v) => update('download_multiplier', v)}
                keyboardType="number-pad"
                placeholder="200"
                placeholderTextColor={colors.textLight}
              />
              <Text style={formStyles.hint}>
                200% = double speed
              </Text>
            </View>
            <View style={{ width: spacing.md }} />
            <View style={formStyles.multiplierCol}>
              <Text style={formStyles.label}>Upload Multiplier (%)</Text>
              <TextInput
                style={formStyles.input}
                value={form.upload_multiplier}
                onChangeText={(v) => update('upload_multiplier', v)}
                keyboardType="number-pad"
                placeholder="200"
                placeholderTextColor={colors.textLight}
              />
              <Text style={formStyles.hint}>
                200% = double speed
              </Text>
            </View>
          </View>

          {/* Days of Week */}
          <DaySelector
            value={form.days_of_week}
            onChange={(v) => update('days_of_week', v)}
          />

          {/* Service Selector */}
          <ServiceMultiSelect
            services={services}
            selectedIds={form.service_ids}
            onToggle={toggleService}
          />

          {/* Enabled */}
          <View style={formStyles.switchRow}>
            <Text style={formStyles.switchLabel}>Enabled</Text>
            <Switch
              value={form.enabled}
              onValueChange={(v) => update('enabled', v)}
              trackColor={{ false: colors.border, true: colors.success + '60' }}
              thumbColor={form.enabled ? colors.success : colors.textLight}
            />
          </View>

          {/* Delete button */}
          {isEdit && (
            <TouchableOpacity
              style={formStyles.deleteButton}
              onPress={handleDelete}
              activeOpacity={0.7}
            >
              <Text style={formStyles.deleteButtonText}>Delete Rule</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: spacing.tabBar * 2 }} />
        </ScrollView>
      </View>
    </Modal>
  );
};

const modalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
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
  headerTitle: {
    ...typography.h4,
    color: colors.text,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: spacing.sm,
  },
  cancelButton: {
    ...typography.body,
    color: colors.textSecondary,
  },
  saveButton: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '700',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
  },
});

const formStyles = StyleSheet.create({
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
  timeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  timeCol: {
    flex: 1,
  },
  timeSeparator: {
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.sm,
  },
  timeSepText: {
    ...typography.h4,
    color: colors.textLight,
  },
  multiplierRow: {
    flexDirection: 'row',
    marginBottom: spacing.base,
  },
  multiplierCol: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.base,
  },
  switchLabel: {
    ...typography.body,
    color: colors.text,
    fontWeight: '500',
  },
  deleteButton: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.danger + '40',
    backgroundColor: colors.danger + '08',
    alignItems: 'center',
  },
  deleteButtonText: {
    ...typography.button,
    color: colors.danger,
  },
});

// ---------------------------------------------------------------------------
// BandwidthRulesScreen
// ---------------------------------------------------------------------------

const BandwidthRulesScreen = () => {
  const [rules, setRules] = useState([]);
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedRule, setSelectedRule] = useState(null);
  const [saving, setSaving] = useState(false);

  // -----------------------------------------------------------------------
  // Fetch
  // -----------------------------------------------------------------------

  const fetchRules = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const [rulesRes, svcRes] = await Promise.all([
        bandwidthApi.list(),
        serviceApi.list(),
      ]);

      if (rulesRes?.data) {
        const data = rulesRes.data.data || rulesRes.data;
        const list = data.rules || data.items || (Array.isArray(data) ? data : []);
        setRules(list);
      }

      if (svcRes?.data) {
        const sData = svcRes.data.data || svcRes.data;
        const sList = sData.services || sData.items || (Array.isArray(sData) ? sData : []);
        setServices(sList);
      }
    } catch (err) {
      console.error('BandwidthRulesScreen fetch error:', err);
      if (!silent) {
        Alert.alert('Error', 'Failed to load bandwidth rules.');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchRules(true);
  }, [fetchRules]);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const openCreate = () => {
    setSelectedRule(null);
    setModalVisible(true);
  };

  const openEdit = (rule) => {
    setSelectedRule(rule);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setSelectedRule(null);
  };

  const handleToggle = async (rule) => {
    try {
      await bandwidthApi.update(rule.id, {
        ...rule,
        enabled: !rule.enabled,
      });
      setRules((prev) =>
        prev.map((r) =>
          r.id === rule.id ? { ...r, enabled: !r.enabled } : r,
        ),
      );
    } catch (err) {
      Alert.alert('Error', 'Failed to update rule.');
    }
  };

  const handleSave = async (payload, ruleId) => {
    setSaving(true);
    try {
      if (ruleId) {
        await bandwidthApi.update(ruleId, payload);
      } else {
        await bandwidthApi.create(payload);
      }
      closeModal();
      fetchRules(true);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save bandwidth rule.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ruleId) => {
    setSaving(true);
    try {
      await bandwidthApi.delete(ruleId);
      closeModal();
      fetchRules(true);
    } catch (err) {
      Alert.alert('Error', 'Failed to delete bandwidth rule.');
    } finally {
      setSaving(false);
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (isLoading && rules.length === 0) {
    return <LoadingScreen message="Loading bandwidth rules..." />;
  }

  const renderItem = ({ item }) => (
    <RuleRow rule={item} onEdit={openEdit} onToggle={handleToggle} />
  );

  const keyExtractor = (item, index) => String(item.id || item.ID || index);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Bandwidth Rules</Text>
          <Text style={styles.headerCount}>
            {rules.length} rule{rules.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={openCreate}
          activeOpacity={0.7}
        >
          <Text style={styles.addButtonText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {/* Rule list */}
      <FlatList
        data={rules}
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
            icon={'\u26A1'}
            title="No Bandwidth Rules"
            message="Create time-based speed rules to boost or limit bandwidth during specific hours."
          />
        }
      />

      {/* Create/Edit Modal */}
      <RuleModal
        visible={modalVisible}
        rule={selectedRule}
        services={services}
        onClose={closeModal}
        onSave={handleSave}
        onDelete={handleDelete}
        saving={saving}
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
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  addButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  addButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },
  listContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.tabBar,
  },
});

export default BandwidthRulesScreen;
