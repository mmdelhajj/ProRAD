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
import * as LocalAuthentication from 'expo-local-authentication';
import Constants from 'expo-constants';
import useAuthStore from '../../store/authStore';
import useServerStore from '../../store/serverStore';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

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

  // Get biometric icon text
  const getBiometricIcon = () => {
    if (biometricType === 'face') return '\uD83D\uDE42'; // face
    if (biometricType === 'fingerprint') return '\uD83D\uDD90\uFE0F'; // hand/fingerprint
    return '\uD83D\uDD12'; // lock
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
        <Text style={styles.defaultLogoIcon}>{'\uD83C\uDF10'}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
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
              <Text style={styles.errorIcon}>{'\u26A0'}</Text>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={clearError} style={styles.errorDismiss}>
                <Text style={styles.errorDismissText}>{'\u2715'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Username Input */}
          <View style={styles.inputContainer}>
            <View style={styles.inputIconContainer}>
              <Text style={styles.inputIcon}>{'\uD83D\uDC64'}</Text>
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
              <Text style={styles.inputIcon}>{'\uD83D\uDD12'}</Text>
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
              <Text style={styles.eyeIcon}>
                {showPassword ? '\uD83D\uDC41\uFE0F' : '\uD83D\uDC41\uFE0F\u200D\uD83D\uDDE8\uFE0F'}
              </Text>
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
              {rememberMe && <Text style={styles.checkmark}>{'\u2713'}</Text>}
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
              <Text style={styles.biometricIcon}>{getBiometricIcon()}</Text>
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

          {/* App Version */}
          <Text style={styles.versionText}>v{APP_VERSION}</Text>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxxl,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },

  // Banners
  bannerExpired: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
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
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  bannerIdleText: {
    ...typography.bodySmall,
    color: '#92400e',
    textAlign: 'center',
  },

  // Logo
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.base,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.lg,
  },
  defaultLogo: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultLogoIcon: {
    fontSize: 36,
  },

  // Server name & subtitle
  serverName: {
    ...typography.h2,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.base,
  },
  errorIcon: {
    fontSize: 16,
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
  errorDismissText: {
    fontSize: 14,
    color: colors.danger,
    fontWeight: '600',
  },

  // Inputs
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    height: 52,
    overflow: 'hidden',
  },
  inputIconContainer: {
    width: 48,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.borderLight,
  },
  inputIcon: {
    fontSize: 18,
  },
  input: {
    flex: 1,
    height: '100%',
    paddingHorizontal: spacing.md,
    ...typography.body,
    color: colors.text,
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeButton: {
    position: 'absolute',
    right: 0,
    width: 48,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeIcon: {
    fontSize: 18,
    opacity: 0.6,
  },

  // Remember me
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingVertical: spacing.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
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
  checkmark: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '700',
    marginTop: -1,
  },
  rememberText: {
    ...typography.body,
    color: colors.textSecondary,
  },

  // Sign in button
  signInButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  signInButtonDisabled: {
    opacity: 0.6,
    shadowOpacity: 0,
    elevation: 0,
  },
  signInButtonText: {
    ...typography.button,
    color: colors.textInverse,
    fontSize: 16,
  },

  // Biometric
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.base,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  biometricIcon: {
    fontSize: 22,
    marginRight: spacing.sm,
  },
  biometricText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },

  // Divider
  divider: {
    marginVertical: spacing.xl,
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
    paddingVertical: spacing.sm,
  },
  changeServerText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },

  // Server URL
  serverUrlText: {
    ...typography.caption,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  // Version
  versionText: {
    ...typography.caption,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
