import React, { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, View, StyleSheet, Text, Platform, TouchableOpacity } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useAuthStore from '../store/authStore';
import useServerStore from '../store/serverStore';
import { initializeApi } from '../services/api';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';

// Auth screens
import ServerConnectScreen from '../screens/auth/ServerConnectScreen';
import LoginScreen from '../screens/auth/LoginScreen';

// Admin screens
import AdminDashboardScreen from '../screens/admin/AdminDashboard';
import AdminMoreScreen from '../screens/admin/AdminMoreScreen';
import ResellersScreen from '../screens/admin/ResellersScreen';
import NASScreen from '../screens/admin/NASScreen';
import ReportsScreen from '../screens/admin/ReportsScreen';
import BackupsScreen from '../screens/admin/BackupsScreen';
import SettingsScreen from '../screens/admin/SettingsScreen';
import AuditScreen from '../screens/admin/AuditScreen';
import TicketsScreen from '../screens/admin/TicketsScreen';
import CommunicationScreen from '../screens/admin/CommunicationScreen';
import PermissionsScreen from '../screens/admin/PermissionsScreen';
import BandwidthRulesScreen from '../screens/admin/BandwidthRulesScreen';
import PrepaidScreen from '../screens/admin/PrepaidScreen';
import UsersScreen from '../screens/admin/UsersScreen';
import CDNScreen from '../screens/admin/CDNScreen';

// Reseller screens
import ResellerDashboardScreen from '../screens/reseller/ResellerDashboard';
import ResellerMoreScreen from '../screens/reseller/ResellerMoreScreen';
import WhatsAppScreen from '../screens/reseller/WhatsAppScreen';
import BrandingScreen from '../screens/reseller/BrandingScreen';
import InvoicesScreen from '../screens/reseller/InvoicesScreen';
import ResellerPrepaidScreen from '../screens/reseller/PrepaidScreen';
import ResellerReportsScreen from '../screens/reseller/ReportsScreen';

// Customer screens
import CustomerDashboardScreen from '../screens/customer/CustomerDashboard';
import UsageScreen from '../screens/customer/CustomerUsageScreen';
import TicketListScreen from '../screens/customer/CustomerTicketsScreen';
import TicketDetailScreen from '../screens/customer/CustomerTicketDetailScreen';
import CreateTicketScreen from '../screens/customer/CreateTicketScreen';
import AccountScreen from '../screens/customer/CustomerAccountScreen';

// Shared screens
import SubscriberListScreen from '../screens/shared/SubscriberListScreen';
import SubscriberDetailScreen from '../screens/shared/SubscriberDetailScreen';
import SessionsScreen from '../screens/shared/SessionsScreen';
import ServicesScreen from '../screens/shared/ServicesScreen';
import LiveBandwidthScreen from '../screens/shared/LiveBandwidthScreen';
import SubscriberCreateEditScreen from '../screens/shared/SubscriberCreateEditScreen';

// Placeholder for screens not yet built
function PlaceholderScreen(title, icon) {
  return function Placeholder() {
    return (
      <View style={placeholderStyles.container}>
        <Text style={placeholderStyles.icon}>{icon}</Text>
        <Text style={placeholderStyles.title}>{title}</Text>
        <Text style={placeholderStyles.subtitle}>Coming soon</Text>
      </View>
    );
  };
}

const placeholderStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  icon: { fontSize: 48, marginBottom: spacing.base },
  title: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.textSecondary },
});

// Reseller tickets reuse the admin TicketsScreen
const ResellerTicketsScreen = TicketsScreen;

// ----------------------------------------------------------------
// Navigators
// ----------------------------------------------------------------

const RootStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const SubscribersStack = createNativeStackNavigator();
const AdminMoreStack = createNativeStackNavigator();
const ResellerMoreStack = createNativeStackNavigator();
const CustomerTicketsStack = createNativeStackNavigator();

// ----------------------------------------------------------------
// Tab icon helper
// ----------------------------------------------------------------

function TabIcon({ label, focused }) {
  const iconMap = {
    'Home': '\uD83C\uDFE0',
    'Subscribers': '\uD83D\uDC65',
    'Sessions': '\uD83D\uDCE1',
    'Services': '\uD83D\uDCE6',
    'More': '\u2699\uFE0F',
    'Usage': '\uD83D\uDCCA',
    'Tickets': '\uD83C\uDFAB',
    'Account': '\uD83D\uDC64',
  };

  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>
      {iconMap[label] || '\u2B55'}
    </Text>
  );
}

// ----------------------------------------------------------------
// Stack navigators nested inside tabs
// ----------------------------------------------------------------

function SubscribersStackNavigator() {
  return (
    <SubscribersStack.Navigator screenOptions={{ headerShown: false }}>
      <SubscribersStack.Screen name="SubscriberList" component={SubscriberListScreen} />
      <SubscribersStack.Screen
        name="SubscriberDetail"
        component={SubscriberDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <SubscribersStack.Screen
        name="SubscriberCreateEdit"
        component={SubscriberCreateEditScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <SubscribersStack.Screen
        name="LiveBandwidth"
        component={LiveBandwidthScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </SubscribersStack.Navigator>
  );
}

function AdminMoreStackNavigator() {
  return (
    <AdminMoreStack.Navigator screenOptions={{ headerShown: false }}>
      <AdminMoreStack.Screen name="MoreMenu" component={AdminMoreScreen} />
      <AdminMoreStack.Screen name="Resellers" component={ResellersScreen} options={{ animation: 'slide_from_right' }} />
      <AdminMoreStack.Screen name="NAS" component={NASScreen} options={{ animation: 'slide_from_right' }} />
      <AdminMoreStack.Screen name="Reports" component={ReportsScreen} options={{ animation: 'slide_from_right' }} />
      <AdminMoreStack.Screen name="Backups" component={BackupsScreen} options={{ animation: 'slide_from_right' }} />
      <AdminMoreStack.Screen name="Settings" component={SettingsScreen} options={{ animation: 'slide_from_right' }} />
      <AdminMoreStack.Screen name="Audit" component={AuditScreen} options={{ animation: 'slide_from_right' }} />
      <AdminMoreStack.Screen name="Tickets" component={TicketsScreen} options={{ animation: 'slide_from_right' }} />
      <AdminMoreStack.Screen name="Communication" component={CommunicationScreen} options={{ animation: 'slide_from_right' }} />
      <AdminMoreStack.Screen name="Permissions" component={PermissionsScreen} options={{ animation: 'slide_from_right' }} />
      <AdminMoreStack.Screen name="BandwidthRules" component={BandwidthRulesScreen} options={{ animation: 'slide_from_right' }} />
      <AdminMoreStack.Screen name="Prepaid" component={PrepaidScreen} options={{ animation: 'slide_from_right' }} />
      <AdminMoreStack.Screen name="Users" component={UsersScreen} options={{ animation: 'slide_from_right' }} />
      <AdminMoreStack.Screen name="CDN" component={CDNScreen} options={{ animation: 'slide_from_right' }} />
    </AdminMoreStack.Navigator>
  );
}

function ResellerMoreStackNavigator() {
  return (
    <ResellerMoreStack.Navigator screenOptions={{ headerShown: false }}>
      <ResellerMoreStack.Screen name="MoreMenu" component={ResellerMoreScreen} />
      <ResellerMoreStack.Screen name="Resellers" component={ResellersScreen} options={{ animation: 'slide_from_right' }} />
      <ResellerMoreStack.Screen name="Tickets" component={ResellerTicketsScreen} options={{ animation: 'slide_from_right' }} />
      <ResellerMoreStack.Screen name="WhatsApp" component={WhatsAppScreen} options={{ animation: 'slide_from_right' }} />
      <ResellerMoreStack.Screen name="Branding" component={BrandingScreen} options={{ animation: 'slide_from_right' }} />
      <ResellerMoreStack.Screen name="Invoices" component={InvoicesScreen} options={{ animation: 'slide_from_right' }} />
      <ResellerMoreStack.Screen name="Prepaid" component={ResellerPrepaidScreen} options={{ animation: 'slide_from_right' }} />
      <ResellerMoreStack.Screen name="Reports" component={ResellerReportsScreen} options={{ animation: 'slide_from_right' }} />
    </ResellerMoreStack.Navigator>
  );
}

function CustomerTicketsStackNavigator() {
  return (
    <CustomerTicketsStack.Navigator screenOptions={{ headerShown: false }}>
      <CustomerTicketsStack.Screen name="TicketList" component={TicketListScreen} />
      <CustomerTicketsStack.Screen
        name="TicketDetail"
        component={TicketDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <CustomerTicketsStack.Screen
        name="CreateTicket"
        component={CreateTicketScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
    </CustomerTicketsStack.Navigator>
  );
}

// ----------------------------------------------------------------
// Tab bar options
// ----------------------------------------------------------------

const tabBarScreenOptions = {
  headerShown: false,
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.textLight,
  tabBarStyle: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: Platform.OS === 'ios' ? 0 : spacing.xs,
    height: Platform.OS === 'ios' ? 88 : 64,
  },
  tabBarLabelStyle: {
    ...typography.tabBar,
  },
};

// ----------------------------------------------------------------
// Impersonation Banner
// ----------------------------------------------------------------

function ImpersonationBanner() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const impersonatedFrom = useAuthStore((s) => s.impersonatedFrom);
  const stopImpersonation = useAuthStore((s) => s.stopImpersonation);
  const user = useAuthStore((s) => s.user);

  const handleBackToAdmin = useCallback(async () => {
    await stopImpersonation();
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'AdminTabs' }],
      }),
    );
  }, [stopImpersonation, navigation]);

  if (!impersonatedFrom) return null;

  const resellerName = user?.username || user?.full_name || 'Reseller';

  return (
    <View style={[impersonationStyles.banner, { paddingTop: insets.top + spacing.xs }]}>
      <Text style={impersonationStyles.text} numberOfLines={1}>
        Viewing as: {resellerName}
      </Text>
      <TouchableOpacity style={impersonationStyles.button} onPress={handleBackToAdmin}>
        <Text style={impersonationStyles.buttonText}>Back to Admin</Text>
      </TouchableOpacity>
    </View>
  );
}

const impersonationStyles = StyleSheet.create({
  banner: {
    backgroundColor: colors.warning,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.base,
  },
  text: {
    ...typography.bodySmall,
    color: '#000',
    fontWeight: '600',
    flex: 1,
    marginRight: spacing.md,
  },
  button: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.md,
  },
  buttonText: {
    ...typography.caption,
    color: '#000',
    fontWeight: '700',
  },
});

// ----------------------------------------------------------------
// Tab navigators for each role
// ----------------------------------------------------------------

function AdminTabs() {
  return (
    <Tab.Navigator screenOptions={tabBarScreenOptions}>
      <Tab.Screen
        name="Dashboard"
        component={AdminDashboardScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon label="Home" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Subscribers"
        component={SubscribersStackNavigator}
        options={{
          tabBarLabel: 'Subscribers',
          tabBarIcon: ({ focused }) => <TabIcon label="Subscribers" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Sessions"
        component={SessionsScreen}
        options={{
          tabBarLabel: 'Sessions',
          tabBarIcon: ({ focused }) => <TabIcon label="Sessions" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Services"
        component={ServicesScreen}
        options={{
          tabBarLabel: 'Services',
          tabBarIcon: ({ focused }) => <TabIcon label="Services" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="More"
        component={AdminMoreStackNavigator}
        options={{
          tabBarLabel: 'More',
          tabBarIcon: ({ focused }) => <TabIcon label="More" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

function ResellerTabsInner() {
  return (
    <Tab.Navigator screenOptions={tabBarScreenOptions}>
      <Tab.Screen
        name="Dashboard"
        component={ResellerDashboardScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon label="Home" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Subscribers"
        component={SubscribersStackNavigator}
        options={{
          tabBarLabel: 'Subscribers',
          tabBarIcon: ({ focused }) => <TabIcon label="Subscribers" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Sessions"
        component={SessionsScreen}
        options={{
          tabBarLabel: 'Sessions',
          tabBarIcon: ({ focused }) => <TabIcon label="Sessions" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="More"
        component={ResellerMoreStackNavigator}
        options={{
          tabBarLabel: 'More',
          tabBarIcon: ({ focused }) => <TabIcon label="More" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

function ResellerTabs() {
  return (
    <View style={{ flex: 1 }}>
      <ImpersonationBanner />
      <ResellerTabsInner />
    </View>
  );
}

function CustomerTabs() {
  return (
    <Tab.Navigator screenOptions={tabBarScreenOptions}>
      <Tab.Screen
        name="Dashboard"
        component={CustomerDashboardScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon label="Home" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Usage"
        component={UsageScreen}
        options={{
          tabBarLabel: 'Usage',
          tabBarIcon: ({ focused }) => <TabIcon label="Usage" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Tickets"
        component={CustomerTicketsStackNavigator}
        options={{
          tabBarLabel: 'Tickets',
          tabBarIcon: ({ focused }) => <TabIcon label="Tickets" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        options={{
          tabBarLabel: 'Account',
          tabBarIcon: ({ focused }) => <TabIcon label="Account" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

// ----------------------------------------------------------------
// Root Navigator
// ----------------------------------------------------------------

export default function AppNavigator() {
  const {
    isAuthenticated,
    userType,
    loadSession,
    error: authError,
  } = useAuthStore();
  const { serverUrl, isConnected } = useServerStore();

  const [isReady, setIsReady] = useState(false);
  const [sessionExpiredOnLoad, setSessionExpiredOnLoad] = useState(false);

  // On mount: initialize API layer and check for existing session
  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        await initializeApi();

        // If a server is saved, try to restore the session
        if (serverUrl && isConnected) {
          const restored = await loadSession();
          if (!restored && mounted) {
            // Had a token but it was invalid
            const tokenExists = await (async () => {
              const { getToken } = require('../services/api');
              return !!(await getToken());
            })();
            if (tokenExists) {
              setSessionExpiredOnLoad(true);
            }
          }
        }
      } catch (err) {
        console.error('AppNavigator bootstrap error:', err);
      } finally {
        if (mounted) setIsReady(true);
      }
    }

    bootstrap();
    return () => { mounted = false; };
  }, []);

  // Show loading screen while bootstrapping
  if (!isReady) {
    return (
      <View style={loadingStyles.container}>
        <Text style={loadingStyles.logo}>{'\uD83C\uDF10'}</Text>
        <Text style={loadingStyles.title}>ProxPanel</Text>
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={loadingStyles.spinner}
        />
      </View>
    );
  }

  // Determine the initial route
  const getInitialRouteName = () => {
    if (!serverUrl || !isConnected) return 'ServerConnect';
    if (!isAuthenticated) return 'Login';

    switch (userType) {
      case 'admin':
        return 'AdminTabs';
      case 'reseller':
        return 'ResellerTabs';
      case 'customer':
        return 'CustomerTabs';
      default:
        return 'Login';
    }
  };

  const initialRoute = getInitialRouteName();
  const loginInitialParams = sessionExpiredOnLoad ? { reason: 'expired' } : undefined;

  return (
    <RootStack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{ headerShown: false, animation: 'fade' }}
    >
      {/* Server Connect */}
      <RootStack.Screen
        name="ServerConnect"
        component={ServerConnectScreen}
        options={{ animation: 'fade' }}
      />

      {/* Login */}
      <RootStack.Screen
        name="Login"
        component={LoginScreen}
        initialParams={loginInitialParams}
        options={{ animation: 'fade', gestureEnabled: false }}
      />

      {/* Admin Tabs */}
      <RootStack.Screen
        name="AdminTabs"
        component={AdminTabs}
        options={{ animation: 'fade', gestureEnabled: false }}
      />

      {/* Reseller Tabs */}
      <RootStack.Screen
        name="ResellerTabs"
        component={ResellerTabs}
        options={{ animation: 'fade', gestureEnabled: false }}
      />

      {/* Customer Tabs */}
      <RootStack.Screen
        name="CustomerTabs"
        component={CustomerTabs}
        options={{ animation: 'fade', gestureEnabled: false }}
      />
    </RootStack.Navigator>
  );
}

const loadingStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  logo: {
    fontSize: 56,
    marginBottom: spacing.base,
  },
  title: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.xl,
  },
  spinner: {
    marginTop: spacing.base,
  },
});
