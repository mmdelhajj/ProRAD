import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { EmptyState, LoadingScreen } from '../../components';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { formatCurrency, formatBytes } from '../../utils/format';
import { serviceApi } from '../../services/api';
import useAuthStore from '../../store/authStore';

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

function formatSpeedStr(str) {
  if (!str) return '-';
  const trimmed = str.trim().toLowerCase();
  if (trimmed.endsWith('m')) return trimmed.toUpperCase();
  if (trimmed.endsWith('k')) {
    const val = parseInt(trimmed, 10);
    if (!isNaN(val) && val >= 1000) {
      const m = val / 1000;
      return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
    }
    return `${parseInt(trimmed, 10)}K`;
  }
  const val = parseInt(trimmed, 10);
  if (!isNaN(val)) return formatSpeedKb(val);
  return str;
}

function countFUPTiers(service) {
  let count = 0;
  if (service.fup1_threshold > 0 || service.fup1_download_speed > 0) count++;
  if (service.fup2_threshold > 0 || service.fup2_download_speed > 0) count++;
  if (service.fup3_threshold > 0 || service.fup3_download_speed > 0) count++;
  if (service.monthly_fup1_threshold > 0) count = Math.max(count, 1);
  if (service.monthly_fup2_threshold > 0) count = Math.max(count, 2);
  if (service.monthly_fup3_threshold > 0) count = Math.max(count, 3);
  return count;
}

const EMPTY_FORM = {
  name: '',
  download_speed: '',
  upload_speed: '',
  price: '',
  daily_quota: '',
  monthly_quota: '',
  pool_name: '',
  address_list: '',
  // Burst
  burst_download: '',
  burst_upload: '',
  burst_threshold: '',
  burst_time: '',
  // Daily FUP
  fup1_threshold: '',
  fup1_download_speed: '',
  fup1_upload_speed: '',
  fup2_threshold: '',
  fup2_download_speed: '',
  fup2_upload_speed: '',
  fup3_threshold: '',
  fup3_download_speed: '',
  fup3_upload_speed: '',
  // Monthly FUP
  monthly_fup1_threshold: '',
  monthly_fup1_download_speed: '',
  monthly_fup1_upload_speed: '',
  monthly_fup2_threshold: '',
  monthly_fup2_download_speed: '',
  monthly_fup2_upload_speed: '',
  monthly_fup3_threshold: '',
  monthly_fup3_download_speed: '',
  monthly_fup3_upload_speed: '',
  // Free Hours
  time_based_speed_enabled: false,
  time_from_hour: '',
  time_from_minute: '',
  time_to_hour: '',
  time_to_minute: '',
  time_download_ratio: '',
  time_upload_ratio: '',
};

// ---------------------------------------------------------------------------
// Form Field
// ---------------------------------------------------------------------------

const FormField = ({ label, value, onChangeText, placeholder, keyboardType }) => (
  <View style={formFieldStyles.container}>
    <Text style={formFieldStyles.label}>{label}</Text>
    <TextInput
      style={formFieldStyles.input}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textLight}
      keyboardType={keyboardType || 'default'}
      autoCapitalize="none"
      autoCorrect={false}
    />
  </View>
);

const SectionHeader = ({ title }) => (
  <Text style={formFieldStyles.sectionHeader}>{title}</Text>
);

const ToggleField = ({ label, value, onToggle }) => (
  <TouchableOpacity
    style={formFieldStyles.toggleRow}
    onPress={onToggle}
    activeOpacity={0.6}
  >
    <Text style={formFieldStyles.label}>{label}</Text>
    <View style={[formFieldStyles.toggle, value && formFieldStyles.toggleOn]}>
      <View style={[formFieldStyles.toggleDot, value && formFieldStyles.toggleDotOn]} />
    </View>
  </TouchableOpacity>
);

const formFieldStyles = StyleSheet.create({
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
  sectionHeader: {
    ...typography.label,
    color: colors.primary,
    fontWeight: '700',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary + '30',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.base,
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.border,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleOn: {
    backgroundColor: colors.primary,
  },
  toggleDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  toggleDotOn: {
    alignSelf: 'flex-end',
  },
});

// ---------------------------------------------------------------------------
// Detail Field
// ---------------------------------------------------------------------------

const DetailField = ({ label, value }) => {
  if (!value && value !== 0) return null;
  return (
    <View style={detailStyles.field}>
      <Text style={detailStyles.fieldLabel}>{label}</Text>
      <Text style={detailStyles.fieldValue}>{String(value)}</Text>
    </View>
  );
};

const detailStyles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  fieldLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flex: 1,
  },
  fieldValue: {
    ...typography.body,
    color: colors.text,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
});

// ---------------------------------------------------------------------------
// Service Detail Modal (with Edit & Delete)
// ---------------------------------------------------------------------------

const ServiceDetailModal = ({ service, visible, onClose, onEdit, onDelete, isAdmin }) => {
  if (!service) return null;

  const downloadSpeed =
    service.download_speed_str ||
    (service.download_speed ? formatSpeedKb(service.download_speed) : '-');
  const uploadSpeed =
    service.upload_speed_str ||
    (service.upload_speed ? formatSpeedKb(service.upload_speed) : '-');

  const fupTiers = countFUPTiers(service);

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
          <Text style={modalStyles.headerTitle} numberOfLines={1}>
            {service.name || 'Service'}
          </Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.6}>
            <Text style={modalStyles.closeButton}>{'\u2715'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={modalStyles.body}
          contentContainerStyle={modalStyles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Speed section */}
          <Text style={modalStyles.sectionTitle}>Speed</Text>
          <View style={modalStyles.card}>
            <DetailField label="Download Speed" value={formatSpeedStr(downloadSpeed)} />
            <DetailField label="Upload Speed" value={formatSpeedStr(uploadSpeed)} />
            {service.burst_download ? (
              <DetailField label="Burst Download" value={formatSpeedKb(service.burst_download)} />
            ) : null}
            {service.burst_upload ? (
              <DetailField label="Burst Upload" value={formatSpeedKb(service.burst_upload)} />
            ) : null}
            {service.burst_threshold ? (
              <DetailField label="Burst Threshold" value={`${service.burst_threshold}%`} />
            ) : null}
            {service.burst_time ? (
              <DetailField label="Burst Time" value={`${service.burst_time}s`} />
            ) : null}
          </View>

          {/* Pricing section */}
          <Text style={modalStyles.sectionTitle}>Pricing</Text>
          <View style={modalStyles.card}>
            <DetailField
              label="Price"
              value={service.price != null && service.price > 0 ? formatCurrency(service.price) : 'Free'}
            />
            {service.subscriber_count != null && (
              <DetailField label="Subscribers Using" value={service.subscriber_count} />
            )}
          </View>

          {/* Quotas section */}
          <Text style={modalStyles.sectionTitle}>Quotas</Text>
          <View style={modalStyles.card}>
            <DetailField
              label="Daily Quota"
              value={service.daily_quota ? formatBytes(service.daily_quota) : 'Unlimited'}
            />
            <DetailField
              label="Monthly Quota"
              value={service.monthly_quota ? formatBytes(service.monthly_quota) : 'Unlimited'}
            />
          </View>

          {/* FUP Tiers section */}
          {fupTiers > 0 && (
            <>
              <Text style={modalStyles.sectionTitle}>FUP Tiers</Text>
              <View style={modalStyles.card}>
                {(service.fup1_threshold > 0 || service.fup1_download_speed > 0) && (
                  <DetailField
                    label="Daily FUP 1"
                    value={`${formatBytes(service.fup1_threshold || 0)} / ${formatSpeedKb(service.fup1_download_speed || 0)}`}
                  />
                )}
                {(service.fup2_threshold > 0 || service.fup2_download_speed > 0) && (
                  <DetailField
                    label="Daily FUP 2"
                    value={`${formatBytes(service.fup2_threshold || 0)} / ${formatSpeedKb(service.fup2_download_speed || 0)}`}
                  />
                )}
                {(service.fup3_threshold > 0 || service.fup3_download_speed > 0) && (
                  <DetailField
                    label="Daily FUP 3"
                    value={`${formatBytes(service.fup3_threshold || 0)} / ${formatSpeedKb(service.fup3_download_speed || 0)}`}
                  />
                )}
                {service.monthly_fup1_threshold > 0 && (
                  <DetailField
                    label="Monthly FUP 1"
                    value={`${formatBytes(service.monthly_fup1_threshold)} / ${formatSpeedKb(service.monthly_fup1_download_speed || 0)}`}
                  />
                )}
                {service.monthly_fup2_threshold > 0 && (
                  <DetailField
                    label="Monthly FUP 2"
                    value={`${formatBytes(service.monthly_fup2_threshold)} / ${formatSpeedKb(service.monthly_fup2_download_speed || 0)}`}
                  />
                )}
                {service.monthly_fup3_threshold > 0 && (
                  <DetailField
                    label="Monthly FUP 3"
                    value={`${formatBytes(service.monthly_fup3_threshold)} / ${formatSpeedKb(service.monthly_fup3_download_speed || 0)}`}
                  />
                )}
              </View>
            </>
          )}

          {/* Free Hours */}
          {service.time_based_speed_enabled && (
            <>
              <Text style={modalStyles.sectionTitle}>Free Hours</Text>
              <View style={modalStyles.card}>
                <DetailField
                  label="Window"
                  value={`${String(service.time_from_hour || 0).padStart(2, '0')}:${String(service.time_from_minute || 0).padStart(2, '0')} - ${String(service.time_to_hour || 0).padStart(2, '0')}:${String(service.time_to_minute || 0).padStart(2, '0')}`}
                />
                <DetailField label="Download Free %" value={`${service.time_download_ratio || 0}%`} />
                <DetailField label="Upload Free %" value={`${service.time_upload_ratio || 0}%`} />
              </View>
            </>
          )}

          {/* Additional settings */}
          <Text style={modalStyles.sectionTitle}>Additional</Text>
          <View style={modalStyles.card}>
            {service.pool_name ? <DetailField label="IP Pool" value={service.pool_name} /> : null}
            {service.address_list ? <DetailField label="Address List" value={service.address_list} /> : null}
            <DetailField
              label="Free Hours"
              value={service.time_based_speed_enabled ? 'Enabled' : 'Disabled'}
            />
          </View>

          {/* Action buttons */}
          {isAdmin && (
            <View style={modalStyles.actionRow}>
              <TouchableOpacity
                style={[modalStyles.actionBtn, { backgroundColor: colors.primary + '15' }]}
                onPress={() => onEdit(service)}
              >
                <Text style={[modalStyles.actionBtnText, { color: colors.primary }]}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modalStyles.actionBtn, { backgroundColor: colors.danger + '15' }]}
                onPress={() => onDelete(service)}
              >
                <Text style={[modalStyles.actionBtnText, { color: colors.danger }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: spacing.xxxl }} />
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
    ...typography.h3,
    color: colors.text,
    flex: 1,
    marginRight: spacing.md,
  },
  closeButton: {
    fontSize: 20,
    color: colors.textSecondary,
    paddingHorizontal: spacing.sm,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
  },
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
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  actionBtnText: {
    ...typography.button,
    fontWeight: '700',
  },
});

// ---------------------------------------------------------------------------
// Service Row
// ---------------------------------------------------------------------------

const ServiceRow = ({ service, onPress }) => {
  const downloadSpeed =
    service.download_speed_str ||
    (service.download_speed ? formatSpeedKb(service.download_speed) : '-');
  const uploadSpeed =
    service.upload_speed_str ||
    (service.upload_speed ? formatSpeedKb(service.upload_speed) : '-');

  const fupTiers = countFUPTiers(service);
  const subscriberCount = service.subscriber_count ?? service.subscribers_count ?? null;
  const price = service.price;
  const hasMonthlyQuota = service.monthly_quota && service.monthly_quota > 0;

  return (
    <TouchableOpacity
      style={serviceRowStyles.container}
      onPress={() => onPress(service)}
      activeOpacity={0.7}
    >
      <View style={serviceRowStyles.row}>
        <View style={serviceRowStyles.info}>
          <Text style={serviceRowStyles.name} numberOfLines={1}>
            {service.name || 'Unnamed Service'}
          </Text>
          <Text style={serviceRowStyles.speed}>
            {formatSpeedStr(downloadSpeed)} / {formatSpeedStr(uploadSpeed)}
          </Text>
          <View style={serviceRowStyles.tagsRow}>
            {hasMonthlyQuota && (
              <View style={serviceRowStyles.tag}>
                <Text style={serviceRowStyles.tagText}>{formatBytes(service.monthly_quota)}</Text>
              </View>
            )}
            {fupTiers > 0 && (
              <View style={[serviceRowStyles.tag, serviceRowStyles.fupTag]}>
                <Text style={[serviceRowStyles.tagText, serviceRowStyles.fupTagText]}>
                  {fupTiers} FUP tier{fupTiers > 1 ? 's' : ''}
                </Text>
              </View>
            )}
            {subscriberCount != null && (
              <View style={[serviceRowStyles.tag, serviceRowStyles.subscriberTag]}>
                <Text style={[serviceRowStyles.tagText, serviceRowStyles.subscriberTagText]}>
                  {subscriberCount} user{subscriberCount !== 1 ? 's' : ''}
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={serviceRowStyles.rightSide}>
          <Text style={serviceRowStyles.price}>
            {price != null && price > 0 ? formatCurrency(price) : 'Free'}
          </Text>
          <Text style={serviceRowStyles.chevron}>{'\u203A'}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const serviceRowStyles = StyleSheet.create({
  container: { marginHorizontal: spacing.base, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
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
  info: { flex: 1 },
  name: { ...typography.body, fontWeight: '700', color: colors.text, marginBottom: 2 },
  speed: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.sm },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tag: {
    backgroundColor: colors.primary + '12',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  tagText: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  fupTag: { backgroundColor: colors.warning + '15' },
  fupTagText: { color: colors.warning },
  subscriberTag: { backgroundColor: colors.textSecondary + '12' },
  subscriberTagText: { color: colors.textSecondary },
  rightSide: { justifyContent: 'center', alignItems: 'flex-end', marginLeft: spacing.md },
  price: { ...typography.body, fontWeight: '700', color: colors.text, marginBottom: 2 },
  chevron: { ...typography.h3, color: colors.textLight },
});

// ---------------------------------------------------------------------------
// ServicesScreen
// ---------------------------------------------------------------------------

const ServicesScreen = () => {
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const isAdmin = useAuthStore((s) => s.isAdmin());

  // -----------------------------------------------------------------------
  // Fetch
  // -----------------------------------------------------------------------

  const fetchServices = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await serviceApi.list();
      if (res?.data) {
        const data = res.data.data || res.data;
        const list = data.services || data.items || (Array.isArray(data) ? data : []);
        setServices(list);
      }
    } catch (err) {
      console.error('ServicesScreen fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchServices(true);
  }, [fetchServices]);

  // -----------------------------------------------------------------------
  // CRUD
  // -----------------------------------------------------------------------

  const openForm = (service = null) => {
    setSelectedService(null);
    if (service) {
      setEditingService(service);
      const s = service;
      const str = (v) => (v != null && v !== 0 ? String(v) : '');
      setForm({
        name: s.name || '',
        download_speed: str(s.download_speed),
        upload_speed: str(s.upload_speed),
        price: s.price != null ? String(s.price) : '',
        daily_quota: str(s.daily_quota),
        monthly_quota: str(s.monthly_quota),
        pool_name: s.pool_name || '',
        address_list: s.address_list || '',
        burst_download: str(s.burst_download),
        burst_upload: str(s.burst_upload),
        burst_threshold: str(s.burst_threshold),
        burst_time: str(s.burst_time),
        fup1_threshold: str(s.fup1_threshold),
        fup1_download_speed: str(s.fup1_download_speed),
        fup1_upload_speed: str(s.fup1_upload_speed),
        fup2_threshold: str(s.fup2_threshold),
        fup2_download_speed: str(s.fup2_download_speed),
        fup2_upload_speed: str(s.fup2_upload_speed),
        fup3_threshold: str(s.fup3_threshold),
        fup3_download_speed: str(s.fup3_download_speed),
        fup3_upload_speed: str(s.fup3_upload_speed),
        monthly_fup1_threshold: str(s.monthly_fup1_threshold),
        monthly_fup1_download_speed: str(s.monthly_fup1_download_speed),
        monthly_fup1_upload_speed: str(s.monthly_fup1_upload_speed),
        monthly_fup2_threshold: str(s.monthly_fup2_threshold),
        monthly_fup2_download_speed: str(s.monthly_fup2_download_speed),
        monthly_fup2_upload_speed: str(s.monthly_fup2_upload_speed),
        monthly_fup3_threshold: str(s.monthly_fup3_threshold),
        monthly_fup3_download_speed: str(s.monthly_fup3_download_speed),
        monthly_fup3_upload_speed: str(s.monthly_fup3_upload_speed),
        time_based_speed_enabled: !!s.time_based_speed_enabled,
        time_from_hour: str(s.time_from_hour),
        time_from_minute: str(s.time_from_minute),
        time_to_hour: str(s.time_to_hour),
        time_to_minute: str(s.time_to_minute),
        time_download_ratio: str(s.time_download_ratio),
        time_upload_ratio: str(s.time_upload_ratio),
      });
    } else {
      setEditingService(null);
      setForm(EMPTY_FORM);
    }
    setShowForm(true);
  };

  const saveService = async () => {
    if (!form.name.trim()) {
      Alert.alert('Validation', 'Service name is required.');
      return;
    }

    setIsSaving(true);
    try {
      const int = (v) => parseInt(v, 10) || 0;
      const payload = {
        name: form.name.trim(),
        download_speed: int(form.download_speed),
        upload_speed: int(form.upload_speed),
        download_speed_str: int(form.download_speed) + 'k',
        upload_speed_str: int(form.upload_speed) + 'k',
        price: parseFloat(form.price) || 0,
        daily_quota: int(form.daily_quota),
        monthly_quota: int(form.monthly_quota),
        pool_name: form.pool_name.trim(),
        address_list: form.address_list.trim(),
        burst_download: int(form.burst_download),
        burst_upload: int(form.burst_upload),
        burst_threshold: int(form.burst_threshold),
        burst_time: int(form.burst_time),
        fup1_threshold: int(form.fup1_threshold),
        fup1_download_speed: int(form.fup1_download_speed),
        fup1_upload_speed: int(form.fup1_upload_speed),
        fup2_threshold: int(form.fup2_threshold),
        fup2_download_speed: int(form.fup2_download_speed),
        fup2_upload_speed: int(form.fup2_upload_speed),
        fup3_threshold: int(form.fup3_threshold),
        fup3_download_speed: int(form.fup3_download_speed),
        fup3_upload_speed: int(form.fup3_upload_speed),
        monthly_fup1_threshold: int(form.monthly_fup1_threshold),
        monthly_fup1_download_speed: int(form.monthly_fup1_download_speed),
        monthly_fup1_upload_speed: int(form.monthly_fup1_upload_speed),
        monthly_fup2_threshold: int(form.monthly_fup2_threshold),
        monthly_fup2_download_speed: int(form.monthly_fup2_download_speed),
        monthly_fup2_upload_speed: int(form.monthly_fup2_upload_speed),
        monthly_fup3_threshold: int(form.monthly_fup3_threshold),
        monthly_fup3_download_speed: int(form.monthly_fup3_download_speed),
        monthly_fup3_upload_speed: int(form.monthly_fup3_upload_speed),
        time_based_speed_enabled: !!form.time_based_speed_enabled,
        time_from_hour: int(form.time_from_hour),
        time_from_minute: int(form.time_from_minute),
        time_to_hour: int(form.time_to_hour),
        time_to_minute: int(form.time_to_minute),
        time_download_ratio: int(form.time_download_ratio),
        time_upload_ratio: int(form.time_upload_ratio),
      };

      if (editingService) {
        await serviceApi.update(editingService.id || editingService.ID, payload);
      } else {
        await serviceApi.create(payload);
      }

      setShowForm(false);
      fetchServices(true);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save service.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteService = (service) => {
    Alert.alert(
      'Delete Service',
      `Delete "${service.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await serviceApi.delete(service.id || service.ID);
              setSelectedService(null);
              fetchServices(true);
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to delete service.');
            }
          },
        },
      ],
    );
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (isLoading && services.length === 0) {
    return <LoadingScreen message="Loading services..." />;
  }

  const renderItem = ({ item }) => (
    <ServiceRow service={item} onPress={setSelectedService} />
  );

  const keyExtractor = (item, index) => String(item.id || item.ID || index);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Services</Text>
        <View style={styles.headerRight}>
          <Text style={styles.headerCount}>
            {services.length} plan{services.length !== 1 ? 's' : ''}
          </Text>
          {isAdmin && (
            <TouchableOpacity style={styles.addBtn} onPress={() => openForm()}>
              <Text style={styles.addBtnText}>+</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Service list */}
      <FlatList
        data={services}
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
            icon={'\uD83D\uDCE6'}
            title="No Services"
            message="No service plans have been configured yet."
            actionLabel={isAdmin ? 'Create Service' : undefined}
            onAction={isAdmin ? () => openForm() : undefined}
          />
        }
      />

      {/* Detail Modal */}
      <ServiceDetailModal
        service={selectedService}
        visible={!!selectedService}
        onClose={() => setSelectedService(null)}
        onEdit={openForm}
        onDelete={deleteService}
        isAdmin={isAdmin}
      />

      {/* Create/Edit Form Modal */}
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
          <View style={formModalStyles.container}>
            {/* Header */}
            <View style={formModalStyles.header}>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Text style={formModalStyles.cancelBtn}>Cancel</Text>
              </TouchableOpacity>
              <Text style={formModalStyles.title}>
                {editingService ? 'Edit Service' : 'New Service'}
              </Text>
              <TouchableOpacity onPress={saveService} disabled={isSaving}>
                {isSaving ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={formModalStyles.saveBtn}>Save</Text>
                )}
              </TouchableOpacity>
            </View>

            <ScrollView
              style={formModalStyles.body}
              contentContainerStyle={{ paddingBottom: spacing.xxxl }}
              showsVerticalScrollIndicator={false}
            >
              {/* Basic Info */}
              <FormField
                label="Service Name"
                value={form.name}
                onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
                placeholder="e.g. 4MB-12GB"
              />
              <View style={styles.formRow}>
                <View style={styles.formHalf}>
                  <FormField
                    label="Download Speed (kb)"
                    value={form.download_speed}
                    onChangeText={(v) => setForm((p) => ({ ...p, download_speed: v }))}
                    placeholder="e.g. 4000"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.formHalf}>
                  <FormField
                    label="Upload Speed (kb)"
                    value={form.upload_speed}
                    onChangeText={(v) => setForm((p) => ({ ...p, upload_speed: v }))}
                    placeholder="e.g. 2000"
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <FormField
                label="Price"
                value={form.price}
                onChangeText={(v) => setForm((p) => ({ ...p, price: v }))}
                placeholder="e.g. 25.00"
                keyboardType="decimal-pad"
              />
              <View style={styles.formRow}>
                <View style={styles.formHalf}>
                  <FormField
                    label="Daily Quota (bytes)"
                    value={form.daily_quota}
                    onChangeText={(v) => setForm((p) => ({ ...p, daily_quota: v }))}
                    placeholder="0 = Unlimited"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.formHalf}>
                  <FormField
                    label="Monthly Quota (bytes)"
                    value={form.monthly_quota}
                    onChangeText={(v) => setForm((p) => ({ ...p, monthly_quota: v }))}
                    placeholder="0 = Unlimited"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Burst Settings */}
              <SectionHeader title="Burst Settings" />
              <View style={styles.formRow}>
                <View style={styles.formHalf}>
                  <FormField
                    label="Burst Download (kb)"
                    value={form.burst_download}
                    onChangeText={(v) => setForm((p) => ({ ...p, burst_download: v }))}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.formHalf}>
                  <FormField
                    label="Burst Upload (kb)"
                    value={form.burst_upload}
                    onChangeText={(v) => setForm((p) => ({ ...p, burst_upload: v }))}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <View style={styles.formRow}>
                <View style={styles.formHalf}>
                  <FormField
                    label="Burst Threshold (%)"
                    value={form.burst_threshold}
                    onChangeText={(v) => setForm((p) => ({ ...p, burst_threshold: v }))}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.formHalf}>
                  <FormField
                    label="Burst Time (sec)"
                    value={form.burst_time}
                    onChangeText={(v) => setForm((p) => ({ ...p, burst_time: v }))}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Daily FUP Tier 1 */}
              <SectionHeader title="Daily FUP - Tier 1" />
              <FormField
                label="Threshold (bytes)"
                value={form.fup1_threshold}
                onChangeText={(v) => setForm((p) => ({ ...p, fup1_threshold: v }))}
                placeholder="0 = disabled"
                keyboardType="numeric"
              />
              <View style={styles.formRow}>
                <View style={styles.formHalf}>
                  <FormField
                    label="DL Speed (kb)"
                    value={form.fup1_download_speed}
                    onChangeText={(v) => setForm((p) => ({ ...p, fup1_download_speed: v }))}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.formHalf}>
                  <FormField
                    label="UL Speed (kb)"
                    value={form.fup1_upload_speed}
                    onChangeText={(v) => setForm((p) => ({ ...p, fup1_upload_speed: v }))}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Daily FUP Tier 2 */}
              <SectionHeader title="Daily FUP - Tier 2" />
              <FormField
                label="Threshold (bytes)"
                value={form.fup2_threshold}
                onChangeText={(v) => setForm((p) => ({ ...p, fup2_threshold: v }))}
                placeholder="0 = disabled"
                keyboardType="numeric"
              />
              <View style={styles.formRow}>
                <View style={styles.formHalf}>
                  <FormField
                    label="DL Speed (kb)"
                    value={form.fup2_download_speed}
                    onChangeText={(v) => setForm((p) => ({ ...p, fup2_download_speed: v }))}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.formHalf}>
                  <FormField
                    label="UL Speed (kb)"
                    value={form.fup2_upload_speed}
                    onChangeText={(v) => setForm((p) => ({ ...p, fup2_upload_speed: v }))}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Daily FUP Tier 3 */}
              <SectionHeader title="Daily FUP - Tier 3" />
              <FormField
                label="Threshold (bytes)"
                value={form.fup3_threshold}
                onChangeText={(v) => setForm((p) => ({ ...p, fup3_threshold: v }))}
                placeholder="0 = disabled"
                keyboardType="numeric"
              />
              <View style={styles.formRow}>
                <View style={styles.formHalf}>
                  <FormField
                    label="DL Speed (kb)"
                    value={form.fup3_download_speed}
                    onChangeText={(v) => setForm((p) => ({ ...p, fup3_download_speed: v }))}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.formHalf}>
                  <FormField
                    label="UL Speed (kb)"
                    value={form.fup3_upload_speed}
                    onChangeText={(v) => setForm((p) => ({ ...p, fup3_upload_speed: v }))}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Monthly FUP Tier 1 */}
              <SectionHeader title="Monthly FUP - Tier 1" />
              <FormField
                label="Threshold (bytes)"
                value={form.monthly_fup1_threshold}
                onChangeText={(v) => setForm((p) => ({ ...p, monthly_fup1_threshold: v }))}
                placeholder="0 = disabled"
                keyboardType="numeric"
              />
              <View style={styles.formRow}>
                <View style={styles.formHalf}>
                  <FormField
                    label="DL Speed (kb)"
                    value={form.monthly_fup1_download_speed}
                    onChangeText={(v) => setForm((p) => ({ ...p, monthly_fup1_download_speed: v }))}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.formHalf}>
                  <FormField
                    label="UL Speed (kb)"
                    value={form.monthly_fup1_upload_speed}
                    onChangeText={(v) => setForm((p) => ({ ...p, monthly_fup1_upload_speed: v }))}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Monthly FUP Tier 2 */}
              <SectionHeader title="Monthly FUP - Tier 2" />
              <FormField
                label="Threshold (bytes)"
                value={form.monthly_fup2_threshold}
                onChangeText={(v) => setForm((p) => ({ ...p, monthly_fup2_threshold: v }))}
                placeholder="0 = disabled"
                keyboardType="numeric"
              />
              <View style={styles.formRow}>
                <View style={styles.formHalf}>
                  <FormField
                    label="DL Speed (kb)"
                    value={form.monthly_fup2_download_speed}
                    onChangeText={(v) => setForm((p) => ({ ...p, monthly_fup2_download_speed: v }))}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.formHalf}>
                  <FormField
                    label="UL Speed (kb)"
                    value={form.monthly_fup2_upload_speed}
                    onChangeText={(v) => setForm((p) => ({ ...p, monthly_fup2_upload_speed: v }))}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Monthly FUP Tier 3 */}
              <SectionHeader title="Monthly FUP - Tier 3" />
              <FormField
                label="Threshold (bytes)"
                value={form.monthly_fup3_threshold}
                onChangeText={(v) => setForm((p) => ({ ...p, monthly_fup3_threshold: v }))}
                placeholder="0 = disabled"
                keyboardType="numeric"
              />
              <View style={styles.formRow}>
                <View style={styles.formHalf}>
                  <FormField
                    label="DL Speed (kb)"
                    value={form.monthly_fup3_download_speed}
                    onChangeText={(v) => setForm((p) => ({ ...p, monthly_fup3_download_speed: v }))}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.formHalf}>
                  <FormField
                    label="UL Speed (kb)"
                    value={form.monthly_fup3_upload_speed}
                    onChangeText={(v) => setForm((p) => ({ ...p, monthly_fup3_upload_speed: v }))}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Free Hours */}
              <SectionHeader title="Free Hours - Quota Discount" />
              <ToggleField
                label="Enable Free Hours"
                value={form.time_based_speed_enabled}
                onToggle={() => setForm((p) => ({ ...p, time_based_speed_enabled: !p.time_based_speed_enabled }))}
              />
              {form.time_based_speed_enabled && (
                <>
                  <View style={styles.formRow}>
                    <View style={styles.formHalf}>
                      <FormField
                        label="From Hour (0-23)"
                        value={form.time_from_hour}
                        onChangeText={(v) => setForm((p) => ({ ...p, time_from_hour: v }))}
                        placeholder="0"
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.formHalf}>
                      <FormField
                        label="From Minute (0-59)"
                        value={form.time_from_minute}
                        onChangeText={(v) => setForm((p) => ({ ...p, time_from_minute: v }))}
                        placeholder="0"
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                  <View style={styles.formRow}>
                    <View style={styles.formHalf}>
                      <FormField
                        label="To Hour (0-23)"
                        value={form.time_to_hour}
                        onChangeText={(v) => setForm((p) => ({ ...p, time_to_hour: v }))}
                        placeholder="0"
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.formHalf}>
                      <FormField
                        label="To Minute (0-59)"
                        value={form.time_to_minute}
                        onChangeText={(v) => setForm((p) => ({ ...p, time_to_minute: v }))}
                        placeholder="0"
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                  <View style={styles.formRow}>
                    <View style={styles.formHalf}>
                      <FormField
                        label="Download Free %"
                        value={form.time_download_ratio}
                        onChangeText={(v) => setForm((p) => ({ ...p, time_download_ratio: v }))}
                        placeholder="100 = fully free"
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.formHalf}>
                      <FormField
                        label="Upload Free %"
                        value={form.time_upload_ratio}
                        onChangeText={(v) => setForm((p) => ({ ...p, time_upload_ratio: v }))}
                        placeholder="100 = fully free"
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                </>
              )}

              {/* RADIUS Settings */}
              <SectionHeader title="RADIUS Settings" />
              <FormField
                label="IP Pool Name"
                value={form.pool_name}
                onChangeText={(v) => setForm((p) => ({ ...p, pool_name: v }))}
                placeholder="e.g. 4M"
              />
              <FormField
                label="Address List"
                value={form.address_list}
                onChangeText={(v) => setForm((p) => ({ ...p, address_list: v }))}
                placeholder="e.g. allowed_list"
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Form Modal Styles
// ---------------------------------------------------------------------------

const formModalStyles = StyleSheet.create({
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerCount: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    fontSize: 20,
    color: '#fff',
    fontWeight: '600',
    marginTop: -1,
  },
  listContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  formRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  formHalf: {
    flex: 1,
  },
});

export default ServicesScreen;
