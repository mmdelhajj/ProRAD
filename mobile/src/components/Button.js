import React, { useCallback } from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
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

const Button = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  fullWidth = false,
}) => {
  const handlePress = useCallback(() => {
    if (loading || disabled) return;
    if (Haptics && Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onPress?.();
  }, [onPress, loading, disabled]);

  const variantStyles = getVariantStyles(variant);
  const sizeStyles = getSizeStyles(size);
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={handlePress}
      disabled={isDisabled}
      style={[
        styles.base,
        variantStyles.container,
        sizeStyles.container,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        isDisabled && variantStyles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variantStyles.spinnerColor}
          style={styles.spinner}
        />
      ) : (
        <View style={styles.contentRow}>
          {icon && <View style={styles.iconWrapper}>{icon}</View>}
          <Text
            style={[
              styles.text,
              variantStyles.text,
              sizeStyles.text,
              isDisabled && styles.disabledText,
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const getVariantStyles = (variant) => {
  switch (variant) {
    case 'primary':
      return {
        container: {
          backgroundColor: colors.primary,
        },
        text: {
          color: colors.textInverse,
        },
        disabled: {
          backgroundColor: colors.primary + '66',
        },
        spinnerColor: colors.textInverse,
      };
    case 'secondary':
      return {
        container: {
          backgroundColor: colors.primaryLight + '15',
        },
        text: {
          color: colors.primary,
        },
        disabled: {
          backgroundColor: colors.primaryLight + '08',
        },
        spinnerColor: colors.primary,
      };
    case 'outline':
      return {
        container: {
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderColor: colors.border,
        },
        text: {
          color: colors.text,
        },
        disabled: {
          borderColor: colors.borderLight,
        },
        spinnerColor: colors.textSecondary,
      };
    case 'danger':
      return {
        container: {
          backgroundColor: colors.danger,
        },
        text: {
          color: colors.textInverse,
        },
        disabled: {
          backgroundColor: colors.danger + '66',
        },
        spinnerColor: colors.textInverse,
      };
    case 'ghost':
      return {
        container: {
          backgroundColor: 'transparent',
        },
        text: {
          color: colors.primary,
        },
        disabled: {},
        spinnerColor: colors.primary,
      };
    default:
      return {
        container: {
          backgroundColor: colors.primary,
        },
        text: {
          color: colors.textInverse,
        },
        disabled: {},
        spinnerColor: colors.textInverse,
      };
  }
};

const getSizeStyles = (size) => {
  switch (size) {
    case 'sm':
      return {
        container: {
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          borderRadius: borderRadius.sm,
        },
        text: {
          fontSize: 13,
        },
      };
    case 'lg':
      return {
        container: {
          paddingVertical: spacing.base,
          paddingHorizontal: spacing.xl,
          borderRadius: borderRadius.lg,
        },
        text: {
          fontSize: 17,
        },
      };
    case 'md':
    default:
      return {
        container: {
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          borderRadius: borderRadius.md,
        },
        text: {
          fontSize: 15,
        },
      };
  }
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.6,
  },
  disabledText: {
    opacity: 0.7,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    marginRight: spacing.sm,
  },
  text: {
    ...typography.button,
    textAlign: 'center',
  },
  spinner: {
    marginVertical: 2,
  },
});

export default Button;
