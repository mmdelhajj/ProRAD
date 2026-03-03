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
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { shadows } from '../../theme/shadows';
import useAuthStore from '../../store/authStore';
import { getBaseURL } from '../../services/api';

// ---------------------------------------------------------------------------
// Menu item definitions for resellers
// ---------------------------------------------------------------------------

const MENU_ITEMS = [
  {
    key: 'Resellers',
    icon: '\uD83D\uDC65',
    label: 'Sub-Resellers',
    description: 'Manage sub-resellers',
    route: 'Resellers',
    permission: 'resellers.view',
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
    key: 'WhatsApp',
    icon: '\uD83D\uDCAC',
    label: 'WhatsApp',
    description: 'Messaging & notifications',
    route: 'WhatsApp',
    permission: 'notifications.whatsapp',
  },
  {
    key: 'Branding',
    icon: '\uD83C\uDFA8',
    label: 'Branding',
    description: 'Customize your portal',
    route: 'Branding',
  },
  {
    key: 'Invoices',
    icon: '\uD83D\uDCC4',
    label: 'Invoices',
    description: 'View invoice history',
    route: 'Invoices',
    permission: 'invoices.view',
  },
  {
    key: 'Prepaid',
    icon: '\uD83D\uDCB3',
    label: 'Prepaid Cards',
    description: 'Manage prepaid cards',
    route: 'Prepaid',
    permission: 'prepaid.view',
  },
  {
    key: 'Reports',
    icon: '\uD83D\uDCCA',
    label: 'Reports',
    description: 'Subscriber reports',
    route: 'Reports',
    permission: 'reports.view',
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
    fontSize: 16,
  },
  textContainer: {
    flex: 1,
    marginBottom: 1,
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
    ...typography.h4,
    color: colors.textLight,
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
  },
});

// ---------------------------------------------------------------------------
// ResellerMoreScreen
// ---------------------------------------------------------------------------

const ResellerMoreScreen = ({ navigation }) => {
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
          {user?.username || user?.name || 'Reseller'}
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
    paddingTop: Platform.OS === 'ios' ? 40 : spacing.md,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
  logoutText: {
    ...typography.button,
    color: colors.danger,
    fontWeight: '700',
  },
});

export default ResellerMoreScreen;
