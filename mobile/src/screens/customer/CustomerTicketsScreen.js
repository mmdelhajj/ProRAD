import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { EmptyState, LoadingScreen } from '../../components';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { formatDate, getTimeAgo } from '../../utils/format';
import { customerApi } from '../../services/api';

// ---------------------------------------------------------------------------
// Status badge config
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
// TicketRow
// ---------------------------------------------------------------------------

const TicketRow = ({ ticket, onPress }) => {
  const statusConfig = getStatusConfig(ticket.status);
  const hasUnread = ticket.has_admin_reply || ticket.admin_replied || ticket.unread;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={styles.ticketRow}
    >
      <View style={styles.ticketHeader}>
        <View style={styles.ticketTitleRow}>
          {hasUnread && <View style={styles.unreadDot} />}
          <Text style={styles.ticketNumber} numberOfLines={1}>
            #{ticket.id || ticket.ticket_id}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
          <Text style={[styles.statusText, { color: statusConfig.text }]}>
            {statusConfig.label}
          </Text>
        </View>
      </View>

      <Text style={styles.ticketSubject} numberOfLines={2}>
        {ticket.subject || 'No subject'}
      </Text>

      <View style={styles.ticketFooter}>
        {ticket.category ? (
          <View style={styles.categoryChip}>
            <Text style={styles.categoryText}>{ticket.category}</Text>
          </View>
        ) : null}
        <Text style={styles.ticketDate}>
          {ticket.created_at ? getTimeAgo(ticket.created_at) : '-'}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

// ---------------------------------------------------------------------------
// CustomerTicketsScreen
// ---------------------------------------------------------------------------

const CustomerTicketsScreen = ({ navigation }) => {
  const [tickets, setTickets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // -----------------------------------------------------------------------
  // Fetch
  // -----------------------------------------------------------------------

  const fetchTickets = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await customerApi.tickets();
      if (res?.data) {
        const list = res.data.data || res.data.tickets || res.data || [];
        setTickets(Array.isArray(list) ? list : []);
      }
    } catch (err) {
      console.error('CustomerTicketsScreen fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Refresh when returning from detail or create
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchTickets(true);
    });
    return unsubscribe;
  }, [navigation, fetchTickets]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchTickets(true);
  }, [fetchTickets]);

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------

  const handleTicketPress = (ticket) => {
    navigation.navigate('TicketDetail', { ticketId: ticket.id || ticket.ticket_id });
  };

  const handleCreateTicket = () => {
    navigation.navigate('CreateTicket');
  };

  // -----------------------------------------------------------------------
  // First load
  // -----------------------------------------------------------------------

  if (isLoading && tickets.length === 0) {
    return <LoadingScreen message="Loading tickets..." />;
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const renderItem = ({ item }) => (
    <TicketRow ticket={item} onPress={() => handleTicketPress(item)} />
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Support</Text>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleCreateTicket}
          style={styles.addButton}
        >
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Ticket List */}
      <FlatList
        data={tickets}
        keyExtractor={(item) => String(item.id || item.ticket_id)}
        renderItem={renderItem}
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
            icon={'\uD83C\uDFAB'}
            title="No tickets yet"
            message="Tap + to create one."
            actionLabel="Create Ticket"
            onAction={handleCreateTicket}
          />
        }
      />

      {/* FAB */}
      {tickets.length > 0 && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleCreateTicket}
          style={styles.fab}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}
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
    paddingTop: spacing.xxxl + spacing.base,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.text,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.textInverse,
    marginTop: -1,
  },

  // List
  listContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl + spacing.xxxl,
  },

  // Ticket Row
  ticketRow: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  ticketTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginRight: spacing.sm,
  },
  ticketNumber: {
    ...typography.h4,
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginLeft: spacing.sm,
  },
  statusText: {
    ...typography.caption,
    fontWeight: '600',
  },
  ticketSubject: {
    ...typography.body,
    color: colors.text,
    marginBottom: spacing.md,
  },
  ticketFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryChip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceHover,
  },
  categoryText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  ticketDate: {
    ...typography.caption,
    color: colors.textLight,
  },

  // FAB
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: {
    fontSize: 28,
    fontWeight: '500',
    color: colors.textInverse,
    marginTop: -1,
  },
});

export default CustomerTicketsScreen;
