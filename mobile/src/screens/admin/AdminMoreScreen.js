import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Platform,
} from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import useAuthStore from '../../store/authStore';
import { getBaseURL } from '../../services/api';

// ---------------------------------------------------------------------------
// Menu item definitions
// ---------------------------------------------------------------------------

const MENU_ITEMS = [
  {
    key: 'Resellers',
    icon: '\uD83D\uDC65',
    label: 'Resellers',
    description: 'Manage reseller accounts',
    route: 'Resellers',
    permission: 'resellers.view',
  },
  {
    key: 'NAS',
    icon: '\uD83D\uDCE1',
    label: 'NAS / Routers',
    description: 'MikroTik router management',
    route: 'NAS',
    permission: 'nas.view',
  },
  {
    key: 'Reports',
    icon: '\uD83D\uDCCA',
    label: 'Reports',
    description: 'Subscriber & revenue reports',
    route: 'Reports',
    permission: 'reports.view',
  },
  {
    key: 'Backups',
    icon: '\uD83D\uDCBE',
    label: 'Backups',
    description: 'Database backup & restore',
    route: 'Backups',
    permission: 'backups.view',
  },
  {
    key: 'Communication',
    icon: '\uD83D\uDCE8',
    label: 'Communication',
    description: 'Notification rules & templates',
    route: 'Communication',
    permission: 'communication.view',
  },
  {
    key: 'Tickets',
    icon: '\uD83C\uDFAB',
    label: 'Tickets',
    description: 'Support ticket management',
    route: 'Tickets',
    permission: 'tickets.view',
  },
  {
    key: 'Audit',
    icon: '\uD83D\uDCCB',
    label: 'Audit Logs',
    description: 'System activity history',
    route: 'Audit',
    permission: 'audit.view',
  },
  {
    key: 'BandwidthRules',
    icon: '\u26A1',
    label: 'Bandwidth Rules',
    description: 'Time-based speed rules',
    route: 'BandwidthRules',
    permission: 'bandwidth.view',
  },
  {
    key: 'Settings',
    icon: '\u2699\uFE0F',
    label: 'Settings',
    description: 'System configuration',
    route: 'Settings',
    permission: 'settings.view',
  },
  {
    key: 'CDN',
    icon: '\uD83C\uDF10',
    label: 'CDN',
    description: 'CDN & PCQ management',
    route: 'CDN',
    permission: 'cdn.view',
  },
  {
    key: 'Permissions',
    icon: '\uD83D\uDD10',
    label: 'Permissions',
    description: 'Permission groups & roles',
    route: 'Permissions',
    permission: 'permissions.view',
  },
  {
    key: 'Prepaid',
    icon: '\uD83D\uDCB3',
    label: 'Prepaid Cards',
    description: 'Generate & manage cards',
    route: 'Prepaid',
    permission: 'prepaid.view',
  },
  {
    key: 'Users',
    icon: '\uD83D\uDC64',
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
        <Text style={itemStyles.icon}>{item.icon}</Text>
      </View>
      <View style={itemStyles.textContainer}>
        <Text style={itemStyles.label} numberOfLines={1}>
          {item.label}
        </Text>
        <Text style={itemStyles.description} numberOfLines={1}>
          {item.description}
        </Text>
      </View>
      <Text style={itemStyles.chevron}>{'\u203A'}</Text>
    </TouchableOpacity>
  );
};

const itemStyles = StyleSheet.create({
  card: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    flexDirection: 'column',
    minHeight: 100,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary + '10',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  icon: {
    fontSize: 20,
  },
  textContainer: {
    flex: 1,
    marginBottom: spacing.xs,
  },
  label: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  description: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 15,
  },
  chevron: {
    ...typography.h4,
    color: colors.textLight,
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
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
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

      <View style={{ height: spacing.xxxl }} />
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
    paddingBottom: spacing.xxxl,
  },
  header: {
    backgroundColor: colors.surface,
    paddingTop: Platform.OS === 'ios' ? 56 : spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.text,
  },
  headerSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
  },
  serverInfo: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.base,
  },
  serverText: {
    ...typography.caption,
    color: colors.textLight,
    marginBottom: 4,
  },
  versionText: {
    ...typography.caption,
    color: colors.textLight,
  },
  logoutButton: {
    marginHorizontal: spacing.base,
    backgroundColor: colors.danger + '10',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.danger + '30',
    paddingVertical: spacing.base,
    alignItems: 'center',
  },
  logoutText: {
    ...typography.button,
    color: colors.danger,
    fontWeight: '700',
  },
});

export default AdminMoreScreen;
