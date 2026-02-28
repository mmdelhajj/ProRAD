import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
} from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';

const formatBytes = (bytes) => {
  if (bytes === 0 || bytes == null) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  const idx = Math.min(i, units.length - 1);
  const val = bytes / Math.pow(k, idx);
  return `${val.toFixed(val >= 100 ? 0 : val >= 10 ? 1 : 2)} ${units[idx]}`;
};

const ProgressBar = ({
  value = 0,
  total = 0,
  label,
  showPercentage = true,
  color,
  warningThreshold = 80,
  dangerThreshold = 95,
}) => {
  const animWidth = useRef(new Animated.Value(0)).current;

  const percentage = total > 0 ? Math.min((value / total) * 100, 100) : 0;
  const roundedPercent = Math.round(percentage * 10) / 10;

  const getBarColor = () => {
    if (color) return color;
    if (percentage >= dangerThreshold) return colors.danger;
    if (percentage >= warningThreshold) return colors.warning;
    return colors.success;
  };

  const barColor = getBarColor();

  useEffect(() => {
    Animated.timing(animWidth, {
      toValue: percentage,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [percentage, animWidth]);

  const animatedBarWidth = animWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      {(label || showPercentage) && (
        <View style={styles.headerRow}>
          {label && (
            <Text style={styles.label}>{label}</Text>
          )}
          {showPercentage && (
            <Text style={[styles.percentage, { color: barColor }]}>
              {roundedPercent}%
            </Text>
          )}
        </View>
      )}

      <View style={styles.trackOuter}>
        <Animated.View
          style={[
            styles.bar,
            {
              width: animatedBarWidth,
              backgroundColor: barColor,
            },
          ]}
        />
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.usageText}>
          {formatBytes(value)}
        </Text>
        <Text style={styles.totalText}>
          / {formatBytes(total)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  label: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  percentage: {
    ...typography.bodySmall,
    fontWeight: '700',
  },
  trackOuter: {
    height: 8,
    backgroundColor: colors.borderLight,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs + 1,
  },
  usageText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
  },
  totalText: {
    ...typography.caption,
    color: colors.textLight,
    marginLeft: 3,
  },
});

export default ProgressBar;
