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
import StatusBadge from './StatusBadge';

const formatBytes = (bytes) => {
  if (bytes === 0 || bytes == null) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  const idx = Math.min(i, units.length - 1);
  const val = bytes / Math.pow(k, idx);
  return `${val.toFixed(val >= 100 ? 0 : val >= 10 ? 1 : 2)} ${units[idx]}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '--';
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  return `${month}/${day}/${year}`;
};

const getStatusKey = (subscriber) => {
  if (!subscriber) return 'inactive';
  if (subscriber.status === 'expired') return 'expired';
  if (subscriber.status === 'inactive') return 'inactive';
  if (subscriber.is_online) return 'online';
  return 'offline';
};

const SubscriberRow = ({ subscriber, onPress }) => {
  if (!subscriber) return null;

  const statusKey = getStatusKey(subscriber);
  const isOnline = subscriber.is_online;

  const dailyPercent =
    subscriber.daily_quota && subscriber.daily_quota > 0
      ? Math.round((subscriber.daily_download_used / subscriber.daily_quota) * 100)
      : null;

  const dailyUsed = subscriber.daily_download_used || 0;
  const monthlyUsed = subscriber.monthly_download_used || subscriber.monthly_quota_used || 0;

  return (
    <TouchableOpacity
      activeOpacity={0.65}
      onPress={() => onPress?.(subscriber)}
      style={styles.container}
    >
      <View style={styles.row}>
        {/* Online dot */}
        <View
          style={[
            styles.onlineDot,
            { backgroundColor: isOnline ? colors.online : colors.offline },
          ]}
        />

        {/* Main content */}
        <View style={styles.content}>
          <View style={styles.topRow}>
            <View style={styles.nameBlock}>
              <Text style={styles.username} numberOfLines={1}>
                {subscriber.username || '--'}
              </Text>
              {subscriber.full_name ? (
                <Text style={styles.fullName} numberOfLines={1}>
                  {subscriber.full_name}
                </Text>
              ) : null}
            </View>
            <StatusBadge status={statusKey} />
          </View>

          <View style={styles.bottomRow}>
            {subscriber.service_name ? (
              <View style={styles.infoChip}>
                <Text style={styles.infoChipText}>{subscriber.service_name}</Text>
              </View>
            ) : null}

            {subscriber.ip_address && isOnline ? (
              <Text style={styles.ipText}>{subscriber.ip_address}</Text>
            ) : null}

            {dailyPercent !== null && (
              <View style={styles.quotaContainer}>
                <View style={styles.quotaTrack}>
                  <View
                    style={[
                      styles.quotaBar,
                      {
                        width: `${Math.min(dailyPercent, 100)}%`,
                        backgroundColor:
                          dailyPercent >= 95
                            ? colors.danger
                            : dailyPercent >= 80
                            ? colors.warning
                            : colors.success,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.quotaText}>{dailyPercent}%</Text>
              </View>
            )}
          </View>

          {/* Usage row - daily and monthly */}
          {(dailyUsed > 0 || monthlyUsed > 0) ? (
            <View style={styles.usageRow}>
              {dailyUsed > 0 ? (
                <Text style={styles.usageText}>
                  {'\u2193'} Today: {formatBytes(dailyUsed)}
                </Text>
              ) : null}
              {monthlyUsed > 0 ? (
                <Text style={styles.usageText}>
                  {'\u{1F4C5}'} Month: {formatBytes(monthlyUsed)}
                </Text>
              ) : null}
            </View>
          ) : null}

          {subscriber.expiry_date && (
            <Text style={styles.expiryText}>
              Exp: {formatDate(subscriber.expiry_date)}
            </Text>
          )}
        </View>

        {/* Chevron */}
        <Text style={styles.chevron}>{'\u203A'}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.md,
  },
  content: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  nameBlock: {
    flex: 1,
    marginRight: spacing.sm,
  },
  username: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  fullName: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  infoChip: {
    backgroundColor: colors.primaryLight + '12',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  infoChipText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '500',
  },
  ipText: {
    ...typography.caption,
    color: colors.textLight,
    fontFamily: 'monospace',
  },
  quotaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quotaTrack: {
    width: 40,
    height: 4,
    backgroundColor: colors.borderLight,
    borderRadius: 2,
    overflow: 'hidden',
    marginRight: 4,
  },
  quotaBar: {
    height: '100%',
    borderRadius: 2,
  },
  quotaText: {
    ...typography.caption,
    color: colors.textLight,
    fontSize: 10,
  },
  usageRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  usageText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
  },
  expiryText: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: spacing.xs,
  },
  chevron: {
    fontSize: 22,
    color: colors.textLight,
    marginLeft: spacing.sm,
    fontWeight: '300',
  },
});

export default SubscriberRow;
