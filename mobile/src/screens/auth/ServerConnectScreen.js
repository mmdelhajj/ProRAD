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

import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
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
          <Text style={styles.permissionIconText}>&#128247;</Text>
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
          <Text style={styles.errorText}>{error}</Text>
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
          <Text style={styles.successCheckMark}>&#10003;</Text>
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
    <View style={[styles.screen, { paddingTop: insets.top }]}>
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
            <View style={[styles.errorBox, { marginHorizontal: spacing.xl }]}>
              <Text style={styles.errorText}>{error}</Text>
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

          {/* Saved servers toggle */}
          {savedServers.length > 0 && (
            <View style={styles.savedServersSection}>
              <TouchableOpacity
                style={styles.savedServersToggle}
                onPress={() => setShowSavedServers(!showSavedServers)}
                activeOpacity={0.7}
              >
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
    </View>
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
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },

  // Header
  header: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  logoContainer: {
    marginBottom: spacing.base,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  logoText: {
    ...typography.h1,
    color: colors.textInverse,
    fontSize: 32,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  headerSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    marginBottom: spacing.base,
    backgroundColor: colors.surfaceHover,
    borderRadius: borderRadius.lg,
    padding: spacing.xs,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.md,
  },
  tabActive: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  tabText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.textInverse,
  },

  // Tab content wrapper
  tabContentWrapper: {
    marginHorizontal: spacing.xl,
  },

  // QR Scanner
  scannerContainer: {
    alignItems: 'center',
  },
  cameraWrapper: {
    width: QR_FRAME_SIZE + 40,
    height: QR_FRAME_SIZE + 40,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    backgroundColor: '#000',
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
    width: 24,
    height: 24,
    borderColor: colors.primary,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 4,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 4,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 4,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 4,
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
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.base,
    paddingHorizontal: spacing.base,
  },
  scanAgainButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceHover,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scanAgainText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.primary,
  },

  // Permission states
  centeredContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.base,
  },
  permissionIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceHover,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
  },
  permissionIconText: {
    fontSize: 28,
  },
  permissionTitle: {
    ...typography.h4,
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  permissionText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  permissionDescription: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
    maxWidth: 300,
  },
  permissionButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
  },
  permissionButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },

  // Input tabs (URL / Code)
  tabContent: {
    paddingTop: spacing.base,
  },
  inputLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  inputWrapper: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  textInput: {
    ...typography.body,
    color: colors.text,
    paddingHorizontal: spacing.base,
    paddingVertical: Platform.OS === 'ios' ? spacing.base : spacing.md,
    minHeight: 48,
  },
  inputHint: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: spacing.sm,
    lineHeight: 16,
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.danger,
    lineHeight: 18,
  },
  connectButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.base,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    minHeight: 50,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  connectButtonDisabled: {
    backgroundColor: colors.textLight,
    shadowOpacity: 0,
    elevation: 0,
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
    marginTop: spacing.base,
    gap: spacing.sm,
  },
  connectingText: {
    ...typography.body,
    color: colors.primary,
  },

  // Saved servers
  savedServersSection: {
    marginTop: spacing.xxl,
    marginHorizontal: spacing.xl,
  },
  savedServersToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  savedServersToggleText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '500',
  },
  savedServersBadge: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textInverse,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    minWidth: 22,
    textAlign: 'center',
    overflow: 'hidden',
  },
  savedServersTitle: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  serversList: {
    marginTop: spacing.sm,
  },
  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingRight: spacing.md,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  serverInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  serverIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  serverIconLetter: {
    ...typography.h4,
    color: colors.primary,
  },
  serverDetails: {
    flex: 1,
  },
  serverName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  serverUrl: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: 2,
  },
  deleteButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  deleteButtonText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.danger,
  },
  noServersContainer: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  noServersText: {
    ...typography.body,
    color: colors.textLight,
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
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xxxl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 16,
  },
  successCheckCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
  },
  successCheckMark: {
    fontSize: 36,
    color: colors.textInverse,
    fontWeight: '700',
  },
  successTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  successSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 220,
  },
});
