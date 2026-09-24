import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import {
  CheckCircle2,
  ClipboardList,
  FileText,
  Gavel,
  LogOut,
  XCircle,
} from "lucide-react-native";
import { router } from "expo-router";

import { auth } from "@/firebase/config";
import API_URL from "@/services/api";
import { logOut } from "@/services/auth";

type ApplicationStatus = "pending" | "approved" | "rejected";

type ArtistApplication = {
  id: number;
  artist_name: string;
  email: string;
  hourly_rate: string;
  bio: string;
  portfolio: Array<{
    title?: string;
    description?: string;
    imageDataUri?: string;
    imageUri?: string;
  }>;
  bir_certificate: string;
  sworn_declaration: string;
  status: ApplicationStatus;
  submitted_at: string;
};

type ArtistApplicationLog = {
  id: number;
  action: string;
  previous_status: string;
  new_status: string;
  reason: string;
  artist_name: string;
  actor_name: string;
  created_at: string;
};

const statusLabel: Record<ApplicationStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const statusStyle = (status: ApplicationStatus) => {
  if (status === "approved") return styles.statusApproved;
  if (status === "rejected") return styles.statusRejected;
  return styles.statusPending;
};

export default function HrDashboardScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const [applications, setApplications] = useState<ArtistApplication[]>([]);
  const [filter, setFilter] = useState<"all" | ApplicationStatus>("all");
  const [selectedApplication, setSelectedApplication] =
    useState<ArtistApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [logs, setLogs] = useState<ArtistApplicationLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const getToken = async () => {
    const user = auth.currentUser;
    if (!user) throw new Error("Please log in with an HR account.");
    return user.getIdToken();
  };

  const loadApplications = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const response = await fetch(
        `${API_URL}/api/users/artist-applications/`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Unable to load artist applications.");
      setApplications(payload);
    } catch (error: any) {
      Alert.alert(
        "HR dashboard",
        error.message || "Unable to load artist applications.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApplications();
  }, []);

  const loadLogs = async () => {
    try {
      setLogsLoading(true);
      const token = await getToken();
      const response = await fetch(
        `${API_URL}/api/users/artist-application-logs/`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Unable to load activity logs.");
      setLogs(payload);
      setShowLogs(true);
    } catch (error: any) {
      Alert.alert(
        "Activity logs",
        error.message || "Unable to load activity logs.",
      );
    } finally {
      setLogsLoading(false);
    }
  };

  const reviewApplication = async (
    application: ArtistApplication,
    status: "approved" | "rejected",
    reason = "",
  ) => {
    try {
      setUpdatingId(application.id);
      const token = await getToken();
      const response = await fetch(
        `${API_URL}/api/users/artist-applications/${application.id}/`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status, rejection_reason: reason }),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Unable to update this application.");

      setApplications((items) =>
        items.map((item) =>
          item.id === application.id ? { ...item, status } : item,
        ),
      );
      setSelectedApplication(null);
      setIsRejecting(false);
      setRejectionReason("");
      Alert.alert(
        status === "approved" ? "Approved" : "Rejected",
        status === "approved"
          ? `${application.artist_name}'s request has been approved. The artist has been notified.`
          : `${application.artist_name}'s request has been rejected. The artist has been notified.`,
      );
      if (showLogs) loadLogs();
    } catch (error: any) {
      Alert.alert(
        "Review failed",
        error.message || "Unable to update this application.",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredApplications = useMemo(
    () =>
      filter === "all"
        ? applications
        : applications.filter((application) => application.status === filter),
    [applications, filter],
  );

  const pendingCount = applications.filter(
    (application) => application.status === "pending",
  ).length;
  const approvedCount = applications.filter(
    (application) => application.status === "approved",
  ).length;

  const handleLogout = async () => {
    await logOut();
    router.replace("/login");
  };

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <View>
            <Text style={styles.brand}>ArtFiliere</Text>
            <Text style={styles.roleLabel}>HR PORTAL</Text>
          </View>
          <TouchableOpacity style={styles.accountButton} onPress={handleLogout}>
            <LogOut size={15} color="#5A4039" />
            <Text style={styles.accountButtonText}>Log out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.content, !isWide && styles.contentCompact]}>
          <View style={styles.navBar}>
            <Text style={styles.activeNav}>Artist Registration</Text>
            <TouchableOpacity onPress={loadLogs} disabled={logsLoading}>
              <Text style={styles.navText}>
                {logsLoading ? "Loading logs..." : "Activity Logs"}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.pageTitle}>Artist Registration Requests</Text>
          <Text style={styles.pageSubtitle}>
            Review submitted documents and approve artists when their
            application is complete.
          </Text>

          <View
            style={[styles.summaryRow, !isWide && styles.summaryRowCompact]}
          >
            <SummaryCard
              icon={<ClipboardList size={22} color="#C15656" />}
              label="Pending requests"
              value={pendingCount}
            />
            <SummaryCard
              icon={<CheckCircle2 size={22} color="#5D8A63" />}
              label="Approved artists"
              value={approvedCount}
            />
            <SummaryCard
              icon={<Gavel size={22} color="#8B6E49" />}
              label="Total applications"
              value={applications.length}
            />
          </View>

          <View style={styles.panel}>
            <View
              style={[styles.panelHeader, !isWide && styles.panelHeaderCompact]}
            >
              <Text style={styles.panelTitle}>Artist applications</Text>
              <View style={styles.filterRow}>
                {(["all", "pending", "approved", "rejected"] as const).map(
                  (item) => (
                    <TouchableOpacity
                      key={item}
                      onPress={() => setFilter(item)}
                      style={[
                        styles.filterChip,
                        filter === item && styles.filterChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          filter === item && styles.filterChipTextActive,
                        ]}
                      >
                        {item === "all" ? "All" : statusLabel[item]}
                      </Text>
                    </TouchableOpacity>
                  ),
                )}
              </View>
            </View>

            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator size="large" color="#C15656" />
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.table}>
                  <TableHeader />
                  {filteredApplications.length === 0 ? (
                    <Text style={styles.emptyText}>
                      No artist applications found.
                    </Text>
                  ) : (
                    filteredApplications.map((application) => (
                      <View key={application.id} style={styles.tableRow}>
                        <Text style={[styles.cell, styles.artistCell]}>
                          {application.artist_name}
                        </Text>
                        <Text style={[styles.cell, styles.emailCell]}>
                          {application.email}
                        </Text>
                        <Text style={[styles.cell, styles.rateCell]}>
                          Php {application.hourly_rate}
                        </Text>
                        <Text style={[styles.cell, styles.portfolioCell]}>
                          {application.portfolio.length} piece
                          {application.portfolio.length === 1 ? "" : "s"}
                        </Text>
                        <Text
                          style={[
                            styles.cell,
                            styles.statusCell,
                            statusStyle(application.status),
                          ]}
                        >
                          {statusLabel[application.status]}
                        </Text>
                        <TouchableOpacity
                          onPress={() => {
                            setSelectedApplication(application);
                            setIsRejecting(false);
                            setRejectionReason("");
                          }}
                        >
                          <Text style={styles.viewLink}>View</Text>
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </View>
              </ScrollView>
            )}
          </View>

          {showLogs && (
            <View style={styles.logPanel}>
              <View style={styles.logPanelHeader}>
                <Text style={styles.panelTitle}>Activity logs</Text>
                <TouchableOpacity onPress={() => setShowLogs(false)}>
                  <Text style={styles.closeLogText}>Close</Text>
                </TouchableOpacity>
              </View>
              {logs.length === 0 ? (
                <Text style={styles.emptyText}>
                  No activity has been logged yet.
                </Text>
              ) : (
                logs.map((log) => (
                  <View key={log.id} style={styles.logRow}>
                    <Text style={styles.logAction}>
                      {log.action.replace("_", " ")}
                    </Text>
                    <Text style={styles.logDetail}>
                      {log.artist_name} · by {log.actor_name}
                    </Text>
                    {!!log.reason && (
                      <Text style={styles.logDetail}>Reason: {log.reason}</Text>
                    )}
                    <Text style={styles.logDetail}>
                      {new Date(log.created_at).toLocaleString()}
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={!!selectedApplication}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedApplication(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setSelectedApplication(null)}
        >
          <Pressable
            style={styles.modalCard}
            onPress={(event) => event.stopPropagation()}
          >
            {selectedApplication && (
              <>
                <Text style={styles.modalTitle}>
                  {selectedApplication.artist_name}
                </Text>
                <Text style={styles.modalEmail}>
                  {selectedApplication.email}
                </Text>
                <Text style={styles.detailLabel}>Hourly rate</Text>
                <Text style={styles.detailValue}>
                  Php {selectedApplication.hourly_rate}
                </Text>
                <Text style={styles.detailLabel}>Bio</Text>
                <Text style={styles.detailValue}>
                  {selectedApplication.bio || "No bio provided."}
                </Text>
                <Text style={styles.detailLabel}>Portfolio</Text>
                {selectedApplication.portfolio.length ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.portfolioGallery}
                  >
                    {selectedApplication.portfolio.map((item, index) => {
                      const imageUri = item.imageDataUri || item.imageUri;
                      return (
                        <View
                          key={`${item.title || "artwork"}-${index}`}
                          style={styles.portfolioPiece}
                        >
                          {imageUri ? (
                            <Image
                              source={{ uri: imageUri }}
                              style={styles.portfolioImage}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={styles.missingImage}>
                              <FileText size={25} color="#A98E82" />
                            </View>
                          )}
                          <Text style={styles.portfolioTitle} numberOfLines={1}>
                            {item.title || "Untitled artwork"}
                          </Text>
                          {!!item.description && (
                            <Text
                              style={styles.portfolioDescription}
                              numberOfLines={2}
                            >
                              {item.description}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <Text style={styles.detailValue}>No pieces listed.</Text>
                )}
                <Text style={styles.detailLabel}>Submitted documents</Text>
                <Text style={styles.detailValue}>
                  {selectedApplication.bir_certificate} ·{" "}
                  {selectedApplication.sworn_declaration}
                </Text>
                {selectedApplication.status === "pending" &&
                  (isRejecting ? (
                    <View style={styles.rejectForm}>
                      <Text style={styles.detailLabel}>
                        Reason for rejection
                      </Text>
                      <TextInput
                        style={styles.reasonInput}
                        value={rejectionReason}
                        onChangeText={setRejectionReason}
                        placeholder="Explain what the applicant needs to correct..."
                        placeholderTextColor="#9A8D88"
                        multiline
                        maxLength={1000}
                      />
                      <View style={styles.reviewActions}>
                        <TouchableOpacity
                          disabled={updatingId === selectedApplication.id}
                          style={[styles.reviewButton, styles.cancelButton]}
                          onPress={() => {
                            setIsRejecting(false);
                            setRejectionReason("");
                          }}
                        >
                          <Text style={styles.reviewButtonText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          disabled={
                            updatingId === selectedApplication.id ||
                            !rejectionReason.trim()
                          }
                          style={[
                            styles.reviewButton,
                            styles.rejectButton,
                            !rejectionReason.trim() && styles.disabledButton,
                          ]}
                          onPress={() =>
                            reviewApplication(
                              selectedApplication,
                              "rejected",
                              rejectionReason.trim(),
                            )
                          }
                        >
                          <XCircle size={16} color="#FFFFFF" />
                          <Text style={styles.reviewButtonText}>
                            {updatingId === selectedApplication.id
                              ? "Saving..."
                              : "Confirm rejection"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.reviewActions}>
                      <TouchableOpacity
                        disabled={updatingId === selectedApplication.id}
                        style={[styles.reviewButton, styles.rejectButton]}
                        onPress={() => setIsRejecting(true)}
                      >
                        <XCircle size={16} color="#FFFFFF" />
                        <Text style={styles.reviewButtonText}>Reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={updatingId === selectedApplication.id}
                        style={[styles.reviewButton, styles.approveButton]}
                        onPress={() =>
                          reviewApplication(selectedApplication, "approved")
                        }
                      >
                        <CheckCircle2 size={16} color="#FFFFFF" />
                        <Text style={styles.reviewButtonText}>
                          {updatingId === selectedApplication.id
                            ? "Saving..."
                            : "Approve"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryIcon}>{icon}</View>
      <View>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={styles.summaryValue}>{value}</Text>
      </View>
    </View>
  );
}

function TableHeader() {
  return (
    <View style={[styles.tableRow, styles.tableHeader]}>
      <Text style={[styles.headerCell, styles.artistCell]}>Artist</Text>
      <Text style={[styles.headerCell, styles.emailCell]}>Email</Text>
      <Text style={[styles.headerCell, styles.rateCell]}>Rate</Text>
      <Text style={[styles.headerCell, styles.portfolioCell]}>Portfolio</Text>
      <Text style={[styles.headerCell, styles.statusCell]}>Status</Text>
      <Text style={styles.headerCell}>Action</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#24211F" },
  header: {
    backgroundColor: "#FFF8D6",
    borderBottomWidth: 2,
    borderBottomColor: "#D87964",
  },
  headerInner: {
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    paddingHorizontal: 24,
    height: 90,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: { color: "#D45C5C", fontSize: 28, fontWeight: "800" },
  roleLabel: {
    color: "#8B6E49",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginTop: 2,
  },
  accountButton: {
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#C9B77C",
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  accountButtonText: { color: "#5A4039", fontSize: 12, fontWeight: "800" },
  scrollContent: { flexGrow: 1, backgroundColor: "#FFFDF5" },
  content: {
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  contentCompact: { paddingHorizontal: 14 },
  navBar: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#E8D8B3",
  },
  navText: { color: "#6F625D", fontSize: 12, fontWeight: "700" },
  activeNav: {
    color: "#C15656",
    fontSize: 12,
    fontWeight: "800",
    borderBottomWidth: 2,
    borderBottomColor: "#C15656",
    paddingVertical: 16,
  },
  pageTitle: {
    color: "#322B29",
    fontSize: 24,
    fontWeight: "800",
    marginTop: 26,
  },
  pageSubtitle: {
    color: "#746865",
    fontSize: 13,
    marginTop: 5,
    marginBottom: 20,
  },
  summaryRow: { flexDirection: "row", gap: 14, marginBottom: 22 },
  summaryRowCompact: { flexWrap: "wrap" },
  summaryCard: {
    minWidth: 190,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#E3D8CC",
    padding: 15,
    shadowColor: "#4F403B",
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  summaryIcon: {
    backgroundColor: "#FFF3E5",
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryLabel: { color: "#746865", fontSize: 11, fontWeight: "700" },
  summaryValue: {
    color: "#342B28",
    fontSize: 24,
    fontWeight: "800",
    marginTop: 2,
  },
  panel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E3D8CC",
    overflow: "hidden",
  },
  panelHeader: {
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#EEE4DA",
  },
  panelHeaderCompact: {
    alignItems: "flex-start",
    flexDirection: "column",
    gap: 12,
  },
  panelTitle: { color: "#433633", fontSize: 16, fontWeight: "800" },
  filterRow: { flexDirection: "row", gap: 6 },
  filterChip: {
    borderWidth: 1,
    borderColor: "#DECFC5",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  filterChipActive: { backgroundColor: "#C15656", borderColor: "#C15656" },
  filterChipText: { color: "#7C6A64", fontSize: 11, fontWeight: "700" },
  filterChipTextActive: { color: "#FFFFFF" },
  logPanel: {
    marginTop: 22,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E3D8CC",
    overflow: "hidden",
  },
  logPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#EEE4DA",
  },
  closeLogText: { color: "#C15656", fontSize: 12, fontWeight: "800" },
  logRow: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0E8E2",
  },
  logAction: {
    color: "#4B403C",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  logDetail: { color: "#7C6A64", fontSize: 11, marginTop: 2 },
  loading: { height: 260, justifyContent: "center", alignItems: "center" },
  table: { minWidth: 900 },
  tableRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#F0E8E2",
    paddingHorizontal: 16,
  },
  tableHeader: { minHeight: 38, backgroundColor: "#FFF5D8" },
  cell: { color: "#4B403C", fontSize: 12 },
  headerCell: { color: "#58463E", fontSize: 11, fontWeight: "800" },
  artistCell: { width: 155, fontWeight: "700" },
  emailCell: { width: 220 },
  rateCell: { width: 120 },
  portfolioCell: { width: 115 },
  statusCell: { width: 110, fontWeight: "800" },
  statusPending: { color: "#B37D21" },
  statusApproved: { color: "#4F8757" },
  statusRejected: { color: "#C15656" },
  viewLink: { color: "#5384A3", fontSize: 12, fontWeight: "800" },
  emptyText: { padding: 28, color: "#7C6A64" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(35, 28, 25, 0.52)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 500,
    maxHeight: "88%",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 24,
  },
  modalTitle: { color: "#3A2D2A", fontSize: 23, fontWeight: "800" },
  modalEmail: {
    color: "#857671",
    fontSize: 13,
    marginTop: 3,
    marginBottom: 18,
  },
  detailLabel: {
    color: "#C15656",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 12,
    marginBottom: 3,
  },
  detailValue: { color: "#514541", fontSize: 13, lineHeight: 19 },
  portfolioGallery: { gap: 10, paddingVertical: 3 },
  portfolioPiece: { width: 145 },
  portfolioImage: {
    width: 145,
    height: 120,
    borderRadius: 8,
    backgroundColor: "#F2ECE7",
  },
  missingImage: {
    width: 145,
    height: 120,
    borderRadius: 8,
    backgroundColor: "#F2ECE7",
    justifyContent: "center",
    alignItems: "center",
  },
  portfolioTitle: {
    color: "#514541",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 5,
  },
  portfolioDescription: {
    color: "#857671",
    fontSize: 10,
    marginTop: 2,
    lineHeight: 14,
  },
  rejectForm: { marginTop: 12 },
  reasonInput: {
    minHeight: 92,
    borderWidth: 1,
    borderColor: "#DCCFC7",
    borderRadius: 8,
    padding: 10,
    color: "#514541",
    fontSize: 13,
    textAlignVertical: "top",
  },
  reviewActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 24,
  },
  reviewButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 7,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rejectButton: { backgroundColor: "#A86868" },
  approveButton: { backgroundColor: "#5D8A63" },
  cancelButton: { backgroundColor: "#8A7C76" },
  disabledButton: { opacity: 0.55 },
  reviewButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
});
