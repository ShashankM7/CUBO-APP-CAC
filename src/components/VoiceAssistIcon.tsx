import Svg, { Path } from 'react-native-svg';

type Props = { size?: number; color?: string };

/** A calm, human voice mark shared by Assistant and Map. */
export function VoiceAssistIcon({ size = 24, color = 'currentColor' }: Props) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
    <Path d="M10.7 4.4a4.1 4.1 0 0 0-4.1 4.1v1.25c0 1-.34 1.88-.98 2.62L4.35 13.8h4.1v3.75h3.25" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M14.05 9.15a3.85 3.85 0 0 1 0 5.7M16.95 6.8a7.05 7.05 0 0 1 0 10.4M19.7 4.65a10.15 10.15 0 0 1 0 14.7" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
  </Svg>;
}
