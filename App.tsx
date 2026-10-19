import { StatusBar } from 'expo-status-bar';
import { MapSourceProvider } from './src/features/maps/MapSourceContext';
import { NavigationContainer, Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Easing, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { useEffect, useState } from 'react';

import { PhoneFrame } from './src/components/PhoneFrame';
import { TabBar } from './src/components/TabBar';
import { HomeScreen } from './src/screens/HomeScreen';
import { DrivesScreen } from './src/screens/DrivesScreen';
import { GarageScreen } from './src/screens/GarageScreen';
import { LiveDriveScreen } from './src/screens/LiveDriveScreen';
import { TripSummaryScreen } from './src/screens/TripSummaryScreen';
import { DriveEventsScreen } from './src/screens/DriveEventsScreen';
import { DriveProvider } from './src/features/drives/DriveContext';
import { DetectionScreen } from './src/screens/DetectionScreen';
import { DriverReportsScreen } from './src/screens/DriverReportsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { SplashScreen } from './src/screens/SplashScreen';
import { VehicleDetailScreen } from './src/screens/VehicleDetailScreen';
import { AppBlockingScreen } from './src/screens/AppBlockingScreen';
import { MainTabParamList, RootStackParamList } from './src/navigation/types';
import { colors } from './src/theme/colors';
import { AppearanceProvider, useAppearance } from './src/theme/AppearanceContext';
import { VehicleProvider } from './src/features/vehicles/VehicleContext';
import { AddVehicleScreen } from './src/screens/AddVehicleScreen';
import { TripDetailScreen } from './src/screens/TripDetailScreen';
import { SettingsDetailScreen } from './src/screens/SettingsDetailScreen';
import { ProfileProvider } from './src/features/profile/ProfileContext';
import { DeviceProvider } from './src/features/devices/DeviceContext';
import { CruiseCameraScreen } from './src/screens/CruiseCameraScreen';
import { ConnectedDevicesScreen } from './src/screens/ConnectedDevicesScreen';
import { FamilyProvider } from './src/features/family/FamilyContext';
import { InsuranceProvider } from './src/features/insurance/InsuranceContext';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { FamilyMemberScreen } from './src/screens/FamilyMemberScreen';
import { FamilyScreen } from './src/screens/FamilyScreen';
import { InsuranceConnectionScreen } from './src/screens/InsuranceConnectionScreen';
import { MapScreen } from './src/screens/MapScreen';
import { AuthProvider, useAuth } from './src/features/auth/AuthContext';
import { WelcomeFlow } from './src/screens/WelcomeFlow';

import { LoadingScreen } from './src/components/LoadingScreen';
import { ReturningHomeScreen } from './src/screens/ReturningHomeScreen';
import { SavedPlaceScreen } from './src/screens/SavedPlaceScreen';
import { PlacesProvider } from './src/features/places/PlacesContext';
import { useReducedMotion } from './src/hooks/useReducedMotion';
import { CruiseProvider } from './src/features/devices/CruiseContext';
import { CameraCalibrationScreen } from './src/screens/CameraCalibrationScreen';
import { AppBlockingProvider } from './src/features/appBlocking/AppBlockingContext';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const navTheme: Theme = {
  dark: false,
  colors: {
    primary: colors.accentLime,
    background: colors.background,
    card: colors.card,
    text: colors.text,
    border: colors.border,
    notification: colors.danger,
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' },
    medium: { fontFamily: 'System', fontWeight: '500' },
    bold: { fontFamily: 'System', fontWeight: '700' },
    heavy: { fontFamily: 'System', fontWeight: '800' },
  },
};

const MainTabs = () => {
  const { colors } = useAppearance();
  const reduced = useReducedMotion();
  const animateTabs = Platform.OS !== 'web' && !reduced;
  return (
    <Tab.Navigator
      initialRouteName="Home"
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        animation: animateTabs ? 'shift' : 'none',
        transitionSpec: animateTabs ? { animation: 'timing', config: { duration: 240, easing: Easing.inOut(Easing.cubic) } } : undefined,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="Map" component={MapScreen} options={{ tabBarLabel: 'Map' }} />
      <Tab.Screen name="Activity" component={DrivesScreen} />
      <Tab.Screen name="Account" component={ProfileScreen} />
    </Tab.Navigator>
  );
};

const Wrapper = Platform.OS === 'web' ? View : GestureHandlerRootView;

function AppNavigation() {
  const { user, loading } = useAuth();
  const { colors, mode } = useAppearance();
  const [fontsLoaded, fontError] = useFonts({ Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });
  const fontsReady = fontsLoaded || !!fontError;
  const [boot, setBoot] = useState(0);
  const [readyUid, setReadyUid] = useState<string | null>(null);
  useEffect(() => { const timer = setTimeout(() => setBoot(1), 400); return () => clearTimeout(timer); }, []);
  useEffect(() => { if (boot !== 1 || !fontsReady || loading) return; const timer = setTimeout(() => setBoot(2), 160); return () => clearTimeout(timer); }, [boot, fontsReady, loading]);
  useEffect(() => { setReadyUid(null); if (!user || loading) return; const timer = setTimeout(() => setReadyUid(user.uid), 180); return () => clearTimeout(timer); }, [user?.uid, loading]);
  if (boot === 0) return <LoadingScreen brand />;
  if (boot !== 2 || !fontsReady || loading) return <LoadingScreen />;
  if (user && readyUid !== user.uid) return <LoadingScreen />;
  if (!user) return <WelcomeFlow />;
  const theme = { ...navTheme, dark: mode === 'dark', colors: { ...navTheme.colors, primary: colors.accent, background: colors.background, card: colors.card, text: colors.text, border: colors.border } };
  return (
        <DriveProvider>
        <NavigationContainer theme={theme}>
          <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
          <Stack.Navigator initialRouteName={Platform.OS === 'web' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('familyInvite') ? 'Family' : 'MainTabs'} screenOptions={{ headerShown: false, animationDuration: 220, contentStyle: { backgroundColor: colors.background } }}>
            <Stack.Screen name="MainTabs" component={MainTabs} options={{ animation: 'fade' }} />
            <Stack.Screen name="Splash" component={SplashScreen} options={{ animation: 'fade' }} />
            <Stack.Screen name="Drives" component={DrivesScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="Garage" component={GarageScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="AddVehicle" component={AddVehicleScreen} options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="CameraCalibration" component={CameraCalibrationScreen} options={{ animation: 'slide_from_right', gestureEnabled: false }} />
            <Stack.Screen name="CruiseCamera" component={CruiseCameraScreen} />
            <Stack.Screen name="ConnectedDevices" component={ConnectedDevicesScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="FamilyMember" component={FamilyMemberScreen} />
            <Stack.Screen name="Family" component={FamilyScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="InsuranceConnection" component={InsuranceConnectionScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="TripDetail" component={TripDetailScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="SettingsDetail" component={SettingsDetailScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="LiveDrive" component={LiveDriveScreen} options={{ presentation: 'formSheet', sheetAllowedDetents: [.9], sheetCornerRadius: 28, sheetGrabberVisible: true, animation: 'slide_from_bottom', gestureEnabled: false }} />
            <Stack.Screen name="DriveMap" component={MapScreen} options={{ gestureEnabled: false, animation: 'fade' }} />
            <Stack.Screen name="ReturningHome" component={ReturningHomeScreen} options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="SavedPlace" component={SavedPlaceScreen} options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="DriveEvents" component={DriveEventsScreen} />
            <Stack.Screen name="TripSummary" component={TripSummaryScreen} options={{ animation: 'slide_from_right', gestureEnabled: false }} />
            <Stack.Screen name="VehicleDetail" component={VehicleDetailScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="DriverReports" component={DriverReportsScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="DetectionLive" component={DetectionScreen} options={{ animation: 'fade_from_bottom' }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="AppBlocking" component={AppBlockingScreen} options={{ animation: 'slide_from_right' }} />
          </Stack.Navigator>
        </NavigationContainer>
        </DriveProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider><AppearanceProvider><MapSourceProvider>
      <PhoneFrame>
        <Wrapper style={{ flex: 1 }}>
          <AuthProvider><AppBlockingProvider><ProfileProvider><VehicleProvider><CruiseProvider><DeviceProvider><FamilyProvider><InsuranceProvider><PlacesProvider><AppNavigation /></PlacesProvider></InsuranceProvider></FamilyProvider></DeviceProvider></CruiseProvider></VehicleProvider></ProfileProvider></AppBlockingProvider></AuthProvider>
        </Wrapper>
      </PhoneFrame>
    </MapSourceProvider></AppearanceProvider></SafeAreaProvider>
  );
}
