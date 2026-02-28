import React, { useEffect, useState, useCallback } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, LogBox } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { initializeApi } from './src/services/api';
import useServerStore from './src/store/serverStore';
import AppNavigator from './src/navigation/AppNavigator';
import { colors } from './src/theme/colors';
import { typography } from './src/theme/typography';
import { spacing } from './src/theme/spacing';

// Suppress non-critical warnings in development
LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
]);

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const loadServers = useServerStore((s) => s.loadServers);

  // Initialize API layer and restore persisted server on launch
  const initialize = useCallback(async () => {
    try {
      await initializeApi();
      await loadServers();
    } catch (err) {
      console.error('App initialization error:', err);
    } finally {
      setIsReady(true);
    }
  }, [loadServers]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Splash / loading while restoring state
  if (!isReady) {
    return (
      <View style={styles.splash}>
        <Text style={styles.splashLogo}>{'\uD83C\uDF10'}</Text>
        <Text style={styles.splashTitle}>ProxPanel</Text>
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={styles.splashSpinner}
        />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  splashLogo: {
    fontSize: 64,
    marginBottom: spacing.base,
  },
  splashTitle: {
    ...typography.h1,
    color: colors.text,
    marginBottom: spacing.xl,
  },
  splashSpinner: {
    marginTop: spacing.base,
  },
});
