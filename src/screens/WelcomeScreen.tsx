import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { MotionPressable } from '../components/MotionPressable';
import { Reveal } from '../components/Reveal';

type Props = { onChooseMode: (mode: 'login' | 'signup') => void };

function CircuitField() {
  return <Svg pointerEvents="none" accessibilityElementsHidden style={StyleSheet.absoluteFill} viewBox="0 0 390 360" fill="none">
    <Path d="M-14 265L78 213H142L198 181H280L408 108" stroke="#84DDB4" strokeWidth="1.4" opacity=".16" />
    <Path d="M-18 306L61 261H121L175 229H258L405 145" stroke="#84DDB4" strokeWidth="1.4" opacity=".12" />
    <Path d="M-8 174L65 216H123L169 243H233L402 340" stroke="#84DDB4" strokeWidth="1.4" opacity=".12" />
    <Path d="M24 104L101 149H154L203 177H279L397 246" stroke="#84DDB4" strokeWidth="1.4" opacity=".14" />
    <Path d="M47 329L108 294H164M306 80L353 53H401" stroke="#84DDB4" strokeWidth="1.4" opacity=".12" />
    {[[-4, 265], [78, 213], [142, 213], [198, 181], [280, 181], [61, 261], [121, 261], [175, 229], [258, 229], [65, 216], [123, 216], [169, 243], [233, 243], [101, 149], [154, 149], [203, 177], [279, 177], [108, 294], [306, 80], [353, 53]].map(([cx, cy], index) => <Circle key={`${cx}-${cy}-${index}`} cx={cx} cy={cy} r="3" fill="#84DDB4" opacity=".2" />)}
  </Svg>;
}

/** Signed-out presentation only. Authentication screens and behavior live elsewhere. */
export function WelcomeScreen({ onChooseMode }: Props) {
  return <View style={s.page}>
    <StatusBar style="light" />
    <LinearGradient pointerEvents="none" colors={['#0A3D2D', '#082E23', '#061C17']} locations={[0, .62, 1]} style={StyleSheet.absoluteFill} />
    <View pointerEvents="none" style={s.ambientTop} />
    <SafeAreaView style={s.safe}>
      <Reveal style={s.brand}>
        <View style={s.brandMark}><View style={s.brandMarkInner} /></View>
        <Text accessibilityRole="header" style={s.wordmark}>CUBO</Text>
        <Text style={s.product}>PERSONAL DRIVE ASSISTANT</Text>
      </Reveal>

      <Reveal style={s.hero}>
        <CircuitField />
        <View style={s.platformShadow} />
        <LinearGradient pointerEvents="none" colors={['#48B77F', '#1C7754']} start={{ x: .15, y: 0 }} end={{ x: .9, y: 1 }} style={s.platform} />
        <View pointerEvents="none" style={s.vehicleGlow} />
        <Image source={require('../../assets/vehicles/compact-car-green.png')} resizeMode="contain" style={s.vehicle} accessibilityIgnoresInvertColors />
      </Reveal>

      <Reveal style={s.message}>
        <Text style={s.headline}>Drive smarter.{`\n`}Arrive safer.</Text>
        <Text style={s.supporting}>Focus alerts, live guidance, and safer habits for every drive.</Text>
      </Reveal>

      <Reveal style={s.actions}>
        <MotionPressable accessibilityRole="button" onPress={() => onChooseMode('login')} style={s.signIn}>
          <Text style={s.signInText}>Sign in</Text>
        </MotionPressable>
        <MotionPressable accessibilityRole="button" onPress={() => onChooseMode('signup')} style={s.create}>
          <Text style={s.createText}>Create account</Text>
        </MotionPressable>
      </Reveal>
    </SafeAreaView>
  </View>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#061C17' },
  safe: { flex: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 14 },
  ambientTop: { position: 'absolute', top: -130, left: '12%', width: '76%', aspectRatio: 1, borderRadius: 999, backgroundColor: 'rgba(77,190,130,.09)' },
  brand: { alignItems: 'center', gap: 6 },
  brandMark: { width: 34, height: 34, borderRadius: 18, borderWidth: 3, borderColor: '#8CE3BA', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  brandMarkInner: { width: 12, height: 12, borderRadius: 7, backgroundColor: '#8CE3BA' },
  wordmark: { color: '#FFFFFF', fontFamily: 'Manrope_800ExtraBold', fontSize: 31, lineHeight: 34, letterSpacing: 2.8, textAlign: 'center' },
  product: { color: 'rgba(219,244,231,.72)', fontFamily: 'Manrope_600SemiBold', fontSize: 10, letterSpacing: 1.7, textAlign: 'center' },
  hero: { flex: 1, minHeight: 178, marginHorizontal: -24, marginTop: 4, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  platformShadow: { position: 'absolute', top: '58%', width: '70%', height: 92, borderRadius: 999, backgroundColor: 'rgba(0,0,0,.28)', transform: [{ scaleY: .48 }] },
  platform: { position: 'absolute', top: '48%', width: '72%', height: 128, borderRadius: 999, transform: [{ scaleY: .55 }], borderWidth: 1, borderColor: 'rgba(190,250,219,.2)' },
  vehicleGlow: { position: 'absolute', top: '29%', width: '76%', height: 150, borderRadius: 999, backgroundColor: 'rgba(114,221,170,.08)' },
  vehicle: { width: '96%', height: '72%', transform: [{ translateY: -2 }] },
  message: { alignItems: 'center', paddingHorizontal: 12, marginTop: -2, marginBottom: 16 },
  headline: { color: '#FFFFFF', fontFamily: 'Manrope_800ExtraBold', fontSize: 28, lineHeight: 31, letterSpacing: -.7, textAlign: 'center' },
  supporting: { color: 'rgba(223,241,232,.7)', fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 17, textAlign: 'center', maxWidth: 310, marginTop: 8 },
  actions: { gap: 10 },
  signIn: { minHeight: 50, borderRadius: 14, backgroundColor: '#F4FFF9', alignItems: 'center', justifyContent: 'center', shadowColor: '#020C09', shadowOffset: { width: 0, height: 8 }, shadowOpacity: .2, shadowRadius: 18, elevation: 4 },
  create: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(211,244,227,.38)', backgroundColor: 'rgba(255,255,255,.035)', alignItems: 'center', justifyContent: 'center' },
  signInText: { color: '#0A4A34', fontFamily: 'Manrope_700Bold', fontSize: 16 },
  createText: { color: '#FFFFFF', fontFamily: 'Manrope_600SemiBold', fontSize: 16 },
});
