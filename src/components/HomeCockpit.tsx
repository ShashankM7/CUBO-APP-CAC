import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, LinearGradient as SvgGradient, Stop, Rect } from 'react-native-svg';
import { MotionPressable } from './MotionPressable';
import { ProfileAvatar } from './ProfileAvatar';
import { Reveal } from './Reveal';
import { useAppearance } from '../theme/AppearanceContext';

type Props = {
  name: string;
  avatarId?: string;
  photoUri?: string;
  uid?: string;
  score: number;
  measured: number;
  active: boolean;
  unread: number;
  onAccount: () => void;
  onNotifications: () => void;
  onActivity: () => void;
  onInsurance: () => void;
};

export function HomeCockpit(p: Props) {
  const { mode } = useAppearance();
  const { width } = useWindowDimensions();
  const carouselRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const requestedPageRef = useRef<number | null>(null);
  const [page, setPage] = useState(0);
  const [pageWidth, setPageWidth] = useState(Math.min(width, 430));
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning,' : hour < 18 ? 'Good afternoon,' : 'Good evening,';
  const circumference = 2 * Math.PI * 105;
  const greenGradient = mode === 'dark' ? ['#1B2022', '#14181A', '#101315'] as const : ['#0B3023', '#0E4A2D', '#072B1C'] as const;
  const purpleGradient = mode === 'dark' ? ['#2B2630', '#211D27', '#151419'] as const : ['#4A3B56', '#352C40', '#1F1B24'] as const;
  const purpleOpacity = scrollX.interpolate({ inputRange: [0, Math.max(1, pageWidth)], outputRange: [0, 1], extrapolate: 'clamp' });

  const showPage = (nextPage: number) => {
    const next = Math.max(0, Math.min(1, nextPage));
    requestedPageRef.current = next;
    setPage(next);
    carouselRef.current?.scrollTo({ x: next * pageWidth, y: 0, animated: true });
  };
  const trackPage = (offset: number) => {
    const requested = requestedPageRef.current;
    if (requested !== null) {
      if (Math.abs(offset - requested * pageWidth) < 2) requestedPageRef.current = null;
      return;
    }
    const next = Math.round(offset / pageWidth);
    if ((next === 0 || next === 1) && next !== page) setPage(next);
  };
  useEffect(() => {
    carouselRef.current?.scrollTo({ x: page * pageWidth, y: 0, animated: false });
    scrollX.setValue(page * pageWidth);
  }, [pageWidth]);

  return <View style={s.hero}>
    <LinearGradient pointerEvents="none" colors={greenGradient} style={StyleSheet.absoluteFill} />
    <Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs><RadialGradient id="field" cx="50%" cy="48%" rx="70%" ry="55%"><Stop offset="0" stopColor="#48AA68" stopOpacity={mode === 'dark' ? '.14' : '.38'} /><Stop offset="1" stopColor="#113821" stopOpacity="0" /></RadialGradient></Defs>
      <Rect width="100%" height="100%" fill="url(#field)" />
    </Svg>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: purpleOpacity }]}>
      <LinearGradient colors={purpleGradient} style={StyleSheet.absoluteFill} />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs><RadialGradient id="plum-field" cx="50%" cy="48%" rx="70%" ry="55%"><Stop offset="0" stopColor="#8D73A0" stopOpacity=".24" /><Stop offset="1" stopColor="#2A2230" stopOpacity="0" /></RadialGradient></Defs>
        <Rect width="100%" height="100%" fill="url(#plum-field)" />
      </Svg>
    </Animated.View>

    <View style={s.header}>
      <View style={s.nameBlock}><Text style={s.greeting}>{greeting}</Text><Text numberOfLines={1} style={s.name}>{p.name.split(' ')[0] || 'Welcome'}</Text></View>
      <MotionPressable accessibilityLabel={`Notifications, ${p.unread} unread`} onPress={p.onNotifications} style={s.bell}><Ionicons name="notifications-outline" size={21} color="#FFFFFF" />{p.unread > 0 && <View style={s.dot} />}</MotionPressable>
      <MotionPressable accessibilityLabel="Your account" onPress={p.onAccount} style={s.avatar}><ProfileAvatar avatarId={p.avatarId} photoUri={p.photoUri} uid={p.uid} size={46} rounded /></MotionPressable>
    </View>

    <Reveal style={s.carouselFrame}>
      <View style={s.carouselFrame} onLayout={event => setPageWidth(Math.min(event.nativeEvent.layout.width, 430))}>
        <Animated.ScrollView
          ref={carouselRef} horizontal pagingEnabled
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          snapToInterval={pageWidth}
          snapToAlignment="start"
          scrollEventThrottle={16}
          onScrollBeginDrag={() => { requestedPageRef.current = null; }}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false, listener: (event: any) => trackPage(event.nativeEvent.contentOffset.x) })}
          onMomentumScrollEnd={event => { requestedPageRef.current = null; setPage(Math.max(0, Math.min(1, Math.round(event.nativeEvent.contentOffset.x / pageWidth)))); }}
          contentContainerStyle={s.carousel}
        >
          <View style={[s.page, { width: pageWidth }]}>
            <MotionPressable accessibilityLabel={`Safety score ${p.score}. Open Drive Activity`} onPress={p.onActivity} style={s.score} scaleTo={.99}>
              <Svg width={252} height={252} viewBox="0 0 252 252" style={StyleSheet.absoluteFill}>
                <Defs><SvgGradient id="score-light" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#AEFF8B" /><Stop offset=".55" stopColor="#53DD63" /><Stop offset="1" stopColor="#168441" /></SvgGradient></Defs>
                <Circle cx="126" cy="126" r="123" stroke="#83D978" strokeOpacity=".12" strokeWidth="1" fill="none" />
                <Circle cx="126" cy="126" r="105" stroke="#A5FF7A" strokeOpacity=".08" strokeWidth="22" fill="none" />
                <Circle cx="126" cy="126" r="105" stroke="#8BAF82" strokeOpacity=".22" strokeWidth="8" fill="none" />
                <Circle cx="126" cy="126" r="105" stroke="url(#score-light)" strokeWidth="11" fill="none" strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={circumference * (1 - Math.max(0, Math.min(100, p.score)) / 100)} rotation="-90" origin="126,126" />
              </Svg>
              <Text style={s.scoreValue}>{p.score}</Text><Text style={s.scoreLabel}>{p.measured ? 'Average safety score' : 'Starter safety score'}</Text><Ionicons name="shield-checkmark" size={25} color="#9AE784" style={s.scoreIcon} />
            </MotionPressable>
          </View>
          <View style={[s.page, { width: pageWidth }]}>
            <MotionPressable accessibilityLabel="Potential savings, 27 dollars per month. Open Insurance" onPress={p.onInsurance} style={s.score} scaleTo={.99}>
              <Svg width={252} height={252} viewBox="0 0 252 252" style={StyleSheet.absoluteFill}>
                <Defs><SvgGradient id="savings-light" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#D4C0E1" /><Stop offset=".52" stopColor="#A98DBB" /><Stop offset="1" stopColor="#765E86" /></SvgGradient></Defs>
                <Circle cx="126" cy="126" r="123" stroke="#C8B2D4" strokeOpacity=".14" strokeWidth="1" fill="none" />
                <Circle cx="126" cy="126" r="105" stroke="#BFA8CC" strokeOpacity=".11" strokeWidth="22" fill="none" />
                <Circle cx="126" cy="126" r="105" stroke="#85738F" strokeOpacity=".32" strokeWidth="8" fill="none" />
                <Circle cx="126" cy="126" r="105" stroke="url(#savings-light)" strokeWidth="11" fill="none" strokeLinecap="round" strokeDasharray={`${circumference * .72} ${circumference}`} rotation="-90" origin="126,126" />
              </Svg>
              <Text style={s.savingsValue}>$27<Text style={s.savingsUnit}>/mo</Text></Text><Text style={[s.scoreLabel, { color: '#E3D7E9' }]}>Potential premium savings</Text><Text style={[s.previewLabel, { color: '#B9A8C3' }]}>Illustrative preview</Text>
            </MotionPressable>
          </View>
        </Animated.ScrollView>
        <View accessibilityRole="tablist" style={s.pageDots}>
          <MotionPressable accessibilityRole="tab" accessibilityLabel="Show safety score" accessibilityState={{ selected: page === 0 }} onPress={() => showPage(0)} scaleTo={.9} style={s.pageDotTarget}><View style={page === 0 ? s.pageDotActive : s.pageDot} /></MotionPressable>
          <MotionPressable accessibilityRole="tab" accessibilityLabel="Show potential savings" accessibilityState={{ selected: page === 1 }} onPress={() => showPage(1)} scaleTo={.9} style={s.pageDotTarget}><View style={page === 1 ? s.pageDotSavings : s.pageDot} /></MotionPressable>
        </View>
      </View>
    </Reveal>
    <Text style={s.ready}>{p.active ? 'Drive monitoring active' : 'Ready for your next drive'}</Text>
  </View>;
}

const s = StyleSheet.create({
  hero: { paddingTop: 22, paddingBottom: 54, minHeight: 472, alignItems: 'center', overflow: 'hidden' },
  header: { zIndex: 2, flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 4, gap: 8, paddingHorizontal: 24 },
  nameBlock: { flex: 1 },
  greeting: { color: '#D3E4D8', fontSize: 17, fontFamily: 'Manrope_400Regular' },
  name: { color: '#FFFFFF', fontSize: 29, lineHeight: 36, fontFamily: 'Manrope_800ExtraBold', letterSpacing: -.7 },
  bell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 7, right: 9, width: 6, height: 6, borderRadius: 3, backgroundColor: '#B7F28C' },
  avatar: { borderRadius: 25, borderWidth: 2, borderColor: 'rgba(255,255,255,.5)', overflow: 'hidden' },
  carouselFrame: { width: '100%', zIndex: 1 },
  carousel: { alignItems: 'center' },
  page: { alignItems: 'center', justifyContent: 'center' },
  score: { width: 252, height: 252, alignItems: 'center', justifyContent: 'center', paddingTop: 8 },
  scoreValue: { color: '#FFFFFF', fontFamily: 'Manrope_800ExtraBold', fontSize: 68, lineHeight: 78, letterSpacing: -3, fontVariant: ['tabular-nums'] },
  savingsValue: { color: '#FFFFFF', fontFamily: 'Manrope_800ExtraBold', fontSize: 56, lineHeight: 70, letterSpacing: -2.5, fontVariant: ['tabular-nums'] },
  savingsUnit: { fontSize: 20, letterSpacing: -.5 },
  scoreLabel: { color: '#D4E9D6', fontFamily: 'Manrope_500Medium', fontSize: 13, marginTop: 4 },
  scoreIcon: { marginTop: 14 },
  previewLabel: { color: '#93AA9F', fontFamily: 'Manrope_600SemiBold', fontSize: 10, marginTop: 14, letterSpacing: .5, textTransform: 'uppercase' },
  pageDots: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  pageDotTarget: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pageDotActive: { width: 22, height: 5, borderRadius: 3, backgroundColor: '#71D3A4' },
  pageDotSavings: { width: 22, height: 5, borderRadius: 3, backgroundColor: '#B39AC2' },
  pageDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.34)' },
  ready: { zIndex: 1, color: '#FFFFFF', fontFamily: 'Manrope_700Bold', fontSize: 22, textAlign: 'center', letterSpacing: -.6, marginTop: 2 },
});
