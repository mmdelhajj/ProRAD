import React from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';
import { shadows } from '../theme/shadows';

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
    marginBottom: spacing.xl,
  },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.md,
  },
  logoText: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textInverse,
    letterSpacing: -1,
  },
  brandName: {
    ...typography.h3,
    color: colors.text,
    letterSpacing: 0.3,
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
