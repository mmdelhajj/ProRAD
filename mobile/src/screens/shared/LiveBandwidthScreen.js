import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { subscriberApi } from '../../services/api';
import { Card, StatusBadge } from '../../components';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { formatBytes, formatDuration } from '../../utils/format';

const POLL_INTERVAL = 2000;
const MAX_DATA_POINTS = 30;
const CHART_HEIGHT = 120;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// Helper: format bytes-per-second to Mbps with appropriate precision
// ---------------------------------------------------------------------------
function formatMbps(mbps) {
  if (!mbps || mbps <= 0) return '0.00';
  if (mbps >= 100) return mbps.toFixed(0);
  if (mbps >= 10) return mbps.toFixed(1);
  return mbps.toFixed(2);
}

// ---------------------------------------------------------------------------
// Helper: format rate from torch (bytes/sec) to human-readable
// ---------------------------------------------------------------------------
function formatRate(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s';
  const bitsPerSec = bytesPerSec * 8;
  if (bitsPerSec >= 1000000) return `${(bitsPerSec / 1000000).toFixed(1)} Mbps`;
  if (bitsPerSec >= 1000) return `${(bitsPerSec / 1000).toFixed(0)} Kbps`;
  return `${Math.round(bytesPerSec)} B/s`;
}

// ---------------------------------------------------------------------------
// Helper: extract port from address string like "192.168.1.1:443"
// ---------------------------------------------------------------------------
function extractPort(address) {
  if (!address) return '-';
  const parts = address.split(':');
  return parts.length > 1 ? parts[parts.length - 1] : '-';
}

// ---------------------------------------------------------------------------
// Helper: extract IP from address string
// ---------------------------------------------------------------------------
function extractIP(address) {
  if (!address) return '-';
  const parts = address.split(':');
  if (parts.length > 1) {
    return parts.slice(0, -1).join(':');
  }
  return address;
}

// ---------------------------------------------------------------------------
// Ping color based on RTT
// ---------------------------------------------------------------------------
function getPingColor(ms) {
  if (ms === null || ms === undefined) return colors.textLight;
  if (ms < 20) return colors.success;
  if (ms < 80) return colors.warning;
  return colors.danger;
}

// ---------------------------------------------------------------------------
// Helper: parse MikroTik uptime string like "1d5h30m15s" to seconds
// ---------------------------------------------------------------------------
function parseUptimeToSeconds(uptime) {
  if (!uptime) return 0;
  if (typeof uptime === 'number') return uptime;
  const str = String(uptime);
  let total = 0;
  const weeks = str.match(/(\d+)w/);
  const days = str.match(/(\d+)d/);
  const hours = str.match(/(\d+)h/);
  const mins = str.match(/(\d+)m(?!s)/);
  const secs = str.match(/(\d+)s/);
  if (weeks) total += parseInt(weeks[1], 10) * 604800;
  if (days) total += parseInt(days[1], 10) * 86400;
  if (hours) total += parseInt(hours[1], 10) * 3600;
  if (mins) total += parseInt(mins[1], 10) * 60;
  if (secs) total += parseInt(secs[1], 10);
  return total || 0;
}

// ===========================================================================
// SpeedChart: Simple View-based bar chart for bandwidth history
// ===========================================================================
const SpeedChart = React.memo(({ data, maxSpeed }) => {
  const effectiveMax = maxSpeed > 0 ? maxSpeed : 1;
  const barGroupWidth = (SCREEN_WIDTH - spacing.base * 2 - spacing.base * 2 - 2) / MAX_DATA_POINTS;
  const barWidth = Math.max(barGroupWidth / 2 - 1, 2);

  return (
    <View style={chartStyles.container}>
      <View style={chartStyles.barsRow}>
        {data.map((point, i) => {
          const dlHeight = Math.max((point.download / effectiveMax) * CHART_HEIGHT, 1);
          const ulHeight = Math.max((point.upload / effectiveMax) * CHART_HEIGHT, 1);
          return (
            <View key={i} style={[chartStyles.barGroup, { width: barGroupWidth }]}>
              <View style={chartStyles.barWrapper}>
                <View
                  style={[
                    chartStyles.downloadBar,
                    {
                      height: dlHeight,
                      width: barWidth,
                    },
                  ]}
                />
                <View
                  style={[
                    chartStyles.uploadBar,
                    {
                      height: ulHeight,
                      width: barWidth,
                    },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
      <View style={chartStyles.legendRow}>
        <View style={chartStyles.legendItem}>
          <View style={[chartStyles.legendDot, { backgroundColor: colors.success }]} />
          <Text style={chartStyles.legendText}>Download</Text>
        </View>
        <Text style={chartStyles.legendLabel}>Last 60 seconds</Text>
        <View style={chartStyles.legendItem}>
          <View style={[chartStyles.legendDot, { backgroundColor: colors.primary }]} />
          <Text style={chartStyles.legendText}>Upload</Text>
        </View>
      </View>
    </View>
  );
});

const chartStyles = StyleSheet.create({
  container: {
    paddingVertical: spacing.sm,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: CHART_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  barGroup: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  barWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 1,
  },
  downloadBar: {
    backgroundColor: colors.success,
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
  },
  uploadBar: {
    backgroundColor: colors.primary,
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  legendText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  legendLabel: {
    ...typography.caption,
    color: colors.textLight,
  },
});

// ===========================================================================
// ConnectionRow: Single row in the connections table
// ===========================================================================
function ConnectionRow({ item, isLast }) {
  return (
    <View style={[connStyles.row, !isLast && connStyles.rowBorder]}>
      <View style={connStyles.protocolCol}>
        <View
          style={[
            connStyles.protocolBadge,
            {
              backgroundColor:
                item.protocol === 'TCP'
                  ? colors.primary + '20'
                  : colors.warning + '20',
            },
          ]}
        >
          <Text
            style={[
              connStyles.protocolText,
              {
                color:
                  item.protocol === 'TCP' ? colors.primary : colors.warning,
              },
            ]}
          >
            {item.protocol || '-'}
          </Text>
        </View>
      </View>
      <View style={connStyles.ipCol}>
        <Text style={connStyles.ipText} numberOfLines={1}>
          {extractIP(item.dst_address)}
        </Text>
        <Text style={connStyles.portText}>:{extractPort(item.dst_address)}</Text>
      </View>
      <View style={connStyles.speedCol}>
        <Text style={connStyles.dlText}>{formatRate(item.rx_rate)}</Text>
        <Text style={connStyles.ulText}>{formatRate(item.tx_rate)}</Text>
      </View>
    </View>
  );
}

const connStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  protocolCol: {
    width: 50,
  },
  protocolBadge: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    alignSelf: 'flex-start',
  },
  protocolText: {
    ...typography.caption,
    fontWeight: '700',
  },
  ipCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.xs,
  },
  ipText: {
    ...typography.bodySmall,
    color: colors.text,
    flexShrink: 1,
  },
  portText: {
    ...typography.bodySmall,
    color: colors.textLight,
  },
  speedCol: {
    width: 90,
    alignItems: 'flex-end',
  },
  dlText: {
    ...typography.caption,
    color: colors.success,
    fontWeight: '600',
  },
  ulText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
});

// ===========================================================================
// Main Screen
// ===========================================================================
export default function LiveBandwidthScreen({ route, navigation }) {
  const {
    subscriberId,
    subscriberName = '',
    subscriberUsername = '',
  } = route.params || {};

  // ---- State ----
  const [isPaused, setIsPaused] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [ipAddress, setIpAddress] = useState('-');
  const [currentDownload, setCurrentDownload] = useState(0);
  const [currentUpload, setCurrentUpload] = useState(0);
  const [pingMs, setPingMs] = useState(null);
  const [pingOk, setPingOk] = useState(false);
  const [sessionUptime, setSessionUptime] = useState(0);
  const [totalDownloaded, setTotalDownloaded] = useState(0);
  const [totalUploaded, setTotalUploaded] = useState(0);
  const [history, setHistory] = useState(() =>
    Array.from({ length: MAX_DATA_POINTS }, () => ({
      download: 0,
      upload: 0,
      ping: null,
    })),
  );
  const [connections, setConnections] = useState([]);
  const [error, setError] = useState(null);
  const [pollCount, setPollCount] = useState(0);

  // For average speed calculation
  const speedSumRef = useRef({ download: 0, upload: 0, count: 0 });
  const intervalRef = useRef(null);

  // ---- Polling ----
  const fetchData = useCallback(async () => {
    if (!subscriberId) {
      setError('Subscriber ID not found');
      return;
    }
    try {
      // Fetch bandwidth and torch in parallel
      const [bwResponse, torchResponse] = await Promise.allSettled([
        subscriberApi.bandwidth(subscriberId),
        subscriberApi.torch(subscriberId),
      ]);

      // Process bandwidth data
      if (bwResponse.status === 'fulfilled' && bwResponse.value?.data) {
        const bw = bwResponse.value.data.data || bwResponse.value.data;
        const dl = bw.download || 0;
        const ul = bw.upload || 0;
        const ping = bw.ping_ms ?? null;
        const ok = bw.ping_ok ?? false;
        const ip = bw.ip_address || '-';
        const uptime = parseUptimeToSeconds(bw.uptime);

        setCurrentDownload(dl);
        setCurrentUpload(ul);
        setPingMs(ping);
        setPingOk(ok);
        setIpAddress(ip);
        setIsOnline(dl > 0 || ul > 0 || ok || (!!ip && ip !== '-'));
        setSessionUptime(uptime);
        setError(null);

        // Accumulate for average
        if (dl > 0 || ul > 0) {
          speedSumRef.current.download += dl;
          speedSumRef.current.upload += ul;
          speedSumRef.current.count += 1;
        }

        // Use rx_bytes/tx_bytes from API (accumulated session bytes)
        if (bw.tx_bytes) {
          setTotalDownloaded(bw.tx_bytes); // tx from MikroTik = download to user
        }
        if (bw.rx_bytes) {
          setTotalUploaded(bw.rx_bytes); // rx from MikroTik = upload from user
        }

        // Update history
        setHistory((prev) => {
          const next = [...prev.slice(1), { download: dl, upload: ul, ping }];
          return next;
        });

        setPollCount((c) => c + 1);
      } else if (bwResponse.status === 'rejected') {
        setError(bwResponse.reason?.message || 'Failed to fetch bandwidth');
      }

      // Process torch data (connections)
      if (torchResponse.status === 'fulfilled' && torchResponse.value?.data) {
        const torchData = torchResponse.value.data.data || torchResponse.value.data;
        // Backend returns {entries: [...], total_tx, total_rx, ...}
        const entries = Array.isArray(torchData)
          ? torchData
          : Array.isArray(torchData?.entries)
            ? torchData.entries
            : [];
        if (entries.length > 0) {
          // Normalize entries: combine dst_address + dst_port into single field
          const normalized = entries.map((e) => ({
            ...e,
            protocol: (e.protocol || '-').toUpperCase(),
            dst_address: e.dst_port
              ? `${e.dst_address || '-'}:${e.dst_port}`
              : e.dst_address || '-',
          }));
          // Sort by download rate (rx_rate) descending
          const sorted = normalized.sort(
            (a, b) => (b.rx_rate || 0) - (a.rx_rate || 0),
          );
          setConnections(sorted.slice(0, 20)); // Limit to top 20
        } else {
          setConnections([]);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch data');
    }
  }, [subscriberId]);

  // Start/stop polling
  useEffect(() => {
    if (!isPaused) {
      // Fetch immediately
      fetchData();
      intervalRef.current = setInterval(fetchData, POLL_INTERVAL);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPaused, fetchData]);

  // ---- Computed values ----
  const maxSpeed = Math.max(
    ...history.map((p) => Math.max(p.download, p.upload)),
    1,
  );

  const avgDownload =
    speedSumRef.current.count > 0
      ? speedSumRef.current.download / speedSumRef.current.count
      : 0;
  const avgUpload =
    speedSumRef.current.count > 0
      ? speedSumRef.current.upload / speedSumRef.current.count
      : 0;

  // ---- Render ----
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header bar */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backArrow}>{'\u2190'}</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleArea}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {subscriberUsername || 'Live Bandwidth'}
          </Text>
          {subscriberName ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {subscriberName}
            </Text>
          ) : null}
        </View>
        <View style={styles.headerRight}>
          {isPaused ? (
            <View style={styles.pausedBadge}>
              <Text style={styles.pausedBadgeText}>Paused</Text>
            </View>
          ) : null}
          <StatusBadge status={isOnline ? 'online' : 'offline'} />
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Error banner */}
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* IP Address row */}
        <View style={styles.ipRow}>
          <Text style={styles.ipLabel}>IP Address</Text>
          <Text style={styles.ipValue}>{ipAddress}</Text>
        </View>

        {/* ====== Current Speed Display ====== */}
        <View style={styles.speedDisplayContainer}>
          {/* Download */}
          <View style={styles.speedCard}>
            <View style={styles.speedArrowContainer}>
              <Text style={[styles.speedArrow, { color: colors.success }]}>
                {'\u2193'}
              </Text>
            </View>
            <Text
              style={[styles.speedValue, { color: colors.success }]}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              {formatMbps(currentDownload)}
            </Text>
            <Text style={styles.speedUnit}>Mbps</Text>
            <Text style={styles.speedLabel}>Download</Text>
          </View>

          {/* Upload */}
          <View style={styles.speedCard}>
            <View style={styles.speedArrowContainer}>
              <Text style={[styles.speedArrow, { color: colors.primary }]}>
                {'\u2191'}
              </Text>
            </View>
            <Text
              style={[styles.speedValue, { color: colors.primary }]}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              {formatMbps(currentUpload)}
            </Text>
            <Text style={styles.speedUnit}>Mbps</Text>
            <Text style={styles.speedLabel}>Upload</Text>
          </View>

          {/* Ping */}
          <View style={styles.speedCard}>
            <View style={styles.speedArrowContainer}>
              <Text style={[styles.speedArrow, { color: getPingColor(pingMs) }]}>
                {'\u25CF'}
              </Text>
            </View>
            <Text
              style={[styles.speedValue, { color: getPingColor(pingMs) }]}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              {pingOk && pingMs !== null ? Math.round(pingMs) : '--'}
            </Text>
            <Text style={styles.speedUnit}>ms</Text>
            <Text style={styles.speedLabel}>Ping</Text>
          </View>
        </View>

        {/* ====== Speed History Chart ====== */}
        <Card title="Speed History">
          <SpeedChart data={history} maxSpeed={maxSpeed} />
        </Card>

        {/* ====== Connection Details ====== */}
        <Card
          title="Active Connections"
          badge={connections.length > 0 ? `${connections.length}` : undefined}
          badgeColor={colors.info}
          style={styles.sectionCard}
        >
          {connections.length > 0 ? (
            <View>
              {/* Table header */}
              <View style={styles.connHeader}>
                <Text style={[styles.connHeaderText, { width: 50 }]}>Proto</Text>
                <Text style={[styles.connHeaderText, { flex: 1, marginHorizontal: spacing.xs }]}>
                  Remote IP : Port
                </Text>
                <Text style={[styles.connHeaderText, { width: 90, textAlign: 'right' }]}>
                  DL / UL
                </Text>
              </View>
              {connections.map((conn, idx) => (
                <ConnectionRow
                  key={idx}
                  item={conn}
                  isLast={idx === connections.length - 1}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyConnections}>
              <Text style={styles.emptyConnectionsText}>
                {isOnline
                  ? 'No active connections detected'
                  : 'Subscriber is offline'}
              </Text>
            </View>
          )}
        </Card>

        {/* ====== Stats Summary ====== */}
        <Card title="Session Stats" style={styles.sectionCard}>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Session Duration</Text>
              <Text style={styles.statValue}>
                {sessionUptime > 0 ? formatDuration(sessionUptime) : '--'}
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Total Downloaded</Text>
              <Text style={[styles.statValue, { color: colors.success }]}>
                {totalDownloaded > 0 ? formatBytes(totalDownloaded) : '--'}
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Total Uploaded</Text>
              <Text style={[styles.statValue, { color: colors.primary }]}>
                {totalUploaded > 0 ? formatBytes(totalUploaded) : '--'}
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Avg Download</Text>
              <Text style={styles.statValue}>
                {avgDownload > 0 ? `${formatMbps(avgDownload)} Mbps` : '--'}
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Avg Upload</Text>
              <Text style={styles.statValue}>
                {avgUpload > 0 ? `${formatMbps(avgUpload)} Mbps` : '--'}
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Polls</Text>
              <Text style={styles.statValue}>{pollCount}</Text>
            </View>
          </View>
        </Card>

        {/* Bottom spacer */}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      {/* ====== Start/Pause FAB ====== */}
      <TouchableOpacity
        style={[
          styles.fab,
          isPaused ? styles.fabPaused : styles.fabActive,
        ]}
        onPress={() => setIsPaused((p) => !p)}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>{isPaused ? '\u25B6' : '\u23F8'}</Text>
        <Text style={styles.fabText}>{isPaused ? 'Resume' : 'Pause'}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ===========================================================================
// Styles
// ===========================================================================
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ---- Header ----
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    marginRight: spacing.md,
    padding: spacing.xs,
  },
  backArrow: {
    fontSize: 22,
    color: colors.primary,
    fontWeight: '600',
  },
  headerTitleArea: {
    flex: 1,
  },
  headerTitle: {
    ...typography.h4,
    color: colors.text,
  },
  headerSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pausedBadge: {
    backgroundColor: colors.warning + '25',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  pausedBadgeText: {
    ...typography.caption,
    color: colors.warning,
    fontWeight: '700',
  },

  // ---- Scroll ----
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
  },

  // ---- Error ----
  errorBanner: {
    backgroundColor: colors.danger + '15',
    borderWidth: 1,
    borderColor: colors.danger + '30',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.danger,
  },

  // ---- IP row ----
  ipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  ipLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  ipValue: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },

  // ---- Speed Display ----
  speedDisplayContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  speedCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  speedArrowContainer: {
    marginBottom: spacing.xs,
  },
  speedArrow: {
    fontSize: 20,
    fontWeight: '700',
  },
  speedValue: {
    fontSize: 26,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  speedUnit: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  speedLabel: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: spacing.xs,
  },

  // ---- Section cards ----
  sectionCard: {
    marginTop: spacing.md,
  },

  // ---- Connection header ----
  connHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.xs,
  },
  connHeaderText: {
    ...typography.caption,
    color: colors.textLight,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ---- Empty connections ----
  emptyConnections: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyConnectionsText: {
    ...typography.bodySmall,
    color: colors.textLight,
  },

  // ---- Stats grid ----
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statItem: {
    width: '50%',
    paddingVertical: spacing.sm,
    paddingRight: spacing.sm,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  statValue: {
    ...typography.h4,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },

  // ---- FAB ----
  fab: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 36 : 20,
    right: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  fabActive: {
    backgroundColor: colors.primary,
  },
  fabPaused: {
    backgroundColor: colors.success,
  },
  fabIcon: {
    fontSize: 16,
    color: colors.textInverse,
    marginRight: spacing.xs,
  },
  fabText: {
    ...typography.button,
    color: colors.textInverse,
  },
});
