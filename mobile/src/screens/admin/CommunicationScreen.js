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
import api from '../../services/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRIGGER_EVENTS = [
  { value: 'expiry_warning', label: 'Expiry Warning' },
  { value: 'expired', label: 'Expired' },
  { value: 'fup_applied', label: 'FUP Applied' },
  { value: 'quota_warning', label: 'Quota Warning' },
];

const CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
];

const TEMPLATE_VARIABLES = [
  '{username}',
  '{full_name}',
  '{expiry_date}',
  '{service_name}',
  '{balance}',
  '{quota_used}',
  '{quota_total}',
  '{quota_percent}',
  '{fup_level}',
  '{days_before}',
];

const TRIGGER_COLORS = {
  expiry_warning: colors.warning,
  expired: colors.danger,
  fup_applied: colors.info,
  quota_warning: colors.secondary,
};

const CHANNEL_ICONS = {
  whatsapp: '\uD83D\uDCAC',
  sms: '\uD83D\uDCF1',
  email: '\uD83D\uDCE7',
};

const EMPTY_FORM = {
  name: '',
  trigger_event: 'expiry_warning',
  channel: 'whatsapp',
  template: '',
  enabled: true,
  days_before: '3',
  fup_levels: '1,2,3',
  send_to_reseller: false,
};

// ---------------------------------------------------------------------------
// Picker component (simple dropdown)
// ---------------------------------------------------------------------------

const PickerDropdown = ({ label, options, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={formStyles.fieldContainer}>
      <Text style={formStyles.label}>{label}</Text>
      <TouchableOpacity
        style={formStyles.pickerButton}
        onPress={() => setOpen(!open)}
        activeOpacity={0.7}
      >
        <Text style={formStyles.pickerButtonText}>
          {selected?.label || 'Select...'}
        </Text>
        <Text style={formStyles.pickerArrow}>{open ? '\u25B2' : '\u25BC'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={formStyles.pickerOptions}>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                formStyles.pickerOption,
                opt.value === value && formStyles.pickerOptionActive,
              ]}
              onPress={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              <Text
                style={[
                  formStyles.pickerOptionText,
                  opt.value === value && formStyles.pickerOptionTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
// FUP Level Checkboxes
// ---------------------------------------------------------------------------

const FUPLevelCheckboxes = ({ value, onChange }) => {
  const levels = (value || '').split(',').filter(Boolean);

  const toggle = (level) => {
    const lStr = String(level);
    const current = new Set(levels);
    if (current.has(lStr)) {
      current.delete(lStr);
    } else {
      current.add(lStr);
    }
    onChange(
      Array.from(current)
        .sort()
        .join(','),
    );
  };

  return (
    <View style={formStyles.fieldContainer}>
      <Text style={formStyles.label}>FUP Levels</Text>
      <View style={formStyles.checkboxRow}>
        {[1, 2, 3].map((level) => {
          const active = levels.includes(String(level));
          return (
            <TouchableOpacity
              key={level}
              style={[
                formStyles.checkbox,
                active && formStyles.checkboxActive,
              ]}
              onPress={() => toggle(level)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  formStyles.checkboxText,
                  active && formStyles.checkboxTextActive,
                ]}
              >
                FUP {level}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Rule Row
// ---------------------------------------------------------------------------

const RuleRow = ({ rule, onEdit, onToggle }) => {
  const triggerLabel =
    TRIGGER_EVENTS.find((t) => t.value === rule.trigger_event)?.label ||
    rule.trigger_event;
  const channelIcon = CHANNEL_ICONS[rule.channel] || '\uD83D\uDCE8';
  const triggerColor = TRIGGER_COLORS[rule.trigger_event] || colors.textSecondary;

  return (
    <TouchableOpacity
      style={rowStyles.container}
      onPress={() => onEdit(rule)}
      activeOpacity={0.7}
    >
      <View style={rowStyles.row}>
        <View style={rowStyles.info}>
          <View style={rowStyles.nameRow}>
            <Text style={rowStyles.name} numberOfLines={1}>
              {rule.name || 'Unnamed Rule'}
            </Text>
            <Text style={rowStyles.channel}>{channelIcon}</Text>
          </View>
          <View style={rowStyles.tagsRow}>
            <View style={[rowStyles.tag, { backgroundColor: triggerColor + '15' }]}>
              <Text style={[rowStyles.tagText, { color: triggerColor }]}>
                {triggerLabel}
              </Text>
            </View>
            <View style={[rowStyles.tag, { backgroundColor: colors.textSecondary + '12' }]}>
              <Text style={[rowStyles.tagText, { color: colors.textSecondary }]}>
                {(rule.channel || '').toUpperCase()}
              </Text>
            </View>
            {rule.trigger_event === 'expiry_warning' && rule.days_before > 0 && (
              <View style={[rowStyles.tag, { backgroundColor: colors.primary + '12' }]}>
                <Text style={[rowStyles.tagText, { color: colors.primary }]}>
                  {rule.days_before}d before
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

const rowStyles = StyleSheet.create({
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
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  name: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  channel: {
    fontSize: 16,
    marginLeft: spacing.sm,
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

const RuleModal = ({ visible, rule, onClose, onSave, onDelete, saving }) => {
  const isEdit = !!rule?.id;
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (rule && rule.id) {
      setForm({
        name: rule.name || '',
        trigger_event: rule.trigger_event || 'expiry_warning',
        channel: rule.channel || 'whatsapp',
        template: rule.template || '',
        enabled: rule.enabled !== false,
        days_before: String(rule.days_before || 0),
        fup_levels: rule.fup_levels || '1,2,3',
        send_to_reseller: !!rule.send_to_reseller,
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [rule]);

  const update = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  const handleSave = () => {
    if (!form.name.trim()) {
      Alert.alert('Validation', 'Rule name is required.');
      return;
    }
    if (!form.template.trim()) {
      Alert.alert('Validation', 'Message template is required.');
      return;
    }
    const payload = {
      ...form,
      days_before: parseInt(form.days_before, 10) || 0,
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

  const insertVariable = (variable) => {
    update('template', form.template + variable);
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
              placeholder="e.g., Expiry Warning - WhatsApp"
              placeholderTextColor={colors.textLight}
            />
          </View>

          {/* Trigger Event */}
          <PickerDropdown
            label="Trigger Event"
            options={TRIGGER_EVENTS}
            value={form.trigger_event}
            onChange={(v) => update('trigger_event', v)}
          />

          {/* Channel */}
          <PickerDropdown
            label="Channel"
            options={CHANNELS}
            value={form.channel}
            onChange={(v) => update('channel', v)}
          />

          {/* Days Before (for expiry_warning) */}
          {form.trigger_event === 'expiry_warning' && (
            <View style={formStyles.fieldContainer}>
              <Text style={formStyles.label}>Days Before Expiry</Text>
              <TextInput
                style={formStyles.input}
                value={form.days_before}
                onChangeText={(v) => update('days_before', v)}
                keyboardType="number-pad"
                placeholder="3"
                placeholderTextColor={colors.textLight}
              />
            </View>
          )}

          {/* Quota Threshold (for quota_warning) */}
          {form.trigger_event === 'quota_warning' && (
            <View style={formStyles.fieldContainer}>
              <Text style={formStyles.label}>Quota Threshold (%)</Text>
              <TextInput
                style={formStyles.input}
                value={form.days_before}
                onChangeText={(v) => update('days_before', v)}
                keyboardType="number-pad"
                placeholder="80"
                placeholderTextColor={colors.textLight}
              />
              <Text style={formStyles.hint}>
                Fires when monthly usage crosses this percentage (e.g., 80 = fire at 80% used)
              </Text>
            </View>
          )}

          {/* FUP Levels (for fup_applied) */}
          {form.trigger_event === 'fup_applied' && (
            <FUPLevelCheckboxes
              value={form.fup_levels}
              onChange={(v) => update('fup_levels', v)}
            />
          )}

          {/* Template */}
          <View style={formStyles.fieldContainer}>
            <Text style={formStyles.label}>Message Template</Text>
            <TextInput
              style={[formStyles.input, formStyles.textArea]}
              value={form.template}
              onChangeText={(v) => update('template', v)}
              placeholder="Hello {full_name}, your subscription for {service_name} will expire on {expiry_date}."
              placeholderTextColor={colors.textLight}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
          </View>

          {/* Variable Hints */}
          <View style={formStyles.fieldContainer}>
            <Text style={formStyles.label}>Insert Variable</Text>
            <View style={formStyles.variableRow}>
              {TEMPLATE_VARIABLES.map((v) => (
                <TouchableOpacity
                  key={v}
                  style={formStyles.variableChip}
                  onPress={() => insertVariable(v)}
                  activeOpacity={0.6}
                >
                  <Text style={formStyles.variableChipText}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

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

          {/* Send to Reseller */}
          <View style={formStyles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={formStyles.switchLabel}>Send to Reseller</Text>
              <Text style={formStyles.hint}>Also send notification to the subscriber's reseller</Text>
            </View>
            <Switch
              value={form.send_to_reseller}
              onValueChange={(v) => update('send_to_reseller', v)}
              trackColor={{ false: colors.border, true: colors.primary + '60' }}
              thumbColor={form.send_to_reseller ? colors.primary : colors.textLight}
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
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
    paddingTop: spacing.md,
  },
  hint: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: spacing.xs,
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
  },
  pickerArrow: {
    ...typography.caption,
    color: colors.textLight,
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
  checkboxRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  checkbox: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  checkboxActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  checkboxText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  checkboxTextActive: {
    color: colors.primary,
  },
  variableRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  variableChip: {
    backgroundColor: colors.primary + '12',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  variableChipText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
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
// CommunicationScreen
// ---------------------------------------------------------------------------

const CommunicationScreen = () => {
  const [rules, setRules] = useState([]);
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
      const res = await api.get('/api/communication/rules');
      if (res?.data) {
        const data = res.data.data || res.data;
        const list = data.rules || data.items || (Array.isArray(data) ? data : []);
        setRules(list);
      }
    } catch (err) {
      console.error('CommunicationScreen fetch error:', err);
      if (!silent) {
        Alert.alert('Error', 'Failed to load communication rules.');
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
      await api.put(`/api/communication/rules/${rule.id}`, {
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
        await api.put(`/api/communication/rules/${ruleId}`, payload);
      } else {
        await api.post('/api/communication/rules', payload);
      }
      closeModal();
      fetchRules(true);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save rule.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ruleId) => {
    setSaving(true);
    try {
      await api.delete(`/api/communication/rules/${ruleId}`);
      closeModal();
      fetchRules(true);
    } catch (err) {
      Alert.alert('Error', 'Failed to delete rule.');
    } finally {
      setSaving(false);
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (isLoading && rules.length === 0) {
    return <LoadingScreen message="Loading rules..." />;
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
          <Text style={styles.headerTitle}>Communication</Text>
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
            icon={'\uD83D\uDCE8'}
            title="No Communication Rules"
            message="Create notification rules to alert subscribers about expiry, FUP, and quotas."
          />
        }
      />

      {/* Create/Edit Modal */}
      <RuleModal
        visible={modalVisible}
        rule={selectedRule}
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

export default CommunicationScreen;
