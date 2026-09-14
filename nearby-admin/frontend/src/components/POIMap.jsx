import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, AttributionControl } from 'react-leaflet';
import { Drawer, Title, Text, Stack, Paper, Loader, Group, Box, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSearch } from '@tabler/icons-react';
import L from 'leaflet';
import { createCustomIcon, getPoiColor, legendData, createTooltipText } from '../utils/mapUtils';
import PoiDetailView from './PoiDetailView';

// Fix for default Leaflet icon path issue with bundlers like Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Add custom CSS for tooltips and markers
const customStyles = `
  .custom-tooltip {
    background: white !important;
    border: 1px solid #e5e7eb !important;
    border-radius: 6px !important;
    color: #374151 !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    font-size: 12px !important;
    padding: 6px 10px !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15) !important;
    white-space: nowrap !important;
    max-width: 250px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }
  
  .custom-tooltip::before {
    border-top-color: white !important;
  }
  
  .custom-marker {
    background: transparent !important;
    border: none !important;
  }
  
  .custom-marker div {
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  
  .custom-marker:hover div {
    transform: scale(1.1);
    box-shadow: 0 4px 12px rgba(0,0,0,0.4) !important;
  }
`;

// Inject custom styles
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = customStyles;
  document.head.appendChild(styleElement);
}





// Legend component
const MapLegend = () => (
  <Paper
    style={{
      position: 'absolute',
      bottom: 20,
      left: 20,
      zIndex: 1000,
      padding: '8px',
      backgroundColor: 'white',
      borderRadius: '6px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      minWidth: '140px'
    }}
    withBorder
  >
    <Text size="sm" fw={600} mb={4}>POI Types</Text>
    <Stack gap={4}>
      {legendData.map((item) => (
        <Group key={item.type} gap={6} wrap="nowrap">
          <div
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              backgroundColor: item.color,
              border: '2px solid white',
              boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '9px',
              color: 'white',
              fontWeight: 'bold'
            }}
          >
            {item.icon}
          </div>
          <Text size="xs" style={{ flex: 1 }}>{item.label}</Text>
        </Group>
      ))}
    </Stack>
  </Paper>
);

function POIMap() {
  const [pois, setPois] = useState([]);
  const [filteredPois, setFilteredPois] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPoi, setSelectedPoi] = useState(null);
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchPois = async () => {
      try {
        console.log('Fetching POIs...');
        const response = await api.get('/pois/?limit=1000');
        const data = await response.json();
        console.log('Fetched POIs:', data.length);
        console.log('Sample POI:', data[0]);
        setPois(data);
        setFilteredPois(data);
      } catch (error) {
        console.error('Error fetching POIs:', error);
        notifications.show({ title: 'Error fetching data', message: 'Could not load points of interest for the map.', color: 'red' });
      } finally {
        setLoading(false);
      }
    };
    fetchPois();
  }, []);

  // Filter POIs based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredPois(pois);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = pois.filter(poi => {
      const nameMatch = poi.name?.toLowerCase().includes(query);
      const descriptionMatch = (poi.description_long || poi.description_short)?.toLowerCase().includes(query);
      const categoryMatch = poi.categories?.some(cat => 
        cat.name?.toLowerCase().includes(query)
      );
      const addressMatch = poi.address_full?.toLowerCase().includes(query) ||
                          poi.address_street?.toLowerCase().includes(query) ||
                          poi.address_city?.toLowerCase().includes(query) ||
                          poi.address_state?.toLowerCase().includes(query);
      
      return nameMatch || descriptionMatch || categoryMatch || addressMatch;
    });
    
    setFilteredPois(filtered);
  }, [searchQuery, pois]);

  const handleMarkerClick = async (poi) => {
    setLoading(true);
    setDrawerOpen(true);
    try {
        const response = await api.get(`/pois/${poi.id}`);
        const data = await response.json();
        setSelectedPoi(data);
    } catch(e) {
        notifications.show({ title: 'Error', message: 'Could not fetch POI details.', color: 'red' });
        setDrawerOpen(false);
    } finally {
        setLoading(false);
    }
  };

  const handleEditClick = () => {
    if (selectedPoi) {
      navigate(`/poi/${selectedPoi.id}/edit`);
    }
  };
  
  const handleCloseDrawer = () => {
      setDrawerOpen(false);
      setSelectedPoi(null);
  }

  // Create tooltip content for a POI
  const createTooltipContent = (poi) => {
    const { name, poi_type, status, address_full, address_street, address_city, address_state } = poi;
    
    // Build address string
    const addressParts = [address_street, address_city, address_state].filter(Boolean);
    const address = address_full || addressParts.join(', ') || 'Address not available';
    
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 200px;">
        <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; color: #1f2937;">${name}</div>
        <div style="font-size: 12px; color: #6b7280; margin-bottom: 2px;">${poi_type}</div>
        <div style="font-size: 11px; color: #9ca3af; margin-bottom: 2px;">${status}</div>
        <div style="font-size: 11px; color: #9ca3af;">${address}</div>
      </div>
    `;
  };



  return (
    <>
      <Paper style={{ height: '85vh', width: '100%' }} withBorder radius="md" p={0} shadow="sm">
        <Box p="md" style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, maxWidth: '400px', width: '100%' }}>
          <TextInput
            placeholder="Search POIs..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
            leftSection={<IconSearch size={16} />}
            styles={{
              input: {
                backgroundColor: 'white',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              },
              rightSection: {
                width: 'auto',
                paddingRight: '4px'
              }
            }}
          />
          {searchQuery && (
            <Text size="xs" c="dimmed" mt={4} ta="center">
              Showing {filteredPois.length} of {pois.length} POIs
            </Text>
          )}
        </Box>
        
        {loading && pois.length === 0 ? (
          <Box style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Stack align="center" spacing="md">
              <Loader size="lg" />
              <Text>Loading map data...</Text>
            </Stack>
          </Box>
        ) : (
          <>
            <MapContainer 
              center={[35.7, -79.1]} 
              zoom={9} 
              scrollWheelZoom={true} 
              style={{ height: "100%", width: "100%", borderRadius: 'var(--mantine-radius-md)' }}
              key={filteredPois.length} // Force re-render when POIs change
              attributionControl={false}
            >
              {/* #102: Leaflet's default prefix is "🇺🇦 Leaflet"; drop the flag, keep the credit. */}
              <AttributionControl position="bottomright" prefix="Leaflet" />
              <TileLayer 
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' 
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
              />
              {filteredPois.map(poi => {
                const coords = poi.location?.coordinates;
                if (!coords || coords.length !== 2) {
                  console.log('Skipping POI due to invalid coordinates:', poi.name, coords);
                  return null;
                }
                const position = [coords[1], coords[0]]; 
                const poiType = poi.poi_type || 'business';
                const iconColor = getPoiColor(poiType);
                const customIcon = createCustomIcon(poiType, iconColor);
                
                console.log('Rendering marker for:', poi.name, 'at position:', position, 'type:', poiType);

                return (
                  <Marker 
                    key={poi.id} 
                    position={position} 
                    icon={customIcon}
                    eventHandlers={{ click: () => handleMarkerClick(poi) }}
                  >
                    <Tooltip 
                      permanent={false}
                      direction="top"
                      offset={[0, -8]}
                      opacity={0.9}
                      className="custom-tooltip"
                    >
                      {createTooltipText(poi)}
                    </Tooltip>
                  </Marker>
                );
              })}
            </MapContainer>
            
            <MapLegend />
          </>
        )}
      </Paper>
      
      <Drawer opened={isDrawerOpen} onClose={handleCloseDrawer} title={<Title order={4}>POI Details</Title>} position="right" padding="xl" size="xl" shadow="md">
        {loading && <Group justify="center" mt="xl"><Loader /></Group>}
        {!loading && selectedPoi && (
            <PoiDetailView poi={selectedPoi} onEditClick={handleEditClick} />
        )}
      </Drawer>
    </>
  );
}

export default POIMap;