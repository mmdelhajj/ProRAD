import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Modal,
} from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { LoadingScreen, EmptyState, Card, SectionHeader } from '../../components';
import { backupApi } from '../../services/api';
import { formatBytes, formatDate, getTimeAgo } from '../../utils/format';

// ---------------------------------------------------------------------------
// Backup type badge color
// ---------------------------------------------------------------------------

function getTypeBadge(type) {
  switch (type?.toLowerCase()) {
    case 'manual':
      return { bg: colors.primary + '18', text: colors.primary, label: 'Manual' };
    case 'scheduled':
    case 'auto':
      return { bg: colors.success + '18', text: colors.success, label: 'Scheduled' };
    case 'cloud':
      return { bg: colors.info + '18', text: colors.info, label: 'Cloud' };
    default:
      return { bg: colors.textLight + '18', text: colors.textSecondary, label: type || 'Unknown' };
  }
}

// ---------------------------------------------------------------------------
// Backup Row
// ---------------------------------------------------------------------------

const BackupRow = ({ item, onRestore, onDelete, isRestoring, isDeleting }) => {
  const filename = item.filename || item.file_name || item.name || 'Unknown';
  const size = item.size || item.file_size || item.size_bytes || 0;
  const date = item.created_at || item.date || item.timestamp;
  const backupType = item.backup_type || item.type || 'manual';
  const badge = getTypeBadge(backupType);

  return (
    <View style={rowStyles.container}>
      <View style={rowStyles.header}>
        <View style={rowStyles.iconBg}>
          <Text style={rowStyles.icon}>{'\uD83D\uDCBE'}</Text>
        </View>
        <View style={rowStyles.info}>
          <Text style={rowStyles.filename} numberOfLines={1}>
            {filename}
          </Text>
          <View style={rowStyles.metaRow}>
            <Text style={rowStyles.meta}>{formatBytes(size)}</Text>
            <Text style={rowStyles.metaDot}>{'\u2022'}</Text>
            <Text style={rowStyles.meta}>{date ? getTimeAgo(date) : '-'}</Text>
          </View>
        </View>
        <View style={[rowStyles.typeBadge, { backgroundColor: badge.bg }]}>
          <Text style={[rowStyles.typeText, { color: badge.text }]}>{badge.label}</Text>
        </View>
      </View>

      {/* Full date */}
      {date ? (
        <Text style={rowStyles.fullDate}>{formatDate(date)}</Text>
      ) : null}

      {/* Actions */}
      <View style={rowStyles.actions}>
        <TouchableOpacity
          style={[rowStyles.actionButton, rowStyles.restoreButton]}
          onPress={() => onRestore(item)}
          disabled={isRestoring}
          activeOpacity={0.7}
        >
          {isRestoring ? (
            <ActivityIndicator size="small" color={colors.warning} />
          ) : (
            <Text style={[rowStyles.actionText, { color: colors.warning }]}>Restore</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[rowStyles.actionButton, rowStyles.deleteButton]}
          onPress={() => onDelete(item)}
          disabled={isDeleting}
          activeOpacity={0.7}
        >
          {isDeleting ? (
            <ActivityIndicator size="small" color={colors.danger} />
          ) : (
            <Text style={[rowStyles.actionText, { color: colors.danger }]}>Delete</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const rowStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    padding: spacing.base,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBg: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  icon: {
    fontSize: 18,
  },
  info: {
    flex: 1,
  },
  filename: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  meta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  metaDot: {
    ...typography.caption,
    color: colors.textLight,
    marginHorizontal: spacing.xs,
  },
  typeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginLeft: spacing.sm,
  },
  typeText: {
    ...typography.caption,
    fontWeight: '600',
  },
  fullDate: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: spacing.sm,
    marginLeft: 52, // align with text after icon
  },
  actions: {
    flexDirection: 'row',
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.md,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginHorizontal: spacing.xs,
  },
  restoreButton: {
    backgroundColor: colors.warning + '12',
    borderWidth: 1,
    borderColor: colors.warning + '30',
  },
  deleteButton: {
    backgroundColor: colors.danger + '12',
    borderWidth: 1,
    borderColor: colors.danger + '30',
  },
  actionText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
});

// ---------------------------------------------------------------------------
// Schedule Row
// ---------------------------------------------------------------------------

const ScheduleRow = ({ schedule }) => {
  const name = schedule.name || schedule.schedule_name || 'Unnamed Schedule';
  const frequency = schedule.frequency || schedule.schedule || '-';
  const time = schedule.time_of_day || schedule.time || '-';
  const lastRun = schedule.last_run_at || schedule.last_run;
  const nextRun = schedule.next_run_at || schedule.next_run;
  const isEnabled = schedule.is_active !== false && schedule.enabled !== false;

  return (
    <View style={scheduleStyles.row}>
      <View style={scheduleStyles.left}>
        <View style={scheduleStyles.nameRow}>
          <View
            style={[
              scheduleStyles.dot,
              { backgroundColor: isEnabled ? colors.success : colors.textLight },
            ]}
          />
          <Text style={scheduleStyles.name}>{name}</Text>
        </View>
        <Text style={scheduleStyles.detail}>
          {frequency} at {time}
        </Text>
      </View>
      <View style={scheduleStyles.right}>
        {lastRun ? (
          <Text style={scheduleStyles.detail}>Last: {getTimeAgo(lastRun)}</Text>
        ) : null}
        {nextRun ? (
          <Text style={scheduleStyles.detail}>Next: {formatDate(nextRun, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
        ) : null}
      </View>
    </View>
  );
};

const scheduleStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  left: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  name: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  detail: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    marginLeft: spacing.base + spacing.sm,
  },
  right: {
    alignItems: 'flex-end',
  },
});

// ---------------------------------------------------------------------------
// Progress Modal
// ---------------------------------------------------------------------------

const ProgressModal = ({ visible, title, message }) => (
  <Modal visible={visible} transparent animationType="fade">
    <View style={progressStyles.overlay}>
      <View style={progressStyles.card}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={progressStyles.title}>{title}</Text>
        {message ? <Text style={progressStyles.message}>{message}</Text> : null}
      </View>
    </View>
  </Modal>
);

const progressStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xxl,
    alignItems: 'center',
    width: 260,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  title: {
    ...typography.h4,
    color: colors.text,
    marginTop: spacing.base,
  },
  message: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});

// ---------------------------------------------------------------------------
// BackupsScreen
// ---------------------------------------------------------------------------

const BackupsScreen = ({ navigation }) => {
  const [backups, setBackups] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [restoringFile, setRestoringFile] = useState(null);
  const [deletingFile, setDeletingFile] = useState(null);
  const [progressModal, setProgressModal] = useState({ visible: false, title: '', message: '' });

  // -----------------------------------------------------------------------
  // Fetch data
  // -----------------------------------------------------------------------

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const [backupsRes, schedulesRes] = await Promise.all([
        backupApi.list().catch(() => null),
        backupApi.schedules().catch(() => null),
      ]);

      if (backupsRes?.data) {
        const data = backupsRes.data.data || backupsRes.data.backups || backupsRes.data;
        setBackups(Array.isArray(data) ? data : []);
      }

      if (schedulesRes?.data) {
        const data = schedulesRes.data.data || schedulesRes.data.schedules || schedulesRes.data;
        setSchedules(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('BackupsScreen fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchData(true);
  }, [fetchData]);

  // -----------------------------------------------------------------------
  // Create backup
  // -----------------------------------------------------------------------

  const handleCreate = async () => {
    Alert.alert(
      'Create Backup',
      'This will create a new database backup. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: async () => {
            setIsCreating(true);
            setProgressModal({
              visible: true,
              title: 'Creating Backup',
              message: 'Please wait while the backup is being created...',
            });
            try {
              await backupApi.create();
              setProgressModal({ visible: false, title: '', message: '' });
              Alert.alert('Success', 'Backup created successfully.');
              fetchData(true);
            } catch (err) {
              setProgressModal({ visible: false, title: '', message: '' });
              Alert.alert('Error', err.message || 'Failed to create backup.');
            } finally {
              setIsCreating(false);
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  // -----------------------------------------------------------------------
  // Restore backup
  // -----------------------------------------------------------------------

  const handleRestore = (item) => {
    const filename = item.filename || item.file_name || item.name;
    Alert.alert(
      'Restore Backup',
      `Are you sure you want to restore "${filename}"?\n\nThis will replace the current database with the backup data. This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            setRestoringFile(filename);
            setProgressModal({
              visible: true,
              title: 'Restoring Backup',
              message: 'Decrypting and restoring database...',
            });
            try {
              await backupApi.restore(filename);
              setProgressModal({ visible: false, title: '', message: '' });
              Alert.alert('Success', 'Backup restored successfully. The system may restart.');
            } catch (err) {
              setProgressModal({ visible: false, title: '', message: '' });
              Alert.alert('Error', err.message || 'Failed to restore backup.');
            } finally {
              setRestoringFile(null);
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  // -----------------------------------------------------------------------
  // Delete backup
  // -----------------------------------------------------------------------

  const handleDelete = (item) => {
    const filename = item.filename || item.file_name || item.name;
    Alert.alert(
      'Delete Backup',
      `Are you sure you want to delete "${filename}"?\n\nThis action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingFile(filename);
            try {
              await backupApi.delete(filename);
              Alert.alert('Success', 'Backup deleted successfully.');
              fetchData(true);
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to delete backup.');
            } finally {
              setDeletingFile(null);
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  // -----------------------------------------------------------------------
  // Loading
  // -----------------------------------------------------------------------

  if (isLoading) {
    return <LoadingScreen message="Loading backups..." />;
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const renderBackup = ({ item }) => {
    const filename = item.filename || item.file_name || item.name;
    return (
      <BackupRow
        item={item}
        onRestore={handleRestore}
        onDelete={handleDelete}
        isRestoring={restoringFile === filename}
        isDeleting={deletingFile === filename}
      />
    );
  };

  const ListHeader = () => (
    <>
      {/* Create Backup Button */}
      <TouchableOpacity
        style={[styles.createButton, isCreating && styles.createButtonDisabled]}
        onPress={handleCreate}
        disabled={isCreating}
        activeOpacity={0.7}
      >
        {isCreating ? (
          <ActivityIndicator size="small" color={colors.textInverse} />
        ) : (
          <>
            <Text style={styles.createIcon}>{'\uFF0B'}</Text>
            <Text style={styles.createText}>Create Backup</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Backup Schedules */}
      {schedules.length > 0 && (
        <Card
          title="Backup Schedules"
          style={styles.schedulesCard}
        >
          {schedules.map((schedule, index) => (
            <ScheduleRow key={schedule.id || index} schedule={schedule} />
          ))}
        </Card>
      )}

      {/* Backup Files Header */}
      <SectionHeader title={`Backup Files (${backups.length})`} />
    </>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={backups}
        renderItem={renderBackup}
        keyExtractor={(item, index) => item.id?.toString() || item.filename || item.file_name || String(index)}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          <EmptyState
            icon={'\uD83D\uDCBE'}
            title="No Backups"
            message="No backup files found. Create your first backup to protect your data."
            actionLabel="Create Backup"
            onAction={handleCreate}
          />
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Progress Modal */}
      <ProgressModal
        visible={progressModal.visible}
        title={progressModal.title}
        message={progressModal.message}
      />
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingTop: spacing.base,
    paddingBottom: spacing.tabBar,
  },
  createButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.base,
    marginBottom: spacing.base,
    paddingVertical: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createIcon: {
    fontSize: 20,
    color: colors.textInverse,
    marginRight: spacing.sm,
    fontWeight: '600',
  },
  createText: {
    ...typography.button,
    color: colors.textInverse,
    fontSize: 16,
  },
  schedulesCard: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
});

export default BackupsScreen;
