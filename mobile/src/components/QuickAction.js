import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';

let Haptics;
try {
  Haptics = require('expo-haptics');
} catch (e) {
  Haptics = null;
}

const QuickAction = ({
  icon,
  label,
  color = colors.primary,
  onPress,
}) => {
  const handlePress = useCallback(() => {
    if (Haptics && Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    onPress?.();
  }, [onPress]);

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handlePress}
      style={styles.container}
    >
      <View style={[styles.iconCircle, { backgroundColor: color + '12' }]}>
        <Text style={[styles.iconText, { color }]}>{icon}</Text>
      </View>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    width: 72,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  iconText: {
    fontSize: 20,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 15,
  },
});

export default QuickAction;
