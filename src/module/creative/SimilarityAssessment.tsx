import { Text } from '@/components/Typography';
import ArtworkVerificationPanel from '@/module/blockchain/ArtworkVerificationPanel';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Pressable, StyleSheet, View } from 'react-native';

export type SimilarityMatch = {
  id: number;
  reference_artwork_id: number;
  reference_title: string;
  reference_artist_name: string;
  reference_image_data: string;
  reference_status?: string;
  reference_provenance?: { artwork_id: string; creator_verified: boolean; disputed: boolean } | null;
  confidence_score: number | null;
  phash_distance?: number | null;
  dhash_distance?: number | null;
  edge_hash_distance?: number | null;
  feature_match_score?: number | null;
  color_similarity_score?: number | null;
  review_status: 'pending' | 'confirmed_copy' | 'not_a_copy' | 'auto_blocked';
  automatic_assessment?: 'exact_duplicate' | 'high_similarity' | 'possible_match';
  assessment_threshold?: number;
  match_evidence?: {
    algorithm_version?: string; rotation?: number; mirrored?: boolean;
    strong_copy_evidence?: boolean;
    geometry?: { verified: boolean; inliers: number; matches: number; inlier_ratio: number; coverage_left: number; coverage_right: number };
  };
};

const validRatio = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
// These are the existing algorithm's normalized indices, not probabilities or
// percentages of identical pixels. Keep ORB as its raw measured match ratio.
const hashIndex = (distance: unknown) => typeof distance === 'number' && Number.isFinite(distance) && Number.isInteger(distance) && distance >= 0 && distance <= 64 ? Math.max(0, 1 - distance / 20) : null;

export default function SimilarityAssessment({ match, onInspect }: {
  match: SimilarityMatch;
  onInspect: (uri: string, title: string) => void;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const score = validRatio(match.confidence_score) ? match.confidence_score : null;
  const exact = match.automatic_assessment === 'exact_duplicate';
  const high = match.automatic_assessment === 'high_similarity';
  useEffect(() => {
    let active = true;
    let animation: Animated.CompositeAnimation | undefined;
    const start = (reduce: boolean) => {
      animation?.stop();
      if (reduce) { progress.setValue(1); return; }
      progress.setValue(0);
      animation = Animated.timing(progress, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: false });
      animation.start();
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(reduce => { if (active) start(reduce); }).catch(() => { if (active) progress.setValue(1); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', reduce => { if (active) start(reduce); });
    return () => { active = false; animation?.stop(); subscription.remove(); };
  }, [match.id, progress]);
  const metrics = [
    { name: 'pHash similarity index', value: hashIndex(match.phash_distance), raw: match.phash_distance, color: '#A43D44' },
    { name: 'dHash similarity index', value: hashIndex(match.dhash_distance), raw: match.dhash_distance, color: '#D15C58' },
    { name: 'Edge similarity index', value: hashIndex(match.edge_hash_distance), raw: match.edge_hash_distance, color: '#E48854' },
    { name: match.match_evidence?.algorithm_version ? 'Geometrically verified ORB ratio' : 'Legacy ORB feature-match ratio', value: validRatio(match.feature_match_score) ? match.feature_match_score : null, raw: undefined, color: '#B87D28' },
  ];
  const title = exact ? 'Identical file detected' : score === null ? 'Assessment unavailable' : high ? 'High visual similarity' : 'Possible visual match';
  return <View style={s.card}>
    <View style={s.header}>
      <View style={s.heading}><Text style={s.eyebrow}>AUTOMATIC ASSESSMENT</Text><Text style={s.title}>{title}</Text></View>
      <View style={s.score}><Text style={s.scoreNumber}>{score === null ? '—' : `${(score * 100).toFixed(1)}/100`}</Text><Text style={s.scoreCaption}>{exact ? 'File match' : 'Visual similarity'}</Text></View>
    </View>
    <Text style={s.description}>{exact ? 'The file fingerprint matches an existing upload. Exact-file duplicate protection applies.' : 'Ownership review required. Check the matched work and any permission or repost evidence before the final artwork decision.'}</Text>
    <View style={s.reference}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Inspect matched artwork: ${match.reference_title}`} onPress={() => onInspect(match.reference_image_data, match.reference_title)}>
        <Image source={{ uri: match.reference_image_data }} style={s.image} resizeMode="cover" />
      </Pressable>
      <View style={s.referenceInfo}>
        <Text style={s.referenceTitle}>{match.reference_title}</Text>
        <Text style={s.description}>by {match.reference_artist_name}</Text>
        <Text style={s.caption}>Listing #{match.reference_artwork_id} · {match.reference_status || 'Status unavailable'}</Text>
        <Text style={s.caption}>{match.reference_provenance ? `Registration: ${match.reference_provenance.artwork_id}` : 'Artwork identity not registered yet'}</Text>
        {match.reference_provenance && <Text style={s.caption}>{match.reference_provenance.disputed ? 'Attribution disputed—investigate history' : match.reference_provenance.creator_verified ? 'Creator attribution reviewed' : 'Creator attribution claimed'}</Text>}
      </View>
    </View>
    <ArtworkVerificationPanel artworkId={match.reference_artwork_id} buttonLabel="Verify matched artwork" />
    {match.match_evidence?.geometry && <View style={s.rule}>
      <Text style={s.ruleTitle}>Spatial verification</Text>
      <Text style={s.caption}>{match.match_evidence.geometry.verified ? 'Consistent feature geometry detected' : 'Insufficient consistent feature geometry'} · {match.match_evidence.geometry.inliers} inliers / {match.match_evidence.geometry.matches} candidate matches.</Text>
      <Text style={s.caption}>Matched area: {Math.round(match.match_evidence.geometry.coverage_left * 100)}% of submission / {Math.round(match.match_evidence.geometry.coverage_right * 100)}% of reference. Orientation: {match.match_evidence.rotation || 0}°{match.match_evidence.mirrored ? ', mirrored' : ''}.</Text>
      <Text style={s.caption}>Algorithm: {match.match_evidence.algorithm_version}. {match.match_evidence.strong_copy_evidence ? 'Multiple copy-detection signals agree.' : 'Treat this as review evidence.'}</Text>
    </View>}
    {!exact && <View style={s.chart}>
      <Text style={s.chartTitle}>Comparison measurements</Text>
      <Text style={s.caption}>Each bar uses its own measure. These are not parts of a total or a simple average.</Text>
      {metrics.map(metric => <View key={metric.name} style={s.metric}>
        <View style={s.metricHeading}><Text style={s.metricLabel}>{metric.name}</Text><Text style={s.metricValue}>{metric.value === null ? 'Unavailable' : metric.raw === undefined ? `${(metric.value * 100).toFixed(1)}%` : `${Math.round(metric.value * 100)}/100`}</Text></View>
        <View accessible accessibilityLabel={`${metric.name}: ${metric.value === null ? 'unavailable' : `${(metric.value * 100).toFixed(1)} out of 100`}${metric.raw === undefined ? '' : `; hash distance ${metric.raw}, lower distance means more similar`}`} style={s.track}>
          {metric.value !== null && <Animated.View style={[s.bar, { backgroundColor: metric.color, width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${metric.value * 100}%`] }) }]} />}
        </View>
        {metric.value !== null && metric.raw !== undefined && <Text style={s.caption}>Hash distance: {metric.raw} · lower is more similar</Text>}
      </View>)}
      <Text style={s.caption}>Hash indices use max(0, 1 − distance ÷ 20). ORB shows the matched-feature ratio (RANSAC-verified for geometry-v2); the overall score applies its own normalization and weights.</Text>
      {validRatio(match.color_similarity_score) && <Text style={s.caption}>Palette similarity: {Math.round(match.color_similarity_score * 100)}% · context only, excluded from the final score.</Text>}
    </View>}
    <View style={s.rule}>
      <Text style={s.ruleTitle}>System rule</Text>
      <Text style={s.description}>{exact ? 'Exact file fingerprint match.' : score === null ? 'The measured score is unavailable. Do not interpret this as a clear result.' : high && validRatio(match.assessment_threshold) ? `Score ${match.confidence_score} reached the current high-similarity cutoff of ${match.assessment_threshold}.` : 'The existing hash-distance, edge or feature-match rules flagged this comparison for review.'}</Text>
      {!exact && <Text style={s.caption}>The current rule is provisional, not a research-validated plagiarism threshold. The score is not a plagiarism probability or proof of ownership.</Text>}
    </View>
    {['confirmed_copy', 'not_a_copy'].includes(match.review_status) && <Text style={s.caption}>Historical manual assessment: {match.review_status === 'confirmed_copy' ? 'copy match confirmed' : 'marked not a copy'}. Retained for investigation; the automatic assessment above is independent.</Text>}
  </View>;
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#E8D8D1', borderRadius: 12, padding: 14, marginBottom: 12, backgroundColor: '#FFFDFC', gap: 10 },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  heading: { flex: 1, minWidth: 140, gap: 5 },
  eyebrow: { color: '#98736A', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  title: { color: '#8C4144', fontSize: 15, fontWeight: '800' },
  score: { padding: 9, borderRadius: 10, backgroundColor: '#F7E9E4', alignItems: 'center' },
  scoreNumber: { color: '#A43D44', fontSize: 22, fontWeight: '800' },
  scoreCaption: { color: '#885A50', fontSize: 10 },
  description: { color: '#69564F', fontSize: 12, lineHeight: 18 },
  reference: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  image: { width: 80, height: 84, borderRadius: 8, backgroundColor: '#EEE9E5' },
  referenceInfo: { flex: 1, minWidth: 0, gap: 3 },
  referenceTitle: { color: '#433633', fontWeight: '700', fontSize: 13 },
  caption: { color: '#85736C', fontSize: 10, lineHeight: 16 },
  chart: { borderWidth: 1, borderColor: '#EBDDD4', borderRadius: 10, padding: 12, gap: 10, backgroundColor: '#FFFFFF' },
  chartTitle: { fontSize: 13, fontWeight: '700', color: '#58413C' },
  metric: { gap: 5 },
  metricHeading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 4 },
  metricLabel: { color: '#69564F', fontSize: 11 },
  metricValue: { color: '#8C4144', fontSize: 11, fontWeight: '700' },
  track: { height: 9, borderRadius: 5, backgroundColor: '#F2EBE6', overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 5 },
  rule: { padding: 11, borderRadius: 8, backgroundColor: '#FAF0E4', gap: 5 },
  ruleTitle: { color: '#8B563D', fontWeight: '700', fontSize: 11 },
});
