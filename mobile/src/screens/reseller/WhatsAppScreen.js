import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
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
import { Ionicons } from '@expo/vector-icons';
import { Card, EmptyState, LoadingScreen, StatusBadge } from '../../components';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { shadows } from '../../theme/shadows';
import api from '../../services/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL = 4000; // 4s polling for QR link status

// ---------------------------------------------------------------------------
// Connection Status Card
// ---------------------------------------------------------------------------

const ConnectionCard = ({ status, onLink, onUnlink, loading }) => {
  const isConnected = status?.connected || status?.whatsapp_enabled;
  const phone = status?.phone || status?.proxrad_phone || '';

  return (
    <Card title="WhatsApp Connection" subtitle="Manage your WhatsApp account">
      <View style={connStyles.statusRow}>
        <View
          style={[
            connStyles.indicator,
            { backgroundColor: isConnected ? colors.success : colors.inactive },
          ]}
        />
        <Text style={connStyles.statusText}>
          {isConnected ? 'Connected' : 'Not Connected'}
        </Text>
      </View>

      {isConnected && phone ? (
        <View style={connStyles.phoneRow}>
          <Ionicons name="call-outline" size={14} color={colors.success} style={{ marginRight: spacing.xs }} />
          <Text style={connStyles.phoneText}>{phone}</Text>
        </View>
      ) : null}

      <View style={connStyles.actions}>
        {isConnected ? (
          <TouchableOpacity
            style={connStyles.unlinkBtn}
            onPress={onUnlink}
            activeOpacity={0.7}
            disabled={loading}
          >
            <Text style={connStyles.unlinkText}>Unlink Account</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={connStyles.linkBtn}
            onPress={onLink}
            activeOpacity={0.7}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Text style={connStyles.linkText}>Link WhatsApp Account</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </Card>
  );
};

const connStyles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.lg,
    marginRight: spacing.xs,
  },
  statusText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    backgroundColor: colors.success + '10',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  phoneIcon: {
    fontSize: 13,
    marginRight: spacing.xs,
  },
  phoneText: {
    ...typography.bodySmall,
    color: colors.success,
    fontWeight: '600',
  },
  actions: {
    marginTop: spacing.xs,
  },
  linkBtn: {
    backgroundColor: '#25D366',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    ...shadows.sm,
  },
  linkText: {
    ...typography.button,
    color: colors.textInverse,
  },
  unlinkBtn: {
    backgroundColor: colors.danger + '12',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.danger + '30',
  },
  unlinkText: {
    ...typography.button,
    color: colors.danger,
  },
});

// ---------------------------------------------------------------------------
// QR Code Section
// ---------------------------------------------------------------------------

const QRSection = ({ qrUrl, visible, onCancel }) => {
  if (!visible) return null;

  return (
    <Card title="Scan QR Code" subtitle="Open WhatsApp on your phone and scan">
      <View style={qrStyles.container}>
        {qrUrl ? (
          <Image
            source={{ uri: qrUrl }}
            style={qrStyles.qrImage}
            resizeMode="contain"
          />
        ) : (
          <View style={qrStyles.loading}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={qrStyles.loadingText}>Generating QR Code...</Text>
          </View>
        )}
        <Text style={qrStyles.hint}>
          WhatsApp {'>'} Settings {'>'} Linked Devices {'>'} Link a Device
        </Text>
        <TouchableOpacity
          style={qrStyles.cancelBtn}
          onPress={onCancel}
          activeOpacity={0.7}
        >
          <Text style={qrStyles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
};

const qrStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  qrImage: {
    width: 200,
    height: 200,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loading: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHover,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadingText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  cancelBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  cancelText: {
    ...typography.button,
    color: colors.danger,
  },
});

// ---------------------------------------------------------------------------
// Subscriber Row
// ---------------------------------------------------------------------------

const SubscriberItem = ({ item, onToggle, toggling }) => {
  const enabled = item.whatsapp_notifications !== false;
  const isToggling = toggling === item.id;

  return (
    <View style={subStyles.row}>
      <View style={subStyles.info}>
        <Text style={subStyles.name} numberOfLines={1}>
          {item.full_name || item.username || `Subscriber #${item.id}`}
        </Text>
        <Text style={subStyles.phone} numberOfLines={1}>
          {item.phone || 'No phone'}
        </Text>
      </View>
      <TouchableOpacity
        style={[
          subStyles.bellBtn,
          { backgroundColor: enabled ? colors.success + '15' : colors.inactive + '15' },
        ]}
        onPress={() => onToggle(item)}
        activeOpacity={0.7}
        disabled={isToggling}
      >
        {isToggling ? (
          <ActivityIndicator size="small" color={colors.textSecondary} />
        ) : (
          <Text style={subStyles.bellIcon}>
            <Ionicons name={enabled ? 'notifications' : 'notifications-off'} size={16} color={enabled ? colors.success : colors.inactive} />
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

const subStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  info: {
    flex: 1,
    marginRight: spacing.xs,
  },
  name: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  phone: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  bellBtn: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  bellIcon: {
    fontSize: 16,
  },
});

// ---------------------------------------------------------------------------
// Message Composer
// ---------------------------------------------------------------------------

const MessageComposer = ({ selectedCount, onSend, sending }) => {
  const [message, setMessage] = useState('');

  const handleSend = () => {
    if (!message.trim()) {
      Alert.alert('Error', 'Please enter a message to send.');
      return;
    }
    if (selectedCount === 0) {
      Alert.alert('Error', 'No subscribers with notifications enabled.');
      return;
    }
    Alert.alert(
      'Send Message',
      `Send this message to ${selectedCount} subscriber(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: () => {
            onSend(message.trim());
            setMessage('');
          },
        },
      ],
    );
  };

  return (
    <Card title="Send Message" subtitle={`${selectedCount} subscriber(s) with notifications enabled`}>
      <View style={compStyles.container}>
        <TextInput
          style={compStyles.input}
          placeholder="Type your message here..."
          placeholderTextColor={colors.textLight}
          value={message}
          onChangeText={setMessage}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
        <TouchableOpacity
          style={[
            compStyles.sendBtn,
            (!message.trim() || sending) && compStyles.sendBtnDisabled,
          ]}
          onPress={handleSend}
          activeOpacity={0.7}
          disabled={!message.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <Text style={compStyles.sendText}>Send Message</Text>
          )}
        </TouchableOpacity>
      </View>
    </Card>
  );
};

const compStyles = StyleSheet.create({
  container: {
    marginTop: spacing.xs,
  },
  input: {
    ...typography.bodySmall,
    color: colors.text,
    backgroundColor: colors.surfaceHover,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 80,
    marginBottom: spacing.sm,
  },
  sendBtn: {
    backgroundColor: '#25D366',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
    ...shadows.sm,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendText: {
    ...typography.button,
    color: colors.textInverse,
  },
});

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

const WhatsAppScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState(null);
  const [subscribers, setSubscribers] = useState([]);
  const [showQR, setShowQR] = useState(false);
  const [qrUrl, setQrUrl] = useState(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [toggling, setToggling] = useState(null);
  const [sending, setSending] = useState(false);

  const pollRef = useRef(null);

  // ------ Fetch status ------
  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get('/api/reseller/whatsapp/status');
      if (res.data?.success !== false) {
        setStatus(res.data?.data || res.data);
      }
    } catch (err) {
      // silent — status stays null
    }
  }, []);

  // ------ Fetch subscribers ------
  const fetchSubscribers = useCallback(async () => {
    try {
      const res = await api.get('/api/reseller/whatsapp/subscribers');
      const list = res.data?.data || res.data?.subscribers || [];
      setSubscribers(Array.isArray(list) ? list : []);
    } catch (err) {
      // silent
    }
  }, []);

  // ------ Initial load ------
  const loadAll = useCallback(async () => {
    await Promise.all([fetchStatus(), fetchSubscribers()]);
  }, [fetchStatus, fetchSubscribers]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadAll();
      setLoading(false);
    })();
  }, [loadAll]);

  // ------ Pull to refresh ------
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  // ------ Link WhatsApp ------
  const handleLink = useCallback(async () => {
    try {
      setLinkLoading(true);
      setShowQR(true);
      setQrUrl(null);

      const res = await api.get('/api/notifications/proxrad/create-link');
      const data = res.data?.data || res.data;
      if (data?.qr_url || data?.qr_image) {
        setQrUrl(data.qr_url || data.qr_image);
      }

      // Start polling for link status
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await api.get('/api/notifications/proxrad/link-status');
          const d = statusRes.data?.data || statusRes.data;
          if (d?.connected) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setShowQR(false);
            setQrUrl(null);
            await fetchStatus();
            Alert.alert('Success', 'WhatsApp account linked successfully!');
          }
        } catch (_) {
          // keep polling
        }
      }, POLL_INTERVAL);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to generate QR code.');
      setShowQR(false);
    } finally {
      setLinkLoading(false);
    }
  }, [fetchStatus]);

  // ------ Cancel QR ------
  const handleCancelQR = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setShowQR(false);
    setQrUrl(null);
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, []);

  // ------ Unlink ------
  const handleUnlink = useCallback(() => {
    Alert.alert(
      'Unlink WhatsApp',
      'Are you sure you want to disconnect your WhatsApp account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post('/api/notifications/proxrad/unlink');
              await fetchStatus();
              Alert.alert('Done', 'WhatsApp account unlinked.');
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to unlink account.');
            }
          },
        },
      ],
    );
  }, [fetchStatus]);

  // ------ Toggle notification ------
  const handleToggle = useCallback(
    async (subscriber) => {
      setToggling(subscriber.id);
      try {
        await api.post(
          `/api/reseller/whatsapp/subscribers/${subscriber.id}/toggle-notifications`,
        );
        setSubscribers((prev) =>
          prev.map((s) =>
            s.id === subscriber.id
              ? { ...s, whatsapp_notifications: !s.whatsapp_notifications }
              : s,
          ),
        );
      } catch (err) {
        Alert.alert('Error', err.message || 'Failed to toggle notification.');
      } finally {
        setToggling(null);
      }
    },
    [],
  );

  // ------ Select All / Clear All ------
  const handleSelectAll = useCallback(() => {
    setSubscribers((prev) =>
      prev.map((s) => ({ ...s, whatsapp_notifications: true })),
    );
    // Optionally batch update on server — or let individual toggles handle it
  }, []);

  const handleClearAll = useCallback(() => {
    setSubscribers((prev) =>
      prev.map((s) => ({ ...s, whatsapp_notifications: false })),
    );
  }, []);

  // ------ Send message ------
  const handleSend = useCallback(async (message) => {
    setSending(true);
    try {
      await api.post('/api/reseller/whatsapp/send', { message });
      Alert.alert('Success', 'Message sent successfully!');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  }, []);

  // ------ Counts ------
  const enabledCount = subscribers.filter(
    (s) => s.whatsapp_notifications !== false,
  ).length;

  // ------ Render ------
  if (loading) {
    return <LoadingScreen message="Loading WhatsApp..." />;
  }

  const ListHeader = () => (
    <View style={styles.listHeader}>
      {/* Connection Status */}
      <ConnectionCard
        status={status}
        onLink={handleLink}
        onUnlink={handleUnlink}
        loading={linkLoading}
      />

      {/* QR Code */}
      {showQR && (
        <View style={styles.section}>
          <QRSection
            qrUrl={qrUrl}
            visible={showQR}
            onCancel={handleCancelQR}
          />
        </View>
      )}

      {/* Message Composer */}
      <View style={styles.section}>
        <MessageComposer
          selectedCount={enabledCount}
          onSend={handleSend}
          sending={sending}
        />
      </View>

      {/* Subscribers header */}
      <View style={styles.subsHeader}>
        <Text style={styles.subsTitle}>
          Subscribers ({subscribers.length})
        </Text>
        <View style={styles.subsActions}>
          <TouchableOpacity
            style={styles.selectBtn}
            onPress={handleSelectAll}
            activeOpacity={0.7}
          >
            <Text style={styles.selectBtnText}>Select All</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.selectBtn, styles.clearBtn]}
            onPress={handleClearAll}
            activeOpacity={0.7}
          >
            <Text style={[styles.selectBtnText, styles.clearBtnText]}>
              Clear All
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={subscribers}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <SubscriberItem
              item={item}
              onToggle={handleToggle}
              toggling={toggling}
            />
          )}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            <EmptyState
              iconName="chatbubbles-outline"
              title="No Subscribers"
              message="No subscribers found for WhatsApp notifications."
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
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
  listContent: {
    paddingBottom: spacing.tabBar,
  },
  listHeader: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  section: {
    marginTop: spacing.sm,
  },
  subsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  subsTitle: {
    ...typography.h4,
    color: colors.text,
  },
  subsActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  selectBtn: {
    backgroundColor: colors.primary + '12',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectBtnText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primary,
  },
  clearBtn: {
    backgroundColor: colors.inactive + '15',
  },
  clearBtnText: {
    color: colors.textSecondary,
  },
});

export default WhatsAppScreen;
