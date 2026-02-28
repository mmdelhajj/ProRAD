import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  RefreshControl,
  TouchableOpacity,
  Modal,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { EmptyState, LoadingScreen } from '../../components';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import api, { permissionApi } from '../../services/api';

// ---------------------------------------------------------------------------
// Permission categories (for grouped UI)
// ---------------------------------------------------------------------------

const PERMISSION_CATEGORIES = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: '\uD83D\uDCCA',
    color: colors.primary,
  },
  {
    key: 'subscribers',
    label: 'Subscribers',
    icon: '\uD83D\uDC64',
    color: colors.success,
  },
  {
    key: 'services',
    label: 'Services',
    icon: '\uD83D\uDCE6',
    color: colors.info,
  },
  {
    key: 'sessions',
    label: 'Sessions',
    icon: '\uD83D\uDD17',
    color: colors.warning,
  },
  {
    key: 'nas',
    label: 'NAS / Routers',
    icon: '\uD83D\uDCE1',
    color: colors.secondary,
  },
  {
    key: 'resellers',
    label: 'Resellers',
    icon: '\uD83D\uDC65',
    color: '#8b5cf6',
  },
  {
    key: 'invoices',
    label: 'Invoices',
    icon: '\uD83D\uDCC4',
    color: colors.info,
  },
  {
    key: 'transactions',
    label: 'Transactions',
    icon: '\uD83D\uDCB0',
    color: colors.success,
  },
  {
    key: 'prepaid',
    label: 'Prepaid Cards',
    icon: '\uD83D\uDCB3',
    color: colors.warning,
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: '\uD83D\uDCC8',
    color: colors.primary,
  },
  {
    key: 'tickets',
    label: 'Tickets',
    icon: '\uD83C\uDFAB',
    color: colors.danger,
  },
  {
    key: 'backups',
    label: 'Backups',
    icon: '\uD83D\uDCBE',
    color: colors.textSecondary,
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: '\u2699\uFE0F',
    color: colors.textSecondary,
  },
  {
    key: 'audit',
    label: 'Audit',
    icon: '\uD83D\uDCCB',
    color: '#6366f1',
  },
  {
    key: 'communication',
    label: 'Communication',
    icon: '\uD83D\uDCE8',
    color: colors.info,
  },
  {
    key: 'bandwidth',
    label: 'Bandwidth',
    icon: '\u26A1',
    color: colors.warning,
  },
  {
    key: 'fup',
    label: 'FUP',
    icon: '\uD83D\uDCC9',
    color: colors.danger,
  },
  {
    key: 'sharing',
    label: 'Sharing Detection',
    icon: '\uD83D\uDD0D',
    color: colors.secondary,
  },
  {
    key: 'cdn',
    label: 'CDN',
    icon: '\uD83C\uDF10',
    color: colors.primary,
  },
  {
    key: 'permissions',
    label: 'Permissions',
    icon: '\uD83D\uDD10',
    color: '#7c3aed',
  },
  {
    key: 'users',
    label: 'Users',
    icon: '\uD83D\uDC68\u200D\uD83D\uDCBB',
    color: colors.text,
  },
];

/**
 * Group flat permission list by category prefix (e.g., "subscribers.view" => "subscribers")
 */
function groupPermissions(permissions) {
  const groups = {};
  (permissions || []).forEach((perm) => {
    const name = perm.name || perm;
    const dotIdx = name.indexOf('.');
    const category = dotIdx > 0 ? name.substring(0, dotIdx) : 'other';
    if (!groups[category]) groups[category] = [];
    groups[category].push(perm);
  });
  return groups;
}

/**
 * Pretty label for a permission name: "subscribers.view_all" => "View All"
 */
function permLabel(name) {
  const dotIdx = name.indexOf('.');
  const action = dotIdx > 0 ? name.substring(dotIdx + 1) : name;
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Group Row
// ---------------------------------------------------------------------------

const GroupRow = ({ group, onPress }) => {
  const permCount = group.permissions?.length || group.permission_count || 0;
  const resellers = group.resellers || [];

  return (
    <TouchableOpacity
      style={rowStyles.container}
      onPress={() => onPress(group)}
      activeOpacity={0.7}
    >
      <View style={rowStyles.row}>
        <View style={rowStyles.iconWrap}>
          <Text style={rowStyles.icon}>{'\uD83D\uDD10'}</Text>
        </View>
        <View style={rowStyles.info}>
          <Text style={rowStyles.name} numberOfLines={1}>
            {group.name || 'Unnamed Group'}
          </Text>
          <View style={rowStyles.tagsRow}>
            <View style={rowStyles.tag}>
              <Text style={rowStyles.tagText}>
                {permCount} permission{permCount !== 1 ? 's' : ''}
              </Text>
            </View>
            {resellers.length > 0 && (
              <View style={[rowStyles.tag, rowStyles.resellerTag]}>
                <Text style={[rowStyles.tagText, rowStyles.resellerTagText]}>
                  {resellers.length} reseller{resellers.length !== 1 ? 's' : ''}
                </Text>
              </View>
            )}
          </View>
          {resellers.length > 0 && (
            <Text style={rowStyles.resellerNames} numberOfLines={1}>
              {resellers.map((r) => r.username || r.name).join(', ')}
            </Text>
          )}
        </View>
        <Text style={rowStyles.chevron}>{'\u203A'}</Text>
      </View>
    </TouchableOpacity>
  );
};

const rowStyles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: '#7c3aed' + '12',
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
  name: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  tag: {
    backgroundColor: colors.primary + '12',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  tagText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  resellerTag: {
    backgroundColor: colors.success + '12',
  },
  resellerTagText: {
    color: colors.success,
  },
  resellerNames: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: spacing.xs,
  },
  chevron: {
    ...typography.h3,
    color: colors.textLight,
    marginLeft: spacing.sm,
  },
});

// ---------------------------------------------------------------------------
// Permission Category Section
// ---------------------------------------------------------------------------

const PermissionCategorySection = ({ category, permissions, selectedIds, onToggle }) => {
  const catMeta =
    PERMISSION_CATEGORIES.find((c) => c.key === category) || {
      label: category,
      icon: '\uD83D\uDD12',
      color: colors.textSecondary,
    };

  const allSelected = permissions.every((p) =>
    selectedIds.has(p.id || p.ID),
  );

  const toggleAll = () => {
    permissions.forEach((p) => {
      const id = p.id || p.ID;
      if (allSelected) {
        onToggle(id, false);
      } else {
        onToggle(id, true);
      }
    });
  };

  return (
    <View style={catStyles.container}>
      <TouchableOpacity
        style={catStyles.header}
        onPress={toggleAll}
        activeOpacity={0.7}
      >
        <Text style={catStyles.icon}>{catMeta.icon}</Text>
        <Text style={[catStyles.title, { color: catMeta.color }]}>
          {catMeta.label}
        </Text>
        <View
          style={[
            catStyles.selectAllBadge,
            allSelected && { backgroundColor: catMeta.color + '20' },
          ]}
        >
          <Text
            style={[
              catStyles.selectAllText,
              allSelected && { color: catMeta.color },
            ]}
          >
            {allSelected ? 'All' : 'Select All'}
          </Text>
        </View>
      </TouchableOpacity>
      {permissions.map((perm) => {
        const id = perm.id || perm.ID;
        const active = selectedIds.has(id);
        return (
          <View key={id} style={catStyles.permRow}>
            <View style={catStyles.permInfo}>
              <Text style={catStyles.permName}>
                {permLabel(perm.name)}
              </Text>
              {perm.description ? (
                <Text style={catStyles.permDesc} numberOfLines={1}>
                  {perm.description}
                </Text>
              ) : null}
            </View>
            <Switch
              value={active}
              onValueChange={(val) => onToggle(id, val)}
              trackColor={{ false: colors.border, true: catMeta.color + '60' }}
              thumbColor={active ? catMeta.color : colors.textLight}
            />
          </View>
        );
      })}
    </View>
  );
};

const catStyles = StyleSheet.create({
  container: {
    marginBottom: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceHover,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  icon: {
    fontSize: 16,
    marginRight: spacing.sm,
  },
  title: {
    ...typography.body,
    fontWeight: '700',
    flex: 1,
  },
  selectAllBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.textSecondary + '12',
  },
  selectAllText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  permInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  permName: {
    ...typography.body,
    color: colors.text,
  },
  permDesc: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: 1,
  },
});

// ---------------------------------------------------------------------------
// Group Edit Modal
// ---------------------------------------------------------------------------

const GroupModal = ({
  visible,
  group,
  allPermissions,
  onClose,
  onSave,
  onDelete,
  saving,
}) => {
  const isEdit = !!group?.id;
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());

  useEffect(() => {
    if (group) {
      setName(group.name || '');
      const ids = new Set();
      (group.permissions || []).forEach((p) => {
        const id = p.id || p.ID;
        if (id) ids.add(id);
      });
      setSelectedIds(ids);
    } else {
      setName('');
      setSelectedIds(new Set());
    }
  }, [group]);

  const togglePermission = (id, enabled) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (enabled) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Validation', 'Group name is required.');
      return;
    }
    onSave(
      {
        name: name.trim(),
        permission_ids: Array.from(selectedIds),
      },
      group?.id,
    );
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Group',
      `Are you sure you want to delete "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete(group.id),
        },
      ],
    );
  };

  const grouped = groupPermissions(allPermissions);
  const categories = Object.keys(grouped).sort((a, b) => {
    const aIdx = PERMISSION_CATEGORIES.findIndex((c) => c.key === a);
    const bIdx = PERMISSION_CATEGORIES.findIndex((c) => c.key === b);
    if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={modalStyles.container}>
        {/* Header */}
        <View style={modalStyles.header}>
          <TouchableOpacity onPress={onClose} activeOpacity={0.6}>
            <Text style={modalStyles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={modalStyles.headerTitle} numberOfLines={1}>
            {isEdit ? 'Edit Group' : 'New Group'}
          </Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.6}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={modalStyles.saveButton}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={modalStyles.body}
          contentContainerStyle={modalStyles.bodyContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Name */}
          <View style={formStyles.fieldContainer}>
            <Text style={formStyles.label}>Group Name</Text>
            <TextInput
              style={formStyles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g., SALES"
              placeholderTextColor={colors.textLight}
              autoCapitalize="characters"
            />
          </View>

          {/* Summary */}
          <View style={formStyles.summaryRow}>
            <Text style={formStyles.summaryText}>
              {selectedIds.size} of {allPermissions.length} permissions selected
            </Text>
          </View>

          {/* Permission categories */}
          {categories.map((cat) => (
            <PermissionCategorySection
              key={cat}
              category={cat}
              permissions={grouped[cat]}
              selectedIds={selectedIds}
              onToggle={togglePermission}
            />
          ))}

          {/* Delete button */}
          {isEdit && (
            <TouchableOpacity
              style={formStyles.deleteButton}
              onPress={handleDelete}
              activeOpacity={0.7}
            >
              <Text style={formStyles.deleteButtonText}>Delete Group</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: spacing.xxxl * 2 }} />
        </ScrollView>
      </View>
    </Modal>
  );
};

const modalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...typography.h4,
    color: colors.text,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: spacing.sm,
  },
  cancelButton: {
    ...typography.body,
    color: colors.textSecondary,
  },
  saveButton: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '700',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
  },
});

const formStyles = StyleSheet.create({
  fieldContainer: {
    marginBottom: spacing.base,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
    ...typography.body,
    color: colors.text,
  },
  summaryRow: {
    backgroundColor: colors.primary + '08',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    marginBottom: spacing.base,
  },
  summaryText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
    textAlign: 'center',
  },
  deleteButton: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.danger + '40',
    backgroundColor: colors.danger + '08',
    alignItems: 'center',
  },
  deleteButtonText: {
    ...typography.button,
    color: colors.danger,
  },
});

// ---------------------------------------------------------------------------
// PermissionsScreen
// ---------------------------------------------------------------------------

const PermissionsScreen = () => {
  const [groups, setGroups] = useState([]);
  const [allPermissions, setAllPermissions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [saving, setSaving] = useState(false);

  // -----------------------------------------------------------------------
  // Fetch
  // -----------------------------------------------------------------------

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const [groupsRes, permsRes] = await Promise.all([
        permissionApi.listGroups(),
        permissionApi.listAll(),
      ]);

      if (groupsRes?.data) {
        const data = groupsRes.data.data || groupsRes.data;
        const list =
          data.groups || data.items || (Array.isArray(data) ? data : []);
        setGroups(list);
      }

      if (permsRes?.data) {
        const data = permsRes.data.data || permsRes.data;
        const perms = data.permissions || data.items || (Array.isArray(data) ? data : []);
        setAllPermissions(perms);
      }
    } catch (err) {
      console.error('PermissionsScreen fetch error:', err);
      if (!silent) {
        Alert.alert('Error', 'Failed to load permission groups.');
      }
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
  // Actions
  // -----------------------------------------------------------------------

  const openCreate = () => {
    setSelectedGroup(null);
    setModalVisible(true);
  };

  const openEdit = async (group) => {
    // Fetch full group details with permissions
    try {
      const res = await permissionApi.getGroup(group.id);
      const data = res?.data?.data || res?.data || group;
      setSelectedGroup(data.group || data);
      setModalVisible(true);
    } catch {
      // Fallback to what we have
      setSelectedGroup(group);
      setModalVisible(true);
    }
  };

  const closeModal = () => {
    setModalVisible(false);
    setSelectedGroup(null);
  };

  const handleSave = async (payload, groupId) => {
    setSaving(true);
    try {
      if (groupId) {
        await permissionApi.updateGroup(groupId, payload);
      } else {
        await permissionApi.createGroup(payload);
      }
      closeModal();
      fetchData(true);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save permission group.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (groupId) => {
    setSaving(true);
    try {
      await permissionApi.deleteGroup(groupId);
      closeModal();
      fetchData(true);
    } catch (err) {
      Alert.alert('Error', 'Failed to delete permission group.');
    } finally {
      setSaving(false);
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (isLoading && groups.length === 0) {
    return <LoadingScreen message="Loading permissions..." />;
  }

  const renderItem = ({ item }) => (
    <GroupRow group={item} onPress={openEdit} />
  );

  const keyExtractor = (item, index) => String(item.id || item.ID || index);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Permissions</Text>
          <Text style={styles.headerCount}>
            {groups.length} group{groups.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={openCreate}
          activeOpacity={0.7}
        >
          <Text style={styles.addButtonText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {/* Group list */}
      <FlatList
        data={groups}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon={'\uD83D\uDD10'}
            title="No Permission Groups"
            message="Create permission groups to control what resellers can access."
          />
        }
      />

      {/* Create/Edit Modal */}
      <GroupModal
        visible={modalVisible}
        group={selectedGroup}
        allPermissions={allPermissions}
        onClose={closeModal}
        onSave={handleSave}
        onDelete={handleDelete}
        saving={saving}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    paddingTop: Platform.OS === 'ios' ? 56 : spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.text,
  },
  headerCount: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  addButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  addButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },
  listContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
});

export default PermissionsScreen;
