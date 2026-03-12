import React from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';
import { shadows } from '../theme/shadows';

const LoadingScreen = ({ message }) => {
  return (
    <LinearGradient
      colors={colors.gradients.dark}
      style={styles.container}
    >
      <View style={styles.logoContainer}>
        <View style={styles.logoBadge}>
          <Ionicons name="globe-outline" size={28} color="#ffffff" />
        </View>
        <Text style={styles.brandName}>ProxPanel</Text>
      </View>
      <ActivityIndicator
        size="large"
        color="#ffffff"
        style={styles.spinner}
      />
      <Text style={styles.message}>
        {message || 'Loading...'}
      </Text>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  brandName: {
    ...typography.h3,
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  spinner: {
    marginBottom: spacing.base,
  },
  message: {
    ...typography.body,
    color: 'rgba(255,255,255,0.7)',
  },
});

export default LoadingScreen;
