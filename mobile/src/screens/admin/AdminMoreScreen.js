import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Platform,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { shadows } from '../../theme/shadows';
import useAuthStore from '../../store/authStore';
import { getBaseURL } from '../../services/api';

// ---------------------------------------------------------------------------
// Menu item definitions
// ---------------------------------------------------------------------------

const MENU_ITEMS = [
  {
    key: 'Resellers',
    icon: 'people-circle-outline',
    label: 'Resellers',
    description: 'Manage reseller accounts',
    route: 'Resellers',
    permission: 'resellers.view',
  },
  {
    key: 'NAS',
    icon: 'hardware-chip-outline',
    label: 'NAS / Routers',
    description: 'MikroTik router management',
    route: 'NAS',
    permission: 'nas.view',
  },
  {
    key: 'Reports',
    icon: 'stats-chart-outline',
    label: 'Reports',
    description: 'Subscriber & revenue reports',
    route: 'Reports',
    permission: 'reports.view',
  },
  {
    key: 'Backups',
    icon: 'cloud-download-outline',
    label: 'Backups',
    description: 'Database backup & restore',
    route: 'Backups',
    permission: 'backups.view',
  },
  {
    key: 'Communication',
    icon: 'megaphone-outline',
    label: 'Communication',
    description: 'Notification rules & templates',
    route: 'Communication',
    permission: 'communication.view',
  },
  {
    key: 'Tickets',
    icon: 'chatbubble-ellipses-outline',
    label: 'Tickets',
    description: 'Support ticket management',
    route: 'Tickets',
    permission: 'tickets.view',
  },
  {
    key: 'Audit',
    icon: 'shield-checkmark-outline',
    label: 'Audit Logs',
    description: 'System activity history',
    route: 'Audit',
    permission: 'audit.view',
  },
  {
    key: 'BandwidthRules',
    icon: 'speedometer-outline',
    label: 'Bandwidth Rules',
    description: 'Time-based speed rules',
    route: 'BandwidthRules',
    permission: 'bandwidth.view',
  },
  {
    key: 'Settings',
    icon: 'settings-outline',
    label: 'Settings',
    description: 'System configuration',
    route: 'Settings',
    permission: 'settings.view',
  },
  {
    key: 'CDN',
    icon: 'globe-outline',
    label: 'CDN',
    description: 'CDN & PCQ management',
    route: 'CDN',
    permission: 'cdn.view',
  },
  {
    key: 'Permissions',
    icon: 'key-outline',
    label: 'Permissions',
    description: 'Permission groups & roles',
    route: 'Permissions',
    permission: 'permissions.view',
  },
  {
    key: 'Prepaid',
    icon: 'card-outline',
    label: 'Prepaid Cards',
    description: 'Generate & manage cards',
    route: 'Prepaid',
    permission: 'prepaid.view',
  },
  {
    key: 'Users',
    icon: 'person-add-outline',
    label: 'Users',
    description: 'Admin & reseller accounts',
    route: 'Users',
    permission: 'users.view',
  },
];

// ---------------------------------------------------------------------------
// MenuItem component
// ---------------------------------------------------------------------------

const MenuItem = ({ item, onPress }) => {
  return (
    <TouchableOpacity
      style={itemStyles.card}
      onPress={() => onPress(item.route)}
      activeOpacity={0.7}
    >
      <View style={itemStyles.iconContainer}>
        <Ionicons name={item.icon} size={18} color={colors.primary} />
      </View>
      <View style={itemStyles.textContainer}>
        <Text style={itemStyles.label} numberOfLines={1}>
          {item.label}
        </Text>
        <Text style={itemStyles.description} numberOfLines={1}>
          {item.description}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.textLight} style={itemStyles.chevron} />
    </TouchableOpacity>
  );
};

const itemStyles = StyleSheet.create({
  card: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    ...shadows.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    flexDirection: 'column',
    minHeight: 80,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primary + '10',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  icon: {
    // Kept for legacy; Ionicons used directly now
  },
  textContainer: {
    flex: 1,
    marginBottom: spacing.xs,
  },
  label: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 1,
  },
  description: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 13,
  },
  chevron: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
  },
});

// ---------------------------------------------------------------------------
// AdminMoreScreen
// ---------------------------------------------------------------------------

const AdminMoreScreen = ({ navigation }) => {
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const hasPermission = useAuthStore((state) => state.hasPermission);

  const handleNavigate = useCallback(
    (route) => {
      navigation?.navigate?.(route);
    },
    [navigation],
  );

  const handleLogout = useCallback(() => {
    Alert.alert(
      'Logout',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
            // Navigate to login screen after logout
            navigation?.reset?.({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          },
        },
      ],
      { cancelable: true },
    );
  }, [logout, navigation]);

  const [serverUrl, setServerUrl] = React.useState('');
  React.useEffect(() => {
    getBaseURL().then((url) => {
      if (url) setServerUrl(url);
    });
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>More</Text>
        <Text style={styles.headerSubtitle}>
          {user?.username || user?.name || 'Admin'}
        </Text>
      </View>

      {/* Menu Grid */}
      <View style={styles.grid}>
        {MENU_ITEMS.filter((item) => !item.permission || hasPermission(item.permission)).map((item) => (
          <MenuItem key={item.key} item={item} onPress={handleNavigate} />
        ))}
      </View>

      {/* Server Info */}
      <View style={styles.serverInfo}>
        {serverUrl ? (
          <Text style={styles.serverText} numberOfLines={1}>
            {serverUrl}
          </Text>
        ) : null}
        <Text style={styles.versionText}>ProxPanel Mobile</Text>
      </View>

      {/* Logout Button */}
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
        activeOpacity={0.7}
      >
        <View style={styles.logoutContent}>
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={styles.logoutText}>Log Out</Text>
        </View>
      </TouchableOpacity>

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
  header: {
    backgroundColor: colors.surface,
    paddingTop: Platform.OS === 'ios' ? 48 : spacing.md,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    ...shadows.sm,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.text,
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  serverInfo: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  serverText: {
    ...typography.caption,
    color: colors.textLight,
    marginBottom: 2,
  },
  versionText: {
    ...typography.caption,
    color: colors.textLight,
  },
  logoutButton: {
    marginHorizontal: spacing.sm,
    backgroundColor: colors.danger + '10',
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.danger + '30',
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  logoutContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoutText: {
    ...typography.button,
    color: colors.danger,
    fontWeight: '700',
  },
});

export default AdminMoreScreen;
