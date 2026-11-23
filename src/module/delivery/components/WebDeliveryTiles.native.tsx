import { Text } from '@/components/Typography';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';

interface Props {
  target: [number, number]; driver: [number, number] | null;
  points: [number, number][]; label: string; color: string; accuracy?: number; overview?: boolean;
}

// Leaflet renders directly in the embedded browser, without a Google Maps native canvas.
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" onerror="this.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css'">
<style>html,body,#map{height:100%;width:100%;margin:0;background:#f5eee8} .leaflet-control-attribution{font-size:9px}</style></head>
<body><div id="map"></div><script>
function send(data){window.ReactNativeWebView.postMessage(JSON.stringify(data))}
function start(){
 try {
  var map=L.map('map').setView([12.8797,121.7740],5), layers=L.layerGroup().addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).on('tileerror',function(){send({type:'error',message:'Map tiles could not download. Check the phone internet connection, then retry.'})}).addTo(map);
  function popup(marker,text){var node=document.createElement('span');node.textContent=text;marker.bindPopup(node);return marker}
  window.updateDeliveryMap=function(data){
   layers.clearLayers();
   if(!data.overview)popup(L.circleMarker(data.target,{radius:10,color:'#fff',weight:3,fillColor:data.color,fillOpacity:1}).addTo(layers),data.label);
   if(data.driver)popup(L.circleMarker(data.driver,{radius:9,color:'#fff',weight:3,fillColor:'#2980B9',fillOpacity:1}).addTo(layers),'Your GPS location');
   if(data.accuracy>0)L.circle(data.target,{radius:data.accuracy,color:'#2980B9',fillOpacity:0.1}).addTo(layers);
   if(data.points.length>1){var line=L.polyline(data.points,{color:data.color,weight:5}).addTo(layers);map.fitBounds(line.getBounds(),{padding:[30,30]})}
   else if(data.driver)map.fitBounds([data.driver,data.target],{padding:[30,30],maxZoom:17});
   else map.setView(data.target,data.overview?5:16);
   map.invalidateSize();
  };
  window.addEventListener('resize',function(){map.invalidateSize()});
  send({type:'ready'});
 }catch(e){send({type:'error',message:'Map could not initialize. Please retry.'})}
}
function library(url,fallback){var script=document.createElement('script');script.src=url;script.onload=start;script.onerror=function(){if(fallback)library(fallback);else send({type:'error',message:'Leaflet could not download. Check the phone internet connection.'})};document.head.appendChild(script)}
library('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js','https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js');
</script></body></html>`;
const source = { html };

export default function WebDeliveryTiles(props: Props) {
  const web = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [instance, setInstance] = useState(0);
  const payload = JSON.stringify({ ...props, accuracy: props.accuracy || 0, overview: !!props.overview }).replace(/</g, '\u003c');
  useEffect(() => {
    if (ready) web.current?.injectJavaScript(`window.updateDeliveryMap && window.updateDeliveryMap(${payload}); true;`);
  }, [ready, payload]);
  useEffect(() => {
    if (ready || error) return;
    const timer = setTimeout(() => setError('Map loading timed out. Check the phone internet connection and retry.'), 20000);
    return () => clearTimeout(timer);
  }, [ready, error, instance]);
  return <View style={{ gap: 8 }}>
    <View style={{ height: 300, width: '100%', borderRadius: 14, overflow: 'hidden' }}>
      <WebView key={instance} ref={web} source={source} originWhitelist={['*']} javaScriptEnabled domStorageEnabled style={{ flex: 1 }} scrollEnabled={false}
        onMessage={event => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'ready') { setReady(true); setError(''); }
            if (data.type === 'error' && typeof data.message === 'string') setError(data.message);
          } catch { setError('The map returned an invalid message. Please retry.'); }
        }}
        onError={() => setError('The map could not load. Check your internet connection.')}
        onHttpError={() => setError('The map service could not be reached. Please retry.')}
        onShouldStartLoadWithRequest={request => {
          if (request.url === 'about:blank' || request.url.startsWith('data:text/html')) return true;
          if (request.navigationType === 'click') { if (request.url.startsWith('https://')) void Linking.openURL(request.url); return false; }
          return true;
        }}
      />
      {!ready && !error && <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5EEE8', gap: 8 }}><ActivityIndicator color="#C15656" /><Text>Loading OpenStreetMap…</Text></View>}
    </View>
    {!!error && <View style={{ gap: 6 }}><Text accessibilityRole="alert" style={{ color: '#A13030' }}>{error}</Text><TouchableOpacity accessibilityRole="button" onPress={() => { setReady(false); setError(''); setInstance(value => value + 1); }}><Text style={{ color: '#A43F48', fontWeight: '700' }}>Retry map</Text></TouchableOpacity></View>}
  </View>;
}
