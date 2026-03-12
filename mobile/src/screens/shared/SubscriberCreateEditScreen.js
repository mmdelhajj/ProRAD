import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Switch,
  KeyboardAvoidingView,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { shadows } from '../../theme/shadows';
import { subscriberApi, serviceApi, resellerApi } from '../../services/api';
import { Button, LoadingScreen } from '../../components';
import useAuthStore from '../../store/authStore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: true, label: 'Active' },
  { value: false, label: 'Inactive' },
];

const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Argentina', 'Australia', 'Austria',
  'Bahrain', 'Bangladesh', 'Belgium', 'Brazil', 'Canada', 'Chile', 'China',
  'Colombia', 'Croatia', 'Cyprus', 'Czech Republic', 'Denmark', 'Egypt',
  'Estonia', 'Ethiopia', 'Finland', 'France', 'Germany', 'Ghana', 'Greece',
  'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland',
  'Israel', 'Italy', 'Japan', 'Jordan', 'Kenya', 'Kuwait', 'Latvia',
  'Lebanon', 'Libya', 'Lithuania', 'Luxembourg', 'Malaysia', 'Mexico',
  'Morocco', 'Netherlands', 'New Zealand', 'Nigeria', 'Norway', 'Oman',
  'Pakistan', 'Palestine', 'Peru', 'Philippines', 'Poland', 'Portugal',
  'Qatar', 'Romania', 'Russia', 'Saudi Arabia', 'Senegal', 'Serbia',
  'Singapore', 'Slovakia', 'Slovenia', 'Somalia', 'South Africa', 'South Korea',
  'Spain', 'Sri Lanka', 'Sudan', 'Sweden', 'Switzerland', 'Syria', 'Thailand',
  'Tunisia', 'Turkey', 'UAE', 'UK', 'Ukraine', 'USA', 'Venezuela', 'Vietnam',
  'Yemen',
];

const NATIONALITIES = [
  'Afghan', 'Albanian', 'Algerian', 'American', 'Argentine', 'Australian',
  'Austrian', 'Bahraini', 'Bangladeshi', 'Belgian', 'Brazilian', 'British',
  'Canadian', 'Chilean', 'Chinese', 'Colombian', 'Croatian', 'Cypriot',
  'Czech', 'Danish', 'Dutch', 'Egyptian', 'Emirati', 'Estonian', 'Ethiopian',
  'Filipino', 'Finnish', 'French', 'German', 'Ghanaian', 'Greek', 'Hungarian',
  'Icelandic', 'Indian', 'Indonesian', 'Iranian', 'Iraqi', 'Irish', 'Israeli',
  'Italian', 'Japanese', 'Jordanian', 'Kenyan', 'Korean', 'Kuwaiti', 'Latvian',
  'Lebanese', 'Libyan', 'Lithuanian', 'Malaysian', 'Mexican', 'Moroccan',
  'New Zealander', 'Nigerian', 'Norwegian', 'Omani', 'Pakistani', 'Palestinian',
  'Peruvian', 'Polish', 'Portuguese', 'Qatari', 'Romanian', 'Russian',
  'Saudi', 'Senegalese', 'Serbian', 'Singaporean', 'Slovak', 'Slovenian',
  'Somali', 'South African', 'Spanish', 'Sri Lankan', 'Sudanese', 'Swedish',
  'Swiss', 'Syrian', 'Thai', 'Tunisian', 'Turkish', 'Ukrainian', 'Venezuelan',
  'Vietnamese', 'Yemeni',
];

// ---------------------------------------------------------------------------
// Dropdown Picker Component
// ---------------------------------------------------------------------------

function DropdownPicker({ label, value, options, onSelect, placeholder, disabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');

  const selectedLabel = options.find((o) => o.value === value)?.label || '';

  const filteredOptions = searchText
    ? options.filter((o) => o.label.toLowerCase().includes(searchText.toLowerCase()))
    : options;

  return (
    <View style={dropdownStyles.container}>
      {label && <Text style={dropdownStyles.label}>{label}</Text>}
      <TouchableOpacity
        style={[dropdownStyles.trigger, disabled && dropdownStyles.triggerDisabled]}
        onPress={() => !disabled && setIsOpen(!isOpen)}
        activeOpacity={0.7}
      >
        <Text
          style={[
            dropdownStyles.triggerText,
            !selectedLabel && dropdownStyles.placeholder,
          ]}
          numberOfLines={1}
        >
          {selectedLabel || placeholder || 'Select...'}
        </Text>
        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={12} color={colors.textSecondary} />
      </TouchableOpacity>

      {isOpen && (
        <View style={dropdownStyles.dropdown}>
          {options.length > 8 && (
            <TextInput
              style={dropdownStyles.searchInput}
              placeholder="Search..."
              placeholderTextColor={colors.textLight}
              value={searchText}
              onChangeText={setSearchText}
              autoCorrect={false}
            />
          )}
          <ScrollView
            style={dropdownStyles.optionsList}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {placeholder && (
              <TouchableOpacity
                style={[
                  dropdownStyles.option,
                  value === '' && dropdownStyles.optionSelected,
                ]}
                onPress={() => {
                  onSelect('');
                  setIsOpen(false);
                  setSearchText('');
                }}
              >
                <Text style={[dropdownStyles.optionText, dropdownStyles.placeholder]}>
                  {placeholder}
                </Text>
              </TouchableOpacity>
            )}
            {filteredOptions.map((option) => {
              const isSelected = option.value === value;
              return (
                <TouchableOpacity
                  key={String(option.value)}
                  style={[
                    dropdownStyles.option,
                    isSelected && dropdownStyles.optionSelected,
                  ]}
                  onPress={() => {
                    onSelect(option.value);
                    setIsOpen(false);
                    setSearchText('');
                  }}
                >
                  <Text
                    style={[
                      dropdownStyles.optionText,
                      isSelected && dropdownStyles.optionTextSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {filteredOptions.length === 0 && (
              <Text style={dropdownStyles.noResults}>No results found</Text>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const dropdownStyles = StyleSheet.create({
  container: {
    marginBottom: 8,
    zIndex: 1,
  },
  label: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: 2,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 5,
    backgroundColor: colors.surface,
    minHeight: 48,
  },
  triggerDisabled: {
    opacity: 0.5,
  },
  triggerText: {
    fontSize: 12,
    color: colors.text,
    flex: 1,
  },
  placeholder: {
    color: colors.textLight,
  },
  arrow: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  dropdown: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    marginTop: 2,
    maxHeight: 200,
  },
  searchInput: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontSize: 12,
    color: colors.text,
  },
  optionsList: {
    maxHeight: 180,
  },
  option: {
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  optionSelected: {
    backgroundColor: colors.primaryLight + '12',
  },
  optionText: {
    ...typography.body,
    color: colors.text,
  },
  optionTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  noResults: {
    ...typography.bodySmall,
    color: colors.textLight,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});

// ---------------------------------------------------------------------------
// Simple Date Input Component (YYYY-MM-DD)
// ---------------------------------------------------------------------------

function DateInput({ label, value, onChange }) {
  // Display as formatted date, allow editing as text
  const [displayValue, setDisplayValue] = useState(value || '');

  useEffect(() => {
    if (value) {
      // Format the ISO date to YYYY-MM-DD for display
      try {
        const d = new Date(value);
        if (!isNaN(d.getTime())) {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          setDisplayValue(`${yyyy}-${mm}-${dd}`);
        }
      } catch {
        setDisplayValue(value);
      }
    } else {
      setDisplayValue('');
    }
  }, [value]);

  const handleChangeText = (text) => {
    // Allow typing numbers and dashes
    const cleaned = text.replace(/[^0-9-]/g, '');
    setDisplayValue(cleaned);

    // Auto-format: add dashes after YYYY and MM
    if (cleaned.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
      const d = new Date(cleaned + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        onChange(d.toISOString());
      }
    }
  };

  const handleBlur = () => {
    if (displayValue && /^\d{4}-\d{2}-\d{2}$/.test(displayValue)) {
      const d = new Date(displayValue + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        onChange(d.toISOString());
      }
    }
  };

  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={displayValue}
        onChangeText={handleChangeText}
        onBlur={handleBlur}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colors.textLight}
        keyboardType="numbers-and-punctuation"
        maxLength={10}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function SubscriberCreateEditScreen({ route, navigation }) {
  const subscriberId = route?.params?.id;
  const isEditing = !!subscriberId;

  const isAdmin = useAuthStore((s) => s.isAdmin);

  // Form state
  const [form, setForm] = useState({
    username: '',
    password: '',
    full_name: '',
    phone: '',
    email: '',
    service_id: '',
    reseller_id: '',
    is_active: true,
    expiry_date: '',
    static_ip: '',
    mac_address: '',
    address: '',
    region: '',
    building: '',
    country: '',
    nationality: '',
    notes: '',
    override_price: false,
    price: '',
    balance: '',
  });

  // UI state
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [services, setServices] = useState([]);
  const [resellers, setResellers] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [resellersLoading, setResellersLoading] = useState(false);
  const [error, setError] = useState(null);

  const scrollRef = useRef(null);

  // -------------------------------------------------------------------
  // Field updater
  // -------------------------------------------------------------------

  const updateField = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  // -------------------------------------------------------------------
  // Load services and resellers
  // -------------------------------------------------------------------

  useEffect(() => {
    let mounted = true;

    async function loadDropdownData() {
      // Load services
      try {
        setServicesLoading(true);
        const res = await serviceApi.list();
        const list = res?.data?.data || res?.data?.services || res?.data || [];
        if (mounted) {
          setServices(Array.isArray(list) ? list : []);
        }
      } catch (err) {
        console.error('Failed to load services:', err);
      } finally {
        if (mounted) setServicesLoading(false);
      }

      // Load resellers (admin only)
      if (isAdmin()) {
        try {
          setResellersLoading(true);
          const res = await resellerApi.list({ limit: 500 });
          const list = res?.data?.data || res?.data?.resellers || res?.data || [];
          if (mounted) {
            setResellers(Array.isArray(list) ? list : []);
          }
        } catch (err) {
          console.error('Failed to load resellers:', err);
        } finally {
          if (mounted) setResellersLoading(false);
        }
      }
    }

    loadDropdownData();
    return () => { mounted = false; };
  }, [isAdmin]);

  // -------------------------------------------------------------------
  // Load subscriber data when editing
  // -------------------------------------------------------------------

  useEffect(() => {
    if (!isEditing) return;

    let mounted = true;

    async function loadSubscriber() {
      setLoading(true);
      setError(null);
      try {
        const res = await subscriberApi.get(subscriberId);
        const sub = res?.data?.data || res?.data?.subscriber || res?.data;

        if (!mounted || !sub) return;

        setForm({
          username: sub.username || '',
          password: '', // Don't pre-fill password for security
          full_name: sub.full_name || sub.name || '',
          phone: sub.phone || '',
          email: sub.email || '',
          service_id: sub.service_id || sub.service?.id || '',
          reseller_id: sub.reseller_id || '',
          is_active: sub.is_active !== false,
          expiry_date: sub.expiry_date || sub.expires_at || '',
          static_ip: sub.static_ip || '',
          mac_address: sub.mac_address || '',
          address: sub.address || '',
          region: sub.region || '',
          building: sub.building || '',
          country: sub.country || '',
          nationality: sub.nationality || '',
          notes: sub.notes || '',
          override_price: !!sub.override_price,
          price: sub.price != null ? String(sub.price) : '',
          balance: sub.balance != null ? String(sub.balance) : '',
        });

        // Also try to load password
        try {
          const pwRes = await subscriberApi.getPassword(subscriberId);
          const password =
            pwRes?.data?.data?.password ||
            pwRes?.data?.password ||
            pwRes?.data?.data?.password_plain ||
            pwRes?.data?.password_plain ||
            '';
          if (mounted && password) {
            setForm((prev) => ({ ...prev, password }));
          }
        } catch {
          // Password not available - that's fine
        }
      } catch (err) {
        console.error('Failed to load subscriber:', err);
        if (mounted) {
          setError(err.message || 'Failed to load subscriber data.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadSubscriber();
    return () => { mounted = false; };
  }, [subscriberId, isEditing]);

  // -------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------

  const validate = () => {
    if (!form.username.trim()) {
      Alert.alert('Validation Error', 'Username is required.');
      return false;
    }
    if (!isEditing && !form.password.trim()) {
      Alert.alert('Validation Error', 'Password is required for new subscribers.');
      return false;
    }
    if (!form.service_id) {
      Alert.alert('Validation Error', 'Please select a service.');
      return false;
    }
    return true;
  };

  // -------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------

  const handleSave = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        username: form.username.trim(),
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        service_id: Number(form.service_id),
        is_active: form.is_active,
        static_ip: form.static_ip.trim(),
        mac_address: form.mac_address.trim(),
        address: form.address.trim(),
        region: form.region.trim(),
        building: form.building.trim(),
        country: form.country.trim(),
        nationality: form.nationality.trim(),
        notes: form.notes.trim(),
        override_price: form.override_price,
      };

      // Only include password if provided
      if (form.password.trim()) {
        payload.password = form.password.trim();
      }

      // Only include reseller_id if admin and set
      if (isAdmin() && form.reseller_id) {
        payload.reseller_id = Number(form.reseller_id);
      }

      // Expiry date
      if (form.expiry_date) {
        payload.expiry_date = form.expiry_date;
      }

      // Price
      if (form.override_price && form.price) {
        payload.price = parseFloat(form.price);
      }

      // Balance
      if (form.balance !== '') {
        payload.balance = parseFloat(form.balance);
      }

      if (isEditing) {
        await subscriberApi.update(subscriberId, payload);
        Alert.alert('Success', 'Subscriber updated successfully.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        await subscriberApi.create(payload);
        Alert.alert('Success', 'Subscriber created successfully.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (err) {
      console.error('Save failed:', err);
      Alert.alert(
        'Error',
        err.message || `Failed to ${isEditing ? 'update' : 'create'} subscriber.`,
      );
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------------------
  // Loading / Error states
  // -------------------------------------------------------------------

  if (loading) {
    return <LoadingScreen message="Loading subscriber..." />;
  }

  if (error && isEditing) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="warning-outline" size={36} color={colors.warning} style={styles.errorIcon} />
        <Text style={styles.errorTitle}>Failed to Load</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <Button title="Go Back" onPress={() => navigation.goBack()} variant="primary" />
      </View>
    );
  }

  // -------------------------------------------------------------------
  // Build dropdown options
  // -------------------------------------------------------------------

  const serviceOptions = services.map((s) => ({
    value: s.id,
    label: `${s.name}${s.download_speed_str ? ` (${s.download_speed_str})` : ''}${s.price != null ? ` - $${s.price}` : ''}`,
  }));

  const resellerOptions = resellers.map((r) => ({
    value: r.id,
    label: `${r.user?.username || r.username || r.name || `Reseller #${r.id}`}${r.user?.full_name ? ` (${r.user.full_name})` : ''}`,
  }));

  const countryOptions = COUNTRIES.map((c) => ({ value: c, label: c }));
  const nationalityOptions = NATIONALITIES.map((n) => ({ value: n, label: n }));

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="arrow-back" size={14} color={colors.primary} style={{ marginRight: 2 }} />
            <Text style={styles.backText}>Back</Text>
          </View>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {isEditing ? 'Edit Subscriber' : 'New Subscriber'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Saving overlay */}
      {saving && (
        <View style={styles.savingBar}>
          <ActivityIndicator size="small" color={colors.textInverse} />
          <Text style={styles.savingText}>
            {isEditing ? 'Updating...' : 'Creating...'}
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ========== SECTION: Account ========== */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="person-outline" size={15} color={colors.text} style={styles.sectionIcon} />
              <Text style={styles.sectionTitle}>Account Information</Text>
            </View>
            <View style={styles.sectionCard}>
              {/* Username */}
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Username *</Text>
                <TextInput
                  style={styles.input}
                  value={form.username}
                  onChangeText={(v) => updateField('username', v)}
                  placeholder="e.g. user@domain"
                  placeholderTextColor={colors.textLight}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isEditing}
                />
                {isEditing && (
                  <Text style={styles.fieldHint}>Username cannot be changed after creation.</Text>
                )}
              </View>

              {/* Password */}
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>
                  Password {!isEditing && '*'}
                </Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={[styles.input, styles.passwordInput]}
                    value={form.password}
                    onChangeText={(v) => updateField('password', v)}
                    placeholder={isEditing ? 'Leave blank to keep current' : 'Enter password'}
                    placeholderTextColor={colors.textLight}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={styles.passwordToggle}
                    onPress={() => setShowPassword(!showPassword)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Full Name */}
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  value={form.full_name}
                  onChangeText={(v) => updateField('full_name', v)}
                  placeholder="Enter full name"
                  placeholderTextColor={colors.textLight}
                />
              </View>

              {/* Phone */}
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Phone</Text>
                <TextInput
                  style={styles.input}
                  value={form.phone}
                  onChangeText={(v) => updateField('phone', v)}
                  placeholder="Enter phone number"
                  placeholderTextColor={colors.textLight}
                  keyboardType="phone-pad"
                />
              </View>

              {/* Email */}
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={form.email}
                  onChangeText={(v) => updateField('email', v)}
                  placeholder="Enter email address"
                  placeholderTextColor={colors.textLight}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
          </View>

          {/* ========== SECTION: Service & Status ========== */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="cube-outline" size={15} color={colors.text} style={styles.sectionIcon} />
              <Text style={styles.sectionTitle}>Service & Status</Text>
            </View>
            <View style={styles.sectionCard}>
              {/* Service Dropdown */}
              <DropdownPicker
                label="Service *"
                value={form.service_id}
                options={serviceOptions}
                onSelect={(v) => updateField('service_id', v)}
                placeholder={servicesLoading ? 'Loading services...' : 'Select a service'}
                disabled={servicesLoading}
              />

              {/* Reseller Dropdown (admin only) */}
              {isAdmin() && (
                <DropdownPicker
                  label="Reseller"
                  value={form.reseller_id}
                  options={resellerOptions}
                  onSelect={(v) => updateField('reseller_id', v)}
                  placeholder={resellersLoading ? 'Loading resellers...' : 'No reseller (admin-owned)'}
                  disabled={resellersLoading}
                />
              )}

              {/* Status */}
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Status</Text>
                <View style={styles.statusRow}>
                  <TouchableOpacity
                    style={[
                      styles.statusOption,
                      form.is_active && styles.statusOptionActive,
                    ]}
                    onPress={() => updateField('is_active', true)}
                  >
                    <Text
                      style={[
                        styles.statusOptionText,
                        form.is_active && styles.statusOptionTextActive,
                      ]}
                    >
                      Active
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.statusOption,
                      !form.is_active && styles.statusOptionInactive,
                    ]}
                    onPress={() => updateField('is_active', false)}
                  >
                    <Text
                      style={[
                        styles.statusOptionText,
                        !form.is_active && styles.statusOptionTextInactive,
                      ]}
                    >
                      Inactive
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Expiry Date */}
              <DateInput
                label="Expiry Date"
                value={form.expiry_date}
                onChange={(v) => updateField('expiry_date', v)}
              />
            </View>
          </View>

          {/* ========== SECTION: Connection ========== */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="globe-outline" size={15} color={colors.text} style={styles.sectionIcon} />
              <Text style={styles.sectionTitle}>Connection</Text>
            </View>
            <View style={styles.sectionCard}>
              {/* Static IP */}
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Static IP</Text>
                <TextInput
                  style={[styles.input, styles.monoInput]}
                  value={form.static_ip}
                  onChangeText={(v) => updateField('static_ip', v)}
                  placeholder="e.g. 10.0.0.100"
                  placeholderTextColor={colors.textLight}
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* MAC Address */}
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>MAC Address</Text>
                <TextInput
                  style={[styles.input, styles.monoInput]}
                  value={form.mac_address}
                  onChangeText={(v) => updateField('mac_address', v)}
                  placeholder="e.g. AA:BB:CC:DD:EE:FF"
                  placeholderTextColor={colors.textLight}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </View>
            </View>
          </View>

          {/* ========== SECTION: Location ========== */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="location-outline" size={15} color={colors.text} style={styles.sectionIcon} />
              <Text style={styles.sectionTitle}>Location & Contact</Text>
            </View>
            <View style={styles.sectionCard}>
              {/* Address */}
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Address</Text>
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  value={form.address}
                  onChangeText={(v) => updateField('address', v)}
                  placeholder="Enter address"
                  placeholderTextColor={colors.textLight}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
              </View>

              {/* Region */}
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Region</Text>
                <TextInput
                  style={styles.input}
                  value={form.region}
                  onChangeText={(v) => updateField('region', v)}
                  placeholder="Enter region"
                  placeholderTextColor={colors.textLight}
                />
              </View>

              {/* Building */}
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Building</Text>
                <TextInput
                  style={styles.input}
                  value={form.building}
                  onChangeText={(v) => updateField('building', v)}
                  placeholder="Enter building"
                  placeholderTextColor={colors.textLight}
                />
              </View>

              {/* Country */}
              <DropdownPicker
                label="Country"
                value={form.country}
                options={countryOptions}
                onSelect={(v) => updateField('country', v)}
                placeholder="Select country"
              />

              {/* Nationality */}
              <DropdownPicker
                label="Nationality"
                value={form.nationality}
                options={nationalityOptions}
                onSelect={(v) => updateField('nationality', v)}
                placeholder="Select nationality"
              />
            </View>
          </View>

          {/* ========== SECTION: Financial ========== */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="cash-outline" size={15} color={colors.text} style={styles.sectionIcon} />
              <Text style={styles.sectionTitle}>Financial</Text>
            </View>
            <View style={styles.sectionCard}>
              {/* Override Price */}
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Override Service Price</Text>
                <Switch
                  value={form.override_price}
                  onValueChange={(v) => updateField('override_price', v)}
                  trackColor={{ false: colors.border, true: colors.primaryLight }}
                  thumbColor={form.override_price ? colors.primary : colors.surface}
                />
              </View>

              {/* Price (only if override enabled) */}
              {form.override_price && (
                <View style={styles.fieldContainer}>
                  <Text style={styles.fieldLabel}>Custom Price</Text>
                  <View style={styles.currencyRow}>
                    <Text style={styles.currencySign}>$</Text>
                    <TextInput
                      style={[styles.input, styles.currencyInput]}
                      value={form.price}
                      onChangeText={(v) => updateField('price', v)}
                      placeholder="0.00"
                      placeholderTextColor={colors.textLight}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              )}

              {/* Balance */}
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Balance</Text>
                <View style={styles.currencyRow}>
                  <Text style={styles.currencySign}>$</Text>
                  <TextInput
                    style={[styles.input, styles.currencyInput]}
                    value={form.balance}
                    onChangeText={(v) => updateField('balance', v)}
                    placeholder="0.00"
                    placeholderTextColor={colors.textLight}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
            </View>
          </View>

          {/* ========== SECTION: Notes ========== */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="document-text-outline" size={15} color={colors.text} style={styles.sectionIcon} />
              <Text style={styles.sectionTitle}>Notes</Text>
            </View>
            <View style={styles.sectionCard}>
              <TextInput
                style={[styles.input, styles.notesInput]}
                value={form.notes}
                onChangeText={(v) => updateField('notes', v)}
                placeholder="Add any notes about this subscriber..."
                placeholderTextColor={colors.textLight}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          </View>

          {/* ========== Save Button ========== */}
          <View style={styles.saveContainer}>
            <Button
              title={saving ? 'Saving...' : isEditing ? 'Update Subscriber' : 'Create Subscriber'}
              onPress={handleSave}
              variant="primary"
              size="lg"
              fullWidth
              disabled={saving}
            />
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Bottom padding */}
          <View style={{ height: spacing.tabBar }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header bar
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 54 : 8,
    paddingBottom: 4,
    paddingHorizontal: 6,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    paddingVertical: 2,
    paddingRight: 6,
  },
  backText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 50,
  },

  // Saving bar
  savingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 3,
    gap: 4,
  },
  savingText: {
    fontSize: 13,
    color: colors.textInverse,
    fontWeight: '600',
    marginLeft: 4,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.tabBar,
  },

  // Error state
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: 12,
  },
  errorIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  errorMessage: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 18,
  },

  // Section
  sectionContainer: {
    paddingHorizontal: 6,
    marginTop: 8,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionIcon: {
    marginRight: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: 8,
    ...shadows.sm,
  },

  // Fields
  fieldContainer: {
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: 2,
  },
  fieldHint: {
    fontSize: 12,
    color: colors.textLight,
    marginTop: 2,
    fontStyle: 'italic',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 5,
    fontSize: 12,
    color: colors.text,
    backgroundColor: colors.surface,
    minHeight: 48,
  },
  multilineInput: {
    minHeight: 56,
    paddingTop: 6,
  },
  monoInput: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
  },

  // Password
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderRightWidth: 0,
  },
  passwordToggle: {
    borderWidth: 1,
    borderColor: colors.border,
    borderTopRightRadius: borderRadius.sm,
    borderBottomRightRadius: borderRadius.sm,
    paddingHorizontal: 6,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  passwordToggleText: {
    fontSize: 16,
  },

  // Status toggle
  statusRow: {
    flexDirection: 'row',
    gap: 4,
  },
  statusOption: {
    flex: 1,
    paddingVertical: 5,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  statusOptionActive: {
    borderColor: colors.success,
    backgroundColor: colors.success + '12',
  },
  statusOptionInactive: {
    borderColor: colors.danger,
    backgroundColor: colors.danger + '12',
  },
  statusOptionText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  statusOptionTextActive: {
    color: colors.success,
  },
  statusOptionTextInactive: {
    color: colors.danger,
  },

  // Switch
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingVertical: 2,
  },
  switchLabel: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '500',
    flex: 1,
  },

  // Currency
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencySign: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    marginRight: 4,
    width: 16,
    textAlign: 'center',
  },
  currencyInput: {
    flex: 1,
  },

  // Notes
  notesInput: {
    minHeight: 72,
    paddingTop: 6,
    textAlignVertical: 'top',
  },

  // Save area
  saveContainer: {
    paddingHorizontal: 6,
    marginTop: 10,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});
