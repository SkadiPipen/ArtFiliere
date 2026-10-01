import { auth } from "@/firebase/config";
import { ChatModal } from "@/module/chat-negotiations/chat-index";
import API_URL from "@/services/api";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Eye,
  ImageIcon,
  MessageCircle,
  Paintbrush,
  Trash2,
  Truck,
  UploadCloud,
  XCircle,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function CommissionsScreen() {
  const router = useRouter();
  const [windowWidth, setWindowWidth] = useState(
    Dimensions.get("window").width,
  );
  const isDesktop = windowWidth >= 960;

  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const styleId = "custom-artfiliere-scrollbar";
      if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.innerHTML = `
          /* Slim X-style scrollbar */
          ::-webkit-scrollbar {
            width: 6px;
            height: 6px;
          }
          ::-webkit-scrollbar-track {
            background: transparent;
          }
          ::-webkit-scrollbar-thumb {
            background-color: #E2D7C8; /* Matches border beige */
            border-radius: 10px;
          }
          ::-webkit-scrollbar-thumb:hover {
            background-color: #C15656; /* ArtFiliere Red on hover */
          }
          * {
            scrollbar-width: thin;
            scrollbar-color: #E2D7C8 transparent;
          }
        `;
        document.head.appendChild(style);
      }
    }
  }, []);

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => {
      setWindowWidth(window.width);
    });
    return () => sub?.remove();
  }, []);

  const [role, setRole] = useState<"buyer" | "artist">("buyer");
  const [userRole, setUserRole] = useState<string>("buyer");
  const [commissions, setCommissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatTargetUser, setChatTargetUser] = useState<{
    id: string;
    name: string;
    role: string;
  } | null>(null);

  // Right Inspector Panel State
  const [selectedCommission, setSelectedCommission] = useState<any | null>(
    null,
  );
  const [rightPanelMode, setRightPanelMode] = useState<
    "track" | "upload" | "map" | "empty"
  >("empty");
  const [trackData, setTrackData] = useState<any>(null);
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);

  // 3-Stage Progress
  const [selectedStage, setSelectedStage] = useState<number>(1);
  const [imageUrlInput, setImageUrlInput] = useState<string>("");
  const [captionInput, setCaptionInput] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  // Automated Cancellation Modal
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("Change of plans/budget");
  const [cancelFeedback, setCancelFeedback] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const [isDragging, setIsDragging] = useState(false);
  const [payingMilestoneId, setPayingMilestoneId] = useState<number | null>(
    null,
  );
  const params = useLocalSearchParams<{
    payment?: string;
    milestone?: string;
  }>();

  // Delivery Map
  const [deliveryData, setDeliveryData] = useState<any>(null);
  const [loadingDelivery, setLoadingDelivery] = useState(false);

  useEffect(() => {
    if (params.payment === "success" && params.milestone) {
      const milestoneId = Number(params.milestone);
      const verifyPayment = async () => {
        try {
          const res = await fetch(
            `${API_URL}/api/commissions/milestones/${milestoneId}/verify/`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
            },
          );
          if (res.ok) {
            if (Platform.OS === "web") {
              window.alert(
                "Payment confirmed! Your milestone is now marked as PAID.",
              );
            } else {
              Alert.alert(
                "Payment Confirmed",
                "Your milestone is now marked as PAID.",
              );
            }
            await fetchCommissions();
          }
        } catch (e) {
          console.warn("Could not verify milestone payment:", e);
        }
      };

      verifyPayment();
    }
  }, [params.payment, params.milestone]);

  const handlePickProgressImage = async () => {
    try {
      if (Platform.OS !== "web") {
        const { status } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permission Denied",
            "Camera roll access is needed to upload updates.",
          );
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        const uri = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;
        setImageUrlInput(uri);
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to select image.");
    }
  };

  const handleDropFile = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (!file.type.startsWith("image/")) {
        Alert.alert(
          "Invalid File",
          "Please upload an image file (PNG, JPG, WEBP).",
        );
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImageUrlInput(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const cancelChoices = [
    "Change of plans/budget",
    "Timeline/deadline too long",
    "Artist vision differs from expectations",
    "Other reasons",
  ];

  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;

        const res = await fetch(`${API_URL}/auth/me/`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
        if (res.ok) {
          const data = await res.json();
          setUserRole((data.role || "buyer").toLowerCase());
        }
      } catch (err) {
        console.warn("Failed to fetch user role:", err);
      }
    };
    fetchUserRole();
  }, []);

  const isArtist = userRole === "artist";

  const currentChatUser = auth.currentUser
    ? {
        id: auth.currentUser.uid,
        uid: auth.currentUser.uid,
        email: auth.currentUser.email || "",
        name:
          auth.currentUser.displayName ||
          auth.currentUser.email?.split("@")[0] ||
          "User",
        displayName:
          auth.currentUser.displayName ||
          auth.currentUser.email?.split("@")[0] ||
          "User",
        role: userRole,
      }
    : null;

  const fetchCommissions = async () => {
    try {
      setLoading(true);
      const email = auth.currentUser?.email || "";
      const username =
        auth.currentUser?.displayName || email.split("@")[0] || "";
      const res = await fetch(
        `${API_URL}/api/commissions/requests/?role=${role}&user_email=${encodeURIComponent(
          email,
        )}&buyer_username=${encodeURIComponent(username)}`,
      );
      if (res.ok) {
        const data = await res.json();
        // Keep a cancelled/declined request out of the active work dashboard
        // even if an older backend response is cached by a client.
        const activeCommissions = data.filter(
          (commission: any) => commission.status !== "CANCELLED",
        );
        setCommissions(activeCommissions);
        if (activeCommissions.length > 0 && isDesktop && !selectedCommission) {
          handleSelectForTrack(activeCommissions[0]);
        }
      }
    } catch (e) {
      console.warn("Error fetching commissions:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCommissions();
  }, [role]);

  const loadTrackData = async (commId: number) => {
    try {
      setLoadingTrack(true);
      const res = await fetch(
        `${API_URL}/api/commissions/requests/${commId}/track/`,
      );
      if (res.ok) {
        const data = await res.json();
        setTrackData(data);
        if (data.photos && data.photos.length > 0) {
          setSelectedPhotoIndex(data.photos.length - 1);
        } else {
          setSelectedPhotoIndex(0);
        }
      }
    } catch (e) {
      console.warn("Error loading process track:", e);
    } finally {
      setLoadingTrack(false);
    }
  };

  const handleSelectForTrack = (item: any) => {
    setSelectedCommission(item);
    setRightPanelMode("track");
    loadTrackData(item.commission_req_id);
  };

  const handleSelectForUpload = (item: any) => {
    setSelectedCommission(item);
    setRightPanelMode("upload");
    setImageUrlInput("");
    setCaptionInput("");
    setSelectedStage(
      item.status === "STAGE_1" ? 2 : item.status === "STAGE_2" ? 3 : 1,
    );
  };

  const handleManage = async (id: number, action: "ACCEPT" | "REJECT") => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error("Please log in again.");
      }
      const res = await fetch(
        `${API_URL}/api/commissions/requests/${id}/manage/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Unable to update this commission.");
      }
      if (Platform.OS === "web") {
        window.alert(
          `Commission marked as ${action === "ACCEPT" ? "In Progress" : "Declined"}`,
        );
      } else {
        Alert.alert(
          "Updated",
          `Commission marked as ${action === "ACCEPT" ? "In Progress" : "Declined"}`,
        );
      }
      fetchCommissions();
    } catch (e: any) {
      const message = e?.message || "Failed to update commission.";
      if (Platform.OS === "web") window.alert(message);
      else Alert.alert("Error", message);
    }
  };

  const handlePayMilestone = async (milestoneId: number, num: number) => {
    try {
      setPayingMilestoneId(milestoneId);
      const token = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(
        `${API_URL}/api/commissions/milestones/${milestoneId}/pay/`,
        {
          method: "POST",
          headers,
        },
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Payment initialization failed.");
      }

      if (data.checkout_url) {
        if (Platform.OS === "web") {
          window.location.href = data.checkout_url;
        } else {
          await Linking.openURL(data.checkout_url);
        }
      } else {
        if (Platform.OS === "web") {
          window.alert(`Milestone #${num} has been paid! (Test Mode)`);
        } else {
          Alert.alert("Payment Successful", `Milestone #${num} has been paid!`);
        }
        await fetchCommissions();
        if (selectedCommission) {
          loadTrackData(selectedCommission.commission_req_id);
        }
      }
    } catch (e: any) {
      if (Platform.OS === "web") {
        window.alert(e.message || "Payment processing failed");
      } else {
        Alert.alert("Payment Error", e.message || "Payment processing failed");
      }
    } finally {
      setPayingMilestoneId(null);
    }
  };

  const handleInlineUploadProgress = async () => {
    if (!imageUrlInput.trim()) {
      if (Platform.OS === "web")
        window.alert("Please enter an image URL or upload an image file.");
      else
        Alert.alert(
          "Required",
          "Please enter an image URL or upload an image file.",
        );
      return;
    }

    try {
      setUploading(true);
      const res = await fetch(
        `${API_URL}/api/commissions/requests/${selectedCommission.commission_req_id}/track/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: imageUrlInput,
            stage_number: selectedStage,
            progress_percentage:
              selectedStage === 1 ? 33 : selectedStage === 2 ? 66 : 100,
            caption: captionInput || `Stage ${selectedStage} progress update`,
          }),
        },
      );

      if (res.ok) {
        if (Platform.OS === "web")
          window.alert(`Stage ${selectedStage} update posted!`);
        else Alert.alert("Success", `Stage ${selectedStage} update posted!`);
        setImageUrlInput("");
        setCaptionInput("");
        await fetchCommissions();
        handleSelectForTrack(selectedCommission);
      } else {
        const err = await res.json();
        if (Platform.OS === "web")
          window.alert(err.error || "Failed to upload progress update.");
        else
          Alert.alert(
            "Error",
            err.error || "Failed to upload progress update.",
          );
      }
    } catch (e) {
      if (Platform.OS === "web")
        window.alert("Network error posting progress.");
      else Alert.alert("Error", "Network error posting progress.");
    } finally {
      setUploading(false);
    }
  };

  const submitCancellation = async () => {
    try {
      setCancelling(true);
      const res = await fetch(
        `${API_URL}/api/commissions/requests/${cancellingId}/cancel/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: cancelReason,
            feedback: cancelFeedback,
          }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        if (Platform.OS === "web") {
          window.alert(
            `Commission Cancelled: Your commission has been cancelled. An automated refund of ₱${data.refund_amount.toLocaleString()} has been processed.`,
          );
        } else {
          Alert.alert(
            "Commission Cancelled",
            `Your commission has been cancelled. An automated refund of ₱${data.refund_amount.toLocaleString()} has been processed.`,
          );
        }
        setCancelModalVisible(false);
        fetchCommissions();
      } else {
        if (Platform.OS === "web")
          window.alert(data.error || "Could not cancel commission.");
        else Alert.alert("Error", data.error || "Could not cancel commission.");
      }
    } catch (e) {
      if (Platform.OS === "web") window.alert("Failed to connect to server.");
      else Alert.alert("Error", "Failed to connect to server.");
    } finally {
      setCancelling(false);
    }
  };

  const handleDownloadFinal = async (comm: any) => {
    try {
      const res = await fetch(
        `${API_URL}/api/commissions/requests/${comm.commission_req_id}/track/`,
      );
      const data = await res.json();
      const finalPhoto =
        data.photos?.find(
          (p: any) => p.stage_number === 3 || p.progress_percentage >= 100,
        ) || data.photos?.[data.photos.length - 1];

      if (!finalPhoto?.image_url) {
        Alert.alert(
          "Not Ready",
          "The artist has not uploaded the high-resolution final file yet.",
        );
        return;
      }

      if (Platform.OS === "web") {
        const link = document.createElement("a");
        link.href = finalPhoto.image_url;
        link.download = `${comm.title.replace(/\s+/g, "_")}_final.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        await Linking.openURL(finalPhoto.image_url);
      }
    } catch (err) {
      Alert.alert("Download Error", "Could not retrieve final artwork file.");
    }
  };

  const handleSelectForDeliveryMap = async (item: any) => {
    setSelectedCommission(item);
    setRightPanelMode("map");
    setLoadingDelivery(true);
    try {
      const res = await fetch(`${API_URL}/api/delivery/orders/active/`);
      if (res.ok) {
        const data = await res.json();
        setDeliveryData(data);
      }
    } catch (err) {
      console.warn("Error loading active delivery:", err);
    } finally {
      setLoadingDelivery(false);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(home)" as any);
    }
  };

  const renderCard = ({ item }: { item: any }) => {
    const isStage3Done =
      item.status === "COMPLETE" || item.status === "STAGE_3";
    const canCancel =
      role === "buyer" && !isStage3Done && item.status !== "CANCELLED";
    const isSelected =
      selectedCommission?.commission_req_id === item.commission_req_id;
    const clientHandle = item.buyer_username || item.buyer_name || "Buyer";

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => handleSelectForTrack(item)}
        style={[s.card, isSelected && isDesktop && s.cardSelected]}
      >
        <View style={s.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{item.title}</Text>
            <Text style={s.cardSub}>
              {role === "buyer"
                ? `Artist: @${item.artist_name}`
                : `Client: @${clientHandle}`}
            </Text>
          </View>
          <View
            style={[
              s.badge,
              item.status.includes("STAGE") || item.status === "IN_PROGRESS"
                ? s.badgeProgress
                : item.status === "COMPLETE"
                  ? s.badgeDone
                  : s.badgePending,
            ]}
          >
            <Text style={s.badgeText}>{item.status}</Text>
          </View>
        </View>

        <Text style={s.desc}>
          {item.description || "No instructions provided."}
        </Text>
        <Text style={s.price}>
          Total: ₱{item.time_duration?.toLocaleString()} • {item.art_type}{" "}
          {item.is_rush_job ? "• Rush Job" : ""}
        </Text>

        {role === "artist" && item.status === "PENDING" && (
          <View style={s.actionRow}>
            <TouchableOpacity
              style={[s.btn, s.btnAccept]}
              onPress={() => handleManage(item.commission_req_id, "ACCEPT")}
            >
              <CheckCircle2 color="#fff" size={14} />
              <Text style={s.btnText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, s.btnReject]}
              onPress={() => handleManage(item.commission_req_id, "REJECT")}
            >
              <XCircle color="#fff" size={14} />
              <Text style={s.btnText}>Decline</Text>
            </TouchableOpacity>
          </View>
        )}

        {role === "artist" &&
          item.status !== "CANCELLED" &&
          item.status !== "COMPLETE" &&
          item.status !== "PENDING" && (
            <TouchableOpacity
              style={s.updateProgressBtn}
              onPress={() => handleSelectForUpload(item)}
            >
              <Paintbrush color="#FFF" size={14} />
              <Text style={s.updateProgressText}>
                Post 3-Stage Progress Update
              </Text>
            </TouchableOpacity>
          )}

        <View style={s.utilityRow}>
          <TouchableOpacity
            style={s.chatBtn}
            onPress={() => {
              setChatTargetUser({
                id:
                  role === "buyer"
                    ? String(item.artist_id)
                    : String(item.buyer_id),
                name:
                  role === "buyer"
                    ? item.artist_name
                    : item.buyer_username || item.buyer_name,
                role: role === "buyer" ? "artist" : "buyer",
              });
              setShowChatModal(true);
            }}
          >
            <MessageCircle color="#E67E22" size={15} />
            <Text style={s.chatBtnText}>Chat & Negotiate</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.trackBtn}
            onPress={() => {
              handleSelectForTrack(item);
            }}
          >
            <Eye color="#C15656" size={15} />
            <Text style={s.trackBtnText}>Track 3-Stage Progress</Text>
          </TouchableOpacity>
        </View>

        <View style={s.milestoneBox}>
          <Text style={s.milestoneHeading}>3-Stage Payment Milestones</Text>
          {item.milestones?.map((m: any) => {
            const isPayingThis = payingMilestoneId === m.milestone_id;
            const isFinalStage = Number(m.milestone_number) === 3;

            return (
              <View key={m.milestone_id} style={s.milestoneRow}>
                <Text style={s.milestoneText}>
                  {m.stage_label} ({m.percentage}%): ₱
                  {Number(m.amount).toLocaleString()}
                </Text>

                {m.status === "PAID" ? (
                  <Text style={s.paidLabel}>PAID</Text>
                ) : role === "buyer" && m.status === "READY_TO_PAY" ? (
                  <TouchableOpacity
                    style={[s.payBtn, isPayingThis && { opacity: 0.7 }]}
                    disabled={isPayingThis}
                    onPress={() =>
                      handlePayMilestone(m.milestone_id, m.milestone_number)
                    }
                  >
                    {isPayingThis ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Text style={s.payBtnText}>
                          {isFinalStage
                            ? "Pay Final Balance"
                            : "Pay Downpayment"}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <Text style={{ fontSize: 11, color: "#999" }}>
                    Awaiting Stage
                  </Text>
                )}
              </View>
            );
          })}
        </View>

        {isStage3Done && role === "buyer" && (
          <View style={s.completeSection}>
            {item.art_type === "Digital" ? (
              <TouchableOpacity
                style={s.dispatchBtn}
                onPress={() => handleDownloadFinal(item)}
              >
                <Download color="#FFF" size={15} />
                <Text style={s.dispatchBtnText}>
                  Download Final Artwork (PNG)
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[s.dispatchBtn, { backgroundColor: "#27AE60" }]}
                onPress={() => handleSelectForDeliveryMap(item)}
              >
                <Text style={s.dispatchBtnText}>
                  Track Physical Delivery Order
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {canCancel && (
          <TouchableOpacity
            style={s.cancelLink}
            onPress={() => {
              setCancellingId(item.commission_req_id);
              setCancelModalVisible(true);
            }}
          >
            <Text style={s.cancelLinkText}>
              Cancel Commission & Request Refund
            </Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const currentPercentage =
    trackData?.photos?.[selectedPhotoIndex]?.progress_percentage ??
    trackData?.current_progress ??
    33;
  const activeImage =
    trackData?.photos?.[selectedPhotoIndex]?.image_url ||
    "https://placehold.co/400x400?text=No+Stage+Uploaded";
  const activeCaption =
    trackData?.photos?.[selectedPhotoIndex]?.caption ||
    `Progress: ${currentPercentage}%`;
  const selectedBuyerHandle =
    selectedCommission?.buyer_username ||
    selectedCommission?.buyer_name ||
    "Client";

  return (
    <SafeAreaView style={s.pageContainer} edges={["top", "left", "right"]}>
      {/* MOBILE TOP NAVIGATION BAR (< 960px) */}
      {!isDesktop && (
        <View style={s.mobileTopNav}>
          <TouchableOpacity onPress={handleBack} style={s.mobileBrandRow}>
            <ArrowLeft color="#B84A4A" size={22} />
            <Text style={s.brandTitle}>Commissions</Text>
          </TouchableOpacity>
          {isArtist ? (
            <View style={s.mobilePillRow}>
              <TouchableOpacity
                style={[
                  s.mobileTabBtn,
                  role === "buyer" && s.mobileTabBtnActive,
                ]}
                onPress={() => setRole("buyer")}
              >
                <Text
                  style={[
                    s.mobileTabBtnText,
                    role === "buyer" && s.mobileTabBtnTextActive,
                  ]}
                >
                  Requests
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  s.mobileTabBtn,
                  role === "artist" && s.mobileTabBtnActive,
                ]}
                onPress={() => setRole("artist")}
              >
                <Text
                  style={[
                    s.mobileTabBtnText,
                    role === "artist" && s.mobileTabBtnTextActive,
                  ]}
                >
                  Incoming
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.buyerBadgeMobile}>
              <Text style={s.buyerBadgeMobileText}>My Requests</Text>
            </View>
          )}
        </View>
      )}

      <View style={s.appLayout}>
        {/* LEFT COLUMN */}
        {isDesktop && (
          <View style={s.sidebar}>
            <TouchableOpacity onPress={handleBack} style={s.brandRow}>
              <ArrowLeft color="#B84A4A" size={24} />
              <Text style={s.brandTitle}>Commissions</Text>
            </TouchableOpacity>

            {isArtist ? (
              <View style={s.sidebarToggleContainer}>
                <TouchableOpacity
                  style={[
                    s.sideNavPill,
                    role === "buyer" && s.sideNavPillActive,
                  ]}
                  onPress={() => setRole("buyer")}
                >
                  <Text
                    style={[
                      s.sideNavText,
                      role === "buyer" && s.sideNavTextActive,
                    ]}
                  >
                    My Requests
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    s.sideNavPill,
                    role === "artist" && s.sideNavPillActive,
                  ]}
                  onPress={() => setRole("artist")}
                >
                  <Text
                    style={[
                      s.sideNavText,
                      role === "artist" && s.sideNavTextActive,
                    ]}
                  >
                    Incoming Jobs
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={s.buyerBadgeSidebar}>
                <Text style={s.buyerBadgeSidebarText}>My Requests</Text>
              </View>
            )}

            <View style={s.sidebarFooterInfo}>
              <Text style={s.sidebarHelpHeading}>3-Stage Pipeline</Text>
              <Text style={s.sidebarHelpText}>
                Stage 1: 33% Sketch & Downpayment
              </Text>
              <Text style={s.sidebarHelpText}>Stage 2: 66% Color Render</Text>
              <Text style={s.sidebarHelpText}>Stage 3: 100% Final</Text>
            </View>
          </View>
        )}

        {/* MIDDLE COLUMN: FEED OF COMMISSIONS */}
        <View style={[s.feedColumn, !isDesktop && s.feedColumnMobile]}>
          {isDesktop && (
            <View style={s.feedHeader}>
              <Text style={s.feedHeaderText}>
                {role === "artist" ? "Incoming Jobs" : "My Commission Requests"}
              </Text>
            </View>
          )}

          {loading ? (
            <ActivityIndicator
              color="#E67E22"
              size="large"
              style={{ marginTop: 40 }}
            />
          ) : (
            <FlatList
              data={commissions}
              keyExtractor={(item) => String(item.commission_req_id)}
              renderItem={renderCard}
              contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
              ListEmptyComponent={
                <Text style={s.empty}>No commissions found in this view.</Text>
              }
            />
          )}
        </View>

        {/* RIGHT COLUMN: ACTIONS & INSPECTION PANEL (DESKTOP) */}
        {isDesktop && (
          <View style={s.rightPanel}>
            {rightPanelMode === "empty" || !selectedCommission ? (
              <View style={s.rightEmptyContainer}>
                <Paintbrush
                  color="#C15656"
                  size={40}
                  style={{ opacity: 0.5 }}
                />
                <Text style={s.rightEmptyHeading}>Select a Commission</Text>
                <Text style={s.rightEmptySub}>
                  Click on any commission card or Track button to review the
                  3-stage progress or submit updates.
                </Text>
              </View>
            ) : rightPanelMode === "upload" && role === "artist" ? (
              <ScrollView contentContainerStyle={s.rightContentInner}>
                <View style={s.rightHeaderRow}>
                  <Text style={s.rightPanelTitle}>Post Stage Update</Text>
                  <TouchableOpacity
                    style={s.panelCloseBtn}
                    onPress={() => setRightPanelMode("track")}
                  >
                    <Text style={s.panelCloseText}>View Track</Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.rightPanelSub}>
                  Client: @{selectedBuyerHandle}
                </Text>

                <Text style={s.inputLabel}>Select Stage:</Text>
                <View style={s.pctRow}>
                  {[1, 2, 3].map((num) => (
                    <TouchableOpacity
                      key={num}
                      style={[
                        s.pctBtn,
                        selectedStage === num && s.pctBtnActive,
                      ]}
                      onPress={() => setSelectedStage(num)}
                    >
                      <Text
                        style={[
                          s.pctBtnText,
                          selectedStage === num && s.pctBtnTextActive,
                        ]}
                      >
                        Stage {num}{" "}
                        {num === 1 ? "(33%)" : num === 2 ? "(66%)" : "(100%)"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.inputLabel}>Upload Stage Artwork:</Text>

                {imageUrlInput ? (
                  <View style={s.uploadedPreviewBox}>
                    <Image
                      source={{ uri: imageUrlInput }}
                      style={s.uploadedPreviewImg}
                      resizeMode="contain"
                    />
                    <TouchableOpacity
                      style={s.removeImageBtn}
                      onPress={() => setImageUrlInput("")}
                    >
                      <Trash2 color="#FFF" size={14} />
                      <Text style={s.removeImageText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handlePickProgressImage}
                    style={[s.dropZone, isDragging && s.dropZoneActive]}
                    {...(Platform.OS === "web"
                      ? ({
                          onDragOver: (e: any) => {
                            e.preventDefault();
                            setIsDragging(true);
                          },
                          onDragLeave: (e: any) => {
                            e.preventDefault();
                            setIsDragging(false);
                          },
                          onDrop: handleDropFile,
                        } as any)
                      : {})}
                  >
                    <View style={s.dropZoneContent}>
                      <View style={s.dropIconCircle}>
                        <ImageIcon color="#B84A4A" size={24} />
                      </View>
                      <Text style={s.dropZoneTitle}>
                        Drag & drop artwork here, or{" "}
                        <Text
                          style={{
                            color: "#B84A4A",
                            textDecorationLine: "underline",
                          }}
                        >
                          Browse
                        </Text>
                      </Text>
                      <Text style={s.dropZoneSubtitle}>
                        Supports PNG, JPG, JPEG, WEBP
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}

                <Text style={s.inputLabel}>
                  Stage Notes / Notes for Client:
                </Text>
                <TextInput
                  style={[
                    s.rightInput,
                    { minHeight: 90, textAlignVertical: "top" },
                  ]}
                  multiline
                  placeholder="e.g. Finished rough sketch layout..."
                  value={captionInput}
                  onChangeText={setCaptionInput}
                />

                <TouchableOpacity
                  style={s.rightSubmitBtn}
                  onPress={handleInlineUploadProgress}
                  disabled={uploading}
                >
                  {uploading ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <>
                      <UploadCloud color="#FFF" size={16} />
                      <Text style={s.rightSubmitBtnText}>
                        Publish Stage Update
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            ) : rightPanelMode === "map" ? (
              /* LIVE PHYSICAL DELIVERY TRACKING MAP */
              <ScrollView contentContainerStyle={s.rightContentInner}>
                <View style={s.rightHeaderRow}>
                  <Text style={s.rightPanelTitle}>Live Delivery Tracking</Text>
                  <TouchableOpacity
                    style={s.panelCloseBtn}
                    onPress={() => setRightPanelMode("track")}
                  >
                    <Text style={s.panelCloseText}>View Progress Track</Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.rightPanelSub}>
                  Order: {selectedCommission?.title}
                </Text>

                {loadingDelivery ? (
                  <ActivityIndicator
                    color="#27AE60"
                    style={{ marginTop: 40 }}
                  />
                ) : (
                  <View style={s.mapWrapper}>
                    <View style={s.mapContainer}>
                      {Platform.OS === "web" ? (
                        <iframe
                          title="Delivery Map"
                          width="100%"
                          height="260"
                          style={{ border: 0, borderRadius: 10 }}
                          src={`https://www.openstreetmap.org/export/embed.html?bbox=123.84,10.27,123.97,10.37&layer=mapnik&marker=${
                            deliveryData?.rider_location?.latitude || 10.3157
                          },${deliveryData?.rider_location?.longitude || 123.8854}`}
                        />
                      ) : (
                        <View style={s.mobileMapPlaceholder}>
                          <Truck color="#27AE60" size={36} />
                          <Text
                            style={{
                              fontWeight: "700",
                              color: "#27AE60",
                              marginTop: 8,
                            }}
                          >
                            Rider In Transit
                          </Text>
                          <Text style={{ fontSize: 12, color: "#777" }}>
                            Lat:{" "}
                            {deliveryData?.rider_location?.latitude || 10.3157}{" "}
                            • Lng:{" "}
                            {deliveryData?.rider_location?.longitude ||
                              123.8854}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={s.riderStatusCard}>
                      <View style={s.riderHeaderRow}>
                        <View style={s.riderBadge}>
                          <Text style={s.riderBadgeText}>
                            {deliveryData?.step?.replace(/_/g, " ") ||
                              "DISPATCHED"}
                          </Text>
                        </View>
                        <Text style={s.etaText}>
                          ETA: {deliveryData?.estimatedTime || "15-25 mins"}
                        </Text>
                      </View>

                      <View style={s.riderInfoRow}>
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text style={s.riderName}>
                            Driver:{" "}
                            {deliveryData?.rider?.name ||
                              "ArtFiliere Courier Rider"}
                          </Text>
                          <Text style={s.riderPhone}>
                            Vehicle: Honda XRM 125 • ABC-1234
                          </Text>
                        </View>
                      </View>

                      <View style={s.divider} />

                      <View style={s.locationDetailRow}>
                        <Text style={s.locationLabel}>
                          Pickup (Artist Studio):
                        </Text>
                        <Text style={s.locationValue}>
                          {deliveryData?.artist?.address ||
                            "Cebu City Art Studio"}
                        </Text>
                      </View>

                      <View style={[s.locationDetailRow, { marginTop: 6 }]}>
                        <Text style={s.locationLabel}>
                          Destination Address:
                        </Text>
                        <Text style={s.locationValue}>
                          {deliveryData?.buyer?.address ||
                            selectedCommission?.delivery_address ||
                            "M.J. Cuenco Avenue, Cebu City"}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
              </ScrollView>
            ) : (
              /* INLINE 3-STAGE TRACK VIEWER */
              <ScrollView contentContainerStyle={s.rightContentInner}>
                <View style={s.rightHeaderRow}>
                  <Text style={s.rightPanelTitle}>Process Track</Text>
                  {role === "artist" && (
                    <TouchableOpacity
                      style={s.panelActionBtn}
                      onPress={() => setRightPanelMode("upload")}
                    >
                      <Paintbrush color="#FFF" size={13} />
                      <Text style={s.panelActionBtnText}>Post Update</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={s.rightPanelSub}>
                  Client: @{selectedBuyerHandle}
                </Text>

                {loadingTrack ? (
                  <ActivityIndicator
                    color="#C15656"
                    style={{ marginTop: 40 }}
                  />
                ) : (
                  <>
                    <View style={s.trackBarContainer}>
                      <View style={s.trackBarBackground}>
                        <View
                          style={[
                            s.trackBarFill,
                            {
                              width: `${Math.min(100, Math.max(10, currentPercentage))}%`,
                            },
                          ]}
                        />
                      </View>
                    </View>

                    <View style={s.previewCardWrapper}>
                      <View style={s.previewCard}>
                        <Image
                          source={{ uri: activeImage }}
                          style={s.previewImg}
                          resizeMode="contain"
                        />
                      </View>
                      <Text style={s.progressLabel}>
                        {currentPercentage}% Completed
                      </Text>
                      <Text style={s.captionText}>{activeCaption}</Text>
                    </View>

                    {trackData?.photos && trackData.photos.length > 0 && (
                      <View style={s.stageDotsRow}>
                        {trackData.photos.map((p: any, idx: number) => (
                          <TouchableOpacity
                            key={p.photo_id}
                            style={[
                              s.stageDot,
                              selectedPhotoIndex === idx && s.stageDotActive,
                            ]}
                            onPress={() => setSelectedPhotoIndex(idx)}
                          >
                            <Text
                              style={[
                                s.stageDotText,
                                selectedPhotoIndex === idx &&
                                  s.stageDotTextActive,
                              ]}
                            >
                              Stage {p.stage_number || idx + 1} (
                              {p.progress_percentage}%)
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </ScrollView>
            )}
          </View>
        )}
      </View>

      {/* MOBILE MODAL */}
      {!isDesktop && (
        <Modal
          visible={rightPanelMode !== "empty" && Boolean(selectedCommission)}
          animationType="slide"
          onRequestClose={() => setRightPanelMode("empty")}
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: "#FAF6EF" }}>
            <View style={s.mobileModalHeader}>
              <Text style={s.mobileModalTitle}>
                {rightPanelMode === "upload"
                  ? "Post Stage Update"
                  : rightPanelMode === "map"
                    ? "Live Delivery Tracking"
                    : "Process Track"}
              </Text>
              <TouchableOpacity
                style={s.mobileModalCloseBtn}
                onPress={() => setRightPanelMode("empty")}
              >
                <Text style={s.mobileModalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={s.rightContentInner}>
              {rightPanelMode === "upload" && role === "artist" ? (
                <>
                  <Text style={s.rightPanelSub}>
                    Client: @{selectedBuyerHandle}
                  </Text>
                  <Text style={s.inputLabel}>Select Stage:</Text>
                  <View style={s.pctRow}>
                    {[1, 2, 3].map((num) => (
                      <TouchableOpacity
                        key={num}
                        style={[
                          s.pctBtn,
                          selectedStage === num && s.pctBtnActive,
                        ]}
                        onPress={() => setSelectedStage(num)}
                      >
                        <Text
                          style={[
                            s.pctBtnText,
                            selectedStage === num && s.pctBtnTextActive,
                          ]}
                        >
                          Stage {num}{" "}
                          {num === 1 ? "(33%)" : num === 2 ? "(66%)" : "(100%)"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={s.inputLabel}>Upload Stage Artwork:</Text>
                  {imageUrlInput ? (
                    <View style={s.uploadedPreviewBox}>
                      <Image
                        source={{ uri: imageUrlInput }}
                        style={s.uploadedPreviewImg}
                        resizeMode="contain"
                      />
                      <TouchableOpacity
                        style={s.removeImageBtn}
                        onPress={() => setImageUrlInput("")}
                      >
                        <Trash2 color="#FFF" size={14} />
                        <Text style={s.removeImageText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={handlePickProgressImage}
                      style={s.dropZone}
                    >
                      <View style={s.dropZoneContent}>
                        <View style={s.dropIconCircle}>
                          <ImageIcon color="#B84A4A" size={24} />
                        </View>
                        <Text style={s.dropZoneTitle}>
                          Tap to select artwork from files
                        </Text>
                        <Text style={s.dropZoneSubtitle}>
                          Supports PNG, JPG, JPEG, WEBP
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}

                  <Text style={s.inputLabel}>
                    Stage Notes / Notes for Client:
                  </Text>
                  <TextInput
                    style={[
                      s.rightInput,
                      { minHeight: 80, textAlignVertical: "top" },
                    ]}
                    multiline
                    placeholder="e.g. Finished rough sketch layout..."
                    value={captionInput}
                    onChangeText={setCaptionInput}
                  />

                  <TouchableOpacity
                    style={s.rightSubmitBtn}
                    onPress={handleInlineUploadProgress}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <>
                        <UploadCloud color="#FFF" size={16} />
                        <Text style={s.rightSubmitBtnText}>
                          Publish Stage Update
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              ) : rightPanelMode === "map" ? (
                <>
                  <View style={s.rightHeaderRow}>
                    <Text style={s.rightPanelSub}>
                      Order: {selectedCommission?.title}
                    </Text>
                    <TouchableOpacity
                      style={s.panelCloseBtn}
                      onPress={() => setRightPanelMode("track")}
                    >
                      <Text style={s.panelCloseText}>View Track</Text>
                    </TouchableOpacity>
                  </View>

                  {loadingDelivery ? (
                    <ActivityIndicator
                      color="#27AE60"
                      style={{ marginTop: 40 }}
                    />
                  ) : (
                    <View style={s.mapWrapper}>
                      <View style={s.mapContainer}>
                        {Platform.OS === "web" ? (
                          <iframe
                            title="Delivery Map Mobile"
                            width="100%"
                            height="240"
                            style={{ border: 0, borderRadius: 10 }}
                            src={`https://www.openstreetmap.org/export/embed.html?bbox=123.84,10.27,123.97,10.37&layer=mapnik&marker=${
                              deliveryData?.rider_location?.latitude || 10.3157
                            },${deliveryData?.rider_location?.longitude || 123.8854}`}
                          />
                        ) : (
                          <View style={s.mobileMapPlaceholder}>
                            <Truck color="#27AE60" size={36} />
                            <Text
                              style={{
                                fontWeight: "700",
                                color: "#27AE60",
                                marginTop: 8,
                              }}
                            >
                              Rider In Transit
                            </Text>
                            <Text style={{ fontSize: 12, color: "#777" }}>
                              Lat:{" "}
                              {deliveryData?.rider_location?.latitude ||
                                10.3157}{" "}
                              • Lng:{" "}
                              {deliveryData?.rider_location?.longitude ||
                                123.8854}
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={s.riderStatusCard}>
                        <View style={s.riderHeaderRow}>
                          <View style={s.riderBadge}>
                            <Text style={s.riderBadgeText}>
                              {deliveryData?.step?.replace(/_/g, " ") ||
                                "DISPATCHED"}
                            </Text>
                          </View>
                          <Text style={s.etaText}>
                            ETA: {deliveryData?.estimatedTime || "15-25 mins"}
                          </Text>
                        </View>

                        <View style={s.riderInfoRow}>
                          <Truck color="#27AE60" size={20} />
                          <View style={{ flex: 1, marginLeft: 8 }}>
                            <Text style={s.riderName}>
                              Driver:{" "}
                              {deliveryData?.rider?.name ||
                                "ArtFiliere Courier Rider"}
                            </Text>
                            <Text style={s.riderPhone}>
                              Vehicle: Honda XRM 125 • ABC-1234
                            </Text>
                          </View>
                        </View>

                        <View style={s.divider} />

                        <View style={s.locationDetailRow}>
                          <Text style={s.locationLabel}>
                            Pickup (Artist Studio):
                          </Text>
                          <Text style={s.locationValue}>
                            {deliveryData?.artist?.address ||
                              "Cebu City Art Studio"}
                          </Text>
                        </View>

                        <View style={[s.locationDetailRow, { marginTop: 6 }]}>
                          <Text style={s.locationLabel}>
                            Destination Address:
                          </Text>
                          <Text style={s.locationValue}>
                            {deliveryData?.buyer?.address ||
                              selectedCommission?.delivery_address ||
                              "M.J. Cuenco Avenue, Cebu City"}
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}
                </>
              ) : (
                <>
                  <View style={s.rightHeaderRow}>
                    <Text style={s.rightPanelSub}>
                      Client: @{selectedBuyerHandle}
                    </Text>
                    {role === "artist" && (
                      <TouchableOpacity
                        style={s.panelActionBtn}
                        onPress={() => setRightPanelMode("upload")}
                      >
                        <Paintbrush color="#FFF" size={13} />
                        <Text style={s.panelActionBtnText}>Post Update</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {loadingTrack ? (
                    <ActivityIndicator
                      color="#C15656"
                      style={{ marginTop: 40 }}
                    />
                  ) : (
                    <>
                      <View style={s.trackBarContainer}>
                        <View style={s.trackBarBackground}>
                          <View
                            style={[
                              s.trackBarFill,
                              {
                                width: `${Math.min(100, Math.max(10, currentPercentage))}%`,
                              },
                            ]}
                          />
                        </View>
                      </View>

                      <View style={s.previewCardWrapper}>
                        <View style={s.previewCard}>
                          <Image
                            source={{ uri: activeImage }}
                            style={s.previewImg}
                            resizeMode="contain"
                          />
                        </View>
                        <Text style={s.progressLabel}>
                          {currentPercentage}% Completed
                        </Text>
                        <Text style={s.captionText}>{activeCaption}</Text>
                      </View>

                      {trackData?.photos && trackData.photos.length > 0 && (
                        <View style={s.stageDotsRow}>
                          {trackData.photos.map((p: any, idx: number) => (
                            <TouchableOpacity
                              key={p.photo_id}
                              style={[
                                s.stageDot,
                                selectedPhotoIndex === idx && s.stageDotActive,
                              ]}
                              onPress={() => setSelectedPhotoIndex(idx)}
                            >
                              <Text
                                style={[
                                  s.stageDotText,
                                  selectedPhotoIndex === idx &&
                                    s.stageDotTextActive,
                                ]}
                              >
                                Stage {p.stage_number || idx + 1} (
                                {p.progress_percentage}%)
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </>
                  )}
                </>
              )}
            </ScrollView>
          </SafeAreaView>
        </Modal>
      )}

      {/* AUTOMATED CANCELLATION SURVEY MODAL */}
      <Modal visible={cancelModalVisible} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Commission Cancellation</Text>
            <Text
              style={{
                fontSize: 12,
                color: "#777",
                marginBottom: 12,
                textAlign: "center",
              }}
            >
              Why do you want to cancel this commission?
            </Text>

            <Text style={s.modalLabel}>Select Reason:</Text>
            {cancelChoices.map((c) => (
              <TouchableOpacity
                key={c}
                style={[s.choicePill, cancelReason === c && s.choicePillActive]}
                onPress={() => setCancelReason(c)}
              >
                <Text
                  style={[
                    s.choiceText,
                    cancelReason === c && s.choiceTextActive,
                  ]}
                >
                  {c}
                </Text>
              </TouchableOpacity>
            ))}

            <Text style={s.modalLabel}>
              What can the artist or platform improve?
            </Text>
            <TextInput
              style={[
                s.modalInput,
                { minHeight: 65, textAlignVertical: "top" },
              ]}
              multiline
              placeholder="Provide constructive feedback for future improvements..."
              value={cancelFeedback}
              onChangeText={setCancelFeedback}
            />

            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.modalCancelBtn}
                onPress={() => setCancelModalVisible(false)}
              >
                <Text style={{ color: "#666", fontWeight: "600" }}>
                  Keep Commission
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalSubmitBtn, { backgroundColor: "#E74C3C" }]}
                onPress={submitCancellation}
                disabled={cancelling}
              >
                {cancelling ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={{ color: "#FFF", fontWeight: "800" }}>
                    Confirm & Process Refund
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* CHAT NEGOTIATION MODAL */}
      {showChatModal && currentChatUser && (
        <ChatModal
          visible={showChatModal}
          onClose={() => {
            setShowChatModal(false);
            setChatTargetUser(null);
          }}
          currentUser={currentChatUser as any}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  pageContainer: {
    flex: 1,
    backgroundColor: "#FAF6EF",
  },
  appLayout: {
    flex: 1,
    flexDirection: "row",
    maxWidth: 1380,
    width: "100%",
    alignSelf: "center",
    height: "100%",
    ...(Platform.OS === "web" ? { overflow: "hidden" } : {}),
  },

  // MOBILE NAV (< 960px)
  mobileTopNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E8DED1",
    backgroundColor: "#FAF6EF",
  },
  mobileBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mobilePillRow: {
    flexDirection: "row",
    gap: 6,
  },
  mobileTabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#EDE5D8",
  },
  mobileTabBtnActive: {
    backgroundColor: "#E67E22",
  },
  mobileTabBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#666",
  },
  mobileTabBtnTextActive: {
    color: "#FFF",
  },
  buyerBadgeMobile: {
    backgroundColor: "#EDE5D8",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  buyerBadgeMobileText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#8E44AD",
  },

  // MOBILE MODAL
  mobileModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E8DED1",
    backgroundColor: "#FAF6EF",
  },
  mobileModalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#B84A4A",
  },
  mobileModalCloseBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  mobileModalCloseText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#B84A4A",
  },

  // SIDEBAR (DESKTOP)
  sidebar: {
    width: 260,
    borderRightWidth: 1,
    borderRightColor: "#E8DED1",
    paddingVertical: 18,
    paddingHorizontal: 16,
    gap: 16,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#B84A4A",
  },
  sidebarToggleContainer: {
    gap: 8,
    marginTop: 8,
  },
  sideNavPill: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 25,
    backgroundColor: "#EDE5D8",
  },
  sideNavPillActive: {
    backgroundColor: "#E67E22",
  },
  sideNavText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#555",
  },
  sideNavTextActive: {
    color: "#FFF",
  },
  buyerBadgeSidebar: {
    backgroundColor: "#EDE5D8",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  buyerBadgeSidebarText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#8E44AD",
  },
  sidebarFooterInfo: {
    marginTop: "auto",
    backgroundColor: "#FFF",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E8DED1",
  },
  sidebarHelpHeading: {
    fontSize: 12,
    fontWeight: "800",
    color: "#B84A4A",
    marginBottom: 6,
  },
  sidebarHelpText: {
    fontSize: 11,
    color: "#666",
    lineHeight: 16,
  },

  // FEED COLUMN (MIDDLE)
  feedColumn: {
    flex: 1,
    maxWidth: 620,
    borderRightWidth: 1,
    borderRightColor: "#E8DED1",
    height: "100%",
    ...(Platform.OS === "web" ? { overflowY: "auto" } : {}),
  },
  feedColumnMobile: {
    maxWidth: "100%",
    borderRightWidth: 0,
  },
  feedHeader: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E8DED1",
    backgroundColor: "rgba(250, 246, 239, 0.95)",
  },
  feedHeaderText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#2C3E50",
  },

  // RIGHT PANEL (DESKTOP)
  rightPanel: {
    flex: 1,
    maxWidth: 460,
    backgroundColor: "#FAF6EF",
    height: "100%",
    ...(Platform.OS === "web" ? { overflowY: "auto" } : {}),
  },
  rightContentInner: {
    padding: 20,
    paddingBottom: 60,
  },
  rightEmptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },
  rightEmptyHeading: {
    fontSize: 16,
    fontWeight: "800",
    color: "#B84A4A",
    marginTop: 14,
  },
  rightEmptySub: {
    fontSize: 12,
    color: "#888",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  rightHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rightPanelTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#B84A4A",
  },
  rightPanelSub: {
    fontSize: 12,
    color: "#777",
    marginTop: 2,
    marginBottom: 16,
  },
  panelActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#8E44AD",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  panelActionBtnText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
  },
  panelCloseBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  panelCloseText: {
    color: "#C15656",
    fontWeight: "700",
    fontSize: 12,
  },

  // CARDS
  card: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E8DED1",
  },
  cardSelected: {
    borderColor: "#E67E22",
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#2C3E50",
  },
  cardSub: {
    fontSize: 12,
    color: "#777",
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgePending: { backgroundColor: "#FAD7A0" },
  badgeProgress: { backgroundColor: "#AED6F1" },
  badgeDone: { backgroundColor: "#A9DFBF" },
  badgeText: { fontSize: 10, fontWeight: "800", color: "#332b2b" },
  desc: { fontSize: 13, color: "#555", marginVertical: 8 },
  price: { fontSize: 13, fontWeight: "700", color: "#C0392B" },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  btnAccept: { backgroundColor: "#27AE60" },
  btnReject: { backgroundColor: "#E74C3C" },
  btnText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  updateProgressBtn: {
    backgroundColor: "#8E44AD",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  updateProgressText: { color: "#FFF", fontSize: 12, fontWeight: "800" },
  utilityRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
    marginBottom: 4,
  },
  chatBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E67E22",
    backgroundColor: "#FEF5EC",
  },
  chatBtnText: { color: "#E67E22", fontSize: 12, fontWeight: "700" },
  trackBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#C15656",
    backgroundColor: "#FAF0F0",
  },
  trackBtnText: { color: "#C15656", fontSize: 12, fontWeight: "700" },
  milestoneBox: {
    backgroundColor: "#FDFBF7",
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  milestoneHeading: {
    fontSize: 12,
    fontWeight: "800",
    color: "#444",
    marginBottom: 6,
  },
  milestoneRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 4,
  },
  milestoneText: { fontSize: 12, color: "#666" },
  paidLabel: { color: "#27AE60", fontSize: 11, fontWeight: "800" },
  payBtn: {
    backgroundColor: "#27AE60",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    gap: 2,
  },
  payBtnText: { color: "#FFF", fontSize: 11, fontWeight: "700" },
  completeSection: {
    marginTop: 12,
    borderTopWidth: 1,
    borderColor: "#EEE",
    paddingTop: 10,
  },
  dispatchBtn: {
    backgroundColor: "#8E44AD",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 8,
  },
  dispatchBtnText: { color: "#FFF", fontSize: 12, fontWeight: "800" },
  cancelLink: { marginTop: 8, alignSelf: "center", paddingVertical: 4 },
  cancelLinkText: {
    color: "#C0392B",
    fontSize: 11,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  empty: { textAlign: "center", marginTop: 30, color: "#888" },

  // PROGRESS PREVIEW STYLES
  trackBarContainer: {
    width: "100%",
    marginVertical: 14,
  },
  trackBarBackground: {
    width: "100%",
    height: 8,
    borderRadius: 4,
    backgroundColor: "#D9D9D9",
    overflow: "hidden",
  },
  trackBarFill: {
    height: "100%",
    backgroundColor: "#C15656",
    borderRadius: 4,
  },
  previewCardWrapper: {
    alignItems: "center",
    marginVertical: 10,
  },
  previewCard: {
    width: "100%",
    height: 260,
    borderWidth: 1.5,
    borderColor: "#C15656",
    backgroundColor: "#FFF",
    overflow: "hidden",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  previewImg: { width: "100%", height: "100%" },
  progressLabel: {
    marginTop: 12,
    color: "#B84A4A",
    fontSize: 14,
    fontWeight: "800",
  },
  captionText: {
    marginTop: 4,
    color: "#666",
    fontSize: 12,
    textAlign: "center",
    paddingHorizontal: 14,
  },
  stageDotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  stageDot: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: "#E6DCCF",
  },
  stageDotActive: { backgroundColor: "#C15656" },
  stageDotText: { fontSize: 11, fontWeight: "700", color: "#666" },
  stageDotTextActive: { color: "#FFF" },

  // INLINE UPLOAD FORM STYLES
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#444",
    marginTop: 12,
    marginBottom: 6,
  },
  pctRow: { flexDirection: "row", gap: 6, marginBottom: 8 },
  pctBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: "#EEE",
    borderRadius: 6,
  },
  pctBtnActive: { backgroundColor: "#B84A4A" },
  pctBtnText: { fontSize: 10, fontWeight: "700", color: "#555" },
  pctBtnTextActive: { color: "#FFF" },
  rightInput: {
    borderWidth: 1,
    borderColor: "#CCC",
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    backgroundColor: "#FFF",
  },
  rightSubmitBtn: {
    backgroundColor: "#B84A4A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 18,
  },
  rightSubmitBtnText: { color: "#FFF", fontWeight: "800", fontSize: 13 },

  // DRAG & DROP ZONE
  dropZone: {
    borderWidth: 2,
    borderColor: "#D4C4B5",
    borderStyle: "dashed",
    borderRadius: 12,
    backgroundColor: "#FAF5ED",
    paddingVertical: 26,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 6,
    cursor: "pointer" as any,
  },
  dropZoneActive: {
    borderColor: "#B84A4A",
    backgroundColor: "#FFF0EE",
  },
  dropZoneContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  dropIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#F3E8DB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  dropZoneTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#333",
    textAlign: "center",
  },
  dropZoneSubtitle: {
    fontSize: 11,
    color: "#888",
  },
  uploadedPreviewBox: {
    position: "relative",
    height: 200,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#B84A4A",
    backgroundColor: "#FFF",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 6,
  },
  uploadedPreviewImg: {
    width: "100%",
    height: "100%",
  },
  removeImageBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(184, 74, 74, 0.9)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  removeImageText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
  },

  // LIVE MAP & RIDER CARD STYLES
  mapWrapper: {
    gap: 12,
    marginTop: 6,
  },
  mapContainer: {
    width: "100%",
    height: 260,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D5E8D4",
    backgroundColor: "#E8F5E9",
  },
  mobileMapPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  riderStatusCard: {
    backgroundColor: "#FFF",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E8DED1",
    gap: 8,
  },
  riderHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  riderBadge: {
    backgroundColor: "#D4EFDF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  riderBadgeText: {
    color: "#1E8449",
    fontSize: 11,
    fontWeight: "800",
  },
  etaText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#C0392B",
  },
  riderInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  riderName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#333",
  },
  riderPhone: {
    fontSize: 11,
    color: "#777",
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: "#F0ECE4",
    marginVertical: 4,
  },
  locationDetailRow: {
    gap: 2,
  },
  locationLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#888",
  },
  locationValue: {
    fontSize: 12,
    color: "#333",
    lineHeight: 16,
  },

  // CANCELLATION MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 20,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#B84A4A",
    marginBottom: 4,
    textAlign: "center",
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#444",
    marginTop: 10,
    marginBottom: 6,
  },
  choicePill: {
    borderWidth: 1,
    borderColor: "#DDD",
    borderRadius: 8,
    padding: 8,
    marginVertical: 3,
    backgroundColor: "#FDFDFD",
  },
  choicePillActive: { borderColor: "#B84A4A", backgroundColor: "#FFF0F0" },
  choiceText: { fontSize: 12, color: "#555" },
  choiceTextActive: { color: "#B84A4A", fontWeight: "700" },
  modalInput: {
    borderWidth: 1,
    borderColor: "#CCC",
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    backgroundColor: "#FAFAFA",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 18,
  },
  modalCancelBtn: { paddingVertical: 8, paddingHorizontal: 14 },
  modalSubmitBtn: {
    backgroundColor: "#B84A4A",
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 6,
  },
});
