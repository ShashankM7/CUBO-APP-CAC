import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MotionPressable } from '../components/MotionPressable';
import { Reveal } from '../components/Reveal';

type Props = { onChooseMode: (mode: 'login' | 'signup') => void };

/** Typography and actions are live UI; only the cool dusk scene is a photograph. */
export function WelcomeScreen({ onChooseMode }: Props) {
  return <View style={s.page}>
    <StatusBar style="light" />
    <Image source={require('../../assets/welcome/cubo-dusk-cool.png')} resizeMode="cover" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} accessibilityIgnoresInvertColors />
    <SafeAreaView style={s.safe}>
      <View style={s.identity}><Reveal><Text accessibilityRole="header" style={s.wordmark}>CUBO</Text><Text style={s.tagline}>Personal Drive Assistant</Text></Reveal></View>
      <Reveal style={s.actions}>
        <MotionPressable accessibilityRole="button" onPress={() => onChooseMode('login')} style={s.signIn}>
          <LinearGradient pointerEvents="none" colors={['#315F53', '#6F9D8D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          <Text style={s.buttonText}>Sign in</Text>
        </MotionPressable>
        <MotionPressable accessibilityRole="button" onPress={() => onChooseMode('signup')} style={s.create}><Text style={s.buttonText}>Create account</Text></MotionPressable>
      </Reveal>
    </SafeAreaView>
  </View>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#071019' },
  safe: { flex: 1 },
  identity: { position: 'absolute', top: '21%', left: 20, right: 20, alignItems: 'center' },
  wordmark: { color: '#FFFFFF', fontFamily: 'Manrope_700Bold', fontSize: 42, letterSpacing: 4.2, textAlign: 'center' },
  tagline: { color: '#FFFFFF', fontFamily: 'Manrope_500Medium', fontSize: 18, marginTop: 12, textAlign: 'center', letterSpacing: -.25 },
  actions: { position: 'absolute', bottom: '8%', left: '8%', right: '8%', gap: 16 },
  signIn: { minHeight: 52, borderRadius: 13, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  create: { minHeight: 52, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(225,238,244,.38)', backgroundColor: 'rgba(5,13,21,.42)', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontFamily: 'Manrope_600SemiBold', fontSize: 17 },
});
