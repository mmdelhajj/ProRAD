import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform,
  RefreshControl,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState, LoadingScreen } from '../../components';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { shadows } from '../../theme/shadows';
import { userApi } from '../../services/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLES = [
  { key: 'admin', label: 'Admin' },
  { key: 'manager', label: 'Manager' },
  { key: 'viewer', label: 'Viewer' },
];

function getRoleColor(role) {
  switch (role?.toLowerCase()) {
    case 'admin':
      return colors.danger;
    case 'manager':
      return colors.warning;
    case 'viewer':
      return colors.info;
    default:
      return colors.textSecondary;
  }
}

function getStatusInfo(user) {
  const isActive = user.is_active !== false;
  return {
    label: isActive ? 'Active' : 'Inactive',
    color: isActive ? colors.success : colors.inactive,
  };
}

// ---------------------------------------------------------------------------
// Form Field
// ---------------------------------------------------------------------------

const FormField = ({ label, value, onChangeText, placeholder, keyboardType, secureTextEntry }) => (
  <View style={formFieldStyles.container}>
    <Text style={formFieldStyles.label}>{label}</Text>
    <TextInput
      style={formFieldStyles.input}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textLight}
      keyboardType={keyboardType || 'default'}
      secureTextEntry={secureTextEntry}
      autoCapitalize="none"
      autoCorrect={false}
    />
  </View>
);

const formFieldStyles = StyleSheet.create({
  container: { marginBottom: spacing.sm },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    ...typography.bodySmall,
    color: colors.text,
  },
});

// ---------------------------------------------------------------------------
// User Row
// ---------------------------------------------------------------------------

const UserRow = ({ user, onPress }) => {
  const role = user.role || user.user_type || 'admin';
  const status = getStatusInfo(user);
  const roleColor = getRoleColor(role);

  return (
    <TouchableOpacity style={rowStyles.container} onPress={() => onPress(user)} activeOpacity={0.7}>
      <View style={rowStyles.row}>
        {/* Avatar circle with initials */}
        <View style={[rowStyles.avatar, { backgroundColor: roleColor + '20' }]}>
          <Text style={[rowStyles.avatarText, { color: roleColor }]}>
            {(user.username || 'U').charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={rowStyles.info}>
          <Text style={rowStyles.username} numberOfLines={1}>{user.username || 'Unknown'}</Text>
          <Text style={rowStyles.email} numberOfLines={1}>{user.email || '-'}</Text>
        </View>

        <View style={rowStyles.rightSide}>
          <View style={[rowStyles.roleBadge, { backgroundColor: roleColor + '18' }]}>
            <Text style={[rowStyles.roleText, { color: roleColor }]}>
              {role.charAt(0).toUpperCase() + role.slice(1)}
            </Text>
          </View>
          <View style={[rowStyles.statusDot, { backgroundColor: status.color }]} />
        </View>
      </View>
    </TouchableOpacity>
  );
};

const rowStyles = StyleSheet.create({
  container: { marginHorizontal: spacing.sm, marginBottom: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    ...shadows.sm,
    padding: spacing.sm,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  avatarText: {
    ...typography.bodySmall,
    fontWeight: '700',
  },
  info: { flex: 1 },
  username: { ...typography.bodySmall, fontWeight: '700', color: colors.text, marginBottom: 1 },
  email: { ...typography.caption, color: colors.textSecondary },
  rightSide: { alignItems: 'flex-end', gap: spacing.xs },
  roleBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  roleText: { ...typography.caption, fontWeight: '600' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
});

// ---------------------------------------------------------------------------
// Create / Edit Modal
// ---------------------------------------------------------------------------

const UserFormModal = ({ visible, user, onClose, onSubmit, onDelete }) => {
  const isEdit = !!user;
  const [form, setForm] = useState({ username: '', password: '', email: '', role: 'admin' });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        username: user.username || '',
        password: '',
        email: user.email || '',
        role: user.role || user.user_type || 'admin',
      });
    } else {
      setForm({ username: '', password: '', email: '', role: 'admin' });
    }
    setShowPassword(false);
  }, [user, visible]);

  const updateField = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = async () => {
    if (!form.username.trim()) {
      Alert.alert('Validation', 'Username is required.');
      return;
    }
    if (!isEdit && !form.password.trim()) {
      Alert.alert('Validation', 'Password is required for new users.');
      return;
    }
    setLoading(true);
    try {
      const payload = { ...form };
      if (isEdit && !payload.password) delete payload.password;
      await onSubmit(user?.id || user?.ID, payload, isEdit);
      onClose();
    } catch (err) {
      Alert.alert('Error', err.message || `Failed to ${isEdit ? 'update' : 'create'} user.`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    if (!user) return;
    Alert.alert(
      'Delete User',
      `Are you sure you want to delete "${user.username}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await onDelete(user.id || user.ID);
              onClose();
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to delete user.');
            }
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={modalStyles.container}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.headerTitle}>{isEdit ? 'Edit User' : 'New User'}</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.6}>
              <Text style={modalStyles.closeButton}>{'\u2715'}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={modalStyles.body}
            contentContainerStyle={modalStyles.bodyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <FormField
              label="Username"
              value={form.username}
              onChangeText={(v) => updateField('username', v)}
              placeholder="Enter username"
            />

            {/* Password with toggle */}
            <View style={formFieldStyles.container}>
              <Text style={formFieldStyles.label}>
                {isEdit ? 'Password (leave blank to keep current)' : 'Password'}
              </Text>
              <View style={passwordStyles.wrapper}>
                <TextInput
                  style={passwordStyles.input}
                  value={form.password}
                  onChangeText={(v) => updateField('password', v)}
                  placeholder={isEdit ? 'Enter new password' : 'Enter password'}
                  placeholderTextColor={colors.textLight}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={passwordStyles.toggleBtn}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Text style={passwordStyles.toggleText}>
                    {showPassword ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <FormField
              label="Email"
              value={form.email}
              onChangeText={(v) => updateField('email', v)}
              placeholder="Enter email"
              keyboardType="email-address"
            />

            {/* Role picker */}
            <View style={formFieldStyles.container}>
              <Text style={formFieldStyles.label}>Role</Text>
              <View style={rolePickerStyles.row}>
                {ROLES.map((r) => {
                  const isActive = form.role === r.key;
                  const roleColor = getRoleColor(r.key);
                  return (
                    <TouchableOpacity
                      key={r.key}
                      style={[
                        rolePickerStyles.chip,
                        isActive && { backgroundColor: roleColor, borderColor: roleColor },
                      ]}
                      onPress={() => updateField('role', r.key)}
                    >
                      <Text style={[rolePickerStyles.chipText, isActive && { color: colors.textInverse }]}>
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={submitStyles.btn}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={submitStyles.text}>{isEdit ? 'Save Changes' : 'Create User'}</Text>
              )}
            </TouchableOpacity>

            {/* Delete button for edit mode */}
            {isEdit && (
              <TouchableOpacity
                style={submitStyles.deleteBtn}
                onPress={handleDelete}
                activeOpacity={0.8}
              >
                <Text style={submitStyles.deleteText}>Delete User</Text>
              </TouchableOpacity>
            )}

            <View style={{ height: spacing.tabBar }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const passwordStyles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    ...typography.bodySmall,
    color: colors.text,
  },
  toggleBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
  },
  toggleText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },
});

const rolePickerStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xs },
  chip: {
    flex: 1,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  chipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
});

const submitStyles = StyleSheet.create({
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  text: { ...typography.button, color: colors.textInverse },
  deleteBtn: {
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  deleteText: { ...typography.button, color: colors.danger },
});

const modalStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 48 : spacing.md,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  headerTitle: { ...typography.h4, color: colors.text, flex: 1, marginRight: spacing.sm },
  closeButton: { fontSize: 15, color: colors.textSecondary, paddingHorizontal: spacing.xs },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: spacing.sm, paddingTop: spacing.md },
});

// ---------------------------------------------------------------------------
// UsersScreen
// ---------------------------------------------------------------------------

export default function UsersScreen() {
  const insets = useSafeAreaInsets();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const fetchUsers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await userApi.list();
      if (!isMounted.current) return;
      const data = res.data?.data || res.data;
      const list = data?.users || data?.items || (Array.isArray(data) ? data : []);
      setUsers(list);
    } catch (err) {
      if (isMounted.current) setError(err.message || 'Failed to load users.');
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchUsers(true);
  }, [fetchUsers]);

  const handleSubmit = useCallback(async (id, payload, isEdit) => {
    if (isEdit) {
      await userApi.update(id, payload);
    } else {
      await userApi.create(payload);
    }
    fetchUsers(true);
  }, [fetchUsers]);

  const handleDelete = useCallback(async (id) => {
    await userApi.delete(id);
    fetchUsers(true);
  }, [fetchUsers]);

  if (loading && users.length === 0 && !refreshing) {
    return <LoadingScreen message="Loading users..." />;
  }

  const renderItem = ({ item }) => <UserRow user={item} onPress={setSelectedUser} />;
  const keyExtractor = (item, index) => String(item.id || item.ID || index);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Users</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{users.length}</Text>
        </View>
      </View>

      {error && !loading && users.length === 0 ? (
        <EmptyState icon={'\u26A0\uFE0F'} title="Connection Error" message={error} actionLabel="Retry" onAction={() => fetchUsers()} />
      ) : (
        <FlatList
          data={users}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[styles.listContent, users.length === 0 && styles.listContentEmpty]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
          ListEmptyComponent={
            <EmptyState icon={'\uD83D\uDC64'} title="No Users" message="No admin or manager users found." actionLabel="Add User" onAction={() => setShowCreate(true)} />
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}
        onPress={() => setShowCreate(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      {/* Edit Modal */}
      <UserFormModal
        visible={!!selectedUser}
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
      />

      {/* Create Modal */}
      <UserFormModal
        visible={showCreate}
        user={null}
        onClose={() => setShowCreate(false)}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    ...shadows.sm,
  },
  headerTitle: { ...typography.h3, color: colors.text },
  countBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    marginLeft: spacing.sm,
  },
  countBadgeText: { ...typography.caption, color: colors.textInverse, fontWeight: '700' },
  listContent: { paddingTop: spacing.sm, paddingBottom: spacing.tabBar },
  listContentEmpty: { flex: 1, justifyContent: 'center' },
  fab: {
    position: 'absolute',
    right: spacing.md,
    width: 44,
    height: 44,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  fabIcon: { fontSize: 22, color: colors.textInverse, fontWeight: '300', marginTop: -1 },
});
