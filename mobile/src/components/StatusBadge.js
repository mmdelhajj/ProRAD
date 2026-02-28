import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';

const STATUS_CONFIG = {
  online: {
    backgroundColor: colors.online + '18',
    textColor: colors.online,
    label: 'Online',
  },
  offline: {
    backgroundColor: colors.offline + '18',
    textColor: colors.offline,
    label: 'Offline',
  },
  active: {
    backgroundColor: colors.success + '18',
    textColor: colors.success,
    label: 'Active',
  },
  inactive: {
    backgroundColor: colors.inactive + '18',
    textColor: colors.inactive,
    label: 'Inactive',
  },
  expired: {
    backgroundColor: colors.expired + '18',
    textColor: colors.expired,
    label: 'Expired',
  },
  fup0: {
    backgroundColor: colors.fup0 + '18',
    textColor: colors.fup0,
    label: 'FUP 0',
  },
  fup1: {
    backgroundColor: colors.fup1 + '18',
    textColor: colors.fup1,
    label: 'FUP 1',
  },
  fup2: {
    backgroundColor: colors.fup2 + '18',
    textColor: colors.fup2,
    label: 'FUP 2',
  },
  fup3: {
    backgroundColor: colors.fup3 + '18',
    textColor: colors.fup3,
    label: 'FUP 3',
  },
};

const StatusBadge = ({ status, label: customLabel }) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.inactive;
  const displayLabel = customLabel || config.label;

  return (
    <View style={[styles.badge, { backgroundColor: config.backgroundColor }]}>
      <View style={[styles.dot, { backgroundColor: config.textColor }]} />
      <Text style={[styles.text, { color: config.textColor }]}>
        {displayLabel}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.xs + 1,
  },
  text: {
    ...typography.caption,
    fontWeight: '600',
  },
});

export default StatusBadge;
