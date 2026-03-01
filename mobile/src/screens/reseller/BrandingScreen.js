import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  Platform,
  KeyboardAvoidingView,
  Image,
} from 'react-native';
import { Card, LoadingScreen } from '../../components';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import api from '../../services/api';

let ImagePicker;
try {
  ImagePicker = require('expo-image-picker');
} catch (e) {
  ImagePicker = null;
}

// ---------------------------------------------------------------------------
// Preset Colors
// ---------------------------------------------------------------------------

const PRESET_COLORS = [
  '#2563eb', // Blue
  '#7c3aed', // Purple
  '#059669', // Green
  '#dc2626', // Red
  '#ea580c', // Orange
  '#0891b2', // Cyan
];

// ---------------------------------------------------------------------------
// Color Picker
// ---------------------------------------------------------------------------

const ColorPicker = ({ selectedColor, onSelect }) => {
  const [customHex, setCustomHex] = useState('');

  const handleCustomApply = () => {
    const hex = customHex.trim();
    if (/^#?[0-9A-Fa-f]{6}$/.test(hex)) {
      const normalized = hex.startsWith('#') ? hex : `#${hex}`;
      onSelect(normalized);
    } else {
      Alert.alert('Invalid Color', 'Please enter a valid 6-digit hex color code.');
    }
  };

  return (
    <View style={pickerStyles.container}>
      <View style={pickerStyles.presets}>
        {PRESET_COLORS.map((color) => (
          <TouchableOpacity
            key={color}
            style={[
              pickerStyles.swatch,
              { backgroundColor: color },
              selectedColor === color && pickerStyles.swatchSelected,
            ]}
            onPress={() => onSelect(color)}
            activeOpacity={0.7}
          />
        ))}
      </View>
      <View style={pickerStyles.customRow}>
        <TextInput
          style={pickerStyles.customInput}
          placeholder="#RRGGBB"
          placeholderTextColor={colors.textLight}
          value={customHex}
          onChangeText={setCustomHex}
          autoCapitalize="characters"
          maxLength={7}
        />
        <TouchableOpacity
          style={pickerStyles.applyBtn}
          onPress={handleCustomApply}
          activeOpacity={0.7}
        >
          <Text style={pickerStyles.applyText}>Apply</Text>
        </TouchableOpacity>
        {selectedColor ? (
          <View
            style={[
              pickerStyles.previewDot,
              { backgroundColor: selectedColor },
            ]}
          />
        ) : null}
      </View>
    </View>
  );
};

const pickerStyles = StyleSheet.create({
  container: {
    marginTop: spacing.sm,
  },
  presets: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchSelected: {
    borderColor: colors.text,
    borderWidth: 3,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  customInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surfaceHover,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    height: 42,
  },
  applyBtn: {
    backgroundColor: colors.primary + '15',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    height: 42,
    justifyContent: 'center',
  },
  applyText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.primary,
  },
  previewDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
});

// ---------------------------------------------------------------------------
// Login Preview
// ---------------------------------------------------------------------------

const LoginPreview = ({ companyName, primaryColor, tagline, footerText, logoUri }) => {
  const themeColor = primaryColor || colors.primary;

  return (
    <View style={previewStyles.container}>
      <Text style={previewStyles.previewLabel}>Login Page Preview</Text>
      <View style={[previewStyles.card, { borderTopColor: themeColor }]}>
        <View style={previewStyles.header}>
          {logoUri ? (
            <Image
              source={{ uri: logoUri }}
              style={previewStyles.logo}
              resizeMode="contain"
            />
          ) : (
            <View style={[previewStyles.logoPlaceholder, { backgroundColor: themeColor }]}>
              <Text style={previewStyles.logoText}>
                {(companyName || 'P').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={previewStyles.name} numberOfLines={1}>
            {companyName || 'Company Name'}
          </Text>
          {tagline ? (
            <Text style={previewStyles.tagline} numberOfLines={1}>
              {tagline}
            </Text>
          ) : null}
        </View>

        {/* Fake form fields */}
        <View style={previewStyles.fakeInput} />
        <View style={previewStyles.fakeInput} />
        <View style={[previewStyles.fakeBtn, { backgroundColor: themeColor }]}>
          <Text style={previewStyles.fakeBtnText}>Login</Text>
        </View>

        {footerText ? (
          <Text style={previewStyles.footer} numberOfLines={1}>
            {footerText}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

const previewStyles = StyleSheet.create({
  container: {
    marginTop: spacing.md,
  },
  previewLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopWidth: 4,
    padding: spacing.lg,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  logoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  logoText: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textInverse,
  },
  name: {
    ...typography.h4,
    color: colors.text,
  },
  tagline: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  fakeInput: {
    width: '100%',
    height: 36,
    backgroundColor: colors.surfaceHover,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  fakeBtn: {
    width: '100%',
    height: 36,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  fakeBtnText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textInverse,
  },
  footer: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: spacing.md,
  },
});

// ---------------------------------------------------------------------------
// Form Field
// ---------------------------------------------------------------------------

const FormField = ({ label, children }) => (
  <View style={fieldStyles.container}>
    <Text style={fieldStyles.label}>{label}</Text>
    {children}
  </View>
);

const fieldStyles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
});

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

const BrandingScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    company_name: '',
    tagline: '',
    primary_color: '#2563eb',
    footer_text: '',
    logo_url: '',
  });
  const [logoUri, setLogoUri] = useState(null);
  const [logoFile, setLogoFile] = useState(null);

  // ------ Fetch branding ------
  const fetchBranding = useCallback(async () => {
    try {
      const res = await api.get('/api/branding');
      const data = res.data?.data || res.data;
      if (data) {
        setFormData({
          company_name: data.company_name || '',
          tagline: data.tagline || '',
          primary_color: data.primary_color || '#2563eb',
          footer_text: data.footer_text || '',
          logo_url: data.logo_url || '',
        });
        if (data.logo_url) {
          setLogoUri(data.logo_url);
        }
      }
    } catch (err) {
      // silent
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchBranding();
      setLoading(false);
    })();
  }, [fetchBranding]);

  // ------ Update form field ------
  const updateField = useCallback((field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  // ------ Pick logo image ------
  const handlePickLogo = useCallback(async () => {
    if (!ImagePicker) {
      Alert.alert('Unavailable', 'Image picker is not available on this device.');
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission Required',
          'Please allow access to your photo library to upload a logo.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.length > 0) {
        const asset = result.assets[0];
        setLogoUri(asset.uri);
        setLogoFile(asset);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to pick image.');
    }
  }, []);

  // ------ Remove logo ------
  const handleRemoveLogo = useCallback(() => {
    setLogoUri(null);
    setLogoFile(null);
    updateField('logo_url', '');
  }, [updateField]);

  // ------ Save branding ------
  const handleSave = useCallback(async () => {
    if (!formData.company_name.trim()) {
      Alert.alert('Validation Error', 'Company name is required.');
      return;
    }

    setSaving(true);
    try {
      // If there's a new logo file, upload it first
      if (logoFile) {
        const fd = new FormData();
        fd.append('logo', {
          uri: logoFile.uri,
          type: logoFile.mimeType || 'image/jpeg',
          name: logoFile.fileName || 'logo.jpg',
        });
        try {
          const uploadRes = await api.post('/api/settings/logo', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          if (uploadRes.data?.data?.logo_url) {
            formData.logo_url = uploadRes.data.data.logo_url;
          }
        } catch (uploadErr) {
          // Continue saving other fields even if logo upload fails
          console.warn('Logo upload failed:', uploadErr.message);
        }
      }

      await api.put('/api/branding', {
        company_name: formData.company_name.trim(),
        tagline: formData.tagline.trim(),
        primary_color: formData.primary_color,
        footer_text: formData.footer_text.trim(),
      });

      Alert.alert('Success', 'Branding settings saved successfully!');
      setLogoFile(null);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save branding settings.');
    } finally {
      setSaving(false);
    }
  }, [formData, logoFile]);

  // ------ Render ------
  if (loading) {
    return <LoadingScreen message="Loading branding..." />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Company Name */}
          <FormField label="Company Name">
            <TextInput
              style={styles.textInput}
              value={formData.company_name}
              onChangeText={(v) => updateField('company_name', v)}
              placeholder="Enter company name"
              placeholderTextColor={colors.textLight}
            />
          </FormField>

          {/* Logo Upload */}
          <FormField label="Logo">
            <View style={styles.logoSection}>
              {logoUri ? (
                <View style={styles.logoPreview}>
                  <Image
                    source={{ uri: logoUri }}
                    style={styles.logoImage}
                    resizeMode="contain"
                  />
                  <View style={styles.logoActions}>
                    <TouchableOpacity
                      style={styles.logoChangeBtn}
                      onPress={handlePickLogo}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.logoChangeBtnText}>Change</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.logoRemoveBtn}
                      onPress={handleRemoveLogo}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.logoRemoveBtnText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.logoUploadBtn}
                  onPress={handlePickLogo}
                  activeOpacity={0.7}
                >
                  <Text style={styles.logoUploadIcon}>{'\uD83D\uDDBC\uFE0F'}</Text>
                  <Text style={styles.logoUploadText}>Choose Logo Image</Text>
                  <Text style={styles.logoUploadHint}>
                    Square image recommended (e.g., 200x200)
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </FormField>

          {/* Primary Color */}
          <FormField label="Primary Color">
            <ColorPicker
              selectedColor={formData.primary_color}
              onSelect={(color) => updateField('primary_color', color)}
            />
          </FormField>

          {/* Tagline */}
          <FormField label="Tagline">
            <TextInput
              style={styles.textInput}
              value={formData.tagline}
              onChangeText={(v) => updateField('tagline', v)}
              placeholder="e.g., Fast & Reliable Internet"
              placeholderTextColor={colors.textLight}
            />
          </FormField>

          {/* Footer Text */}
          <FormField label="Footer Text">
            <TextInput
              style={styles.textInput}
              value={formData.footer_text}
              onChangeText={(v) => updateField('footer_text', v)}
              placeholder="e.g., (C) 2026 MyISP. All rights reserved."
              placeholderTextColor={colors.textLight}
            />
          </FormField>

          {/* Preview */}
          <LoginPreview
            companyName={formData.company_name}
            primaryColor={formData.primary_color}
            tagline={formData.tagline}
            footerText={formData.footer_text}
            logoUri={logoUri}
          />

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            activeOpacity={0.7}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Text style={styles.saveBtnText}>Save Branding</Text>
            )}
          </TouchableOpacity>

          <View style={{ height: spacing.tabBar }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
  flex: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing.tabBar,
  },
  textInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  logoSection: {},
  logoPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  logoImage: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceHover,
  },
  logoActions: {
    gap: spacing.sm,
  },
  logoChangeBtn: {
    backgroundColor: colors.primary + '15',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  logoChangeBtnText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.primary,
  },
  logoRemoveBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  logoRemoveBtnText: {
    ...typography.bodySmall,
    color: colors.danger,
  },
  logoUploadBtn: {
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHover,
  },
  logoUploadIcon: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  logoUploadText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  logoUploadHint: {
    ...typography.caption,
    color: colors.textLight,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.base,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    minHeight: 52,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    ...typography.button,
    color: colors.textInverse,
    fontSize: 16,
  },
});

export default BrandingScreen;
