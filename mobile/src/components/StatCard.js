import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';

const StatCard = ({
  label,
  value,
  icon,
  color = colors.primary,
  trend,
  trendValue,
  onPress,
}) => {
  const getTrendIcon = () => {
    if (trend === 'up') return '\u2191';
    if (trend === 'down') return '\u2193';
    return '\u2192';
  };

  const getTrendColor = () => {
    if (trend === 'up') return colors.success;
    if (trend === 'down') return colors.danger;
    return colors.textSecondary;
  };

  const content = (
    <View style={styles.container}>
      <View style={[styles.topBorder, { backgroundColor: color }]} />
      <View style={styles.body}>
        <View style={styles.headerRow}>
          {icon && (
            <View style={[styles.iconContainer, { backgroundColor: color + '15' }]}>
              <Text style={[styles.iconText, { color }]}>{icon}</Text>
            </View>
          )}
          {trend && trendValue && (
            <View style={[styles.trendBadge, { backgroundColor: getTrendColor() + '15' }]}>
              <Text style={[styles.trendText, { color: getTrendColor() }]}>
                {getTrendIcon()} {trendValue}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        style={styles.touchable}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  touchable: {
    flex: 1,
    borderRadius: borderRadius.lg,
  },
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  topBorder: {
    height: 3,
  },
  body: {
    padding: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 18,
  },
  trendBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  trendText: {
    ...typography.caption,
    fontWeight: '600',
  },
  value: {
    ...typography.h2,
    color: colors.text,
    marginBottom: 2,
  },
  label: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
});

export default StatCard;
