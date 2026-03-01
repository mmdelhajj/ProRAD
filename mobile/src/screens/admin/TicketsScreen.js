import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { LoadingScreen, EmptyState } from '../../components';
import { ticketApi } from '../../services/api';
import { formatDate, getTimeAgo } from '../../utils/format';

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG = {
  open: { bg: colors.success + '18', text: colors.success, label: 'Open' },
  pending: { bg: colors.warning + '18', text: colors.warning, label: 'Pending' },
  closed: { bg: colors.textLight + '18', text: colors.textSecondary, label: 'Closed' },
  in_progress: { bg: colors.info + '18', text: colors.info, label: 'In Progress' },
};

const PRIORITY_CONFIG = {
  high: { color: colors.danger, label: 'High' },
  medium: { color: colors.warning, label: 'Medium' },
  low: { color: colors.success, label: 'Low' },
  normal: { color: colors.primary, label: 'Normal' },
};

const FILTER_CHIPS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'pending', label: 'Pending' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'closed', label: 'Closed' },
];

// ---------------------------------------------------------------------------
// StatusBadge (inline for tickets)
// ---------------------------------------------------------------------------

const TicketStatusBadge = ({ status }) => {
  const config = STATUS_CONFIG[status?.toLowerCase()] || STATUS_CONFIG.open;
  return (
    <View style={[badgeStyles.container, { backgroundColor: config.bg }]}>
      <View style={[badgeStyles.dot, { backgroundColor: config.text }]} />
      <Text style={[badgeStyles.text, { color: config.text }]}>{config.label}</Text>
    </View>
  );
};

const badgeStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
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

// ---------------------------------------------------------------------------
// Filter Chips
// ---------------------------------------------------------------------------

const FilterChips = ({ selected, onSelect }) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={chipStyles.container}
  >
    {FILTER_CHIPS.map((chip) => {
      const isActive = selected === chip.key;
      return (
        <TouchableOpacity
          key={chip.key}
          style={[chipStyles.chip, isActive && chipStyles.chipActive]}
          onPress={() => onSelect(chip.key)}
          activeOpacity={0.7}
        >
          <Text style={[chipStyles.chipText, isActive && chipStyles.chipTextActive]}>
            {chip.label}
          </Text>
        </TouchableOpacity>
      );
    })}
  </ScrollView>
);

const chipStyles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.textInverse,
    fontWeight: '600',
  },
});

// ---------------------------------------------------------------------------
// Ticket Row
// ---------------------------------------------------------------------------

const TicketRow = ({ item, onPress }) => {
  const ticketId = item.id || item.ticket_id;
  const subject = item.subject || item.title || 'No Subject';
  const customerName = item.customer_name || item.user_name || item.username || '-';
  const status = item.status || 'open';
  const priority = item.priority || 'normal';
  const date = item.created_at || item.date;
  const priorityConfig = PRIORITY_CONFIG[priority?.toLowerCase()] || PRIORITY_CONFIG.normal;

  return (
    <TouchableOpacity
      style={ticketRowStyles.container}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <View style={ticketRowStyles.topRow}>
        <View style={ticketRowStyles.idBadge}>
          <Text style={ticketRowStyles.idText}>#{ticketId}</Text>
        </View>
        <TicketStatusBadge status={status} />
      </View>

      <Text style={ticketRowStyles.subject} numberOfLines={2}>
        {subject}
      </Text>

      <View style={ticketRowStyles.bottomRow}>
        <View style={ticketRowStyles.customerRow}>
          <Text style={ticketRowStyles.customerIcon}>{'\uD83D\uDC64'}</Text>
          <Text style={ticketRowStyles.customerName} numberOfLines={1}>
            {customerName}
          </Text>
        </View>

        <View style={ticketRowStyles.metaRight}>
          <View style={[ticketRowStyles.priorityDot, { backgroundColor: priorityConfig.color }]} />
          <Text style={[ticketRowStyles.priorityText, { color: priorityConfig.color }]}>
            {priorityConfig.label}
          </Text>
        </View>
      </View>

      {date ? (
        <Text style={ticketRowStyles.date}>{getTimeAgo(date)}</Text>
      ) : null}
    </TouchableOpacity>
  );
};

const ticketRowStyles = StyleSheet.create({
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
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  idBadge: {
    backgroundColor: colors.primary + '12',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  idText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primary,
  },
  subject: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
    lineHeight: 22,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  customerIcon: {
    fontSize: 14,
    marginRight: spacing.xs,
  },
  customerName: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flex: 1,
  },
  metaRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  priorityText: {
    ...typography.caption,
    fontWeight: '600',
  },
  date: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: spacing.sm,
  },
});

// ---------------------------------------------------------------------------
// Ticket Detail Modal (Conversation View)
// ---------------------------------------------------------------------------

const TicketDetailModal = ({ visible, ticket, onClose, onReply, onCloseTicket }) => {
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [detail, setDetail] = useState(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const scrollRef = useRef(null);

  // Load ticket detail
  useEffect(() => {
    if (visible && ticket) {
      loadDetail();
    }
    return () => {
      setDetail(null);
      setReplyText('');
    };
  }, [visible, ticket]);

  const loadDetail = async () => {
    if (!ticket) return;
    setIsLoadingDetail(true);
    try {
      const id = ticket.id || ticket.ticket_id;
      const res = await ticketApi.get(id);
      const data = res?.data?.data || res?.data?.ticket || res?.data;
      setDetail(data);
    } catch (err) {
      console.error('Failed to load ticket detail:', err);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim()) return;
    setIsSending(true);
    try {
      const id = ticket.id || ticket.ticket_id;
      await ticketApi.reply(id, replyText.trim());
      setReplyText('');
      loadDetail(); // reload conversation
      if (onReply) onReply();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to send reply.');
    } finally {
      setIsSending(false);
    }
  };

  const handleCloseTicket = () => {
    Alert.alert(
      'Close Ticket',
      'Are you sure you want to close this ticket?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close Ticket',
          style: 'destructive',
          onPress: async () => {
            setIsClosing(true);
            try {
              const id = ticket.id || ticket.ticket_id;
              await ticketApi.updateStatus(id, 'closed');
              if (onCloseTicket) onCloseTicket();
              onClose();
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to close ticket.');
            } finally {
              setIsClosing(false);
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  if (!ticket) return null;

  const replies = detail?.replies || detail?.messages || detail?.ticket_replies || [];
  const ticketStatus = detail?.status || ticket.status || 'open';
  const isClosed = ticketStatus === 'closed';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        style={modalStyles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Header */}
        <View style={modalStyles.header}>
          <TouchableOpacity onPress={onClose} style={modalStyles.closeButton}>
            <Text style={modalStyles.closeText}>{'\u2190'} Back</Text>
          </TouchableOpacity>
          <View style={modalStyles.headerCenter}>
            <Text style={modalStyles.headerTitle} numberOfLines={1}>
              Ticket #{ticket.id || ticket.ticket_id}
            </Text>
            <TicketStatusBadge status={ticketStatus} />
          </View>
          {!isClosed && (
            <TouchableOpacity
              onPress={handleCloseTicket}
              disabled={isClosing}
              style={modalStyles.closeTicketButton}
            >
              {isClosing ? (
                <ActivityIndicator size="small" color={colors.danger} />
              ) : (
                <Text style={modalStyles.closeTicketText}>Close</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Subject */}
        <View style={modalStyles.subjectBar}>
          <Text style={modalStyles.subjectText}>
            {detail?.subject || ticket.subject || 'No Subject'}
          </Text>
          <Text style={modalStyles.subjectMeta}>
            {detail?.customer_name || ticket.customer_name || ''}{' '}
            {ticket.created_at ? `\u2022 ${getTimeAgo(ticket.created_at)}` : ''}
          </Text>
        </View>

        {/* Conversation */}
        {isLoadingDetail ? (
          <View style={modalStyles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={modalStyles.loadingText}>Loading conversation...</Text>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={modalStyles.conversation}
            contentContainerStyle={modalStyles.conversationContent}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => {
              scrollRef.current?.scrollToEnd?.({ animated: false });
            }}
          >
            {/* Original message */}
            {(detail?.message || detail?.body || ticket.message) ? (
              <View style={modalStyles.messageBubbleCustomer}>
                <Text style={modalStyles.messageAuthor}>
                  {detail?.customer_name || ticket.customer_name || 'Customer'}
                </Text>
                <Text style={modalStyles.messageText}>
                  {detail?.message || detail?.body || ticket.message}
                </Text>
                <Text style={modalStyles.messageTime}>
                  {ticket.created_at ? formatDate(ticket.created_at) : ''}
                </Text>
              </View>
            ) : null}

            {/* Replies */}
            {replies.map((reply, index) => {
              const isAdmin = reply.is_admin || reply.user_type === 'admin' || reply.role === 'admin';
              return (
                <View
                  key={reply.id || index}
                  style={isAdmin ? modalStyles.messageBubbleAdmin : modalStyles.messageBubbleCustomer}
                >
                  <Text style={modalStyles.messageAuthor}>
                    {reply.user_name || reply.username || reply.author || (isAdmin ? 'Admin' : 'Customer')}
                  </Text>
                  <Text style={modalStyles.messageText}>
                    {reply.message || reply.body || reply.content}
                  </Text>
                  <Text style={modalStyles.messageTime}>
                    {reply.created_at ? formatDate(reply.created_at) : ''}
                  </Text>
                </View>
              );
            })}

            {replies.length === 0 && !detail?.message && !detail?.body && !ticket.message && (
              <View style={modalStyles.emptyConvo}>
                <Text style={modalStyles.emptyConvoText}>No messages yet</Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* Reply Input */}
        {!isClosed && (
          <View style={modalStyles.replyBar}>
            <TextInput
              style={modalStyles.replyInput}
              value={replyText}
              onChangeText={setReplyText}
              placeholder="Type your reply..."
              placeholderTextColor={colors.textLight}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={[
                modalStyles.sendButton,
                (!replyText.trim() || isSending) && modalStyles.sendButtonDisabled,
              ]}
              onPress={handleSendReply}
              disabled={!replyText.trim() || isSending}
              activeOpacity={0.7}
            >
              {isSending ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={modalStyles.sendText}>{'\u2191'}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {isClosed && (
          <View style={modalStyles.closedBar}>
            <Text style={modalStyles.closedText}>This ticket is closed</Text>
          </View>
        )}
      </KeyboardAvoidingView>
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
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: Platform.OS === 'ios' ? 56 : spacing.base,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.base,
  },
  closeButton: {
    paddingVertical: spacing.xs,
    paddingRight: spacing.md,
  },
  closeText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerTitle: {
    ...typography.h4,
    color: colors.text,
  },
  closeTicketButton: {
    paddingVertical: spacing.xs,
    paddingLeft: spacing.md,
  },
  closeTicketText: {
    ...typography.bodySmall,
    color: colors.danger,
    fontWeight: '600',
  },
  subjectBar: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  subjectText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 22,
  },
  subjectMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  conversation: {
    flex: 1,
  },
  conversationContent: {
    padding: spacing.base,
    paddingBottom: spacing.xxl,
  },
  messageBubbleCustomer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    maxWidth: '85%',
    alignSelf: 'flex-start',
  },
  messageBubbleAdmin: {
    backgroundColor: colors.primary + '12',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary + '25',
    padding: spacing.md,
    marginBottom: spacing.md,
    maxWidth: '85%',
    alignSelf: 'flex-end',
  },
  messageAuthor: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  messageText: {
    ...typography.body,
    color: colors.text,
    lineHeight: 22,
  },
  messageTime: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: spacing.sm,
    textAlign: 'right',
  },
  emptyConvo: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  emptyConvoText: {
    ...typography.bodySmall,
    color: colors.textLight,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? spacing.xxl : spacing.md,
  },
  replyInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
    maxHeight: 100,
    marginRight: spacing.sm,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.primary + '44',
  },
  sendText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textInverse,
  },
  closedBar: {
    backgroundColor: colors.surfaceHover,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.base,
    paddingBottom: Platform.OS === 'ios' ? spacing.xxl : spacing.base,
    alignItems: 'center',
  },
  closedText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});

// ---------------------------------------------------------------------------
// TicketsScreen
// ---------------------------------------------------------------------------

const TicketsScreen = ({ navigation }) => {
  const [tickets, setTickets] = useState([]);
  const [filter, setFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);

  // -----------------------------------------------------------------------
  // Fetch tickets
  // -----------------------------------------------------------------------

  const fetchTickets = useCallback(async (pageNum = 1, silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const params = { page: pageNum, limit: 20 };
      if (filter !== 'all') {
        params.status = filter;
      }

      const res = await ticketApi.list(params);
      const data = res?.data?.data || res?.data?.tickets || res?.data;
      const items = Array.isArray(data) ? data : (data?.items || []);
      const total = data?.total || data?.total_count;

      if (pageNum === 1) {
        setTickets(items);
      } else {
        setTickets((prev) => [...prev, ...items]);
      }

      // Determine if more pages exist
      if (total !== undefined) {
        setHasMore(items.length > 0 && tickets.length + items.length < total);
      } else {
        setHasMore(items.length >= 20);
      }
    } catch (err) {
      console.error('TicketsScreen fetch error:', err);
      if (pageNum === 1) setTickets([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    setPage(1);
    fetchTickets(1);
  }, [filter, fetchTickets]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    setPage(1);
    fetchTickets(1, true);
  }, [fetchTickets]);

  const loadMore = () => {
    if (!hasMore || isLoading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchTickets(nextPage, true);
  };

  // -----------------------------------------------------------------------
  // Ticket actions
  // -----------------------------------------------------------------------

  const handleTicketPress = (ticket) => {
    setSelectedTicket(ticket);
  };

  const handleModalClose = () => {
    setSelectedTicket(null);
  };

  const handleReply = () => {
    // Refresh list after reply
    fetchTickets(1, true);
  };

  const handleCloseTicket = () => {
    fetchTickets(1, true);
  };

  // -----------------------------------------------------------------------
  // Loading
  // -----------------------------------------------------------------------

  if (isLoading && tickets.length === 0) {
    return <LoadingScreen message="Loading tickets..." />;
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const renderTicket = ({ item }) => (
    <TicketRow item={item} onPress={handleTicketPress} />
  );

  return (
    <View style={styles.container}>
      {/* Filter chips */}
      <FilterChips selected={filter} onSelect={setFilter} />

      {/* Ticket list */}
      <FlatList
        data={tickets}
        renderItem={renderTicket}
        keyExtractor={(item, index) => (item.id || item.ticket_id || index).toString()}
        ListEmptyComponent={
          <EmptyState
            icon={'\uD83C\uDFAB'}
            title="No Tickets"
            message={
              filter === 'all'
                ? 'No support tickets found.'
                : `No ${filter} tickets found.`
            }
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
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          hasMore && tickets.length > 0 ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Ticket detail modal */}
      <TicketDetailModal
        visible={!!selectedTicket}
        ticket={selectedTicket}
        onClose={handleModalClose}
        onReply={handleReply}
        onCloseTicket={handleCloseTicket}
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
    paddingBottom: spacing.tabBar,
  },
  loadingMore: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
});

export default TicketsScreen;
