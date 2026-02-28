import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { LoadingScreen } from '../../components';
import { settingsApi, dashboardApi } from '../../services/api';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ---------------------------------------------------------------------------
// Collapsible Section
// ---------------------------------------------------------------------------

const CollapsibleSection = ({ title, icon, children, defaultOpen = false }) => {
  const [expanded, setExpanded] = useState(defaultOpen);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  return (
    <View style={sectionStyles.container}>
      <TouchableOpacity
        style={sectionStyles.header}
        onPress={toggle}
        activeOpacity={0.7}
      >
        <View style={sectionStyles.headerLeft}>
          <Text style={sectionStyles.icon}>{icon}</Text>
          <Text style={sectionStyles.title}>{title}</Text>
        </View>
        <Text style={sectionStyles.chevron}>
          {expanded ? '\u25B2' : '\u25BC'}
        </Text>
      </TouchableOpacity>
      {expanded && <View style={sectionStyles.body}>{children}</View>}
    </View>
  );
};

const sectionStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.base,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    fontSize: 20,
    marginRight: spacing.md,
  },
  title: {
    ...typography.h4,
    color: colors.text,
  },
  chevron: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  body: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    padding: spacing.base,
  },
});

// ---------------------------------------------------------------------------
// Form Field Components
// ---------------------------------------------------------------------------

const SettingInput = ({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, editable = true }) => (
  <View style={fieldStyles.wrapper}>
    <Text style={fieldStyles.label}>{label}</Text>
    <TextInput
      style={[
        fieldStyles.input,
        !editable && fieldStyles.inputDisabled,
      ]}
      value={value || ''}
      onChangeText={onChangeText}
      placeholder={placeholder || label}
      placeholderTextColor={colors.textLight}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      editable={editable}
    />
  </View>
);

const SettingToggle = ({ label, value, onValueChange, description }) => (
  <View style={fieldStyles.toggleWrapper}>
    <View style={fieldStyles.toggleLeft}>
      <Text style={fieldStyles.label}>{label}</Text>
      {description ? (
        <Text style={fieldStyles.description}>{description}</Text>
      ) : null}
    </View>
    <Switch
      value={!!value}
      onValueChange={onValueChange}
      trackColor={{ false: colors.border, true: colors.primary + '66' }}
      thumbColor={value ? colors.primary : colors.textLight}
    />
  </View>
);

const SettingReadOnly = ({ label, value }) => (
  <View style={fieldStyles.wrapper}>
    <Text style={fieldStyles.label}>{label}</Text>
    <View style={fieldStyles.readOnly}>
      <Text style={fieldStyles.readOnlyText}>{value || '-'}</Text>
    </View>
  </View>
);

const SaveButton = ({ onPress, loading, label }) => (
  <TouchableOpacity
    style={[fieldStyles.saveButton, loading && fieldStyles.saveButtonDisabled]}
    onPress={onPress}
    disabled={loading}
    activeOpacity={0.7}
  >
    {loading ? (
      <ActivityIndicator size="small" color={colors.textInverse} />
    ) : (
      <Text style={fieldStyles.saveButtonText}>{label || 'Save Changes'}</Text>
    )}
  </TouchableOpacity>
);

const fieldStyles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.base,
  },
  label: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  description: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
  },
  inputDisabled: {
    backgroundColor: colors.surfaceHover,
    color: colors.textSecondary,
  },
  toggleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.base,
    paddingVertical: spacing.xs,
  },
  toggleLeft: {
    flex: 1,
    marginRight: spacing.md,
  },
  readOnly: {
    backgroundColor: colors.surfaceHover,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  readOnlyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },
});

// ---------------------------------------------------------------------------
// System Info Bar
// ---------------------------------------------------------------------------

const SystemInfoBar = ({ label, value, color, percentage }) => (
  <View style={infoBarStyles.wrapper}>
    <View style={infoBarStyles.row}>
      <Text style={infoBarStyles.label}>{label}</Text>
      <Text style={[infoBarStyles.value, { color }]}>{value}</Text>
    </View>
    <View style={infoBarStyles.trackOuter}>
      <View
        style={[
          infoBarStyles.trackFill,
          {
            width: `${Math.min(percentage || 0, 100)}%`,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  </View>
);

const infoBarStyles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  label: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  value: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  trackOuter: {
    height: 6,
    backgroundColor: colors.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  trackFill: {
    height: 6,
    borderRadius: 3,
  },
});

// ---------------------------------------------------------------------------
// Timezones (common)
// ---------------------------------------------------------------------------

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Beirut',
  'Australia/Sydney', 'Pacific/Auckland', 'Africa/Cairo', 'Africa/Johannesburg',
];

// ---------------------------------------------------------------------------
// SettingsScreen
// ---------------------------------------------------------------------------

const SettingsScreen = ({ navigation }) => {
  const [settings, setSettings] = useState({});
  const [systemInfo, setSystemInfo] = useState(null);
  const [licenseInfo, setLicenseInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [savingSection, setSavingSection] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // -----------------------------------------------------------------------
  // Fetch data
  // -----------------------------------------------------------------------

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const [settingsRes, systemRes, licenseRes] = await Promise.all([
        settingsApi.get().catch(() => null),
        dashboardApi.systemInfo().catch(() => null),
        settingsApi.getLicense().catch(() => null),
      ]);

      if (settingsRes?.data) {
        const data = settingsRes.data.data || settingsRes.data.settings || settingsRes.data;
        if (typeof data === 'object' && !Array.isArray(data)) {
          setSettings(data);
        }
      }

      if (systemRes?.data) {
        const data = systemRes.data.data || systemRes.data;
        setSystemInfo(data);
      }

      if (licenseRes?.data) {
        const data = licenseRes.data.data || licenseRes.data;
        setLicenseInfo(data);
      }
    } catch (err) {
      console.error('SettingsScreen fetch error:', err);
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
  // Helpers to update setting fields
  // -----------------------------------------------------------------------

  const updateSetting = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  // -----------------------------------------------------------------------
  // Save section
  // -----------------------------------------------------------------------

  const saveSection = async (sectionName, keys) => {
    setSavingSection(sectionName);
    try {
      const data = {};
      keys.forEach((key) => {
        if (settings[key] !== undefined) {
          data[key] = settings[key];
        }
      });
      await settingsApi.update(data);
      Alert.alert('Success', `${sectionName} settings saved successfully.`);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save settings.');
    } finally {
      setSavingSection(null);
    }
  };

  // -----------------------------------------------------------------------
  // Check for updates
  // -----------------------------------------------------------------------

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const res = await settingsApi.checkUpdate();
      const data = res?.data?.data || res?.data;
      if (data?.update_available) {
        Alert.alert(
          'Update Available',
          `Version ${data.latest_version || data.version} is available.\n\n${data.release_notes || 'Please update from the web panel.'}`,
        );
      } else {
        Alert.alert('Up to Date', 'You are running the latest version.');
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to check for updates.');
    } finally {
      setCheckingUpdate(false);
    }
  };

  // -----------------------------------------------------------------------
  // Loading
  // -----------------------------------------------------------------------

  if (isLoading) {
    return <LoadingScreen message="Loading settings..." />;
  }

  // -----------------------------------------------------------------------
  // Derived values
  // -----------------------------------------------------------------------

  const cpu = systemInfo?.cpu || {};
  const memory = systemInfo?.memory || {};
  const disk = systemInfo?.disk || {};
  const cpuPct = cpu.usage ?? 0;
  const ramPct = memory.usage ?? 0;
  const diskPct = disk.usage ?? 0;

  const license = licenseInfo || {};
  const tierName = license.tier?.display_name || license.tier?.name || license.tier || '-';
  const subscriberCount = license.subscriber_count ?? license.subscribers ?? '-';
  const subscriberLimit = license.max_subscribers ?? license.subscriber_limit ?? '-';
  const expiresAt = license.expires_at || license.expiry || '-';

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {/* ================================================================ */}
      {/* RADIUS Settings                                                  */}
      {/* ================================================================ */}
      <CollapsibleSection title="RADIUS Settings" icon={'\uD83D\uDCE1'} defaultOpen>
        <SettingInput
          label="Daily Quota Reset Time"
          value={settings.daily_quota_reset_time}
          onChangeText={(v) => updateSetting('daily_quota_reset_time', v)}
          placeholder="00:05"
        />
        <SettingInput
          label="Default Realm"
          value={settings.default_realm}
          onChangeText={(v) => updateSetting('default_realm', v)}
          placeholder="example.com"
        />
        <SettingToggle
          label="Enable IP Pool Management"
          value={settings.proisp_ip_management}
          onValueChange={(v) => updateSetting('proisp_ip_management', v)}
          description="Automatically manage IP pool assignments"
        />
        <SettingInput
          label="Session Timeout (seconds)"
          value={String(settings.session_timeout || '')}
          onChangeText={(v) => updateSetting('session_timeout', v)}
          keyboardType="numeric"
        />
        <SaveButton
          onPress={() =>
            saveSection('RADIUS', [
              'daily_quota_reset_time',
              'default_realm',
              'proisp_ip_management',
              'session_timeout',
            ])
          }
          loading={savingSection === 'RADIUS'}
        />
      </CollapsibleSection>

      {/* ================================================================ */}
      {/* Notification Settings                                            */}
      {/* ================================================================ */}
      <CollapsibleSection title="Notifications" icon={'\uD83D\uDD14'}>
        <Text style={styles.subSectionTitle}>SMTP Email</Text>
        <SettingInput
          label="SMTP Host"
          value={settings.smtp_host}
          onChangeText={(v) => updateSetting('smtp_host', v)}
          placeholder="smtp.gmail.com"
        />
        <SettingInput
          label="SMTP Port"
          value={String(settings.smtp_port || '')}
          onChangeText={(v) => updateSetting('smtp_port', v)}
          keyboardType="numeric"
          placeholder="587"
        />
        <SettingInput
          label="SMTP Username"
          value={settings.smtp_username}
          onChangeText={(v) => updateSetting('smtp_username', v)}
          placeholder="user@gmail.com"
        />
        <SettingInput
          label="SMTP Password"
          value={settings.smtp_password}
          onChangeText={(v) => updateSetting('smtp_password', v)}
          secureTextEntry
        />
        <SettingToggle
          label="Enable TLS"
          value={settings.smtp_tls}
          onValueChange={(v) => updateSetting('smtp_tls', v)}
        />

        <View style={styles.divider} />
        <Text style={styles.subSectionTitle}>SMS Provider</Text>
        <SettingInput
          label="SMS Provider"
          value={settings.sms_provider}
          onChangeText={(v) => updateSetting('sms_provider', v)}
          placeholder="twilio / vonage / custom"
        />
        <SettingInput
          label="SMS API Key"
          value={settings.sms_api_key}
          onChangeText={(v) => updateSetting('sms_api_key', v)}
          secureTextEntry
        />

        <View style={styles.divider} />
        <Text style={styles.subSectionTitle}>WhatsApp</Text>
        <SettingInput
          label="WhatsApp Provider"
          value={settings.whatsapp_provider}
          onChangeText={(v) => updateSetting('whatsapp_provider', v)}
          placeholder="proxrad / ultramsg"
        />

        <SaveButton
          onPress={() =>
            saveSection('Notification', [
              'smtp_host', 'smtp_port', 'smtp_username', 'smtp_password', 'smtp_tls',
              'sms_provider', 'sms_api_key',
              'whatsapp_provider',
            ])
          }
          loading={savingSection === 'Notification'}
        />
      </CollapsibleSection>

      {/* ================================================================ */}
      {/* System                                                           */}
      {/* ================================================================ */}
      <CollapsibleSection title="System" icon={'\uD83D\uDDA5\uFE0F'}>
        <SettingInput
          label="Timezone"
          value={settings.system_timezone}
          onChangeText={(v) => updateSetting('system_timezone', v)}
          placeholder="UTC"
        />
        <Text style={fieldStyles.description}>
          Common: {TIMEZONES.slice(0, 5).join(', ')}...
        </Text>
        <View style={{ height: spacing.md }} />

        <SaveButton
          onPress={() => saveSection('System', ['system_timezone'])}
          loading={savingSection === 'System'}
          label="Save Timezone"
        />

        <View style={styles.divider} />
        <Text style={styles.subSectionTitle}>System Resources</Text>

        <SystemInfoBar
          label="CPU"
          value={`${cpuPct.toFixed(1)}%`}
          color={cpuPct >= 90 ? colors.danger : cpuPct >= 70 ? colors.warning : colors.success}
          percentage={cpuPct}
        />
        <SystemInfoBar
          label="Memory"
          value={`${ramPct.toFixed(1)}%`}
          color={ramPct >= 90 ? colors.danger : ramPct >= 70 ? colors.warning : colors.success}
          percentage={ramPct}
        />
        <SystemInfoBar
          label="Disk"
          value={`${diskPct.toFixed(1)}%`}
          color={diskPct >= 90 ? colors.danger : diskPct >= 70 ? colors.warning : colors.success}
          percentage={diskPct}
        />

        {systemInfo?.os ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>OS</Text>
            <Text style={styles.infoValue}>
              {systemInfo.os.name} {systemInfo.os.version}
            </Text>
          </View>
        ) : null}

        {systemInfo?.os?.uptime ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Uptime</Text>
            <Text style={styles.infoValue}>{systemInfo.os.uptime}</Text>
          </View>
        ) : null}

        {cpu.model ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>CPU</Text>
            <Text style={styles.infoValue} numberOfLines={2}>
              {cpu.model} ({cpu.cores} cores)
            </Text>
          </View>
        ) : null}
      </CollapsibleSection>

      {/* ================================================================ */}
      {/* License                                                          */}
      {/* ================================================================ */}
      <CollapsibleSection title="License" icon={'\uD83D\uDD11'}>
        <SettingReadOnly label="License Key" value={license.license_key || license.key || settings.license_key} />
        <SettingReadOnly label="Tier" value={String(tierName)} />
        <SettingReadOnly
          label="Subscribers"
          value={`${subscriberCount} / ${subscriberLimit}`}
        />
        <SettingReadOnly label="Expires" value={String(expiresAt)} />

        {license.version || settings.version ? (
          <SettingReadOnly label="Current Version" value={license.version || settings.version} />
        ) : null}

        <TouchableOpacity
          style={[
            styles.updateButton,
            checkingUpdate && styles.updateButtonDisabled,
          ]}
          onPress={handleCheckUpdate}
          disabled={checkingUpdate}
          activeOpacity={0.7}
        >
          {checkingUpdate ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={styles.updateButtonText}>Check for Updates</Text>
          )}
        </TouchableOpacity>
      </CollapsibleSection>

      {/* ================================================================ */}
      {/* Branding                                                         */}
      {/* ================================================================ */}
      <CollapsibleSection title="Branding" icon={'\uD83C\uDFA8'}>
        <SettingInput
          label="Company Name"
          value={settings.company_name}
          onChangeText={(v) => updateSetting('company_name', v)}
          placeholder="ProxPanel"
        />
        <SettingInput
          label="Primary Color"
          value={settings.primary_color}
          onChangeText={(v) => updateSetting('primary_color', v)}
          placeholder="#2563eb"
        />
        {settings.primary_color ? (
          <View style={styles.colorPreviewRow}>
            <View
              style={[
                styles.colorSwatch,
                { backgroundColor: settings.primary_color },
              ]}
            />
            <Text style={styles.colorPreviewText}>{settings.primary_color}</Text>
          </View>
        ) : null}
        <SettingInput
          label="Tagline"
          value={settings.tagline}
          onChangeText={(v) => updateSetting('tagline', v)}
          placeholder="High Performance ISP Management"
        />
        <SettingInput
          label="Footer Text"
          value={settings.footer_text}
          onChangeText={(v) => updateSetting('footer_text', v)}
          placeholder="(c) 2026 Your Company"
        />

        <SaveButton
          onPress={() =>
            saveSection('Branding', [
              'company_name', 'primary_color', 'tagline', 'footer_text',
            ])
          }
          loading={savingSection === 'Branding'}
        />
      </CollapsibleSection>

      {/* Bottom spacer */}
      <View style={{ height: spacing.xxxl }} />
    </ScrollView>
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
  contentContainer: {
    paddingTop: spacing.base,
    paddingBottom: spacing.xxxl,
  },
  subSectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.base,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  infoLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flex: 1,
  },
  infoValue: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  updateButton: {
    backgroundColor: colors.primary + '12',
    borderWidth: 1,
    borderColor: colors.primary + '30',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  updateButtonDisabled: {
    opacity: 0.6,
  },
  updateButtonText: {
    ...typography.button,
    color: colors.primary,
  },
  colorPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.base,
    marginTop: -spacing.sm,
  },
  colorSwatch: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  colorPreviewText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});

export default SettingsScreen;
