import React from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

const LoadingScreen = ({ message }) => {
  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoText}>P</Text>
        </View>
        <Text style={styles.brandName}>ProxPanel</Text>
      </View>
      <ActivityIndicator
        size="large"
        color={colors.primary}
        style={styles.spinner}
      />
      <Text style={styles.message}>
        {message || 'Loading...'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.textInverse,
    letterSpacing: -1,
  },
  brandName: {
    ...typography.h3,
    color: colors.text,
    letterSpacing: 0.5,
  },
  spinner: {
    marginBottom: spacing.base,
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
  },
});

export default LoadingScreen;
