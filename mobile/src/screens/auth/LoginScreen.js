import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Image,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants from 'expo-constants';
import useAuthStore from '../../store/authStore';
import useServerStore from '../../store/serverStore';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { shadows } from '../../theme/shadows';

const APP_VERSION = Constants.expoConfig?.version || '1.0.0';

export default function LoginScreen({ navigation, route }) {
  // Store
  const {
    login,
    biometricLogin,
    isLoading,
    error,
    clearError,
  } = useAuthStore();
  const { serverUrl, serverName, serverLogo } = useServerStore();

  // Local state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState(null);
  const [sessionBanner, setSessionBanner] = useState(null); // 'expired' | 'idle' | null

  // Refs
  const passwordRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Check navigation params for session expired / idle redirect
  useEffect(() => {
    const reason = route?.params?.reason;
    if (reason === 'expired') {
      setSessionBanner('expired');
    } else if (reason === 'idle') {
      setSessionBanner('idle');
    }
  }, [route?.params?.reason]);

  // Check biometric availability on mount
  useEffect(() => {
    checkBiometrics();
    loadRememberedUsername();

    // Fade in animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const checkBiometrics = async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      if (!compatible) return;

      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) return;

      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      setBiometricAvailable(true);

      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricType('face');
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricType('fingerprint');
      } else {
        setBiometricType('biometric');
      }
    } catch {
      // Biometrics not available
    }
  };

  const loadRememberedUsername = async () => {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const saved = await AsyncStorage.getItem('proxpanel_remember_username');
      if (saved) {
        setUsername(saved);
        setRememberMe(true);
      }
    } catch {
      // ignore
    }
  };

  const saveRememberedUsername = async (name) => {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      if (rememberMe && name) {
        await AsyncStorage.setItem('proxpanel_remember_username', name);
      } else {
        await AsyncStorage.removeItem('proxpanel_remember_username');
      }
    } catch {
      // ignore
    }
  };

  // Handle login
  const handleLogin = useCallback(async () => {
    if (!username.trim() || !password.trim()) return;

    clearError();
    setSessionBanner(null);

    const result = await login(username.trim(), password);

    if (result.success) {
      await saveRememberedUsername(username.trim());

      // Navigation is handled by AppNavigator watching auth state
      // But we can also navigate explicitly for clarity
      switch (result.userType) {
        case 'admin':
          navigation.reset({ index: 0, routes: [{ name: 'AdminTabs' }] });
          break;
        case 'reseller':
          navigation.reset({ index: 0, routes: [{ name: 'ResellerTabs' }] });
          break;
        case 'customer':
          navigation.reset({ index: 0, routes: [{ name: 'CustomerTabs' }] });
          break;
      }
    }
  }, [username, password, login, clearError, navigation, rememberMe]);

  // Handle biometric login
  const handleBiometricLogin = useCallback(async () => {
    clearError();
    setSessionBanner(null);

    const result = await biometricLogin();

    if (result.success) {
      switch (result.userType) {
        case 'admin':
          navigation.reset({ index: 0, routes: [{ name: 'AdminTabs' }] });
          break;
        case 'reseller':
          navigation.reset({ index: 0, routes: [{ name: 'ResellerTabs' }] });
          break;
        case 'customer':
          navigation.reset({ index: 0, routes: [{ name: 'CustomerTabs' }] });
          break;
      }
    }
  }, [biometricLogin, clearError, navigation]);

  // Handle change server
  const handleChangeServer = useCallback(() => {
    navigation.navigate('ServerConnect');
  }, [navigation]);

  // Get biometric icon name for Ionicons
  const getBiometricIconName = () => {
    if (biometricType === 'face') return 'scan-outline';
    if (biometricType === 'fingerprint') return 'finger-print-outline';
    return 'lock-closed-outline';
  };

  const getBiometricLabel = () => {
    if (biometricType === 'face') return 'Sign in with Face ID';
    if (biometricType === 'fingerprint') return 'Sign in with Fingerprint';
    return 'Sign in with Biometrics';
  };

  // Determine logo source
  const renderLogo = () => {
    if (serverLogo) {
      return (
        <Image
          source={{ uri: serverLogo }}
          style={styles.logo}
          resizeMode="contain"
        />
      );
    }

    // Default ProISP logo placeholder
    return (
      <View style={styles.defaultLogo}>
        <Ionicons name="globe-outline" size={32} color={colors.primary} />
      </View>
    );
  };

  return (
    <LinearGradient
      colors={['#2563eb', '#1e40af']}
      style={styles.container}
    >
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
            {/* Session Expired Banner */}
            {sessionBanner === 'expired' && (
              <View style={styles.bannerExpired}>
                <Text style={styles.bannerText}>
                  Your session has expired. Please sign in again.
                </Text>
              </View>
            )}

            {/* Idle Timeout Banner */}
            {sessionBanner === 'idle' && (
              <View style={styles.bannerIdle}>
                <Text style={styles.bannerIdleText}>
                  You were logged out due to inactivity.
                </Text>
              </View>
            )}

            {/* Logo */}
            <View style={styles.logoContainer}>
              {renderLogo()}
            </View>

            {/* Server Name */}
            <Text style={styles.serverName}>
              {serverName || 'ProxPanel'}
            </Text>

            {/* Subtitle */}
            <Text style={styles.subtitle}>Sign in to your account</Text>

            {/* Error Banner */}
            {error && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={14} color={colors.danger} style={styles.errorIcon} />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={clearError} style={styles.errorDismiss}>
                  <Ionicons name="close" size={14} color={colors.danger} />
                </TouchableOpacity>
              </View>
            )}

            {/* Username Input */}
            <View style={styles.inputContainer}>
              <View style={styles.inputIconContainer}>
                <Ionicons name="person-outline" size={16} color={colors.textLight} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Username"
                placeholderTextColor={colors.textLight}
                value={username}
                onChangeText={(text) => {
                  setUsername(text);
                  if (error) clearError();
                }}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={!isLoading}
              />
            </View>

            {/* Password Input */}
            <View style={styles.inputContainer}>
              <View style={styles.inputIconContainer}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.textLight} />
              </View>
              <TextInput
                ref={passwordRef}
                style={[styles.input, styles.passwordInput]}
                placeholder="Password"
                placeholderTextColor={colors.textLight}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (error) clearError();
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                editable={!isLoading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
                disabled={isLoading}
              >
                <Ionicons
                  name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                  size={18}
                  color={colors.textLight}
                  style={styles.eyeIconStyle}
                />
              </TouchableOpacity>
            </View>

            {/* Remember Me */}
            <TouchableOpacity
              style={styles.rememberRow}
              onPress={() => setRememberMe(!rememberMe)}
              disabled={isLoading}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                {rememberMe && <Ionicons name="checkmark" size={12} color={colors.textInverse} />}
              </View>
              <Text style={styles.rememberText}>Remember me</Text>
            </TouchableOpacity>

            {/* Sign In Button */}
            <TouchableOpacity
              style={[
                styles.signInButton,
                (!username.trim() || !password.trim() || isLoading) && styles.signInButtonDisabled,
              ]}
              onPress={handleLogin}
              disabled={!username.trim() || !password.trim() || isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.textInverse} size="small" />
              ) : (
                <Text style={styles.signInButtonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            {/* Biometric Login */}
            {biometricAvailable && rememberMe && (
              <TouchableOpacity
                style={styles.biometricButton}
                onPress={handleBiometricLogin}
                disabled={isLoading}
                activeOpacity={0.7}
              >
                <Ionicons name={getBiometricIconName()} size={20} color={colors.primary} style={styles.biometricIconStyle} />
                <Text style={styles.biometricText}>{getBiometricLabel()}</Text>
              </TouchableOpacity>
            )}

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
            </View>

            {/* Change Server */}
            <TouchableOpacity
              style={styles.changeServerButton}
              onPress={handleChangeServer}
              disabled={isLoading}
              activeOpacity={0.7}
            >
              <Text style={styles.changeServerText}>Change Server</Text>
            </TouchableOpacity>

            {/* Server URL info */}
            {serverUrl && (
              <Text style={styles.serverUrlText} numberOfLines={1}>
                Connected to: {serverUrl}
              </Text>
            )}
          </Animated.View>

          {/* App Version - outside card, on gradient */}
          <Text style={styles.versionText}>v{APP_VERSION}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xl,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    ...shadows.md,
  },

  // Banners
  bannerExpired: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  bannerText: {
    ...typography.bodySmall,
    color: colors.danger,
    textAlign: 'center',
  },
  bannerIdle: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  bannerIdleText: {
    ...typography.bodySmall,
    color: '#92400e',
    textAlign: 'center',
  },

  // Logo
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
  },
  defaultLogo: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },

  // Server name & subtitle
  serverName: {
    ...typography.h2,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.base,
  },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  errorIcon: {
    marginRight: spacing.sm,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.danger,
    flex: 1,
  },
  errorDismiss: {
    paddingLeft: spacing.sm,
    paddingVertical: spacing.xs,
  },

  // Inputs
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
    height: 48,
    overflow: 'hidden',
  },
  inputIconContainer: {
    width: 32,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.toolbar,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  input: {
    flex: 1,
    height: '100%',
    paddingHorizontal: spacing.sm,
    ...typography.body,
    color: colors.text,
  },
  passwordInput: {
    paddingRight: 40,
  },
  eyeButton: {
    position: 'absolute',
    right: 0,
    width: 40,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeIconStyle: {
    opacity: 0.6,
  },

  // Remember me
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingVertical: spacing.xs,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    backgroundColor: colors.surface,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  rememberText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },

  // Sign in button
  signInButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  signInButtonDisabled: {
    opacity: 0.5,
  },
  signInButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },

  // Biometric
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
  },
  biometricIconStyle: {
    marginRight: spacing.sm,
  },
  biometricText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },

  // Divider
  divider: {
    marginVertical: spacing.base,
    alignItems: 'center',
  },
  dividerLine: {
    width: '100%',
    height: 1,
    backgroundColor: colors.border,
  },

  // Change server
  changeServerButton: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  changeServerText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },

  // Server URL
  serverUrlText: {
    ...typography.caption,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: spacing.xs,
  },

  // Version - on gradient background, white/semi-transparent
  versionText: {
    ...typography.caption,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
