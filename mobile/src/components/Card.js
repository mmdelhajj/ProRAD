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
import { shadows } from '../theme/shadows';

const Card = ({
  title,
  subtitle,
  icon,
  badge,
  badgeColor,
  children,
  onPress,
  style,
}) => {
  const content = (
    <View style={[styles.container, style]}>
      {(title || icon || badge) && (
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {icon && <View style={styles.iconWrapper}>{icon}</View>}
            <View style={styles.titleContainer}>
              {title && (
                <Text style={styles.title} numberOfLines={1}>
                  {title}
                </Text>
              )}
              {subtitle && (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              )}
            </View>
          </View>
          {badge && (
            <View
              style={[
                styles.badge,
                { backgroundColor: badgeColor || colors.primary },
              ]}
            >
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          )}
        </View>
      )}
      {children && <View style={styles.body}>{children}</View>}
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
    borderRadius: borderRadius.md,
  },
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconWrapper: {
    marginRight: spacing.md,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    ...typography.h4,
    color: colors.text,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    marginLeft: spacing.sm,
  },
  badgeText: {
    ...typography.caption,
    color: colors.textInverse,
    fontWeight: '600',
  },
  body: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
  },
});

export default Card;
