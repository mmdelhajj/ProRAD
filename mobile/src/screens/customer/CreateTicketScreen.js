import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from 'react-native';
import { Button, Input } from '../../components';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { customerApi } from '../../services/api';

// ---------------------------------------------------------------------------
// Category options
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { key: 'general', label: 'General' },
  { key: 'billing', label: 'Billing' },
  { key: 'technical', label: 'Technical' },
  { key: 'other', label: 'Other' },
];

// ---------------------------------------------------------------------------
// CreateTicketScreen
// ---------------------------------------------------------------------------

const CreateTicketScreen = ({ navigation }) => {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isFormValid = subject.trim().length > 0 && description.trim().length > 0;

  // -----------------------------------------------------------------------
  // Submit
  // -----------------------------------------------------------------------

  const handleSubmit = useCallback(async () => {
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await customerApi.createTicket({
        subject: subject.trim(),
        description: description.trim(),
        category,
      });
      Alert.alert('Success', 'Ticket created successfully', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to create ticket');
    } finally {
      setIsSubmitting(false);
    }
  }, [subject, description, category, isFormValid, isSubmitting, navigation]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.goBack()}
          style={styles.closeButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.closeText}>{'\u2715'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Ticket</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Subject */}
        <Input
          label="Subject"
          value={subject}
          onChangeText={setSubject}
          placeholder="Brief summary of your issue"
        />

        {/* Category Picker */}
        <View style={styles.fieldWrapper}>
          <Text style={styles.fieldLabel}>Category</Text>
          <View style={styles.categoryRow}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.key}
                activeOpacity={0.7}
                onPress={() => setCategory(cat.key)}
                style={[
                  styles.categoryChip,
                  category === cat.key && styles.categoryChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    category === cat.key && styles.categoryChipTextActive,
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Description */}
        <Input
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Describe your issue in detail..."
          multiline
        />

        {/* Submit Button */}
        <View style={styles.submitWrapper}>
          <Button
            title={isSubmitting ? 'Creating...' : 'Create Ticket'}
            onPress={handleSubmit}
            variant="primary"
            size="lg"
            fullWidth
            loading={isSubmitting}
            disabled={!isFormValid || isSubmitting}
          />
        </View>
      </ScrollView>
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

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xxxl + spacing.base,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 18,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  headerTitle: {
    ...typography.h4,
    color: colors.text,
  },
  headerSpacer: {
    width: 32,
  },

  // Scroll content
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
    paddingBottom: spacing.xxxl,
  },

  // Category picker
  fieldWrapper: {
    marginBottom: spacing.base,
  },
  fieldLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryChip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceHover,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  categoryChipActive: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
  },
  categoryChipText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },

  // Submit
  submitWrapper: {
    marginTop: spacing.lg,
  },
});

export default CreateTicketScreen;
