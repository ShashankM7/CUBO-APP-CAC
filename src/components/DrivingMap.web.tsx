import { createContext, forwardRef, useContext, useEffect, useId, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Map as LibreMap, Marker as LibreMarker, LngLatBounds, type GeoJSONSource, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { applyWebDarkMapPaint } from './webDarkMapPaint';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { nearestBearing } from '../features/navigation/courseHeading';

type Coordinate = { latitude: number; longitude: number };
export type Region = Coordinate & { latitudeDelta: number; longitudeDelta: number };
export type MapStyleMode = 'street' | 'satellite';
type Camera = { center: Coordinate; heading?: number; pitch?: number; zoom?: number; altitude?: number };
export type MapView = {
  animateCamera: (camera: Camera, options?: { duration?: number }) => void;
  animateToRegion: (region: Region, duration?: number) => void;
  fitToCoordinates: (points: Coordinate[], options: { edgePadding: { top: number; right: number; bottom: number; left: number }; animated?: boolean }) => void;
  zoomBy: (delta: number) => void;
};
type Props = {
  children?: ReactNode; style?: StyleProp<ViewStyle>; initialRegion: Region; userInterfaceStyle: 'light' | 'dark';
  onPress?: () => void; onPanDrag?: () => void; userLocation?: Coordinate | null; showsUserLocation?: boolean;
  showsMyLocationButton?: boolean; showsCompass?: boolean; toolbarEnabled?: boolean;
  attributionBottom?: number;
  mapStyle?: MapStyleMode;
  interactive?: boolean; onMapReady?: () => void;
};
const MapContext = createContext<LibreMap | null>(null);
const coords = (point: Coordinate): [number, number] => [point.longitude, point.latitude];
const valid = (p: Coordinate) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 85 && Math.abs(p.longitude) <= 180;
const streetStyle = (appearance: Props['userInterfaceStyle']) => `https://tiles.openfreemap.org/styles/${appearance === 'dark' ? 'dark' : 'liberty'}`;
const satelliteTiles = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

function satelliteStyle(appearance: Props['userInterfaceStyle']) {
  return (_previous: StyleSpecification | undefined, next: StyleSpecification): StyleSpecification => {
    const layers = [...next.layers];
    const roadIndex = layers.findIndex(layer => 'source-layer' in layer && layer['source-layer'] === 'transportation');
    layers.splice(roadIndex < 0 ? Math.max(1, layers.length - 1) : roadIndex, 0, {
      id: 'cubo-satellite',
      type: 'raster',
      source: 'cubo-satellite',
      paint: {
        'raster-opacity': appearance === 'dark' ? .86 : .97,
        'raster-saturation': -.06,
        'raster-contrast': .06,
        'raster-resampling': 'linear',
      },
    });
    return {
      ...next,
      sources: { ...next.sources, 'cubo-satellite': { type: 'raster', tiles: [satelliteTiles], tileSize: 256, maxzoom: 19 } },
      layers,
    };
  };
}

function applyMapStyle(map: LibreMap, mapStyle: MapStyleMode, appearance: Props['userInterfaceStyle']) {
  map.setStyle(streetStyle(appearance), mapStyle === 'satellite' ? { diff: false, transformStyle: satelliteStyle(appearance) } : { diff: false });
}

export default forwardRef<MapView, Props>(function DrivingMap(props, ref) {
  const scope = `cubo-map-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<LibreMap | null>(null);
  const callbacks = useRef(props); callbacks.current = props;
  const [map, setMap] = useState<LibreMap | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const activeMapStyle = useRef<MapStyleMode>(props.mapStyle ?? 'street');
  const pending = useRef<((map: LibreMap) => void) | null>(null);
  const run = (action: (map: LibreMap) => void) => { if (instance.current) action(instance.current); else pending.current = action; };
  useImperativeHandle(ref, () => ({
    animateCamera: (camera, options) => run(m => {
      // A fresh GPS fix must replace the previous camera transition instead of
      // queueing behind it; otherwise the map visibly trails a moving driver.
      m.stop();
      m.easeTo({ center: coords(camera.center), bearing: nearestBearing(m.getBearing(), camera.heading ?? 0), pitch: camera.pitch ?? 0, zoom: camera.zoom ?? 16, duration: options?.duration ?? 0, easing: value => 1 - Math.pow(1 - value, 4) });
    }),
    animateToRegion: (region, duration) => run(m => m.easeTo({ center: coords(region), bearing: 0, pitch: 0, zoom: 15, duration: duration ?? 0 })),
    fitToCoordinates: (points, options) => run(m => {
      const safe = points.filter(valid); if (!safe.length) return;
      const bounds = new LngLatBounds(); safe.forEach(p => bounds.extend(coords(p)));
      const height = m.getContainer().clientHeight;
      // Leave room for chrome without requesting impossible padding in small desktop previews.
      const factor = Math.min(1, Math.max(.2, (height - 100) / (options.edgePadding.top + options.edgePadding.bottom)));
      m.fitBounds(bounds, { padding: { ...options.edgePadding, top: options.edgePadding.top * factor, bottom: options.edgePadding.bottom * factor }, maxZoom: 17, duration: options.animated ? 450 : 0 });
    }),
    zoomBy: delta => run(m => m.easeTo({ zoom: Math.max(2, Math.min(19, m.getZoom() + delta)), duration: 220 })),
  }), []);
  useEffect(() => {
    if (!host.current) return;
    let current: LibreMap | undefined;
    let observer: ResizeObserver | undefined;
    let live = true;
    setMap(null); setError('');
    const timer = setTimeout(() => { if (live) setError('Map is taking longer than expected. Check your connection.'); }, 20000);
    try {
      // Normalize fractional browser zoom ratios and cap the map's drawing buffer.
      // This avoids subpixel resize churn and saves GPU memory on 3x phone screens.
      const pixelRatio = Math.max(1, Math.min(2, Math.round(window.devicePixelRatio || 1)));
      current = new LibreMap({ container: host.current, pixelRatio, center: coords(props.initialRegion), zoom: 13, attributionControl: false, interactive: props.interactive ?? true });
      instance.current = current;
      applyMapStyle(current, activeMapStyle.current, props.userInterfaceStyle);
      current.on('styleimagemissing', event => {
        if (!current?.hasImage(event.id)) current?.addImage(event.id, { width: 1, height: 1, data: new Uint8Array([0, 0, 0, 0]) });
      });
      current.on('load', () => { if (!live) return; if (activeMapStyle.current === 'street') applyWebDarkMapPaint(current!, props.userInterfaceStyle); clearTimeout(timer); setError(''); setMap(current!); callbacks.current.onMapReady?.(); });
      current.on('error', () => { if (live) setError('Some map tiles could not load. Check your connection.'); });
      current.on('click', () => callbacks.current.onPress?.());
      current.on('dragstart', () => callbacks.current.onPanDrag?.());
      current.on('zoomstart', event => { if (event.originalEvent) callbacks.current.onPanDrag?.(); });
      observer = new ResizeObserver(() => current?.resize()); observer.observe(host.current);
      pending.current?.(current); pending.current = null;
    } catch { setError('This browser could not start the map. Try an updated Safari or Chrome.'); }
    return () => { live = false; clearTimeout(timer); observer?.disconnect(); instance.current = null; current?.remove(); };
  }, [props.userInterfaceStyle, attempt]);
  useEffect(() => {
    const requested = props.mapStyle ?? 'street';
    if (activeMapStyle.current === requested) return;
    activeMapStyle.current = requested;
    const current = instance.current;
    if (!current) return;
    let live = true;
    setMap(null);
    const ready = () => {
      if (!live) return;
      if (requested === 'street') applyWebDarkMapPaint(current, props.userInterfaceStyle);
      setError(''); setMap(current); callbacks.current.onMapReady?.();
    };
    current.once('style.load', ready);
    applyMapStyle(current, requested, props.userInterfaceStyle);
    return () => { live = false; current.off('style.load', ready); };
  }, [props.mapStyle, props.userInterfaceStyle]);
  return <View style={props.style}>
    <style>{`.${scope} canvas{outline:none}`}</style>
    <div ref={host} className={scope} aria-label={props.interactive === false ? 'Trip route map' : 'Driving map'} style={{ position: 'absolute', inset: 0 }} />
    {props.mapStyle === 'satellite'
      ? <a aria-label="Map and satellite data attribution" href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9" target="_blank" rel="noreferrer" style={{ position: 'absolute', zIndex: 1, right: 6, bottom: props.attributionBottom ?? 250, color: props.userInterfaceStyle === 'dark' ? 'rgba(231,239,235,.56)' : 'rgba(22,40,32,.56)', font: '9px/14px Manrope_500Medium, sans-serif', textDecoration: 'none', letterSpacing: '.01em' }}>© OSM · Imagery © Esri, Vantor, Earthstar, GIS Community</a>
      : <a aria-label="Map data attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" style={{ position: 'absolute', zIndex: 1, right: 6, bottom: props.attributionBottom ?? 250, color: props.userInterfaceStyle === 'dark' ? 'rgba(231,239,235,.56)' : 'rgba(22,40,32,.56)', font: '9px/14px Manrope_500Medium, sans-serif', textDecoration: 'none', letterSpacing: '.01em' }}>© OSM</a>}
    <MapContext.Provider value={map}>{props.children}{props.showsUserLocation && props.userLocation && <Marker coordinate={props.userLocation}><div aria-label="Your location" style={{ width: 16, height: 16, borderRadius: 20, background: '#2985E8', border: '3px solid white', boxShadow: '0 0 0 8px #2985e826' }} /></Marker>}</MapContext.Provider>
    {error && <div role="status" style={{ position: 'absolute', top: '42%', left: 12, right: 64, padding: 12, borderRadius: 12, background: '#FFFFFF', color: '#162820', font: '12px sans-serif' }}>{error}<button style={{ minHeight: 44, marginLeft: 8 }} onClick={() => setAttempt(n => n + 1)}>Retry map</button></div>}
  </View>;
});

export function Marker({ coordinate, children, title, description, pinColor = '#167655', flat = false, rotation = 0, anchor = { x: .5, y: .5 } }: { coordinate: Coordinate; children?: ReactNode; title?: string; description?: string; pinColor?: string; anchor?: { x: number; y: number }; flat?: boolean; rotation?: number }) {
  const map = useContext(MapContext);
  const element = useRef<HTMLDivElement | null>(null);
  if (!element.current && typeof document !== 'undefined') element.current = document.createElement('div');
  const marker = useRef<LibreMarker | null>(null);
  useEffect(() => {
    if (!map || !element.current || !valid(coordinate)) return;
    const verticalAnchor = anchor.y >= .9 ? 'bottom' : 'center';
    marker.current = new LibreMarker({ element: element.current, anchor: verticalAnchor }).setLngLat(coords(coordinate)).addTo(map);
    return () => { marker.current?.remove(); marker.current = null; };
  }, [map]);
  useEffect(() => { if (valid(coordinate)) marker.current?.setLngLat(coords(coordinate)); }, [coordinate.latitude, coordinate.longitude, map]);
  useEffect(() => { marker.current?.setRotationAlignment(flat ? 'map' : 'viewport').setRotation(rotation); }, [map, flat, rotation]);
  if (!element.current) return null;
  element.current.title = [title, description].filter(Boolean).join(' — ');
  return createPortal(children ?? <div aria-label={title || 'Destination'} style={{ width: 20, height: 20, borderRadius: 20, background: pinColor, border: '3px solid white' }} />, element.current);
}

export function Polyline({ coordinates, strokeColor, strokeWidth }: { coordinates: Coordinate[]; strokeColor: string; strokeWidth: number; lineCap?: string; lineJoin?: string }) {
  const map = useContext(MapContext); const id = useId();
  const data = (): GeoJSON.Feature => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coordinates.filter(valid).map(coords) } });
  useEffect(() => {
    if (!map) return;
    map.addSource(id, { type: 'geojson', data: data() });
    map.addLayer({ id, type: 'line', source: id, paint: { 'line-color': strokeColor, 'line-width': strokeWidth }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    return () => { if (!map.getStyle()) return; if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(id)) map.removeSource(id); };
  }, [map, id]);
  useEffect(() => { if (!map?.getSource(id)) return; (map.getSource(id) as GeoJSONSource).setData(data()); map.setPaintProperty(id, 'line-color', strokeColor); map.setPaintProperty(id, 'line-width', strokeWidth); }, [map, id, coordinates, strokeColor, strokeWidth]);
  return null;
}
