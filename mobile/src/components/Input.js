import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Animated,
  StyleSheet,
} from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';

const Input = ({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  secureTextEntry = false,
  icon,
  multiline = false,
  editable = true,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isSecureVisible, setIsSecureVisible] = useState(false);
  const labelAnim = useRef(new Animated.Value(value ? 1 : 0)).current;

  const hasValue = value && value.length > 0;

  useEffect(() => {
    Animated.timing(labelAnim, {
      toValue: isFocused || hasValue ? 1 : 0,
      duration: 150,
      useNativeDriver: false,
    }).start();
  }, [isFocused, hasValue, labelAnim]);

  const labelTop = labelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [multiline ? 14 : 17, -8],
  });

  const labelFontSize = labelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [15, 11],
  });

  const labelColor = labelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.textLight, error ? colors.danger : (isFocused ? colors.primary : colors.textSecondary)],
  });

  const getBorderColor = () => {
    if (error) return colors.danger;
    if (isFocused) return colors.primary;
    return colors.border;
  };

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.container,
          {
            borderColor: getBorderColor(),
            backgroundColor: editable ? colors.surface : colors.surfaceHover,
          },
          isFocused && styles.containerFocused,
          error && styles.containerError,
          multiline && styles.containerMultiline,
        ]}
      >
        {icon && <View style={styles.iconWrapper}>{icon}</View>}

        <View style={styles.inputContainer}>
          {label && (
            <Animated.Text
              style={[
                styles.label,
                {
                  top: labelTop,
                  fontSize: labelFontSize,
                  color: labelColor,
                },
              ]}
              numberOfLines={1}
            >
              {label}
            </Animated.Text>
          )}
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={isFocused || !label ? placeholder : ''}
            placeholderTextColor={colors.textLight}
            secureTextEntry={secureTextEntry && !isSecureVisible}
            multiline={multiline}
            editable={editable}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            style={[
              styles.input,
              icon && styles.inputWithIcon,
              multiline && styles.inputMultiline,
              !editable && styles.inputDisabled,
            ]}
          />
        </View>

        {secureTextEntry && (
          <TouchableOpacity
            onPress={() => setIsSecureVisible(!isSecureVisible)}
            style={styles.eyeButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.eyeText}>
              {isSecureVisible ? '\u{1F441}' : '\u{1F512}'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {error && (
        <Text style={styles.errorText}>{error}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.base,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    minHeight: 52,
    position: 'relative',
  },
  containerFocused: {
    borderWidth: 2,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  containerError: {
    borderColor: colors.danger,
  },
  containerMultiline: {
    alignItems: 'flex-start',
    minHeight: 100,
    paddingTop: spacing.md,
  },
  iconWrapper: {
    marginRight: spacing.sm,
    paddingTop: 2,
  },
  inputContainer: {
    flex: 1,
    justifyContent: 'center',
    position: 'relative',
  },
  label: {
    position: 'absolute',
    left: 0,
    backgroundColor: colors.surface,
    paddingHorizontal: 4,
    zIndex: 1,
    fontWeight: '500',
  },
  input: {
    ...typography.body,
    color: colors.text,
    paddingVertical: spacing.md,
    paddingRight: spacing.xs,
    flex: 1,
  },
  inputWithIcon: {
    paddingLeft: 0,
  },
  inputMultiline: {
    textAlignVertical: 'top',
    minHeight: 70,
    paddingTop: spacing.lg,
  },
  inputDisabled: {
    color: colors.textSecondary,
  },
  eyeButton: {
    paddingLeft: spacing.sm,
    paddingVertical: spacing.sm,
  },
  eyeText: {
    fontSize: 18,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.xs,
    marginLeft: spacing.xs,
  },
});

export default Input;
