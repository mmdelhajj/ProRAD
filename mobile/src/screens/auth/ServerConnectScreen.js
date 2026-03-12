import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Animated,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { shadows } from '../../theme/shadows';
import useServerStore from '../../store/serverStore';
import { isValidURL } from '../../utils/format';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const QR_FRAME_SIZE = Math.min(SCREEN_WIDTH * 0.7, 280);

// ---------- Tab definitions ----------

const TABS = [
  { key: 'qr', label: 'Scan QR Code' },
  { key: 'url', label: 'Enter URL' },
];

// ---------- Helper: test server connection ----------

const testConnection = async (url) => {
  try {
    const resp = await axios.get(`${url}/health`, { timeout: 5000 });
    return resp.status === 200;
  } catch {
    return false;
  }
};

// ---------- Helper: fetch branding ----------

const fetchBranding = async (url) => {
  try {
    const resp = await axios.get(`${url}/api/branding`, { timeout: 5000 });
    return resp.data;
  } catch {
    return null;
  }
};

// ---------- Helper: normalize URL ----------

function normalizeUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let url = raw.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  url = url.replace(/\/+$/, '');
  return url;
}

// ============================================================
// QR Scanner Tab
// ============================================================

function QRScannerTab({ onServerFound, isConnecting }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  // Animate scanning line
  useEffect(() => {
    if (permission?.granted && !scanned) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: true,
          }),
        ]),
      );
      animation.start();
      return () => animation.stop();
    }
  }, [permission?.granted, scanned, scanLineAnim]);

  const handleBarCodeScanned = useCallback(
    ({ data }) => {
      if (scanned || isConnecting) return;
      setScanned(true);

      // Trigger haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );

      try {
        // Try to parse as JSON: {"server": "...", "name": "..."}
        const parsed = JSON.parse(data);
        const serverUrl = parsed.server || parsed.url || parsed.serverUrl;
        const serverName = parsed.name || parsed.serverName || null;

        if (serverUrl && (serverUrl.startsWith('http://') || serverUrl.startsWith('https://'))) {
          onServerFound(normalizeUrl(serverUrl), serverName);
          return;
        }
      } catch {
        // Not valid JSON
      }

      // Try as plain URL
      if (data.startsWith('http://') || data.startsWith('https://')) {
        onServerFound(normalizeUrl(data), null);
        return;
      }

      // Try adding https:// if it looks like a domain
      if (data.includes('.') && !data.includes(' ')) {
        onServerFound(normalizeUrl(data), null);
        return;
      }

      // Invalid QR content
      Alert.alert(
        'Invalid QR Code',
        'This QR code does not contain a valid server address. Please scan a ProxPanel QR code.',
        [{ text: 'Try Again', onPress: () => setScanned(false) }],
      );
    },
    [scanned, isConnecting, onServerFound],
  );

  // Permission not yet determined
  if (!permission) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.permissionText}>Checking camera permission...</Text>
      </View>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <View style={styles.centeredContainer}>
        <View style={styles.permissionIcon}>
          <Ionicons name="camera-outline" size={24} color={colors.textSecondary} />
        </View>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionDescription}>
          Camera access is needed to scan your ISP's QR code. You can also
          connect using the URL or ISP Code tabs above.
        </Text>
        {permission.canAskAgain ? (
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={requestPermission}
            activeOpacity={0.7}
          >
            <Text style={styles.permissionButtonText}>Allow Camera Access</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.permissionButton, { backgroundColor: colors.textSecondary }]}
            onPress={() => Linking.openSettings()}
            activeOpacity={0.7}
          >
            <Text style={styles.permissionButtonText}>Open Settings</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Camera permitted
  const scanLineTranslateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, QR_FRAME_SIZE - 4],
  });

  return (
    <View style={styles.scannerContainer}>
      <View style={styles.cameraWrapper}>
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        />

        {/* Dark overlay with cutout */}
        <View style={styles.overlay}>
          <View style={styles.overlayTop} />
          <View style={styles.overlayMiddle}>
            <View style={styles.overlaySide} />
            <View style={styles.qrFrame}>
              {/* Corner markers */}
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />

              {/* Scanning line */}
              {!scanned && (
                <Animated.View
                  style={[
                    styles.scanLine,
                    { transform: [{ translateY: scanLineTranslateY }] },
                  ]}
                />
              )}
            </View>
            <View style={styles.overlaySide} />
          </View>
          <View style={styles.overlayBottom} />
        </View>
      </View>

      <Text style={styles.scanHint}>
        {scanned
          ? 'QR code detected!'
          : 'Point your camera at the QR code provided by your ISP'}
      </Text>

      {scanned && !isConnecting && (
        <TouchableOpacity
          style={styles.scanAgainButton}
          onPress={() => setScanned(false)}
          activeOpacity={0.7}
        >
          <Text style={styles.scanAgainText}>Scan Again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ============================================================
// URL Input Tab
// ============================================================

function URLInputTab({ onConnect, isConnecting, error }) {
  const [url, setUrl] = useState('');

  const handleConnect = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    onConnect(normalizeUrl(trimmed));
  };

  const isDisabled = !url.trim() || isConnecting;

  return (
    <View style={styles.tabContent}>
      <Text style={styles.inputLabel}>Server URL</Text>
      <View style={styles.inputWrapper}>
        <TextInput
          style={styles.textInput}
          placeholder="https://panel.myisp.com"
          placeholderTextColor={colors.textLight}
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={handleConnect}
          editable={!isConnecting}
        />
      </View>
      <Text style={styles.inputHint}>
        Enter the URL or IP address of your ISP's panel (e.g. https://panel.myisp.com or http://192.168.1.1)
      </Text>

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="close-circle" size={16} color={colors.danger} style={{ marginRight: 6 }} />
          <Text style={[styles.errorText, { flex: 1 }]}>{error}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.connectButton, isDisabled && styles.connectButtonDisabled]}
        onPress={handleConnect}
        disabled={isDisabled}
        activeOpacity={0.7}
      >
        {isConnecting ? (
          <View style={styles.connectButtonInner}>
            <ActivityIndicator size="small" color={colors.textInverse} />
            <Text style={styles.connectButtonText}>Connecting...</Text>
          </View>
        ) : (
          <Text style={styles.connectButtonText}>Connect</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ============================================================
// Saved Servers List
// ============================================================

function SavedServersList({ servers, onSelect, onDelete }) {
  if (!servers || servers.length === 0) {
    return (
      <View style={styles.noServersContainer}>
        <Text style={styles.noServersText}>No saved servers yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.serversList}>
      <Text style={styles.savedServersTitle}>Saved Servers</Text>
      {servers.map((server, index) => (
        <View key={server.url + index} style={styles.serverRow}>
          <TouchableOpacity
            style={styles.serverInfo}
            onPress={() => onSelect(server)}
            activeOpacity={0.7}
          >
            <View style={styles.serverIconCircle}>
              <Text style={styles.serverIconLetter}>
                {(server.name || server.url || 'S').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.serverDetails}>
              <Text style={styles.serverName} numberOfLines={1}>
                {server.name || server.url}
              </Text>
              <Text style={styles.serverUrl} numberOfLines={1}>
                {server.url}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => onDelete(server)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.deleteButtonText}>Remove</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

// ============================================================
// Success Overlay
// ============================================================

function SuccessOverlay({ serverName, visible }) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
    }
  }, [visible, scaleAnim, opacityAnim]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.successOverlay,
        { opacity: opacityAnim },
      ]}
    >
      <Animated.View
        style={[
          styles.successContent,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <View style={styles.successCheckCircle}>
          <Ionicons name="checkmark" size={28} color={colors.textInverse} />
        </View>
        <Text style={styles.successTitle}>Connected!</Text>
        {serverName ? (
          <Text style={styles.successSubtitle}>
            {serverName}
          </Text>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

// ============================================================
// Main Screen
// ============================================================

export default function ServerConnectScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState('qr');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [showSavedServers, setShowSavedServers] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successName, setSuccessName] = useState('');

  const {
    setServer,
    savedServers,
    removeServer,
  } = useServerStore();

  // Clear error when switching tabs
  useEffect(() => {
    setError(null);
  }, [activeTab]);

  // ---------- Connect to server (common flow) ----------

  const connectToServer = useCallback(
    async (url, name) => {
      setIsConnecting(true);
      setError(null);

      try {
        // Step 1: Validate URL format
        const normalized = normalizeUrl(url);
        if (!normalized || !isValidURL(normalized)) {
          setError('Please enter a valid URL (e.g. https://panel.myisp.com)');
          setIsConnecting(false);
          return;
        }

        // Step 2: Test connection via /health
        const reachable = await testConnection(normalized);
        if (!reachable) {
          setError(
            'Could not connect to the server. Please check the URL and make sure the server is online.',
          );
          setIsConnecting(false);
          return;
        }

        // Step 3: Fetch branding (best-effort)
        const branding = await fetchBranding(normalized);
        const serverName =
          name ||
          branding?.company_name ||
          branding?.data?.company_name ||
          branding?.name ||
          null;
        const serverLogo =
          branding?.logo_url ||
          branding?.data?.logo_url ||
          branding?.logo ||
          branding?.data?.logo ||
          null;

        // Resolve relative logo URL to absolute
        let absoluteLogo = serverLogo;
        if (absoluteLogo && !absoluteLogo.startsWith('http')) {
          absoluteLogo = `${normalized}${absoluteLogo.startsWith('/') ? '' : '/'}${absoluteLogo}`;
        }

        // Step 4: Save to store
        await setServer(normalized, serverName, absoluteLogo);

        // Step 5: Show success animation
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
        setSuccessName(serverName || normalized);
        setShowSuccess(true);

        // Step 6: Navigate to login after animation
        setTimeout(() => {
          setShowSuccess(false);
          setIsConnecting(false);
          navigation.replace('Login');
        }, 1500);
      } catch (err) {
        console.error('Connection error:', err);
        setError(
          err.message || 'An unexpected error occurred while connecting.',
        );
        setIsConnecting(false);
      }
    },
    [navigation, setServer],
  );

  // ---------- Handle QR scan result ----------

  const handleQRFound = useCallback(
    (url, name) => {
      connectToServer(url, name);
    },
    [connectToServer],
  );

  // ---------- Handle URL connect ----------

  const handleURLConnect = useCallback(
    (url) => {
      connectToServer(url, null);
    },
    [connectToServer],
  );

  // ---------- Handle saved server select ----------

  const handleSelectServer = useCallback(
    (server) => {
      setShowSavedServers(false);
      connectToServer(server.url, server.name);
    },
    [connectToServer],
  );

  // ---------- Handle saved server delete ----------

  const handleDeleteServer = useCallback(
    (server) => {
      Alert.alert(
        'Remove Server',
        `Remove "${server.name || server.url}" from saved servers?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              removeServer(server.url);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                () => {},
              );
            },
          },
        ],
      );
    },
    [removeServer],
  );

  // ---------- Render ----------

  return (
    <LinearGradient colors={['#2563eb', '#1e40af']} style={[styles.screen, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <View style={styles.logoCircle}>
                <Text style={styles.logoText}>P</Text>
              </View>
            </View>
            <Text style={styles.headerTitle}>Connect to your ISP</Text>
            <Text style={styles.headerSubtitle}>
              Scan a QR code, enter your panel URL, or use your ISP code to get started.
            </Text>
          </View>

          {/* White card wrapper for form content */}
          <View style={styles.formCard}>
            {/* Tab bar */}
            <View style={styles.tabBar}>
              {TABS.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    style={[styles.tab, isActive && styles.tabActive]}
                    onPress={() => {
                      setActiveTab(tab.key);
                      Haptics.impactAsync(
                        Haptics.ImpactFeedbackStyle.Light,
                      ).catch(() => {});
                    }}
                    activeOpacity={0.7}
                    disabled={isConnecting}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        isActive && styles.tabTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Tab content */}
            <View style={styles.tabContentWrapper}>
              {activeTab === 'qr' && (
                <QRScannerTab
                  onServerFound={handleQRFound}
                  isConnecting={isConnecting}
                />
              )}

              {activeTab === 'url' && (
                <URLInputTab
                  onConnect={handleURLConnect}
                  isConnecting={isConnecting}
                  error={error}
                />
              )}

            </View>

            {/* QR tab also shows connection error inline */}
            {activeTab === 'qr' && error ? (
              <View style={[styles.errorBox, { marginHorizontal: spacing.sm }]}>
                <Ionicons name="close-circle" size={16} color={colors.danger} style={{ marginRight: 6 }} />
                <Text style={[styles.errorText, { flex: 1 }]}>{error}</Text>
              </View>
            ) : null}

            {/* Connecting indicator (shown during QR flow) */}
            {activeTab === 'qr' && isConnecting ? (
              <View style={styles.connectingBox}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.connectingText}>
                  Connecting to server...
                </Text>
              </View>
            ) : null}
          </View>

          {/* Saved servers toggle */}
          {savedServers.length > 0 && (
            <View style={styles.savedServersSection}>
              <TouchableOpacity
                style={styles.savedServersToggle}
                onPress={() => setShowSavedServers(!showSavedServers)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={showSavedServers ? 'chevron-up-outline' : 'server-outline'}
                  size={16}
                  color="#93c5fd"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.savedServersToggleText}>
                  {showSavedServers ? 'Hide saved servers' : 'Already connected? View saved servers'}
                </Text>
                <Text style={styles.savedServersBadge}>
                  {savedServers.length}
                </Text>
              </TouchableOpacity>

              {showSavedServers && (
                <SavedServersList
                  servers={savedServers}
                  onSelect={handleSelectServer}
                  onDelete={handleDeleteServer}
                />
              )}
            </View>
          )}

          {/* Bottom spacing */}
          <View style={{ height: insets.bottom + spacing.xxl }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Success overlay */}
      <SuccessOverlay serverName={successName} visible={showSuccess} />
    </LinearGradient>
  );
}

// ============================================================
// Styles
// ============================================================

const OVERLAY_COLOR = 'rgba(0,0,0,0.55)';

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.base,
  },

  // Header (on gradient, no background color)
  header: {
    alignItems: 'center',
    paddingTop: spacing.base,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.base,
  },
  logoContainer: {
    marginBottom: spacing.sm,
  },
  logoCircle: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    ...typography.h1,
    color: '#ffffff',
    fontSize: 22,
  },
  headerTitle: {
    ...typography.h3,
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    ...typography.bodySmall,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 16,
    maxWidth: 320,
  },

  // White form card
  formCard: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadows.md,
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceHover,
    borderRadius: borderRadius.sm,
    padding: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.textInverse,
  },

  // Tab content wrapper (inside card, no margin needed)
  tabContentWrapper: {
  },

  // QR Scanner
  scannerContainer: {
    alignItems: 'center',
  },
  cameraWrapper: {
    width: QR_FRAME_SIZE + 40,
    height: QR_FRAME_SIZE + 40,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: '#000',
    ...shadows.md,
  },
  camera: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: OVERLAY_COLOR,
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: QR_FRAME_SIZE,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: OVERLAY_COLOR,
  },
  qrFrame: {
    width: QR_FRAME_SIZE,
    height: QR_FRAME_SIZE,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: OVERLAY_COLOR,
  },
  corner: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderColor: colors.primary,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderTopLeftRadius: borderRadius.sm,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderTopRightRadius: borderRadius.sm,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderBottomLeftRadius: borderRadius.sm,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderBottomRightRadius: borderRadius.sm,
  },
  scanLine: {
    position: 'absolute',
    left: 8,
    right: 8,
    height: 2,
    backgroundColor: colors.primary,
    opacity: 0.7,
    borderRadius: 1,
  },
  scanHint: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  scanAgainButton: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scanAgainText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.primary,
  },

  // Permission states
  centeredContainer: {
    alignItems: 'center',
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.md,
  },
  permissionIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceHover,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  // permissionIconText removed - using Ionicons instead
  permissionTitle: {
    ...typography.h4,
    color: colors.text,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  permissionText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  permissionDescription: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: spacing.md,
    maxWidth: 300,
  },
  permissionButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: borderRadius.sm,
    ...shadows.sm,
  },
  permissionButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },

  // Input tabs (URL / Code)
  tabContent: {
    paddingTop: spacing.md,
  },
  inputLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  inputWrapper: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  textInput: {
    ...typography.body,
    color: colors.text,
    paddingHorizontal: spacing.sm,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : spacing.sm,
    minHeight: 48,
  },
  inputHint: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: spacing.xs,
    lineHeight: 13,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.danger,
    lineHeight: 15,
  },
  connectButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    minHeight: 48,
    ...shadows.sm,
  },
  connectButtonDisabled: {
    backgroundColor: colors.surfaceHover,
    opacity: 0.6,
  },
  connectButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  connectButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },

  // Connecting indicator (QR tab)
  connectingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  connectingText: {
    ...typography.bodySmall,
    color: colors.primary,
  },

  // Saved servers
  savedServersSection: {
    marginTop: spacing.base,
    marginHorizontal: spacing.base,
  },
  savedServersToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  savedServersToggleText: {
    ...typography.bodySmall,
    color: '#93c5fd',
    fontWeight: '500',
  },
  savedServersBadge: {
    ...typography.caption,
    fontWeight: '700',
    color: '#ffffff',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
    minWidth: 16,
    textAlign: 'center',
    overflow: 'hidden',
  },
  savedServersTitle: {
    ...typography.label,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: spacing.sm,
  },
  serversList: {
    marginTop: spacing.xs,
  },
  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    paddingRight: spacing.sm,
    marginBottom: spacing.xs,
    overflow: 'hidden',
    ...shadows.sm,
  },
  serverInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  serverIconCircle: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primaryLight + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  serverIconLetter: {
    ...typography.h4,
    color: colors.primary,
  },
  serverDetails: {
    flex: 1,
  },
  serverName: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  serverUrl: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: 1,
  },
  deleteButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  deleteButtonText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.danger,
  },
  noServersContainer: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  noServersText: {
    ...typography.bodySmall,
    color: 'rgba(255,255,255,0.6)',
  },

  // Success overlay
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  successContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    ...shadows.lg,
  },
  successCheckCircle: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  // successCheckMark removed - using Ionicons instead
  successTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  successSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 200,
  },
});
