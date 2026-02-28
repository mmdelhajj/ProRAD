import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Card, LoadingScreen } from '../../components';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { formatDate } from '../../utils/format';
import { customerApi } from '../../services/api';

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const TICKET_STATUS = {
  open: { bg: colors.success + '18', text: colors.success, label: 'Open' },
  pending: { bg: colors.warning + '18', text: colors.warning, label: 'Pending' },
  closed: { bg: colors.inactive + '18', text: colors.inactive, label: 'Closed' },
};

function getStatusConfig(status) {
  if (!status) return TICKET_STATUS.open;
  const key = status.toLowerCase();
  return TICKET_STATUS[key] || TICKET_STATUS.open;
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

const MessageBubble = ({ message, isCustomer }) => {
  const senderLabel = isCustomer
    ? 'You'
    : message.sender_name || message.admin_name || 'Support';

  return (
    <View
      style={[
        bubbleStyles.wrapper,
        isCustomer ? bubbleStyles.wrapperRight : bubbleStyles.wrapperLeft,
      ]}
    >
      <Text
        style={[
          bubbleStyles.senderLabel,
          isCustomer ? bubbleStyles.senderRight : bubbleStyles.senderLeft,
        ]}
      >
        {senderLabel}
      </Text>
      <View
        style={[
          bubbleStyles.bubble,
          isCustomer ? bubbleStyles.bubbleCustomer : bubbleStyles.bubbleSupport,
        ]}
      >
        <Text
          style={[
            bubbleStyles.messageText,
            isCustomer ? bubbleStyles.textCustomer : bubbleStyles.textSupport,
          ]}
        >
          {message.message || message.content || message.body || ''}
        </Text>
      </View>
      <Text
        style={[
          bubbleStyles.timestamp,
          isCustomer ? bubbleStyles.timestampRight : bubbleStyles.timestampLeft,
        ]}
      >
        {message.created_at ? formatDate(message.created_at) : ''}
      </Text>
    </View>
  );
};

const bubbleStyles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.base,
    maxWidth: '82%',
  },
  wrapperRight: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  wrapperLeft: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  senderLabel: {
    ...typography.caption,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  senderRight: {
    color: colors.primary,
  },
  senderLeft: {
    color: colors.textSecondary,
  },
  bubble: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  bubbleCustomer: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: borderRadius.sm,
  },
  bubbleSupport: {
    backgroundColor: colors.surfaceHover,
    borderBottomLeftRadius: borderRadius.sm,
  },
  messageText: {
    ...typography.body,
    lineHeight: 22,
  },
  textCustomer: {
    color: colors.textInverse,
  },
  textSupport: {
    color: colors.text,
  },
  timestamp: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: spacing.xs,
  },
  timestampRight: {
    textAlign: 'right',
  },
  timestampLeft: {
    textAlign: 'left',
  },
});

// ---------------------------------------------------------------------------
// CustomerTicketDetailScreen
// ---------------------------------------------------------------------------

const CustomerTicketDetailScreen = ({ navigation, route }) => {
  const ticketId = route?.params?.ticketId;
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const flatListRef = useRef(null);

  // -----------------------------------------------------------------------
  // Fetch
  // -----------------------------------------------------------------------

  const fetchTicket = useCallback(async (silent = false) => {
    if (!ticketId) return;
    if (!silent) setIsLoading(true);
    try {
      const res = await customerApi.getTicket(ticketId);
      if (res?.data) {
        const d = res.data.data || res.data.ticket || res.data;
        setTicket(d);
        const msgs = d.replies || d.messages || d.thread || [];
        setMessages(Array.isArray(msgs) ? msgs : []);
      }
    } catch (err) {
      console.error('CustomerTicketDetailScreen fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  // -----------------------------------------------------------------------
  // Send reply
  // -----------------------------------------------------------------------

  const handleSend = useCallback(async () => {
    const text = replyText.trim();
    if (!text || isSending) return;

    setIsSending(true);
    try {
      await customerApi.replyTicket(ticketId, text);
      setReplyText('');
      await fetchTicket(true);
      // Scroll to bottom after sending
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 200);
    } catch (err) {
      console.error('Reply send error:', err);
    } finally {
      setIsSending(false);
    }
  }, [replyText, isSending, ticketId, fetchTicket]);

  // -----------------------------------------------------------------------
  // First load
  // -----------------------------------------------------------------------

  if (isLoading && !ticket) {
    return <LoadingScreen message="Loading ticket..." />;
  }

  if (!ticket) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Ticket not found</Text>
      </View>
    );
  }

  // -----------------------------------------------------------------------
  // Derived
  // -----------------------------------------------------------------------

  const statusConfig = getStatusConfig(ticket.status);
  const isClosed = (ticket.status || '').toLowerCase() === 'closed';

  // Determine if a message is from the customer
  const isCustomerMessage = (msg) => {
    if (msg.is_customer !== undefined) return msg.is_customer;
    if (msg.sender_type) return msg.sender_type === 'customer';
    if (msg.is_admin !== undefined) return !msg.is_admin;
    if (msg.role) return msg.role === 'customer';
    return false;
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const renderMessage = ({ item }) => (
    <MessageBubble message={item} isCustomer={isCustomerMessage(item)} />
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backText}>{'\u2039'} Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Ticket #{ticketId}
          </Text>
        </View>
        <View style={[styles.headerBadge, { backgroundColor: statusConfig.bg }]}>
          <Text style={[styles.headerBadgeText, { color: statusConfig.text }]}>
            {statusConfig.label}
          </Text>
        </View>
      </View>

      {/* Ticket Info Card */}
      <View style={styles.infoCard}>
        <Text style={styles.infoSubject} numberOfLines={2}>
          {ticket.subject || 'No subject'}
        </Text>
        <View style={styles.infoRow}>
          {ticket.category ? (
            <View style={styles.infoCategoryChip}>
              <Text style={styles.infoCategoryText}>{ticket.category}</Text>
            </View>
          ) : null}
          <Text style={styles.infoDate}>
            Created {ticket.created_at ? formatDate(ticket.created_at) : '-'}
          </Text>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item, index) => String(item.id || index)}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => {
          if (messages.length > 0) {
            flatListRef.current?.scrollToEnd({ animated: false });
          }
        }}
        ListEmptyComponent={
          <View style={styles.emptyMessages}>
            <Text style={styles.emptyMessagesText}>No messages yet</Text>
          </View>
        }
      />

      {/* Closed banner OR reply input */}
      {isClosed ? (
        <View style={styles.closedBanner}>
          <Text style={styles.closedBannerText}>This ticket is closed</Text>
        </View>
      ) : (
        <View style={styles.replyBar}>
          <TextInput
            style={styles.replyInput}
            value={replyText}
            onChangeText={setReplyText}
            placeholder="Type your reply..."
            placeholderTextColor={colors.textLight}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleSend}
            disabled={!replyText.trim() || isSending}
            style={[
              styles.sendButton,
              (!replyText.trim() || isSending) && styles.sendButtonDisabled,
            ]}
          >
            {isSending ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Text style={styles.sendButtonText}>{'\u2191'}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  errorText: {
    ...typography.body,
    color: colors.textSecondary,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.xxxl + spacing.base,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    marginRight: spacing.md,
  },
  backText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    ...typography.h4,
    color: colors.text,
  },
  headerBadge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginLeft: spacing.sm,
  },
  headerBadgeText: {
    ...typography.caption,
    fontWeight: '600',
  },

  // Info card
  infoCard: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoSubject: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoCategoryChip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceHover,
  },
  infoCategoryText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  infoDate: {
    ...typography.caption,
    color: colors.textLight,
  },

  // Messages
  messageList: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.base,
    flexGrow: 1,
  },
  emptyMessages: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
  },
  emptyMessagesText: {
    ...typography.body,
    color: colors.textLight,
  },

  // Closed banner
  closedBanner: {
    backgroundColor: colors.surfaceHover,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.base,
    alignItems: 'center',
  },
  closedBannerText: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '500',
  },

  // Reply bar
  replyBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  replyInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surfaceHover,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    maxHeight: 120,
    marginRight: spacing.sm,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendButtonDisabled: {
    backgroundColor: colors.primary + '55',
  },
  sendButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textInverse,
  },
});

export default CustomerTicketDetailScreen;
