import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import {
  Card,
  StatusBadge,
  ProgressBar,
  Button,
  QuickAction,
  SectionHeader,
  LoadingScreen,
} from '../../components';
import { subscriberApi, serviceApi } from '../../services/api';
import {
  formatBytes,
  formatDate,
  formatSpeed,
  formatCurrency,
  getTimeAgo,
  getFUPColor,
} from '../../utils/format';

let Haptics;
try {
  Haptics = require('expo-haptics');
} catch (e) {
  Haptics = null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDaysRemaining(expiryDate) {
  if (!expiryDate) return null;
  const expiry = new Date(expiryDate);
  if (isNaN(expiry.getTime())) return null;
  const now = new Date();
  const diffMs = expiry.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function getAccountStatus(subscriber) {
  if (!subscriber) return 'inactive';
  if (subscriber.is_online) return 'online';
  const exp = subscriber.expiry_date || subscriber.expires_at;
  if (exp) {
    const d = getDaysRemaining(exp);
    if (d !== null && d < 0) return 'expired';
  }
  if (subscriber.is_active === false) return 'inactive';
  return 'active';
}

function getFUPKey(level) {
  const n = parseInt(level, 10);
  if (n === 1) return 'fup1';
  if (n === 2) return 'fup2';
  if (n === 3) return 'fup3';
  return 'fup0';
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function SubscriberDetailScreen({ route, navigation }) {
  const subscriberId = route?.params?.id;

  // Data state
  const [subscriber, setSubscriber] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Action loading states
  const [actionLoading, setActionLoading] = useState(null); // string key of loading action

  // Modals
  const [addDaysVisible, setAddDaysVisible] = useState(false);
  const [addDaysValue, setAddDaysValue] = useState('');
  const [changeServiceVisible, setChangeServiceVisible] = useState(false);
  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState(null);

  // Auto-refresh timer
  const autoRefreshRef = useRef(null);

  // -------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------

  const fetchSubscriber = useCallback(
    async (opts = {}) => {
      if (!subscriberId) return;
      const { silent = false } = opts;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const response = await subscriberApi.get(subscriberId);
        const data = response?.data?.data || response?.data?.subscriber || response?.data;
        setSubscriber(data);
      } catch (err) {
        console.error('Failed to fetch subscriber:', err);
        setError(err.message || 'Failed to load subscriber');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [subscriberId],
  );

  // Initial load
  useEffect(() => {
    fetchSubscriber();
  }, [fetchSubscriber]);

  // Auto-refresh every 30 seconds when screen is focused
  useFocusEffect(
    useCallback(() => {
      autoRefreshRef.current = setInterval(() => {
        fetchSubscriber({ silent: true });
      }, 30000);
      return () => {
        if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
      };
    }, [fetchSubscriber]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSubscriber({ silent: true });
  }, [fetchSubscriber]);

  // -------------------------------------------------------------------
  // Action helpers
  // -------------------------------------------------------------------

  const hapticFeedback = () => {
    if (Haptics && Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  };

  const confirmAndExecute = (title, message, actionKey, apiCall) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(actionKey);
          try {
            await apiCall();
            hapticFeedback();
            Alert.alert('Success', `${title} completed successfully.`);
            fetchSubscriber({ silent: true });
          } catch (err) {
            Alert.alert('Error', err.message || `${title} failed.`);
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  };

  // Individual actions
  const handleRenew = () =>
    confirmAndExecute('Renew', 'Renew this subscriber?', 'renew', () =>
      subscriberApi.renew(subscriberId),
    );

  const handleDisconnect = () =>
    confirmAndExecute('Disconnect', 'Disconnect this subscriber?', 'disconnect', () =>
      subscriberApi.disconnect(subscriberId),
    );

  const handleResetFUP = () =>
    confirmAndExecute('Reset FUP', 'Reset FUP counters for this subscriber?', 'resetFUP', () =>
      subscriberApi.resetFUP(subscriberId),
    );

  const handleResetMAC = () =>
    confirmAndExecute('Reset MAC', 'Clear MAC address binding?', 'resetMAC', () =>
      subscriberApi.resetMAC(subscriberId),
    );

  const handleResetQuota = () =>
    confirmAndExecute('Reset Quota', 'Reset daily quota for this subscriber?', 'resetQuota', () =>
      subscriberApi.resetQuota(subscriberId),
    );

  const handleToggleActive = () => {
    const isActive = subscriber?.is_active !== false;
    const action = isActive ? 'Deactivate' : 'Activate';
    const apiCall = isActive
      ? () => subscriberApi.deactivate(subscriberId)
      : () => subscriberApi.activate(subscriberId);
    confirmAndExecute(action, `${action} this subscriber?`, 'toggleActive', apiCall);
  };

  const handlePing = async () => {
    setActionLoading('ping');
    try {
      const response = await subscriberApi.ping(subscriberId);
      const result = response?.data?.data || response?.data?.result || response?.data;
      const output =
        typeof result === 'string'
          ? result
          : result?.output || result?.message || JSON.stringify(result, null, 2);
      hapticFeedback();
      Alert.alert('Ping Result', output || 'Ping completed.');
    } catch (err) {
      Alert.alert('Ping Failed', err.message || 'Unable to ping subscriber.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleShowPassword = async () => {
    setActionLoading('showPassword');
    try {
      const response = await subscriberApi.getPassword(subscriberId);
      const password =
        response?.data?.data?.password ||
        response?.data?.password ||
        response?.data?.data?.password_plain ||
        response?.data?.password_plain ||
        'N/A';
      hapticFeedback();
      Alert.alert('Subscriber Password', password);
    } catch (err) {
      Alert.alert('Error', err.message || 'Unable to retrieve password.');
    } finally {
      setActionLoading(null);
    }
  };

  // Add Days
  const handleAddDaysConfirm = async () => {
    const days = parseInt(addDaysValue, 10);
    if (isNaN(days) || days <= 0) {
      Alert.alert('Invalid Input', 'Please enter a positive number of days.');
      return;
    }
    setAddDaysVisible(false);
    setActionLoading('addDays');
    try {
      await subscriberApi.addDays(subscriberId, days);
      hapticFeedback();
      Alert.alert('Success', `Added ${days} day(s) successfully.`);
      fetchSubscriber({ silent: true });
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to add days.');
    } finally {
      setActionLoading(null);
      setAddDaysValue('');
    }
  };

  // Change Service
  const openChangeServiceModal = async () => {
    setChangeServiceVisible(true);
    setServicesLoading(true);
    try {
      const response = await serviceApi.list();
      const list =
        response?.data?.data || response?.data?.services || response?.data || [];
      setServices(Array.isArray(list) ? list : []);
    } catch (err) {
      Alert.alert('Error', 'Failed to load services.');
      setChangeServiceVisible(false);
    } finally {
      setServicesLoading(false);
    }
  };

  const handleChangeServiceConfirm = async () => {
    if (!selectedServiceId) {
      Alert.alert('Select a Service', 'Please select a service to assign.');
      return;
    }
    setChangeServiceVisible(false);
    setActionLoading('changeService');
    try {
      await subscriberApi.changeService(subscriberId, selectedServiceId);
      hapticFeedback();
      Alert.alert('Success', 'Service changed successfully.');
      fetchSubscriber({ silent: true });
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to change service.');
    } finally {
      setActionLoading(null);
      setSelectedServiceId(null);
    }
  };

  // Live Bandwidth
  const handleLiveBandwidth = () => {
    navigation.navigate('LiveBandwidth', { subscriberId: subscriberId, subscriberName: subscriber?.full_name, subscriberUsername: subscriber?.username });
  };

  // -------------------------------------------------------------------
  // Loading / Error states
  // -------------------------------------------------------------------

  if (loading && !subscriber) {
    return <LoadingScreen message="Loading subscriber..." />;
  }

  if (error && !subscriber) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>{'\u26A0\uFE0F'}</Text>
        <Text style={styles.errorTitle}>Failed to Load</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <Button title="Retry" onPress={() => fetchSubscriber()} variant="primary" />
        <View style={{ marginTop: spacing.sm }}>
          <Button title="Go Back" onPress={() => navigation.goBack()} variant="ghost" />
        </View>
      </View>
    );
  }

  if (!subscriber) return null;

  // -------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------

  const accountStatus = getAccountStatus(subscriber);
  const expiryDate = subscriber.expiry_date || subscriber.expires_at;
  const daysRemaining = getDaysRemaining(expiryDate);
  const fupLevel = subscriber.fup_level ?? 0;
  const fupKey = getFUPKey(fupLevel);
  const fupColor = getFUPColor(fupLevel);
  const isOnline = !!subscriber.is_online;
  const isActive = subscriber.is_active !== false;

  const serviceName =
    subscriber.service?.name ||
    subscriber.service_name ||
    '-';

  const ipAddress =
    subscriber.ip_address ||
    subscriber.framed_ip_address ||
    '-';

  const macAddress =
    subscriber.mac_address ||
    subscriber.calling_station_id ||
    '-';

  const dailyDownload = subscriber.daily_download_used || 0;
  const dailyUpload = subscriber.daily_upload_used || 0;
  const dailyQuota = subscriber.daily_quota || subscriber.service?.daily_quota || 0;
  const monthlyDownload = subscriber.monthly_download_used || 0;
  const monthlyUpload = subscriber.monthly_upload_used || 0;
  const monthlyQuota = subscriber.monthly_quota || subscriber.service?.monthly_quota || 0;

  const downloadSpeed =
    subscriber.service?.download_speed_str ||
    (subscriber.service?.download_speed ? `${subscriber.service.download_speed}k` : '-');

  const uploadSpeed =
    subscriber.service?.upload_speed_str ||
    (subscriber.service?.upload_speed ? `${subscriber.service.upload_speed}k` : '-');

  const lastSeen = subscriber.last_seen || subscriber.last_accounting;
  const createdAt = subscriber.created_at;

  const price = subscriber.override_price
    ? subscriber.price
    : subscriber.service?.price;

  const overridePrice = subscriber.override_price ? subscriber.price : null;
  const balance = subscriber.balance;

  // -------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------

  const renderInfoRow = (label, value, opts = {}) => (
    <View style={styles.infoRow} key={label}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text
        style={[
          styles.infoValue,
          opts.mono && styles.monoText,
          opts.color && { color: opts.color },
        ]}
        selectable
        numberOfLines={2}
      >
        {value || '-'}
      </Text>
    </View>
  );

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <View style={styles.screen}>
      {/* Header bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backText}>{'\u2039'} Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Subscriber
        </Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('SubscriberCreateEdit', { id: subscriberId })}
          style={styles.editButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.editText}>Edit</Text>
        </TouchableOpacity>
      </View>

      {/* Global loading overlay for actions */}
      {actionLoading && (
        <View style={styles.actionLoadingBar}>
          <ActivityIndicator size="small" color={colors.textInverse} />
          <Text style={styles.actionLoadingText}>
            {actionLoading === 'renew' && 'Renewing...'}
            {actionLoading === 'disconnect' && 'Disconnecting...'}
            {actionLoading === 'resetFUP' && 'Resetting FUP...'}
            {actionLoading === 'resetMAC' && 'Resetting MAC...'}
            {actionLoading === 'resetQuota' && 'Resetting Quota...'}
            {actionLoading === 'addDays' && 'Adding days...'}
            {actionLoading === 'changeService' && 'Changing service...'}
            {actionLoading === 'toggleActive' && 'Updating status...'}
            {actionLoading === 'ping' && 'Pinging...'}
            {actionLoading === 'showPassword' && 'Fetching password...'}
          </Text>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* ==================== 1. HEADER CARD ==================== */}
        <View style={styles.headerCard}>
          <View style={styles.headerCardTop}>
            <View style={styles.headerCardInfo}>
              <Text style={styles.username} selectable>
                {subscriber.username || '-'}
              </Text>
              <Text style={styles.fullName} numberOfLines={1}>
                {subscriber.full_name || subscriber.name || '-'}
              </Text>
            </View>
            <StatusBadge status={isOnline ? 'online' : 'offline'} />
          </View>
          <View style={styles.headerChips}>
            <View style={styles.chip}>
              <Text style={styles.chipText}>{serviceName}</Text>
            </View>
            {isOnline && ipAddress !== '-' && (
              <View style={[styles.chip, styles.ipChip]}>
                <Text style={[styles.chipText, styles.monoText]}>{ipAddress}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ==================== 2. STATUS & EXPIRY CARD ==================== */}
        <SectionHeader title="Status & Expiry" />
        <Card style={styles.cardSpacing}>
          <View style={styles.statusGrid}>
            <View style={styles.statusItem}>
              <Text style={styles.infoLabel}>Status</Text>
              <StatusBadge status={accountStatus} />
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.infoLabel}>FUP Level</Text>
              <StatusBadge status={fupKey} />
            </View>
          </View>
          {renderInfoRow(
            'Expiry Date',
            expiryDate
              ? formatDate(expiryDate, { year: 'numeric', month: 'short', day: 'numeric' })
              : '-',
          )}
          {daysRemaining !== null && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Days Remaining</Text>
              <Text
                style={[
                  styles.infoValue,
                  { color: daysRemaining >= 0 ? colors.success : colors.danger, fontWeight: '700' },
                ]}
              >
                {daysRemaining >= 0
                  ? `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left`
                  : `Expired ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) !== 1 ? 's' : ''} ago`}
              </Text>
            </View>
          )}
          {renderInfoRow(
            'Created',
            createdAt
              ? formatDate(createdAt, { year: 'numeric', month: 'short', day: 'numeric' })
              : '-',
          )}
        </Card>

        {/* ==================== LIVE BANDWIDTH BUTTON ==================== */}
        <View style={styles.liveBandwidthWrapper}>
          <Button
            title={'\uD83D\uDCCA  View Live Bandwidth'}
            onPress={handleLiveBandwidth}
            variant="primary"
            size="lg"
            fullWidth
          />
        </View>

        {/* ==================== 3. QUICK ACTIONS ==================== */}
        <SectionHeader title="Quick Actions" />
        <Card style={styles.cardSpacing}>
          <View style={styles.actionsGrid}>
            <QuickAction
              icon={'\uD83D\uDCC5'}
              label="Renew"
              color={colors.success}
              onPress={handleRenew}
            />
            <QuickAction
              icon={'\u23FB'}
              label="Disconnect"
              color={colors.danger}
              onPress={handleDisconnect}
            />
            <QuickAction
              icon={'\uD83D\uDD04'}
              label="Reset FUP"
              color={colors.warning}
              onPress={handleResetFUP}
            />
            <QuickAction
              icon={'\uD83D\uDD17'}
              label="Reset MAC"
              color={colors.primary}
              onPress={handleResetMAC}
            />
            <QuickAction
              icon={'\uD83D\uDDC4'}
              label="Reset Quota"
              color="#8b5cf6"
              onPress={handleResetQuota}
            />
            <QuickAction
              icon={'\u2795'}
              label="Add Days"
              color="#14b8a6"
              onPress={() => {
                setAddDaysValue('');
                setAddDaysVisible(true);
              }}
            />
            <QuickAction
              icon={'\uD83D\uDD00'}
              label="Change Service"
              color="#6366f1"
              onPress={openChangeServiceModal}
            />
            <QuickAction
              icon={'\uD83D\uDCF6'}
              label="Ping"
              color="#06b6d4"
              onPress={handlePing}
            />
            <QuickAction
              icon={isActive ? '\u26D4' : '\u2705'}
              label={isActive ? 'Deactivate' : 'Activate'}
              color={isActive ? colors.danger : colors.success}
              onPress={handleToggleActive}
            />
            <QuickAction
              icon={'\uD83D\uDD11'}
              label="Show Password"
              color={colors.textSecondary}
              onPress={handleShowPassword}
            />
          </View>
        </Card>

        {/* ==================== 4. USAGE SECTION ==================== */}
        <SectionHeader title="Usage" />
        <Card style={styles.cardSpacing}>
          {dailyQuota > 0 && (
            <>
              <ProgressBar
                label="Daily Download"
                value={dailyDownload}
                total={dailyQuota}
              />
              <View style={styles.usageSpacer} />
              <ProgressBar
                label="Daily Upload"
                value={dailyUpload}
                total={dailyQuota}
              />
              <View style={styles.usageSpacer} />
            </>
          )}
          {monthlyQuota > 0 && (
            <>
              <ProgressBar
                label="Monthly Download"
                value={monthlyDownload}
                total={monthlyQuota}
              />
              <View style={styles.usageSpacer} />
              <ProgressBar
                label="Monthly Upload"
                value={monthlyUpload}
                total={monthlyQuota}
              />
              <View style={styles.usageSpacer} />
            </>
          )}
          {dailyQuota <= 0 && monthlyQuota <= 0 && (
            <Text style={styles.noQuotaText}>No quota limits configured.</Text>
          )}
          <View style={styles.totalTodayRow}>
            <Text style={styles.totalTodayLabel}>Total today</Text>
            <Text style={styles.totalTodayValue}>
              {formatBytes(dailyDownload + dailyUpload)}
            </Text>
          </View>
        </Card>

        {/* ==================== 5. CONNECTION INFO ==================== */}
        <SectionHeader title="Connection Info" />
        <Card style={styles.cardSpacing}>
          {renderInfoRow('IP Address', ipAddress, { mono: true })}
          {renderInfoRow('MAC Address', macAddress, { mono: true })}
          {renderInfoRow('Last Seen', isOnline ? 'Online now' : getTimeAgo(lastSeen), {
            color: isOnline ? colors.success : undefined,
          })}
          {renderInfoRow('Download Speed', downloadSpeed)}
          {renderInfoRow('Upload Speed', uploadSpeed)}
        </Card>

        {/* ==================== 6. CONTACT INFO ==================== */}
        <SectionHeader title="Contact Info" />
        <Card style={styles.cardSpacing}>
          {renderInfoRow('Phone', subscriber.phone)}
          {renderInfoRow('Email', subscriber.email)}
          {renderInfoRow('Address', subscriber.address)}
          {renderInfoRow('Region', subscriber.region)}
          {renderInfoRow('Building', subscriber.building)}
        </Card>

        {/* ==================== 7. FINANCIAL ==================== */}
        <SectionHeader title="Financial" />
        <Card style={styles.cardSpacing}>
          {renderInfoRow(
            'Service Price',
            subscriber.service?.price != null
              ? formatCurrency(subscriber.service.price)
              : '-',
          )}
          {overridePrice != null && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>
                {'\u2B50'} Override Price
              </Text>
              <Text style={[styles.infoValue, { color: colors.warning, fontWeight: '700' }]}>
                {formatCurrency(overridePrice)}
              </Text>
            </View>
          )}
          {renderInfoRow(
            'Balance',
            balance != null ? formatCurrency(balance) : '-',
            { color: balance != null && balance < 0 ? colors.danger : undefined },
          )}
        </Card>

        {/* Bottom padding */}
        <View style={{ height: spacing.tabBar }} />
      </ScrollView>

      {/* ==================== ADD DAYS MODAL ==================== */}
      <Modal
        visible={addDaysVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddDaysVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Days</Text>
            <Text style={styles.modalSubtitle}>
              Enter the number of days to add to the expiry date.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={addDaysValue}
              onChangeText={setAddDaysValue}
              placeholder="e.g. 30"
              placeholderTextColor={colors.textLight}
              keyboardType="number-pad"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleAddDaysConfirm}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setAddDaysVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleAddDaysConfirm}
              >
                <Text style={styles.modalConfirmText}>Add Days</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ==================== CHANGE SERVICE MODAL ==================== */}
      <Modal
        visible={changeServiceVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setChangeServiceVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.serviceModalContent]}>
            <Text style={styles.modalTitle}>Change Service</Text>
            <Text style={styles.modalSubtitle}>
              Select a new service plan for this subscriber.
            </Text>

            {servicesLoading ? (
              <ActivityIndicator
                size="large"
                color={colors.primary}
                style={{ marginVertical: spacing.xl }}
              />
            ) : (
              <FlatList
                data={services}
                keyExtractor={(item) => String(item.id)}
                style={styles.serviceList}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <Text style={styles.emptyListText}>No services available.</Text>
                }
                renderItem={({ item }) => {
                  const isSelected = selectedServiceId === item.id;
                  const isCurrent = item.id === (subscriber.service_id || subscriber.service?.id);
                  return (
                    <TouchableOpacity
                      style={[
                        styles.serviceItem,
                        isSelected && styles.serviceItemSelected,
                        isCurrent && styles.serviceItemCurrent,
                      ]}
                      onPress={() => setSelectedServiceId(item.id)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.serviceRadio}>
                        <View
                          style={[
                            styles.radioOuter,
                            isSelected && styles.radioOuterSelected,
                          ]}
                        >
                          {isSelected && <View style={styles.radioInner} />}
                        </View>
                      </View>
                      <View style={styles.serviceInfo}>
                        <Text style={styles.serviceName}>
                          {item.name}
                          {isCurrent ? ' (current)' : ''}
                        </Text>
                        <Text style={styles.serviceDetails}>
                          {item.download_speed_str || `${item.download_speed || 0}k`} /{' '}
                          {item.upload_speed_str || `${item.upload_speed || 0}k`}
                          {item.price != null ? `  \u2022  ${formatCurrency(item.price)}` : ''}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setChangeServiceVisible(false);
                  setSelectedServiceId(null);
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmBtn,
                  !selectedServiceId && styles.modalConfirmDisabled,
                ]}
                onPress={handleChangeServiceConfirm}
                disabled={!selectedServiceId}
              >
                <Text style={styles.modalConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingTop: Platform.OS === 'ios' ? 54 : 12,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    paddingVertical: spacing.xs,
    paddingRight: spacing.md,
  },
  backText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },
  headerTitle: {
    ...typography.h4,
    color: colors.text,
    flex: 1,
    textAlign: 'center',
  },
  editButton: {
    paddingVertical: spacing.xs,
    paddingLeft: spacing.md,
  },
  editText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },

  // Action loading bar
  actionLoadingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  actionLoadingText: {
    ...typography.bodySmall,
    color: colors.textInverse,
    fontWeight: '600',
    marginLeft: spacing.sm,
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
    paddingHorizontal: spacing.xxl,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: spacing.base,
  },
  errorTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  errorMessage: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },

  // Header card
  headerCard: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.base,
    marginTop: spacing.base,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  headerCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerCardInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  username: {
    ...typography.h2,
    color: colors.text,
    marginBottom: 2,
  },
  fullName: {
    ...typography.body,
    color: colors.textSecondary,
  },
  headerChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.primaryLight + '15',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: borderRadius.full,
  },
  ipChip: {
    backgroundColor: colors.textSecondary + '12',
  },
  chipText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },

  // Card spacing
  cardSpacing: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.xs,
  },

  // Info rows
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm + 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  infoLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
    flex: 1,
  },
  infoValue: {
    ...typography.body,
    color: colors.text,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  monoText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
  },

  // Status grid (2 columns)
  statusGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  statusItem: {
    flex: 1,
    alignItems: 'flex-start',
  },

  // Quick actions grid
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    paddingTop: spacing.xs,
  },

  // Usage
  usageSpacer: {
    height: spacing.md,
  },
  noQuotaText: {
    ...typography.body,
    color: colors.textLight,
    textAlign: 'center',
    paddingVertical: spacing.base,
  },
  totalTodayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  totalTodayLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  totalTodayValue: {
    ...typography.h4,
    color: colors.text,
  },

  // Live bandwidth button
  liveBandwidthWrapper: {
    marginHorizontal: spacing.base,
    marginTop: spacing.lg,
  },

  // --------- Modals ---------
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  serviceModalContent: {
    maxHeight: '75%',
  },
  modalTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  modalSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  modalInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    marginBottom: spacing.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  modalCancelBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceHover,
  },
  modalCancelText: {
    ...typography.button,
    color: colors.textSecondary,
  },
  modalConfirmBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  modalConfirmDisabled: {
    backgroundColor: colors.primary + '55',
  },
  modalConfirmText: {
    ...typography.button,
    color: colors.textInverse,
  },

  // Service list
  serviceList: {
    maxHeight: 320,
    marginBottom: spacing.md,
  },
  emptyListText: {
    ...typography.body,
    color: colors.textLight,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  serviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.sm,
  },
  serviceItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight + '10',
  },
  serviceItemCurrent: {
    borderColor: colors.success + '50',
    backgroundColor: colors.success + '08',
  },
  serviceRadio: {
    marginRight: spacing.md,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  serviceDetails: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
