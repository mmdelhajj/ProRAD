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
  container: { marginBottom: spacing.base },
  label: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    ...typography.body,
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
  container: { marginHorizontal: spacing.base, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    ...typography.h4,
    fontWeight: '700',
  },
  info: { flex: 1 },
  username: { ...typography.body, fontWeight: '700', color: colors.text, marginBottom: 2 },
  email: { ...typography.bodySmall, color: colors.textSecondary },
  rightSide: { alignItems: 'flex-end', gap: spacing.sm },
  roleBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  roleText: { ...typography.caption, fontWeight: '600' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
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
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    ...typography.body,
    color: colors.text,
  },
  toggleBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  toggleText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },
});

const rolePickerStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  chipText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
});

const submitStyles = StyleSheet.create({
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md + 2,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  text: { ...typography.button, color: colors.textInverse },
  deleteBtn: {
    paddingVertical: spacing.md + 2,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.md,
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
    paddingTop: Platform.OS === 'ios' ? 56 : spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { ...typography.h3, color: colors.text, flex: 1, marginRight: spacing.md },
  closeButton: { fontSize: 20, color: colors.textSecondary, paddingHorizontal: spacing.sm },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: spacing.base, paddingTop: spacing.lg },
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
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { ...typography.h2, color: colors.text },
  countBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginLeft: spacing.md,
  },
  countBadgeText: { ...typography.caption, color: colors.textInverse, fontWeight: '700' },
  listContent: { paddingTop: spacing.md, paddingBottom: spacing.tabBar },
  listContentEmpty: { flex: 1, justifyContent: 'center' },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8 },
      android: { elevation: 6 },
    }),
  },
  fabIcon: { fontSize: 28, color: colors.textInverse, fontWeight: '300', marginTop: -1 },
});
