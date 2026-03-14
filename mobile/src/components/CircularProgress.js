import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const formatBytes = (bytes) => {
  if (bytes === 0 || bytes == null) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  const idx = Math.min(i, units.length - 1);
  const val = bytes / Math.pow(k, idx);
  return `${val.toFixed(val >= 100 ? 0 : val >= 10 ? 1 : 2)} ${units[idx]}`;
};

const CircularProgress = ({
  value = 0,
  total = 0,
  label,
  size = 110,
  strokeWidth = 10,
  warningThreshold = 80,
  dangerThreshold = 95,
}) => {
  const animValue = useRef(new Animated.Value(0)).current;

  const percentage = total > 0 ? Math.min((value / total) * 100, 100) : 0;
  const roundedPercent = Math.round(percentage * 10) / 10;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const getColor = () => {
    if (percentage >= dangerThreshold) return colors.danger;
    if (percentage >= warningThreshold) return colors.warning;
    return colors.success;
  };

  const ringColor = getColor();

  useEffect(() => {
    animValue.setValue(0);
    Animated.timing(animValue, {
      toValue: percentage,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [percentage]);

  const animatedDashoffset = animValue.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
    extrapolate: 'clamp',
  });

  const center = size / 2;

  return (
    <View style={styles.container}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          {/* Background track */}
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={colors.borderLight}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Foreground arc */}
          <AnimatedCircle
            cx={center}
            cy={center}
            r={radius}
            stroke={ringColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={animatedDashoffset}
            transform={`rotate(-90 ${center} ${center})`}
          />
        </Svg>
        {/* Center percentage */}
        <View style={[styles.centerLabel, { width: size, height: size }]}>
          <Text style={[styles.percentText, { color: ringColor }]}>
            {roundedPercent}%
          </Text>
        </View>
      </View>

      {/* Bytes text */}
      <Text style={styles.bytesText}>
        {formatBytes(value)}
        {total > 0 ? ` / ${formatBytes(total)}` : ''}
      </Text>

      {/* Label */}
      {label && <Text style={styles.label}>{label}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  centerLabel: {
    position: 'absolute',
    top: 0,
    left: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  percentText: {
    ...typography.h3,
    fontWeight: '700',
  },
  bytesText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});

export default CircularProgress;
