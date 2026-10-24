import { ReactNode, useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useAppearance } from '../theme/AppearanceContext';
import type { AppColors } from '../theme/colors';
import { shadows } from '../theme/theme';

const PHONE_W = 340;
const PHONE_H = 780;
const DESKTOP_BACKGROUND = '#050706';
const DESKTOP_SPOTLIGHT = 'radial-gradient(circle at 50% 44%, rgba(120, 158, 137, 0.2) 0%, rgba(45, 67, 56, 0.11) 30%, rgba(5, 7, 6, 0) 64%)';

/**
 * Desktop browser “device” chrome so the app feels like a real phone preview.
 * The app content fills the inner safe area; you scroll/interact inside the frame.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  const { colors, mode } = useAppearance();
  const { width } = useWindowDimensions();
  const [phone] = useState(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches && Math.min(window.screen.width, window.screen.height) < 600);
  const fullScreen = phone || width < 600;
  const [landscape, setLandscape] = useState(false);
  useEffect(() => {
    if (!phone) return;
    const update = () => {
      // Physical screen orientation, not a short viewport caused by the keyboard.
      const angle = screen.orientation?.angle ?? (window as Window & { orientation?: number }).orientation;
      setLandscape(angle != null ? Math.abs(angle) % 180 === 90 : screen.width > screen.height);
    };
    const orientation = screen.orientation as ScreenOrientation & { lock?: (value: string) => Promise<void> };
    void orientation?.lock?.('portrait').catch(() => {});
    update(); window.addEventListener('orientationchange', update); orientation?.addEventListener('change', update);
    return () => { window.removeEventListener('orientationchange', update); orientation?.removeEventListener('change', update); };
  }, [phone]);
  useEffect(() => {
    const browserBackground = fullScreen ? colors.background : DESKTOP_BACKGROUND;
    document.documentElement.style.backgroundColor = browserBackground;
    document.body.style.backgroundColor = browserBackground;
    document.documentElement.style.colorScheme = mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', browserBackground);
  }, [colors.background, fullScreen, mode]);
  const styles = makeThemeStyles(colors);
  // Keep the same child ancestry across breakpoints: replacing wrappers remounts
  // auth, navigation and active-drive state when the browser changes width.
  return (
    <View style={fullScreen ? { flex: 1, backgroundColor: colors.background } : [styles.page, { backgroundImage: DESKTOP_SPOTLIGHT } as any]}>
      <View style={fullScreen ? { flex: 1, width: '100%' } : styles.deviceOuter}>
        <View style={fullScreen ? { flex: 1 } : styles.bezel}>
          <View style={[styles.notch, fullScreen && { display: 'none' }]} />
          <View style={[styles.screenCutout, fullScreen && { borderRadius: 0 }]}>
            <View style={{ flex: 1, opacity: landscape ? 0 : 1 }} pointerEvents={landscape ? 'none' : 'auto'} accessibilityElementsHidden={landscape} importantForAccessibility={landscape ? 'no-hide-descendants' : 'auto'}>{children}</View>
            {landscape ? <View accessibilityRole="alert" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
              <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>Keep CUBO upright</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 15, textAlign: 'center', maxWidth: 360 }}>Rotate your phone back to portrait. Your drive stays open. Adjust your phone only when safely parked.</Text>
            </View> : null}
          </View>
        </View>
      </View>
      <View style={[styles.installNoteWrap, fullScreen && { display: 'none' }]}>
        <Text style={styles.installNote}>Designed for phone use. On iPhone, open CUBO in Safari, tap Share, then Add to Home Screen. On Android, open it in Chrome, open the menu, then choose Install app or Add to Home screen.</Text>
      </View>
    </View>
  );
}

const makeThemeStyles = (colors: AppColors) => StyleSheet.create({
  page: {
    flex: 1,
    width: '100%' as any,
    minHeight: '100vh' as any,
    backgroundColor: DESKTOP_BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
    gap: 14,
  },
  installNoteWrap: {
    width: '100%' as any,
    maxWidth: 520,
    paddingHorizontal: 18,
  },
  installNote: {
    color: 'rgba(225, 233, 228, 0.56)',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 17,
  },
  deviceOuter: {
    width: PHONE_W,
    height: PHONE_H,
    maxWidth: '100%' as any,
    maxHeight: 'calc(100vh - 92px)' as any,
    ...shadows.phone,
  },
  bezel: {
    flex: 1,
    borderRadius: 44,
    backgroundColor: '#2A302C',
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  notch: {
    alignSelf: 'center',
    width: 120,
    height: 28,
    marginBottom: 6,
    borderRadius: 20,
    backgroundColor: '#1A1D1B',
  },
  screenCutout: {
    flex: 1,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
});
