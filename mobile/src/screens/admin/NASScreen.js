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
import { nasApi } from '../../services/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NAS_TYPES = [
  { key: 'mikrotik', label: 'MikroTik' },
  { key: 'cisco', label: 'Cisco' },
  { key: 'huawei', label: 'Huawei' },
  { key: 'juniper', label: 'Juniper' },
  { key: 'ubiquiti', label: 'Ubiquiti' },
  { key: 'other', label: 'Other' },
];

const EMPTY_FORM = {
  name: '',
  ip_address: '',
  secret: '',
  type: 'mikrotik',
  api_username: '',
  api_password: '',
  api_port: '8728',
  coa_port: '1700',
  auth_port: '1812',
  acct_port: '1813',
  use_ssl: false,
};

// ---------------------------------------------------------------------------
// Form Field
// ---------------------------------------------------------------------------

const FormField = ({ label, value, onChangeText, placeholder, keyboardType, secureTextEntry }) => (
  <View style={formFieldStyles.container}>
    <Text style={formFieldStyles.label}>{label}</Text>
    <TextInput
      style={formFieldStyles.input}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textLight}
      keyboardType={keyboardType || 'default'}
      secureTextEntry={secureTextEntry}
      autoCapitalize="none"
      autoCorrect={false}
    />
  </View>
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
});

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
  label: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
  value: { ...typography.body, color: colors.text, fontWeight: '500', flex: 1, textAlign: 'right' },
});

// ---------------------------------------------------------------------------
// NAS Row
// ---------------------------------------------------------------------------

const NASRow = ({ nas, onPress }) => {
  const isOnline = nas.is_online;
  const activeSessions = nas.active_sessions || 0;
  const nasType = nas.type || nas.nas_type || 'mikrotik';

  return (
    <TouchableOpacity style={nasRowStyles.container} onPress={() => onPress(nas)} activeOpacity={0.7}>
      <View style={nasRowStyles.row}>
        <View style={nasRowStyles.dotContainer}>
          <View style={[nasRowStyles.dot, { backgroundColor: isOnline ? colors.online : colors.offline }]} />
        </View>
        <View style={nasRowStyles.info}>
          <Text style={nasRowStyles.name} numberOfLines={1}>{nas.name || 'Unnamed NAS'}</Text>
          <Text style={nasRowStyles.ip}>
            {nas.ip_address || nas.nasipaddress || '-'}
          </Text>
          <View style={nasRowStyles.tagsRow}>
            <View style={nasRowStyles.typeTag}>
              <Text style={nasRowStyles.typeTagText}>{nasType}</Text>
            </View>
            <View style={nasRowStyles.sessionsTag}>
              <Text style={nasRowStyles.sessionsTagText}>
                {activeSessions} session{activeSessions !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>
        </View>
        <View style={nasRowStyles.rightSide}>
          <Text style={nasRowStyles.chevron}>{'\u203A'}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const nasRowStyles = StyleSheet.create({
  container: { marginHorizontal: spacing.base, marginBottom: spacing.sm },
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
  dotContainer: { justifyContent: 'flex-start', paddingTop: 5, marginRight: spacing.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
  info: { flex: 1 },
  name: { ...typography.body, fontWeight: '700', color: colors.text, marginBottom: 2 },
  ip: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  typeTag: {
    backgroundColor: colors.primary + '15',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  typeTagText: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  sessionsTag: {
    backgroundColor: colors.textSecondary + '12',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  sessionsTagText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  rightSide: { justifyContent: 'center', marginLeft: spacing.md },
  chevron: { ...typography.h3, color: colors.textLight },
});

// ---------------------------------------------------------------------------
// NAS Detail / Edit Modal
// ---------------------------------------------------------------------------

const NASDetailModal = ({ nas, visible, onClose, onSave, onDelete, onTestConnection, onGetPools }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [pools, setPools] = useState(null);
  const [loadingPools, setLoadingPools] = useState(false);

  useEffect(() => {
    if (nas) {
      setForm({
        name: nas.name || '',
        ip_address: nas.ip_address || nas.nasipaddress || '',
        secret: '', // never sent from API
        type: nas.type || nas.nas_type || 'mikrotik',
        api_username: nas.api_username || '',
        api_password: '', // never sent from API
        api_port: String(nas.api_port || nas.api_ssl_port || '8728'),
        coa_port: String(nas.coa_port || '1700'),
        auth_port: String(nas.auth_port || '1812'),
        acct_port: String(nas.acct_port || '1813'),
        use_ssl: nas.use_ssl || false,
      });
      setIsEditing(false);
      setPools(null);
    }
  }, [nas]);

  const updateField = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('Validation', 'NAS name is required.');
      return;
    }
    if (!form.ip_address.trim()) {
      Alert.alert('Validation', 'IP address is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        api_port: parseInt(form.api_port, 10) || 8728,
        coa_port: parseInt(form.coa_port, 10) || 1700,
        auth_port: parseInt(form.auth_port, 10) || 1812,
        acct_port: parseInt(form.acct_port, 10) || 1813,
      };
      // Only include secret/password if user entered new values
      if (!payload.secret) delete payload.secret;
      if (!payload.api_password) delete payload.api_password;

      await onSave(nas.id || nas.ID, payload);
      setIsEditing(false);
      onClose();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save NAS.');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await onTestConnection(nas.id || nas.ID);
      const msg = res?.data?.message || res?.data?.data?.message || 'Connection successful.';
      Alert.alert('Connection Test', msg);
    } catch (err) {
      Alert.alert('Connection Failed', err.message || 'Could not connect to NAS.');
    } finally {
      setTesting(false);
    }
  };

  const handleGetPools = async () => {
    setLoadingPools(true);
    try {
      const res = await onGetPools(nas.id || nas.ID);
      const poolList = res?.data?.data || res?.data?.pools || res?.data || [];
      setPools(Array.isArray(poolList) ? poolList : []);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to fetch IP pools.');
    } finally {
      setLoadingPools(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete NAS',
      `Are you sure you want to delete "${nas?.name || 'this NAS'}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await onDelete(nas.id || nas.ID);
              onClose();
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to delete NAS.');
            }
          },
        },
      ],
    );
  };

  if (!nas) return null;

  const isOnline = nas.is_online;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={modalStyles.container}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.headerTitle} numberOfLines={1}>
              {isEditing ? 'Edit NAS' : (nas.name || 'NAS')}
            </Text>
            <View style={modalStyles.headerRight}>
              {!isEditing && (
                <TouchableOpacity onPress={() => setIsEditing(true)} style={modalStyles.editBtn}>
                  <Text style={modalStyles.editBtnText}>Edit</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} activeOpacity={0.6}>
                <Text style={modalStyles.closeButton}>{'\u2715'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={modalStyles.body}
            contentContainerStyle={modalStyles.bodyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {isEditing ? (
              /* ---- Edit Form ---- */
              <>
                <FormField label="Name" value={form.name} onChangeText={(v) => updateField('name', v)} placeholder="NAS name" />
                <FormField label="IP Address" value={form.ip_address} onChangeText={(v) => updateField('ip_address', v)} placeholder="e.g. 192.168.1.1" keyboardType="decimal-pad" />
                <FormField label="RADIUS Secret" value={form.secret} onChangeText={(v) => updateField('secret', v)} placeholder="Leave blank to keep current" secureTextEntry />

                {/* Type Dropdown */}
                <View style={formFieldStyles.container}>
                  <Text style={formFieldStyles.label}>Type</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={typePickerStyles.row}>
                      {NAS_TYPES.map((t) => (
                        <TouchableOpacity
                          key={t.key}
                          style={[typePickerStyles.chip, form.type === t.key && typePickerStyles.chipActive]}
                          onPress={() => updateField('type', t.key)}
                        >
                          <Text style={[typePickerStyles.chipText, form.type === t.key && typePickerStyles.chipTextActive]}>
                            {t.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>

                <FormField label="API Username" value={form.api_username} onChangeText={(v) => updateField('api_username', v)} placeholder="admin" />
                <FormField label="API Password" value={form.api_password} onChangeText={(v) => updateField('api_password', v)} placeholder="Leave blank to keep current" secureTextEntry />
                <FormField label="API Port" value={form.api_port} onChangeText={(v) => updateField('api_port', v)} placeholder="8728" keyboardType="number-pad" />
                <FormField label="CoA Port" value={form.coa_port} onChangeText={(v) => updateField('coa_port', v)} placeholder="1700" keyboardType="number-pad" />
                <FormField label="Auth Port" value={form.auth_port} onChangeText={(v) => updateField('auth_port', v)} placeholder="1812" keyboardType="number-pad" />
                <FormField label="Acct Port" value={form.acct_port} onChangeText={(v) => updateField('acct_port', v)} placeholder="1813" keyboardType="number-pad" />

                {/* SSL Toggle */}
                <View style={toggleStyles.container}>
                  <Text style={toggleStyles.label}>Use SSL</Text>
                  <Switch
                    value={form.use_ssl}
                    onValueChange={(v) => updateField('use_ssl', v)}
                    trackColor={{ false: colors.border, true: colors.primary + '60' }}
                    thumbColor={form.use_ssl ? colors.primary : colors.textLight}
                  />
                </View>

                {/* Save / Cancel */}
                <View style={editButtonsStyles.row}>
                  <TouchableOpacity
                    style={editButtonsStyles.cancelBtn}
                    onPress={() => setIsEditing(false)}
                    disabled={saving}
                  >
                    <Text style={editButtonsStyles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={editButtonsStyles.saveBtn}
                    onPress={handleSave}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color={colors.textInverse} />
                    ) : (
                      <Text style={editButtonsStyles.saveText}>Save Changes</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              /* ---- View Mode ---- */
              <>
                <Text style={sectionStyles.title}>Connection</Text>
                <View style={sectionStyles.card}>
                  <DetailField label="Name" value={nas.name} />
                  <DetailField label="IP Address" value={nas.ip_address || nas.nasipaddress} />
                  <DetailField label="Type" value={nas.type || nas.nas_type || 'mikrotik'} />
                  <DetailField
                    label="Status"
                    value={isOnline ? 'Online' : 'Offline'}
                    valueColor={isOnline ? colors.online : colors.offline}
                  />
                  <DetailField label="Active Sessions" value={String(nas.active_sessions || 0)} />
                  <DetailField label="Secret" value={nas.has_secret ? 'Configured' : 'Not Set'} valueColor={nas.has_secret ? colors.success : colors.warning} />
                </View>

                <Text style={sectionStyles.title}>API Configuration</Text>
                <View style={sectionStyles.card}>
                  <DetailField label="API Username" value={nas.api_username || '-'} />
                  <DetailField label="API Password" value={nas.has_api_password ? 'Configured' : 'Not Set'} valueColor={nas.has_api_password ? colors.success : colors.warning} />
                  <DetailField label="API Port" value={String(nas.api_port || nas.api_ssl_port || '-')} />
                  <DetailField label="CoA Port" value={String(nas.coa_port || '-')} />
                  <DetailField label="Auth Port" value={String(nas.auth_port || '-')} />
                  <DetailField label="Acct Port" value={String(nas.acct_port || '-')} />
                  <DetailField label="Use SSL" value={nas.use_ssl ? 'Yes' : 'No'} />
                </View>

                {/* Actions */}
                <Text style={sectionStyles.title}>Actions</Text>
                <View style={actionsStyles.container}>
                  <TouchableOpacity
                    style={[actionsStyles.btn, { backgroundColor: colors.primary }]}
                    onPress={handleTest}
                    disabled={testing}
                  >
                    {testing ? (
                      <ActivityIndicator size="small" color={colors.textInverse} />
                    ) : (
                      <Text style={actionsStyles.btnText}>Test Connection</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[actionsStyles.btn, { backgroundColor: colors.info }]}
                    onPress={handleGetPools}
                    disabled={loadingPools}
                  >
                    {loadingPools ? (
                      <ActivityIndicator size="small" color={colors.textInverse} />
                    ) : (
                      <Text style={actionsStyles.btnText}>Get IP Pools</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[actionsStyles.btn, { backgroundColor: colors.danger }]}
                    onPress={handleDelete}
                  >
                    <Text style={actionsStyles.btnText}>Delete NAS</Text>
                  </TouchableOpacity>
                </View>

                {/* Pools list */}
                {pools && (
                  <>
                    <Text style={sectionStyles.title}>IP Pools ({pools.length})</Text>
                    <View style={sectionStyles.card}>
                      {pools.length === 0 ? (
                        <Text style={poolStyles.emptyText}>No IP pools found on this NAS.</Text>
                      ) : (
                        pools.map((pool, i) => (
                          <View key={i} style={poolStyles.poolRow}>
                            <Text style={poolStyles.poolName}>{pool.name || pool.pool_name || `Pool ${i + 1}`}</Text>
                            <Text style={poolStyles.poolRange}>{pool.ranges || pool.range || '-'}</Text>
                          </View>
                        ))
                      )}
                    </View>
                  </>
                )}
              </>
            )}

            <View style={{ height: spacing.xxxl }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const typePickerStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '500' },
  chipTextActive: { color: colors.textInverse, fontWeight: '600' },
});

const toggleStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingVertical: spacing.sm,
  },
  label: { ...typography.body, color: colors.text, fontWeight: '500' },
});

const editButtonsStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  cancelBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cancelText: { ...typography.button, color: colors.textSecondary },
  saveBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  saveText: { ...typography.button, color: colors.textInverse },
});

const sectionStyles = StyleSheet.create({
  title: { ...typography.label, color: colors.textSecondary, marginTop: spacing.lg, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
  },
});

const actionsStyles = StyleSheet.create({
  container: { gap: spacing.sm },
  btn: { paddingVertical: spacing.md, borderRadius: borderRadius.md, alignItems: 'center' },
  btnText: { ...typography.button, color: colors.textInverse },
});

const poolStyles = StyleSheet.create({
  emptyText: { ...typography.bodySmall, color: colors.textSecondary, paddingVertical: spacing.md, textAlign: 'center' },
  poolRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  poolName: { ...typography.body, color: colors.text, fontWeight: '600' },
  poolRange: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
  },
});

const modalStyles = StyleSheet.create({
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  editBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primary + '15',
    borderRadius: borderRadius.md,
  },
  editBtnText: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },
  closeButton: { fontSize: 20, color: colors.textSecondary, paddingHorizontal: spacing.sm },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: spacing.base, paddingTop: spacing.md },
});

// ---------------------------------------------------------------------------
// Create NAS Modal
// ---------------------------------------------------------------------------

const CreateNASModal = ({ visible, onClose, onSubmit }) => {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [loading, setLoading] = useState(false);

  const updateField = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      Alert.alert('Validation', 'NAS name is required.');
      return;
    }
    if (!form.ip_address.trim()) {
      Alert.alert('Validation', 'IP address is required.');
      return;
    }
    if (!form.secret.trim()) {
      Alert.alert('Validation', 'RADIUS secret is required.');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        ...form,
        api_port: parseInt(form.api_port, 10) || 8728,
        coa_port: parseInt(form.coa_port, 10) || 1700,
        auth_port: parseInt(form.auth_port, 10) || 1812,
        acct_port: parseInt(form.acct_port, 10) || 1813,
      };
      await onSubmit(payload);
      setForm({ ...EMPTY_FORM });
      onClose();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to create NAS.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={modalStyles.container}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.headerTitle}>Add NAS</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.6}>
              <Text style={modalStyles.closeButton}>{'\u2715'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            style={modalStyles.body}
            contentContainerStyle={modalStyles.bodyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <FormField label="Name" value={form.name} onChangeText={(v) => updateField('name', v)} placeholder="NAS name" />
            <FormField label="IP Address" value={form.ip_address} onChangeText={(v) => updateField('ip_address', v)} placeholder="e.g. 192.168.1.1" keyboardType="decimal-pad" />
            <FormField label="RADIUS Secret" value={form.secret} onChangeText={(v) => updateField('secret', v)} placeholder="RADIUS shared secret" secureTextEntry />

            <View style={formFieldStyles.container}>
              <Text style={formFieldStyles.label}>Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={typePickerStyles.row}>
                  {NAS_TYPES.map((t) => (
                    <TouchableOpacity
                      key={t.key}
                      style={[typePickerStyles.chip, form.type === t.key && typePickerStyles.chipActive]}
                      onPress={() => updateField('type', t.key)}
                    >
                      <Text style={[typePickerStyles.chipText, form.type === t.key && typePickerStyles.chipTextActive]}>
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            <FormField label="API Username" value={form.api_username} onChangeText={(v) => updateField('api_username', v)} placeholder="admin" />
            <FormField label="API Password" value={form.api_password} onChangeText={(v) => updateField('api_password', v)} placeholder="API password" secureTextEntry />
            <FormField label="API Port" value={form.api_port} onChangeText={(v) => updateField('api_port', v)} placeholder="8728" keyboardType="number-pad" />
            <FormField label="CoA Port" value={form.coa_port} onChangeText={(v) => updateField('coa_port', v)} placeholder="1700" keyboardType="number-pad" />

            <View style={toggleStyles.container}>
              <Text style={toggleStyles.label}>Use SSL</Text>
              <Switch
                value={form.use_ssl}
                onValueChange={(v) => updateField('use_ssl', v)}
                trackColor={{ false: colors.border, true: colors.primary + '60' }}
                thumbColor={form.use_ssl ? colors.primary : colors.textLight}
              />
            </View>

            <TouchableOpacity style={createBtnStyles.btn} onPress={handleSubmit} disabled={loading} activeOpacity={0.8}>
              {loading ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={createBtnStyles.text}>Create NAS</Text>
              )}
            </TouchableOpacity>
            <View style={{ height: spacing.xxxl }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const createBtnStyles = StyleSheet.create({
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md + 2,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  text: { ...typography.button, color: colors.textInverse },
});

// ---------------------------------------------------------------------------
// NASScreen
// ---------------------------------------------------------------------------

export default function NASScreen() {
  const insets = useSafeAreaInsets();

  const [nasList, setNasList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedNAS, setSelectedNAS] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const fetchNAS = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await nasApi.list();
      if (!isMounted.current) return;
      const data = res.data?.data || res.data;
      const list = data?.nas_devices || data?.nas || data?.items || (Array.isArray(data) ? data : []);
      setNasList(list);
    } catch (err) {
      if (isMounted.current) setError(err.message || 'Failed to load NAS devices.');
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => { fetchNAS(); }, [fetchNAS]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchNAS(true);
  }, [fetchNAS]);

  const handleSave = useCallback(async (id, payload) => {
    await nasApi.update(id, payload);
    fetchNAS(true);
  }, [fetchNAS]);

  const handleDelete = useCallback(async (id) => {
    await nasApi.delete(id);
    fetchNAS(true);
  }, [fetchNAS]);

  const handleTestConnection = useCallback(async (id) => {
    return await nasApi.test(id);
  }, []);

  const handleGetPools = useCallback(async (id) => {
    return await nasApi.getPools(id);
  }, []);

  const handleCreate = useCallback(async (payload) => {
    await nasApi.create(payload);
    fetchNAS(true);
  }, [fetchNAS]);

  if (loading && nasList.length === 0 && !refreshing) {
    return <LoadingScreen message="Loading NAS devices..." />;
  }

  const renderItem = ({ item }) => <NASRow nas={item} onPress={setSelectedNAS} />;
  const keyExtractor = (item, index) => String(item.id || item.ID || index);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>NAS / Routers</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{nasList.length}</Text>
        </View>
      </View>

      {error && !loading && nasList.length === 0 ? (
        <EmptyState icon={'\u26A0\uFE0F'} title="Connection Error" message={error} actionLabel="Retry" onAction={() => fetchNAS()} />
      ) : (
        <FlatList
          data={nasList}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[styles.listContent, nasList.length === 0 && styles.listContentEmpty]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
          ListEmptyComponent={
            <EmptyState icon={'\uD83D\uDDA5\uFE0F'} title="No NAS Devices" message="No NAS devices have been configured yet." actionLabel="Add NAS" onAction={() => setShowCreate(true)} />
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

      {/* Detail Modal */}
      <NASDetailModal
        nas={selectedNAS}
        visible={!!selectedNAS}
        onClose={() => setSelectedNAS(null)}
        onSave={handleSave}
        onDelete={handleDelete}
        onTestConnection={handleTestConnection}
        onGetPools={handleGetPools}
      />

      {/* Create Modal */}
      <CreateNASModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
  listContent: { paddingTop: spacing.md, paddingBottom: spacing.xxxl },
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
