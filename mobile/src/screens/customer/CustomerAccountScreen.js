import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  StyleSheet,
} from 'react-native';
import { Card, Button, Input, LoadingScreen, StatusBadge } from '../../components';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { formatDate, formatSpeed, formatCurrency } from '../../utils/format';
import { customerApi, authApi } from '../../services/api';
import useAuthStore from '../../store/authStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDaysUntilExpiry(expiryDate) {
  if (!expiryDate) return null;
  const exp = new Date(expiryDate);
  if (isNaN(exp.getTime())) return null;
  const now = new Date();
  const diffMs = exp.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function getStatusKey(data) {
  if (!data) return 'inactive';
  const status = (data.status || '').toLowerCase();
  if (status === 'expired') return 'expired';
  if (status === 'inactive') return 'inactive';
  if (data.is_online) return 'online';
  return 'active';
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.charAt(0).toUpperCase();
}

// ---------------------------------------------------------------------------
// InfoRow
// ---------------------------------------------------------------------------

const InfoRow = ({ label, value, isLast }) => (
  <View style={[infoStyles.row, !isLast && infoStyles.rowBorder]}>
    <Text style={infoStyles.label}>{label}</Text>
    <Text style={infoStyles.value} numberOfLines={1}>
      {value || '-'}
    </Text>
  </View>
);

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  label: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flex: 1,
  },
  value: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '600',
    flex: 1.5,
    textAlign: 'right',
  },
});

// ---------------------------------------------------------------------------
// CustomerAccountScreen
// ---------------------------------------------------------------------------

const CustomerAccountScreen = ({ navigation }) => {
  const logout = useAuthStore((s) => s.logout);
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Password change form
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // -----------------------------------------------------------------------
  // Fetch
  // -----------------------------------------------------------------------

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await customerApi.dashboard();
      if (res?.data) {
        setData(res.data.data || res.data);
      }
    } catch (err) {
      console.error('CustomerAccountScreen fetch error:', err);
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
  // Password change
  // -----------------------------------------------------------------------

  const handleChangePassword = useCallback(async () => {
    setPasswordError('');

    if (!currentPassword.trim()) {
      setPasswordError('Current password is required');
      return;
    }
    if (!newPassword.trim()) {
      setPasswordError('New password is required');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setIsChangingPassword(true);
    try {
      await authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      Alert.alert('Success', 'Password changed successfully');
      setShowPasswordForm(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err.message || 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  }, [currentPassword, newPassword, confirmPassword]);

  // -----------------------------------------------------------------------
  // Logout
  // -----------------------------------------------------------------------

  const handleLogout = useCallback(() => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          },
        },
      ],
    );
  }, [logout, navigation]);

  // -----------------------------------------------------------------------
  // Change server
  // -----------------------------------------------------------------------

  const handleChangeServer = useCallback(() => {
    Alert.alert(
      'Change Server',
      'This will disconnect you from the current server. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change',
          onPress: async () => {
            await logout();
            navigation.reset({
              index: 0,
              routes: [{ name: 'ServerConnect' }],
            });
          },
        },
      ],
    );
  }, [logout, navigation]);

  // -----------------------------------------------------------------------
  // First load
  // -----------------------------------------------------------------------

  if (isLoading && !data) {
    return <LoadingScreen message="Loading account..." />;
  }

  // -----------------------------------------------------------------------
  // Derived values
  // -----------------------------------------------------------------------

  const fullName = data?.full_name ?? '';
  const username = data?.username ?? '';
  const email = data?.email ?? '';
  const phone = data?.phone ?? '';
  const address = data?.address ?? '';

  const serviceName = data?.service_name ?? data?.service?.name ?? '';
  const downloadSpeed = data?.download_speed ?? data?.service?.download_speed ?? 0;
  const uploadSpeed = data?.upload_speed ?? data?.service?.upload_speed ?? 0;
  const price = data?.price ?? data?.override_price ?? data?.service?.price ?? 0;

  const statusKey = getStatusKey(data);
  const expiryDate = data?.expiry_date ?? '';
  const daysUntilExpiry = getDaysUntilExpiry(expiryDate);
  const initials = getInitials(fullName || username);

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
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.profileName}>{fullName || username}</Text>
        {username ? (
          <Text style={styles.profileUsername}>{username}</Text>
        ) : null}
      </View>

      {/* Account Info */}
      <View style={styles.sectionHeaderInline}>
        <Text style={styles.sectionTitle}>Account Info</Text>
      </View>
      <Card style={styles.card}>
        <InfoRow label="Full Name" value={fullName} />
        <InfoRow label="Username" value={username} />
        <InfoRow label="Email" value={email} />
        <InfoRow label="Phone" value={phone} />
        <InfoRow label="Address" value={address} isLast />
      </Card>

      {/* Service Info */}
      <View style={styles.sectionHeaderInline}>
        <Text style={styles.sectionTitle}>Service Info</Text>
      </View>
      <Card style={styles.card}>
        <InfoRow label="Current Plan" value={serviceName} />
        <InfoRow
          label="Download Speed"
          value={downloadSpeed ? formatSpeed(downloadSpeed) : '-'}
        />
        <InfoRow
          label="Upload Speed"
          value={uploadSpeed ? formatSpeed(uploadSpeed) : '-'}
        />
        <InfoRow
          label="Monthly Price"
          value={price > 0 ? formatCurrency(price) : '-'}
          isLast
        />
      </Card>

      {/* Subscription */}
      <View style={styles.sectionHeaderInline}>
        <Text style={styles.sectionTitle}>Subscription</Text>
      </View>
      <Card style={styles.card}>
        <View style={styles.subscriptionRow}>
          <Text style={infoStyles.label}>Status</Text>
          <StatusBadge status={statusKey} />
        </View>
        <View style={infoStyles.rowBorder} />
        <InfoRow
          label="Expiry Date"
          value={expiryDate ? formatDate(expiryDate, { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}
        />
        <InfoRow
          label="Days Remaining"
          value={daysUntilExpiry !== null ? String(daysUntilExpiry) : '-'}
          isLast
        />
      </Card>

      {/* Actions */}
      <View style={styles.sectionHeaderInline}>
        <Text style={styles.sectionTitle}>Actions</Text>
      </View>

      {/* Change Password */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setShowPasswordForm(!showPasswordForm)}
        style={styles.actionRow}
      >
        <Text style={styles.actionText}>{'\uD83D\uDD12'} Change Password</Text>
        <Text style={styles.actionChevron}>{showPasswordForm ? '\u2303' : '\u203A'}</Text>
      </TouchableOpacity>

      {showPasswordForm && (
        <View style={styles.passwordForm}>
          <Input
            label="Current Password"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            placeholder="Enter current password"
          />
          <Input
            label="New Password"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            placeholder="Enter new password"
          />
          <Input
            label="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            placeholder="Confirm new password"
          />
          {passwordError ? (
            <Text style={styles.passwordError}>{passwordError}</Text>
          ) : null}
          <Button
            title="Save Password"
            onPress={handleChangePassword}
            loading={isChangingPassword}
            disabled={isChangingPassword}
            variant="primary"
            fullWidth
          />
        </View>
      )}

      {/* Change Server */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={handleChangeServer}
        style={styles.actionRow}
      >
        <Text style={styles.actionText}>{'\uD83D\uDD17'} Change Server</Text>
        <Text style={styles.actionChevron}>{'\u203A'}</Text>
      </TouchableOpacity>

      {/* Logout */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={handleLogout}
        style={[styles.actionRow, styles.logoutRow]}
      >
        <Text style={styles.logoutText}>{'\uD83D\uDEAA'} Logout</Text>
      </TouchableOpacity>

      {/* App version */}
      <View style={styles.versionContainer}>
        <Text style={styles.versionText}>ProxPanel Mobile v1.0.0</Text>
      </View>

      {/* Bottom spacer */}
      <View style={{ height: spacing.tabBar }} />
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
    paddingBottom: spacing.tabBar,
  },

  // Profile header
  profileHeader: {
    alignItems: 'center',
    paddingTop: spacing.xxxl + spacing.xl,
    paddingBottom: spacing.xl,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.textInverse,
  },
  profileName: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  profileUsername: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },

  // Section
  sectionHeaderInline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.text,
  },

  // Card
  card: {
    marginHorizontal: spacing.base,
  },

  // Subscription status row
  subscriptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },

  // Action rows
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.base,
    marginBottom: 1,
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.base,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionText: {
    ...typography.body,
    color: colors.text,
    fontWeight: '500',
  },
  actionChevron: {
    ...typography.body,
    color: colors.textLight,
    fontSize: 18,
  },
  logoutRow: {
    marginTop: spacing.md,
    borderColor: colors.danger + '30',
  },
  logoutText: {
    ...typography.body,
    color: colors.danger,
    fontWeight: '600',
  },

  // Password form
  passwordForm: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    padding: spacing.base,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  passwordError: {
    ...typography.caption,
    color: colors.danger,
    marginBottom: spacing.md,
    textAlign: 'center',
  },

  // Version
  versionContainer: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingBottom: spacing.base,
  },
  versionText: {
    ...typography.caption,
    color: colors.textLight,
  },
});

export default CustomerAccountScreen;
