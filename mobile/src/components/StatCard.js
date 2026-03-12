import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';
import { shadows } from '../theme/shadows';

const StatCard = ({
  label,
  value,
  icon,
  iconName,
  color = colors.primary,
  trend,
  trendValue,
  onPress,
}) => {
  const getTrendIconName = () => {
    if (trend === 'up') return 'arrow-up';
    if (trend === 'down') return 'arrow-down';
    return 'arrow-forward';
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
          {(iconName || icon) && (
            <View style={[styles.iconContainer, { backgroundColor: color + '15' }]}>
              {iconName ? (
                <Ionicons name={iconName} size={20} color={color} />
              ) : (
                <Text style={[styles.iconText, { color }]}>{icon}</Text>
              )}
            </View>
          )}
          {trend && trendValue && (
            <View style={[styles.trendBadge, { backgroundColor: getTrendColor() + '15' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name={getTrendIconName()} size={10} color={getTrendColor()} />
                <Text style={[styles.trendText, { color: getTrendColor(), marginLeft: 2 }]}>
                  {trendValue}
                </Text>
              </View>
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
    borderRadius: borderRadius.md,
  },
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    ...shadows.sm,
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
    marginBottom: spacing.xs,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 16,
  },
  trendBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  trendText: {
    ...typography.caption,
    fontWeight: '600',
  },
  value: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 2,
  },
  label: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
});

export default StatCard;
